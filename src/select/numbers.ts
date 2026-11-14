/**
 * The boxes for a selection's exact place and size: X, Y, Width, Height, Turn and Slant. Pure: each takes the selection's
 * box and the number typed, and gives back the change to make (a matrix for shapes, a pixel operation for pixels), or null
 * when that number is what it already is.
 *
 * Shapes: X and Y are the left and top of the selection's box, Width and Height its size, all in page pixels (the boxes
 * show them in the chosen unit). Turn and Slant are "by this many degrees from where it is now", because a plain shape
 * doesn't remember an angle; both go about the middle of the box.
 *
 * Pixels: the same boxes in whole pixels of the art (the layer's own grid, 0 and 0 at its top left), not of the page.
 * A layer drawn at 8 page pixels per art pixel counts X 3 as 24 on the page. Slant is left out: a slant of pixels
 * would smear them.
 */
import { about, scaleAbout, translate, rotateAbout, type Matrix, type Rect } from '../canvas/geometry';
import type { Img, PixelBox } from '../pixel/transform';

const EPS = 1e-6;
/** The smallest size typed in: smaller than this is a typing slip, not a size. */
export const MIN_SIZE = 0.01;
/** Past this a slant goes off to infinity. */
export const MAX_SLANT = 85;

const same = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

/** Moves the box so its left and top are where they were typed. */
export function moveBoxTo(b: Rect, x: number | null, y: number | null): Matrix | null {
  const dx = x === null || !Number.isFinite(x) ? 0 : x - b.x;
  const dy = y === null || !Number.isFinite(y) ? 0 : y - b.y;
  return same(dx, 0) && same(dy, 0) ? null : translate(dx, dy);
}

/**
 * Sizes the box from its top left corner. Give the width, the height, or both. With `keep`, the one not given follows
 * so the shape keeps its proportions (and when both are given, the width leads). Null for a size that is not a size
 * (zero, negative, not a number) or for a box with nothing to stretch along that way.
 */
export function sizeBoxTo(b: Rect, w: number | null, h: number | null, keep: boolean): Matrix | null {
  const okW = w !== null && Number.isFinite(w) && w >= MIN_SIZE && b.w > EPS;
  const okH = h !== null && Number.isFinite(h) && h >= MIN_SIZE && b.h > EPS;
  if (!okW && !okH) return null;
  let sx = okW ? w! / b.w : 1;
  let sy = okH ? h! / b.h : 1;
  if (keep) {
    if (okW) sy = sx;
    else if (okH) sx = sy;
  }
  if (same(sx, 1) && same(sy, 1)) return null;
  return scaleAbout(sx, sy, b.x, b.y);
}

/** Turns the box by some degrees (clockwise, as the Turn handle does) about its middle. */
export function turnBoxBy(b: Rect, degrees: number): Matrix | null {
  if (!Number.isFinite(degrees) || same(degrees % 360, 0)) return null;
  return rotateAbout((degrees * Math.PI) / 180, b.x + b.w / 2, b.y + b.h / 2);
}

/** Slants the box sideways by some degrees about its middle (the top goes left and the bottom right for a positive number, as a symbol's Slant does). */
export function slantBoxBy(b: Rect, degrees: number): Matrix | null {
  if (!Number.isFinite(degrees) || same(degrees, 0)) return null;
  const k = Math.tan((Math.max(-MAX_SLANT, Math.min(MAX_SLANT, degrees)) * Math.PI) / 180);
  return about([1, 0, k, 1, 0, 0], b.x + b.w / 2, b.y + b.h / 2);
}

// ---------------------------------------------------------------- pixels

/** The size of a pixel box in whole pixels (the box is inclusive at both ends). */
export const pixelSize = (b: PixelBox): { w: number; h: number } => ({ w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });

/** The new size in whole pixels for a typed width and/or height, keeping proportions if asked; null when nothing changes or it isn't a size. */
export function pixelSizeTo(b: PixelBox, w: number | null, h: number | null, keep: boolean): { w: number; h: number } | null {
  const cur = pixelSize(b);
  const whole = (v: number | null) => (v !== null && Number.isFinite(v) && Math.round(v) >= 1 ? Math.round(v) : null);
  const nw = whole(w);
  const nh = whole(h);
  if (nw === null && nh === null) return null;
  let outW = nw ?? cur.w;
  let outH = nh ?? cur.h;
  if (keep && nw !== null) outH = Math.max(1, Math.round((cur.h * nw) / cur.w));
  else if (keep && nh !== null) outW = Math.max(1, Math.round((cur.w * nh) / cur.h));
  return outW === cur.w && outH === cur.h ? null : { w: outW, h: outH };
}

/** The selected pixels moved by whole pixels (they are in `img` alone, the rest clear); what goes off the grid is dropped. */
export function shiftPixels(img: Img, dx: number, dy: number): Uint8ClampedArray {
  const { width: w, height: h, pixels: p } = img;
  const out = new Uint8ClampedArray(p.length);
  const ix = Math.round(dx);
  const iy = Math.round(dy);
  for (let y = 0; y < h; y++) {
    const ny = y + iy;
    if (ny < 0 || ny >= h) continue;
    for (let x = 0; x < w; x++) {
      const nx = x + ix;
      if (nx < 0 || nx >= w) continue;
      const s = (y * w + x) * 4;
      if (!p[s + 3]) continue;
      out.set(p.subarray(s, s + 4), (ny * w + nx) * 4);
    }
  }
  return out;
}

/**
 * The pixels of `box` stretched to `toW` by `toH` with their top left corner kept, every pixel one of the art's own colours
 * (no blending). Bigger sizes repeat pixels, smaller ones skip them; what lands off the grid is dropped.
 */
export function scalePixels(img: Img, box: PixelBox, toW: number, toH: number): Uint8ClampedArray {
  const { width: w, height: h, pixels: p } = img;
  const out = new Uint8ClampedArray(p.length);
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  for (let y = 0; y < toH; y++) {
    const dy = box.y0 + y;
    if (dy < 0 || dy >= h) continue;
    const sy = box.y0 + Math.min(bh - 1, Math.floor(((y + 0.5) * bh) / toH));
    for (let x = 0; x < toW; x++) {
      const dx = box.x0 + x;
      if (dx < 0 || dx >= w) continue;
      const sx = box.x0 + Math.min(bw - 1, Math.floor(((x + 0.5) * bw) / toW));
      const s = (sy * w + sx) * 4;
      if (!p[s + 3]) continue;
      out.set(p.subarray(s, s + 4), (dy * w + dx) * 4);
    }
  }
  return out;
}

