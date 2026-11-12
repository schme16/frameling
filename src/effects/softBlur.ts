/**
 * A JS blur and colour adjust on raw pixels, for browsers whose canvas has no `filter` (Safari). Pure functions on
 * `{ data, width, height }` (RGBA bytes, like ImageData), so they are testable without a canvas.
 *
 * Blur follows the SVG/CSS recipe for a gaussian: three box blurs for sigma >= 2 (what browsers do themselves), a true
 * kernel below that. Colour is premultiplied while blurring so soft edges don't pick up dark or coloured fringes. Only
 * the part of the picture that has ink (plus the blur's reach) is processed, so a small drawing on a big canvas is cheap.
 */

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** A piece of a picture: `data` is `width * height` RGBA, to be placed at (x, y). */
export interface Region extends Pixels {
  x: number;
  y: number;
}

/** Below this sigma the blur uses a true gaussian kernel (boxes are too coarse there); above, three box blurs. */
const KERNEL_BELOW = 4;

/** Sigmas below this are not worth blurring. */
export const MIN_SIGMA = 0.05;

/**
 * Box windows [left, right] (pixels each side of the centre) for three passes whose combined spread matches a gaussian
 * of this sigma: odd widths picked so the variance is exact, which tracks a true gaussian closer than the SVG recipe.
 */
export function boxWindows(sigma: number): [number, number][] {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = ((i < m ? wl : wu) - 1) / 2;
    out.push([r, r]);
  }
  return out;
}

/** How far a blur of this sigma reaches (pixels beyond the ink). */
export function blurReach(sigma: number): number {
  return Math.ceil(sigma * 3) + 2;
}

// Scratch space, grown on demand, so a frame allocates nothing once warm.
let bufA = new Float32Array(0);
let bufB = new Float32Array(0);
let colAcc = new Float64Array(0);

function scratch(n: number, cols: number): void {
  if (bufA.length < n) {
    bufA = new Float32Array(n);
    bufB = new Float32Array(n);
  }
  if (colAcc.length < cols) colAcc = new Float64Array(cols);
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, ch: number, left: number, right: number): void {
  const inv = 1 / (left + right + 1);
  const rowLen = w * ch;
  for (let y = 0; y < h; y++) {
    const base = y * rowLen;
    for (let c = 0; c < ch; c++) {
      let sum = 0;
      for (let i = 0; i <= right && i < w; i++) sum += src[base + i * ch + c];
      for (let x = 0; x < w; x++) {
        dst[base + x * ch + c] = sum * inv;
        const add = x + right + 1;
        if (add < w) sum += src[base + add * ch + c];
        const rem = x - left;
        if (rem >= 0) sum -= src[base + rem * ch + c];
      }
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, ch: number, left: number, right: number): void {
  const inv = 1 / (left + right + 1);
  const rowLen = w * ch;
  const acc = colAcc;
  for (let i = 0; i < rowLen; i++) acc[i] = 0;
  for (let y = 0; y <= right && y < h; y++) {
    const o = y * rowLen;
    for (let i = 0; i < rowLen; i++) acc[i] += src[o + i];
  }
  for (let y = 0; y < h; y++) {
    const o = y * rowLen;
    for (let i = 0; i < rowLen; i++) dst[o + i] = acc[i] * inv;
    const add = y + right + 1;
    if (add < h) {
      const a = add * rowLen;
      for (let i = 0; i < rowLen; i++) acc[i] += src[a + i];
    }
    const rem = y - left;
    if (rem >= 0) {
      const r = rem * rowLen;
      for (let i = 0; i < rowLen; i++) acc[i] -= src[r + i];
    }
  }
}

function kernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

function convH(src: Float32Array, dst: Float32Array, w: number, h: number, ch: number, k: Float32Array): void {
  const r = (k.length - 1) / 2;
  const rowLen = w * ch;
  for (let y = 0; y < h; y++) {
    const base = y * rowLen;
    for (let x = 0; x < w; x++) {
      const lo = Math.max(-r, -x);
      const hi = Math.min(r, w - 1 - x);
      for (let c = 0; c < ch; c++) {
        let s = 0;
        for (let i = lo; i <= hi; i++) s += src[base + (x + i) * ch + c] * k[i + r];
        dst[base + x * ch + c] = s;
      }
    }
  }
}

function convV(src: Float32Array, dst: Float32Array, w: number, h: number, ch: number, k: Float32Array): void {
  const r = (k.length - 1) / 2;
  const rowLen = w * ch;
  for (let y = 0; y < h; y++) {
    const lo = Math.max(-r, -y);
    const hi = Math.min(r, h - 1 - y);
    const o = y * rowLen;
    for (let i = 0; i < rowLen; i++) dst[o + i] = 0;
    for (let j = lo; j <= hi; j++) {
      const kk = k[j + r];
      const s = (y + j) * rowLen;
      for (let i = 0; i < rowLen; i++) dst[o + i] += src[s + i] * kk;
    }
  }
}

/** Blurs `bufA` (w x h, `ch` interleaved channels, zero outside) in place; the result ends up in `bufA`. */
function gaussian(w: number, h: number, ch: number, sigma: number): void {
  if (sigma < KERNEL_BELOW) {
    const k = kernel(sigma);
    convH(bufA, bufB, w, h, ch, k);
    convV(bufB, bufA, w, h, ch, k);
    return;
  }
  for (const [l, r] of boxWindows(sigma)) {
    boxH(bufA, bufB, w, h, ch, l, r);
    boxV(bufB, bufA, w, h, ch, l, r);
  }
}

/** The rectangle of pixels with any alpha, grown by `pad` and kept inside the picture; null when it's empty. */
export function inkBounds(px: Pixels, pad: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const { data, width: w, height: h } = px;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let first = -1;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] !== 0) {
        first = x;
        break;
      }
    }
    if (first < 0) continue;
    let last = first;
    for (let x = w - 1; x > first; x--) {
      if (data[row + x * 4 + 3] !== 0) {
        last = x;
        break;
      }
    }
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  if (x1 < 0) return null;
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(w - 1, x1 + pad), y1: Math.min(h - 1, y1 + pad) };
}

/**
 * Blurs a picture. `mode` 'rgba' blurs colour and alpha (the blur effect); 'alpha' blurs only the alpha and returns it
 * as black ink (the start of a shadow or glow, which the caller tints). Returns the piece that changed, or null when
 * the picture is empty.
 */
export function blurPixels(src: Pixels, sigma: number, mode: 'rgba' | 'alpha'): Region | null {
  const b = inkBounds(src, blurReach(sigma));
  if (!b) return null;
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const ch = mode === 'rgba' ? 4 : 1;
  scratch(w * h * ch, w * ch);
  const sd = src.data;
  for (let y = 0; y < h; y++) {
    let s = ((y + b.y0) * src.width + b.x0) * 4;
    let d = y * w * ch;
    if (mode === 'alpha') {
      for (let x = 0; x < w; x++, s += 4, d++) bufA[d] = sd[s + 3];
    } else {
      for (let x = 0; x < w; x++, s += 4, d += 4) {
        const a = sd[s + 3];
        const f = a / 255;
        bufA[d] = sd[s] * f;
        bufA[d + 1] = sd[s + 1] * f;
        bufA[d + 2] = sd[s + 2] * f;
        bufA[d + 3] = a;
      }
    }
  }
  gaussian(w, h, ch, sigma);
  const out = new Uint8ClampedArray(w * h * 4);
  if (mode === 'alpha') {
    for (let i = 0, o = 3; i < w * h; i++, o += 4) out[o] = bufA[i] + 0.5;
  } else {
    for (let i = 0, o = 0; i < w * h; i++, o += 4) {
      const a = bufA[i * 4 + 3];
      if (a <= 0) continue;
      const f = 255 / a;
      out[o] = bufA[i * 4] * f + 0.5;
      out[o + 1] = bufA[i * 4 + 1] * f + 0.5;
      out[o + 2] = bufA[i * 4 + 2] * f + 0.5;
      out[o + 3] = a + 0.5;
    }
  }
  return { x: b.x0, y: b.y0, width: w, height: h, data: out };
}

export interface Adjust {
  hue: number;
  saturation: number;
  brightness: number;
  contrast: number;
}

const clamp1 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** hue-rotate(), saturate(), brightness(), contrast() in that order, as the canvas filter string applies them. In place. */
export function adjustPixels(px: Pixels, a: Adjust): void {
  const { data } = px;
  const rad = (a.hue * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const hue = [0.213 + 0.787 * c - 0.213 * s, 0.715 - 0.715 * c - 0.715 * s, 0.072 - 0.072 * c + 0.928 * s, 0.213 - 0.213 * c + 0.143 * s, 0.715 + 0.285 * c + 0.14 * s, 0.072 - 0.072 * c - 0.283 * s, 0.213 - 0.213 * c - 0.787 * s, 0.715 - 0.715 * c + 0.715 * s, 0.072 + 0.928 * c + 0.072 * s];
  const t = a.saturation / 100;
  const sat = [0.213 + 0.787 * t, 0.715 - 0.715 * t, 0.072 - 0.072 * t, 0.213 - 0.213 * t, 0.715 + 0.285 * t, 0.072 - 0.072 * t, 0.213 - 0.213 * t, 0.715 - 0.715 * t, 0.072 + 0.928 * t];
  const doHue = a.hue % 360 !== 0;
  const doSat = a.saturation !== 100;
  const bright = a.brightness / 100;
  const k = a.contrast / 100;
  const off = 0.5 - 0.5 * k;
  const doBright = a.brightness !== 100;
  const doContrast = a.contrast !== 100;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;
    if (doHue) {
      const r2 = clamp1(hue[0] * r + hue[1] * g + hue[2] * b);
      const g2 = clamp1(hue[3] * r + hue[4] * g + hue[5] * b);
      b = clamp1(hue[6] * r + hue[7] * g + hue[8] * b);
      r = r2;
      g = g2;
    }
    if (doSat) {
      const r2 = clamp1(sat[0] * r + sat[1] * g + sat[2] * b);
      const g2 = clamp1(sat[3] * r + sat[4] * g + sat[5] * b);
      b = clamp1(sat[6] * r + sat[7] * g + sat[8] * b);
      r = r2;
      g = g2;
    }
    if (doBright) {
      r = clamp1(r * bright);
      g = clamp1(g * bright);
      b = clamp1(b * bright);
    }
    if (doContrast) {
      r = clamp1(r * k + off);
      g = clamp1(g * k + off);
      b = clamp1(b * k + off);
    }
    data[i] = r * 255 + 0.5;
    data[i + 1] = g * 255 + 0.5;
    data[i + 2] = b * 255 + 0.5;
  }
}
