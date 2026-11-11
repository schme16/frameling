/**
 * Pixel selection masks: which art pixels of a pixel layer are selected. Pure, no DOM, so it is easy to test and fast
 * on a 256 x 256 grid. A mask is one byte per art pixel, 1 = selected. Masks are never changed in place by these
 * functions; each returns a new one.
 */
import { u32 } from '../pixel/transform';

export interface Mask {
  width: number;
  height: number;
  bits: Uint8Array;
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
  const out = new Uint8Array(a.bits.length);
  const x = a.bits;
  const y = b.bits;
  if (op === 'add') for (let i = 0; i < out.length; i++) out[i] = x[i] | y[i];
  else if (op === 'subtract') for (let i = 0; i < out.length; i++) out[i] = x[i] & (y[i] ^ 1);
  else for (let i = 0; i < out.length; i++) out[i] = x[i] & y[i];
  return { width: a.width, height: a.height, bits: out };
}

export function invertMask(m: Mask): Mask {
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
  for (let y = 0; y < h; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= h) continue;
    const x0 = Math.max(0, -dx);
    const x1 = Math.min(w, w - dx);
    if (x1 > x0) out.bits.set(m.bits.subarray(y * w + x0, y * w + x1), ny * w + x0 + dx);
  }
  return out;
}

/** A mask made to fit another grid size (kept at the top left, cropped or padded). */
export function resizeMask(m: Mask, width: number, height: number): Mask {
  if (m.width === width && m.height === height) return m;
  const out = emptyMask(width, height);
  const w = Math.min(width, m.width);
  for (let y = 0; y < Math.min(height, m.height); y++) out.bits.set(m.bits.subarray(y * m.width, y * m.width + w), y * width);
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
  const dst = new Uint32Array(out.buffer);
  const bits = m.bits;
  for (let i = 0; i < bits.length; i++) if (bits[i]) dst[i] = 0;
  return out;
}

/** `after` inside the selection and `before` outside it: how every edit is kept to the selection. */
export function clipToMask(before: Uint8ClampedArray, after: Uint8ClampedArray, m: Mask): Uint8ClampedArray {
  const out = new Uint8ClampedArray(before);
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
