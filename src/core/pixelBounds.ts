/**
 * Pixel drawings keep only the painted part of the art grid. A drawing is a `width` x `height` block of RGBA at
 * (`x`, `y`) art pixels from the grid's top-left (missing x and y = 0). A drawing as big as the whole grid at (0, 0)
 * is the older shape of a drawing and is still valid; a blank drawing is 0 x 0.
 *
 * Code that wants the whole grid (fills, selections, filters, exports) asks for `gridPixels`; code that has a
 * grid-sized result writes it back with `setGridPixels`, which trims it to the painted part.
 */
import type { PixelDrawing } from './format';

/** A block of RGBA pixels placed on the art grid. */
export interface Placed {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const NONE = new Uint8ClampedArray(0);

/** Where a drawing's block sits on the grid, in art pixels. */
export function drawingRect(d: Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height'>): { x: number; y: number; w: number; h: number } {
  return { x: d.x ?? 0, y: d.y ?? 0, w: d.width, h: d.height };
}

/** True when the drawing has nothing painted (no block at all). */
export const isBlankDrawing = (d: Pick<PixelDrawing, 'width' | 'height'>): boolean => d.width === 0 || d.height === 0;

/** True when the drawing's block is the whole gw x gh grid. */
export const coversGrid = (d: Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height'>, gw: number, gh: number): boolean => !(d.x ?? 0) && !(d.y ?? 0) && d.width === gw && d.height === gh;

/** The smallest block holding every pixel that is not fully see-through, placed at (ox, oy). A blank picture gives 0 x 0. */
export function trimPixels(pixels: Uint8ClampedArray, w: number, h: number, ox = 0, oy = 0): Placed {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  const fast = pixels.byteOffset % 4 === 0 ? new Uint32Array(pixels.buffer, pixels.byteOffset, w * h) : null;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let first = -1;
    let last = -1;
    if (fast) {
      // Little endian: the alpha byte is the top byte of each word.
      for (let x = 0; x < w; x++) if (fast[row + x] >>> 24) { first = x; break; }
      if (first >= 0) for (let x = w - 1; x >= first; x--) if (fast[row + x] >>> 24) { last = x; break; }
    } else {
      for (let x = 0; x < w; x++) if (pixels[(row + x) * 4 + 3]) { first = x; break; }
      if (first >= 0) for (let x = w - 1; x >= first; x--) if (pixels[(row + x) * 4 + 3]) { last = x; break; }
    }
    if (first < 0) continue;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y0 === h) y0 = y;
    y1 = y;
  }
  if (x1 < 0) return { x: 0, y: 0, width: 0, height: 0, pixels: NONE };
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw === w && bh === h) return { x: ox, y: oy, width: w, height: h, pixels };
  const out = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) out.set(pixels.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + bw) * 4), y * bw * 4);
  return { x: ox + x0, y: oy + y0, width: bw, height: bh, pixels: out };
}

/** Lays a placed block on a gw x gh grid of see-through pixels. What falls off the grid is cut. */
export function placeOnGrid(p: Pick<Placed, 'x' | 'y' | 'width' | 'height' | 'pixels'>, gw: number, gh: number): Uint8ClampedArray {
  if (!p.x && !p.y && p.width === gw && p.height === gh) return p.pixels;
  const out = new Uint8ClampedArray(gw * gh * 4);
  const x0 = Math.max(0, p.x);
  const x1 = Math.min(gw, p.x + p.width);
  if (x1 <= x0) return out;
  for (let y = 0; y < p.height; y++) {
    const gy = y + p.y;
    if (gy < 0 || gy >= gh) continue;
    const src = (y * p.width + (x0 - p.x)) * 4;
    out.set(p.pixels.subarray(src, src + (x1 - x0) * 4), (gy * gw + x0) * 4);
  }
  return out;
}

// A few whole-grid copies stay around, so a tool that asks for the same drawing again does not rebuild it. Kept
// short on purpose: a big grid is megabytes, and this is what the trimmed drawings exist to avoid holding.
const recent: { from: Uint8ClampedArray; x: number; y: number; w: number; h: number; gw: number; gh: number; grid: Uint8ClampedArray }[] = [];
const RECENT = 3;

/**
 * The drawing as one gw x gh grid of RGBA (read only: it can be the drawing's own array). A drawing that covers the
 * whole grid is returned as it is; others are laid out on a grid of see-through pixels.
 */
export function gridPixels(d: Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height' | 'pixels'>, gw: number, gh: number): Uint8ClampedArray {
  if (coversGrid(d, gw, gh)) return d.pixels;
  const x = d.x ?? 0;
  const y = d.y ?? 0;
  for (let i = 0; i < recent.length; i++) {
    const r = recent[i];
    if (r.from === d.pixels && r.x === x && r.y === y && r.w === d.width && r.h === d.height && r.gw === gw && r.gh === gh) {
      if (i) recent.unshift(...recent.splice(i, 1));
      return r.grid;
    }
  }
  const grid = placeOnGrid({ x, y, width: d.width, height: d.height, pixels: d.pixels }, gw, gh);
  recent.unshift({ from: d.pixels, x, y, w: d.width, h: d.height, gw, gh, grid });
  if (recent.length > RECENT) recent.length = RECENT;
  return grid;
}

/** Lets go of the whole-grid copies kept for speed (tests, and after a document closes). */
export function forgetGrids(): void {
  recent.length = 0;
}

/** Writes a block into a drawing's fields (`x` and `y` are left out when 0, so a drawing at the corner stays as it was). */
export function setPlaced(d: { x?: number; y?: number; width: number; height: number; pixels: Uint8ClampedArray }, p: Placed): void {
  d.width = p.width;
  d.height = p.height;
  d.pixels = p.pixels;
  if (p.x) d.x = p.x;
  else delete d.x;
  if (p.y) d.y = p.y;
  else delete d.y;
}

/** Writes a gw x gh grid of RGBA into a drawing, keeping only the painted part. */
export function setGridPixels(d: { x?: number; y?: number; width: number; height: number; pixels: Uint8ClampedArray }, grid: Uint8ClampedArray, gw: number, gh: number): void {
  setPlaced(d, trimPixels(grid, gw, gh));
}

/** The same drawing trimmed to what is painted (the drawing itself when it already is). */
export function trimmedDrawing<T extends Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height' | 'pixels'>>(d: T): T {
  if (d.pixels.length !== d.width * d.height * 4) return d;
  const t = trimPixels(d.pixels, d.width, d.height, d.x ?? 0, d.y ?? 0);
  if (t.width === d.width && t.height === d.height && t.x === (d.x ?? 0) && t.y === (d.y ?? 0)) return d;
  const out = { ...d, width: t.width, height: t.height, pixels: t.pixels } as T;
  if (t.x) out.x = t.x;
  else delete out.x;
  if (t.y) out.y = t.y;
  else delete out.y;
  return out;
}

/** The bytes a drawing holds, for memory reports. */
export const drawingBytes = (d: Pick<PixelDrawing, 'pixels'>): number => d.pixels.byteLength;

/** The smallest rectangle (grid art pixels) holding the blocks of both drawings, or null when both are blank. */
export function unionRect(a: Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height'>, b: Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height'>): { x: number; y: number; w: number; h: number } | null {
  const ra = a.width > 0 && a.height > 0 ? drawingRect(a) : null;
  const rb = b.width > 0 && b.height > 0 ? drawingRect(b) : null;
  if (!ra || !rb) return ra ?? rb;
  const x = Math.min(ra.x, rb.x);
  const y = Math.min(ra.y, rb.y);
  return { x, y, w: Math.max(ra.x + ra.w, rb.x + rb.w) - x, h: Math.max(ra.y + ra.h, rb.y + rb.h) - y };
}

/** The drawing's pixels over the rectangle (grid art pixels), see-through where it holds nothing. */
export function pixelsOver(d: Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height' | 'pixels'>, r: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
  return placeOnGrid({ x: (d.x ?? 0) - r.x, y: (d.y ?? 0) - r.y, width: d.width, height: d.height, pixels: d.pixels }, r.w, r.h);
}

/** Copies a rectangle (grid art pixels) out of a gw-wide grid. */
export function cropGrid(grid: Uint8ClampedArray, gw: number, r: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) out.set(grid.subarray(((r.y + y) * gw + r.x) * 4, ((r.y + y) * gw + r.x + r.w) * 4), y * r.w * 4);
  return out;
}

/**
 * Writes a finished gw-wide grid into a drawing when only the rectangle `touched` was changed since the drawing was
 * `was`: copies and trims just the union of the two, not the whole grid. The grid must be blank outside that union.
 */
export function setGridRect(
  d: { x?: number; y?: number; width: number; height: number; pixels: Uint8ClampedArray },
  grid: Uint8ClampedArray,
  gw: number,
  was: Pick<PixelDrawing, 'x' | 'y' | 'width' | 'height'>,
  touched: { x: number; y: number; w: number; h: number } | null,
): void {
  const r = touched ? unionRect(was, { x: touched.x, y: touched.y, width: touched.w, height: touched.h }) : unionRect(was, { width: 0, height: 0 });
  if (!r) return setPlaced(d, { x: 0, y: 0, width: 0, height: 0, pixels: NONE });
  setPlaced(d, trimPixels(cropGrid(grid, gw, r), r.w, r.h, r.x, r.y));
}
