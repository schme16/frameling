/**
 * Pixel drawing maths: straight lines, the "pixel perfect" corner clean-up, brush footprints and raw RGBA writes.
 * Pure functions, no DOM.
 */

export interface PxPt {
  x: number;
  y: number;
}

/** Every pixel on the straight line between two pixels, both ends included (Bresenham). */
export function bresenham(x0: number, y0: number, x1: number, y1: number): PxPt[] {
  const out: PxPt[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** True when b sits in the elbow of an L between a and c (a and c touch only at their corners). */
export function isElbow(a: PxPt, b: PxPt, c: PxPt): boolean {
  return Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1 && (b.x === a.x || b.x === c.x) && (b.y === a.y || b.y === c.y);
}

/**
 * Feeds pixels one at a time and drops the elbow of any L-shaped corner, which is what keeps a hand-drawn pixel line
 * one pixel thick. `add` returns the pixel it just dropped, if any, so a live drawing can take it back off.
 */
export class PixelPerfect {
  readonly kept: PxPt[] = [];

  add(p: PxPt): PxPt | null {
    const last = this.kept[this.kept.length - 1];
    if (last && last.x === p.x && last.y === p.y) return null;
    this.kept.push(p);
    const n = this.kept.length;
    if (n >= 3 && isElbow(this.kept[n - 3], this.kept[n - 2], this.kept[n - 1])) return this.kept.splice(n - 2, 1)[0];
    return null;
  }
}

/** A whole list of connected pixels with the elbows removed. */
export function pixelPerfect(points: PxPt[]): PxPt[] {
  const pp = new PixelPerfect();
  for (const p of points) pp.add(p);
  return pp.kept;
}

/** A line between two pixels, as the pixels to paint. With `perfect` the elbows are removed. */
export function pixelLine(x0: number, y0: number, x1: number, y1: number, perfect: boolean): PxPt[] {
  const line = bresenham(x0, y0, x1, y1);
  return perfect ? pixelPerfect(line) : line;
}

/**
 * A pixel brush size (in art pixels, as the slider says) through a camera: `factor` is stage length per unit of size
 * (sizeThroughCamera). Whole pixels only, so it's rounded to the nearest (halves go up) and never below one pixel: a
 * 4 pixel brush is 2 through a camera zoomed in 2x, 8 through one zoomed out to half, and a 1 pixel brush stays 1.
 */
export function pixelSizeThroughCamera(size: number, factor: number): number {
  const n = Math.max(1, Math.round(size));
  if (!(factor > 0) || factor === 1) return n;
  return Math.max(1, Math.round(n * factor));
}

export type PixelShape = 'square' | 'round';

/** One row of a brush footprint: the pixels from `x0` to `x1` (both included) in the row `y`, as offsets from the centre pixel. */
export interface BrushSpan {
  y: number;
  x0: number;
  x1: number;
}

/**
 * The pixels a brush covers around its centre pixel, a row at a time: a big brush is a few thousand spans where it
 * would be millions of single pixels. Even sizes lean up and left, like most pixel tools. Rows run top to bottom with
 * none missing, so the row for offset `y` is `spans[y - spans[0].y]`.
 */
export function brushSpans(size: number, shape: PixelShape): BrushSpan[] {
  const n = Math.max(1, Math.round(size));
  const lo = -Math.floor((n - 1) / 2);
  const c = (n - 1) / 2;
  const r2 = (n / 2) * (n / 2) - 0.5;
  const round = shape === 'round' && n > 2;
  const out: BrushSpan[] = new Array(n);
  for (let j = 0; j < n; j++) {
    let i0 = 0;
    let i1 = n - 1;
    if (round) {
      const dj = (j - c) * (j - c);
      const inside = (i: number) => (i - c) * (i - c) + dj <= r2;
      // The edge from the circle's own sum, then nudged until it agrees with the pixel test exactly.
      const d = Math.sqrt(Math.max(0, r2 - dj));
      i0 = Math.max(0, Math.ceil(c - d));
      i1 = Math.min(n - 1, Math.floor(c + d));
      while (i0 > 0 && inside(i0 - 1)) i0--;
      while (i0 <= i1 && !inside(i0)) i0++;
      while (i1 < n - 1 && inside(i1 + 1)) i1++;
      while (i1 >= i0 && !inside(i1)) i1--;
    }
    out[j] = { y: lo + j, x0: lo + i0, x1: lo + i1 };
  }
  return out;
}

/** The pixels a brush covers around its centre pixel, as offsets. Fine for small brushes; a big one wants `brushSpans`. */
export function brushOffsets(size: number, shape: PixelShape): PxPt[] {
  const out: PxPt[] = [];
  for (const s of brushSpans(size, shape)) for (let x = s.x0; x <= s.x1; x++) out.push({ x, y: s.y });
  return out;
}

export type RGBA = readonly [number, number, number, number];

export function getPx(buf: Uint8ClampedArray, w: number, x: number, y: number): RGBA {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

/** Writes one pixel (replacing what was there). Out-of-range pixels are ignored. Returns whether it was written. */
export function setPx(buf: Uint8ClampedArray, w: number, h: number, x: number, y: number, c: RGBA): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const i = (y * w + x) * 4;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
  buf[i + 3] = c[3];
  return true;
}

/** Document position to the art pixel it falls in. */
export function docToPixel(x: number, y: number, pixelSize: number): PxPt {
  return { x: Math.floor(x / pixelSize), y: Math.floor(y / pixelSize) };
}
