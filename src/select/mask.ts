/**
 * Pixel selection masks: which art pixels of a pixel layer are selected. Pure, no DOM, so it is easy to test and fast
 * on a 256 x 256 grid. A mask is one byte per art pixel, 1 = selected. Masks are never changed in place by these
 * functions; each returns a new one.
 */
import { u32 } from '../pixel/transform';
import { dilate } from '../geometry/morph';

export interface Mask {
  width: number;
  height: number;
  /** 1 = selected. With a soft edge this is where the cover is half or more, so the outline and every check that asks "is it in?" still work. */
  bits: Uint8Array;
  /** How much of each pixel is selected, 0 (none) to 255 (all), when the edge is feathered. Missing means every selected pixel is fully in. */
  soft?: Uint8Array;
}

/** An inclusive box of art pixels. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** How a new selection meets the one already there. */
export type SelectOp = 'replace' | 'add' | 'subtract' | 'intersect';

export function emptyMask(width: number, height: number): Mask {
  return { width, height, bits: new Uint8Array(width * height) };
}

export function fullMask(width: number, height: number): Mask {
  return { width, height, bits: new Uint8Array(width * height).fill(1) };
}

/** Every pixel in the box (corners in any order, clamped to the grid). */
export function rectMask(width: number, height: number, ax: number, ay: number, bx: number, by: number): Mask {
  const m = emptyMask(width, height);
  const x0 = Math.max(0, Math.min(ax, bx));
  const x1 = Math.min(width - 1, Math.max(ax, bx));
  const y0 = Math.max(0, Math.min(ay, by));
  const y1 = Math.min(height - 1, Math.max(ay, by));
  for (let y = y0; y <= y1; y++) m.bits.fill(1, y * width + x0, y * width + x1 + 1);
  return m;
}

/**
 * Every pixel whose centre is inside the polygon (even-odd rule), with the points in art pixel units. A scanline fill:
 * one pass over the edges per row, so even a long lasso on 256 x 256 is quick.
 */
export function polygonMask(width: number, height: number, pts: readonly { x: number; y: number }[]): Mask {
  const m = emptyMask(width, height);
  const n = pts.length;
  if (n < 3) return m;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const ys = Math.max(0, Math.floor(minY));
  const ye = Math.min(height - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = ys; y <= ye; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y <= cy === b.y <= cy) continue;
      xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // Pixel x is in when its centre x + 0.5 lies in [xa, xb).
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(width, Math.ceil(xs[k + 1] - 0.5));
      if (to > from) m.bits.fill(1, y * width + from, y * width + to);
    }
  }
  return m;
}

export interface WandOptions {
  /** How different a colour can be and still count as the same, 0 (exact) to 255 (anything), per channel. */
  tolerance?: number;
  /** true: only pixels joined to the clicked one (4-way). false: every matching pixel on the drawing. */
  contiguous?: boolean;
}

/**
 * The magic wand: pixels the same colour as the one at (x, y). Empty pixels all count as one colour (their hidden RGB
 * is ignored), so clicking empty space selects the empty area.
 */
export function wandMask(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, opts: WandOptions = {}): Mask {
  const m = emptyMask(width, height);
  if (x < 0 || y < 0 || x >= width || y >= height) return m;
  const tol = Math.max(0, Math.min(255, Math.round(opts.tolerance ?? 0)));
  const at = (y * width + x) * 4;
  const tr = pixels[at];
  const tg = pixels[at + 1];
  const tb = pixels[at + 2];
  const ta = pixels[at + 3];
  const same = (p: number): boolean => {
    const i = p * 4;
    const a = pixels[i + 3];
    if (ta === 0 && a === 0) return true;
    if (ta === 0 || a === 0) return Math.abs(a - ta) <= tol;
    return Math.abs(pixels[i] - tr) <= tol && Math.abs(pixels[i + 1] - tg) <= tol && Math.abs(pixels[i + 2] - tb) <= tol && Math.abs(a - ta) <= tol;
  };
  const bits = m.bits;
  if (opts.contiguous === false) {
    for (let p = 0; p < width * height; p++) if (same(p)) bits[p] = 1;
    return m;
  }
  // Scanline flood: fill a run, then look above and below it.
  const stack = [y * width + x];
  while (stack.length) {
    const p = stack.pop()!;
    if (bits[p]) continue;
    const row = Math.floor(p / width);
    let l = p - row * width;
    let r = l;
    while (l > 0 && !bits[row * width + l - 1] && same(row * width + l - 1)) l--;
    while (r < width - 1 && !bits[row * width + r + 1] && same(row * width + r + 1)) r++;
    bits.fill(1, row * width + l, row * width + r + 1);
    for (const ny of [row - 1, row + 1]) {
      if (ny < 0 || ny >= height) continue;
      let open = false;
      for (let i = l; i <= r; i++) {
        const q = ny * width + i;
        const ok = !bits[q] && same(q);
        if (ok && !open) stack.push(q);
        open = ok;
      }
    }
  }
  return m;
}

/** A new selection `b` combined with the old one `a` (null = nothing selected yet). */
export function combineMasks(a: Mask | null, b: Mask, op: SelectOp): Mask {
  const fits = !!a && a.width === b.width && a.height === b.height;
  if (op === 'replace') return b;
  if (!fits || !a) return op === 'add' ? b : emptyMask(b.width, b.height);
  if (a.soft || b.soft) {
    // A feathered edge on either side: combine the cover, then read the bits back off it.
    const x = coverOf(a);
    const y = coverOf(b);
    const cover = new Uint8Array(x.length);
    if (op === 'add') for (let i = 0; i < cover.length; i++) cover[i] = Math.max(x[i], y[i]);
    else if (op === 'subtract') for (let i = 0; i < cover.length; i++) cover[i] = Math.min(x[i], 255 - y[i]);
    else for (let i = 0; i < cover.length; i++) cover[i] = Math.min(x[i], y[i]);
    return fromCover(a.width, a.height, cover);
  }
  const out = new Uint8Array(a.bits.length);
  const x = a.bits;
  const y = b.bits;
  if (op === 'add') for (let i = 0; i < out.length; i++) out[i] = x[i] | y[i];
  else if (op === 'subtract') for (let i = 0; i < out.length; i++) out[i] = x[i] & (y[i] ^ 1);
  else for (let i = 0; i < out.length; i++) out[i] = x[i] & y[i];
  return { width: a.width, height: a.height, bits: out };
}

export function invertMask(m: Mask): Mask {
  if (m.soft) {
    const cover = coverOf(m);
    for (let i = 0; i < cover.length; i++) cover[i] = 255 - cover[i];
    return fromCover(m.width, m.height, cover);
  }
  const out = new Uint8Array(m.bits.length);
  for (let i = 0; i < out.length; i++) out[i] = m.bits[i] ^ 1;
  return { width: m.width, height: m.height, bits: out };
}

export function maskCount(m: Mask): number {
  let n = 0;
  for (let i = 0; i < m.bits.length; i++) n += m.bits[i];
  return n;
}

export function maskEmpty(m: Mask | null): boolean {
  if (!m) return true;
  for (let i = 0; i < m.bits.length; i++) if (m.bits[i]) return false;
  return true;
}

/** The box round every selected pixel, or null. */
export function maskBounds(m: Mask): Box | null {
  const { width: w, height: h, bits } = m;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let first = -1;
    let last = -1;
    for (let x = 0; x < w; x++) {
      if (!bits[row + x]) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export function maskHas(m: Mask, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.width && y < m.height && m.bits[y * m.width + x] === 1;
}

/** The mask moved by whole pixels; whatever goes off the grid is dropped. */
export function shiftMask(m: Mask, dx: number, dy: number): Mask {
  if (!dx && !dy) return m;
  const { width: w, height: h } = m;
  const out = emptyMask(w, h);
  if (m.soft) out.soft = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= h) continue;
    const x0 = Math.max(0, -dx);
    const x1 = Math.min(w, w - dx);
    if (x1 <= x0) continue;
    out.bits.set(m.bits.subarray(y * w + x0, y * w + x1), ny * w + x0 + dx);
    if (m.soft) out.soft!.set(m.soft.subarray(y * w + x0, y * w + x1), ny * w + x0 + dx);
  }
  return out;
}

/** A mask made to fit another grid size (kept at the top left, cropped or padded). */
export function resizeMask(m: Mask, width: number, height: number): Mask {
  if (m.width === width && m.height === height) return m;
  const out = emptyMask(width, height);
  if (m.soft) out.soft = new Uint8Array(width * height);
  const w = Math.min(width, m.width);
  for (let y = 0; y < Math.min(height, m.height); y++) {
    out.bits.set(m.bits.subarray(y * m.width, y * m.width + w), y * width);
    if (m.soft) out.soft!.set(m.soft.subarray(y * m.width, y * m.width + w), y * width);
  }
  return out;
}

/**
 * The selection's outline, as line segments between selected and unselected pixels, in art pixel units:
 * [x0, y0, x1, y1, ...]. Runs along a row or column are joined, so a big box is four segments, not hundreds.
 */
export function maskEdges(m: Mask): number[] {
  const { width: w, height: h, bits } = m;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? bits[y * w + x] : 0);
  const out: number[] = [];
  // Horizontal edges: between row y - 1 and row y.
  for (let y = 0; y <= h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && at(x, y - 1) !== at(x, y);
      if (edge && start < 0) start = x;
      else if (!edge && start >= 0) {
        out.push(start, y, x, y);
        start = -1;
      }
    }
  }
  // Vertical edges: between column x - 1 and column x.
  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const edge = y < h && at(x - 1, y) !== at(x, y);
      if (edge && start < 0) start = y;
      else if (!edge && start >= 0) {
        out.push(x, start, x, y);
        start = -1;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- pixels and masks together

/** Only the selected pixels (the rest clear). */
export function extractPixels(pixels: Uint8ClampedArray, m: Mask): Uint8ClampedArray {
  if (m.soft) {
    // A soft edge: the pixels fade out with the cover, so a paste of them has no hard cut.
    const out = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < m.soft.length; i++) {
      const k = m.soft[i];
      if (!k) continue;
      out[i * 4] = pixels[i * 4];
      out[i * 4 + 1] = pixels[i * 4 + 1];
      out[i * 4 + 2] = pixels[i * 4 + 2];
      out[i * 4 + 3] = Math.round((pixels[i * 4 + 3] * k) / 255);
    }
    return out;
  }
  const src = u32(pixels);
  const out = new Uint8ClampedArray(pixels.length);
  const dst = new Uint32Array(out.buffer);
  const bits = m.bits;
  for (let i = 0; i < bits.length; i++) if (bits[i]) dst[i] = src[i];
  return out;
}

/** The pixels with the selected ones cleared. */
export function clearPixels(pixels: Uint8ClampedArray, m: Mask): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  if (m.soft) {
    // A soft edge only clears part of the way: what is left fades back in, so the hole is as soft as the cut.
    for (let i = 0; i < m.soft.length; i++) {
      const k = m.soft[i];
      if (!k) continue;
      const a = Math.round((out[i * 4 + 3] * (255 - k)) / 255);
      if (a === 0) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 0;
      out[i * 4 + 3] = a;
    }
    return out;
  }
  const dst = new Uint32Array(out.buffer);
  const bits = m.bits;
  for (let i = 0; i < bits.length; i++) if (bits[i]) dst[i] = 0;
  return out;
}

/** `after` inside the selection and `before` outside it: how every edit is kept to the selection. */
export function clipToMask(before: Uint8ClampedArray, after: Uint8ClampedArray, m: Mask): Uint8ClampedArray {
  const out = new Uint8ClampedArray(before);
  if (m.soft) {
    for (let i = 0; i < m.soft.length; i++) if (m.soft[i]) mixPixel(before, after, i * 4, m.soft[i], out);
    return out;
  }
  const dst = new Uint32Array(out.buffer);
  const a = u32(after);
  const bits = m.bits;
  for (let i = 0; i < bits.length; i++) if (bits[i]) dst[i] = a[i];
  return out;
}

/**
 * `src` moved by (dx, dy) and laid over `base`. Its clear pixels let the base show through, so moving a box with gaps
 * in it never punches holes in what's underneath. A new array.
 */
export function overlayPixels(base: Uint8ClampedArray, src: Uint8ClampedArray, width: number, height: number, dx: number, dy: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base);
  const dst = new Uint32Array(out.buffer);
  const s = u32(src);
  for (let y = 0; y < height; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let x = 0; x < width; x++) {
      const v = s[y * width + x];
      if (!v) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      const i = (ny * width + nx) * 4;
      const j = (y * width + x) * 4;
      if (src[j + 3] === 255 || out[i + 3] === 0) dst[ny * width + nx] = v;
      else {
        // Part see-through over something: blend, so soft edges stay soft.
        const a = src[j + 3] / 255;
        const b = out[i + 3] / 255;
        const oa = a + b * (1 - a);
        for (let c = 0; c < 3; c++) out[i + c] = (src[j + c] * a + out[i + c] * b * (1 - a)) / oa;
        out[i + 3] = oa * 255;
      }
    }
  }
  return out;
}

/** The mask as an image (selected = opaque white), so it can be flipped and turned with the same code as the art. */
export function maskToImage(m: Mask): Uint8ClampedArray {
  const out = new Uint8ClampedArray(m.bits.length * 4);
  if (m.soft) {
    for (let i = 0; i < m.soft.length; i++) {
      if (!m.soft[i]) continue;
      out.fill(255, i * 4, i * 4 + 3);
      out[i * 4 + 3] = m.soft[i];
    }
    return out;
  }
  const dst = new Uint32Array(out.buffer);
  for (let i = 0; i < m.bits.length; i++) if (m.bits[i]) dst[i] = 0xffffffff;
  return out;
}

/** Every pixel that isn't clear. */
export function maskFromAlpha(pixels: Uint8ClampedArray, width: number, height: number): Mask {
  const m = emptyMask(width, height);
  for (let i = 0; i < m.bits.length; i++) if (pixels[i * 4 + 3]) m.bits[i] = 1;
  return m;
}

/** A pixel image cropped or padded to another size (kept at the top left). */
export function resizePixels(pixels: Uint8ClampedArray, width: number, height: number, toW: number, toH: number): Uint8ClampedArray {
  if (width === toW && height === toH) return pixels;
  const out = new Uint8ClampedArray(toW * toH * 4);
  const w = Math.min(width, toW) * 4;
  for (let y = 0; y < Math.min(height, toH); y++) out.set(pixels.subarray(y * width * 4, y * width * 4 + w), y * toW * 4);
  return out;
}

// ---------------------------------------------------------------- soft edges: feather, grow and shrink

/** The most a selection can grow, shrink or feather by in one go, in art pixels. */
export const MAX_REACH = 100;

/** How much of each pixel is selected, 0 to 255, whether or not the edge is soft. A new array. */
export function coverOf(m: Mask): Uint8Array {
  if (m.soft) return m.soft.slice();
  const out = new Uint8Array(m.bits.length);
  for (let i = 0; i < out.length; i++) out[i] = m.bits[i] ? 255 : 0;
  return out;
}

/** A mask made from cover: the bits are where it is half or more, and the cover is kept only if some of it is part way. */
export function fromCover(width: number, height: number, cover: Uint8Array): Mask {
  const bits = new Uint8Array(cover.length);
  let part = false;
  for (let i = 0; i < cover.length; i++) {
    const k = cover[i];
    if (k >= 128) bits[i] = 1;
    if (k > 0 && k < 255) part = true;
  }
  return part ? { width, height, bits, soft: cover } : { width, height, bits };
}

/** One pixel (at byte `o`) of `before` and `after` mixed by cover `k` (0 to 255) into `out`. A clear pixel takes the other's colour, so nothing darkens. */
export function mixPixel(before: ArrayLike<number>, after: ArrayLike<number>, o: number, k: number, out: { [i: number]: number }): void {
  if (k >= 255) {
    for (let c = 0; c < 4; c++) out[o + c] = after[o + c];
    return;
  }
  const t = k / 255;
  const ba = before[o + 3];
  const aa = after[o + 3];
  const a = ba + (aa - ba) * t;
  if (a <= 0) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    return;
  }
  // Weight the colours by how opaque each side is, so a see-through pixel doesn't pull the colour toward black.
  const wb = ba * (1 - t);
  const wa = aa * t;
  for (let c = 0; c < 3; c++) out[o + c] = Math.round((before[o + c] * wb + after[o + c] * wa) / (wb + wa));
  out[o + 3] = Math.round(a);
}

/** The mask with its edge pushed out (r above 0) or in (r below 0) by that many pixels, as a hard edge. A new mask. */
export function growMask(m: Mask, r: number): Mask {
  const n = Math.min(MAX_REACH, Math.round(Math.abs(r)));
  const w = m.width;
  const h = m.height;
  // Work on the part that is in (half cover or more); a soft edge is cut sharp first.
  if (n < 1) return { width: w, height: h, bits: m.bits.slice() };
  if (r > 0) return { width: w, height: h, bits: dilate(m.bits, w, h, n) };
  const out = new Uint8Array(m.bits.length);
  for (let i = 0; i < out.length; i++) out[i] = m.bits[i] ^ 1;
  // The edge of the picture doesn't eat in: only unselected pixels inside it push the selection back.
  const grown = dilate(out, w, h, n);
  for (let i = 0; i < out.length; i++) out[i] = grown[i] ^ 1;
  return { width: w, height: h, bits: out };
}

/** Coverage on a straight line of weights that add to 1: a bell curve of width `sigma`, cut at three sigma. */
export function bellWeights(sigma: number): Float32Array {
  const reach = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(reach * 2 + 1);
  let sum = 0;
  for (let i = -reach; i <= reach; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + reach] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

/**
 * The edge made soft: the cover fades over about twice `radius` pixels, centred on where the edge was, so a feather of 4
 * fades from 4 pixels in to 4 pixels out. Past the edge of the picture counts as more of the nearest pixel, so a
 * selection that runs to the border doesn't fade away there. A radius under half a pixel returns the mask as it was.
 */
export function featherMask(m: Mask, radius: number): Mask {
  const r = Math.min(MAX_REACH, Math.max(0, radius));
  if (r < 0.5) return m;
  const w = m.width;
  const h = m.height;
  const k = bellWeights(r / 2);
  const reach = (k.length - 1) / 2;
  const src = coverOf(m);
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -reach; i <= reach; i++) v += src[row + Math.min(w - 1, Math.max(0, x + i))] * k[i + reach];
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      for (let i = -reach; i <= reach; i++) v += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + reach];
      out[y * w + x] = Math.round(v);
    }
  }
  return fromCover(w, h, out);
}
