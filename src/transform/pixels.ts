/**
 * Putting selected pixels through a matrix: the Transform tool's pixel half. Pure, no DOM.
 *
 * Pixels can't be turned or squashed without being picked again, so this is lossy, and the tool says so. Two rules keep
 * it honest for pixel art: nothing is ever blended (every pixel that comes out is one of the colours that went in, so a
 * locked palette stays locked), and the work always starts from the original pixels (a session never resamples a
 * resampled picture).
 *
 * - A move by whole pixels, a flip and a quarter turn are exact: nothing is lost.
 * - A stretch or squash picks the nearest pixel (bigger repeats pixels, smaller skips them).
 * - A turn or a skew, in the `crisp` way, first doubles the art three times with Scale2x (which rounds off the
 *   staircase steps without inventing colours) and then picks the nearest pixel of that, the idea behind RotSprite.
 *   The `plain` way skips the doubling: blockier, and the same pixel-for-pixel as the stretch.
 */
import { scale2x, u32, type Img, type PixelBox } from '../pixel/transform';
import type { Matrix } from '../canvas/geometry';
import type { PixelOp } from '../select/ops';
import { inverse } from './box';

export type Resample = 'crisp' | 'plain';

const EPS = 1e-9;
const near = (a: number, b: number, e = 1e-6): boolean => Math.abs(a - b) < e;

/** True when the matrix keeps straight lines level (no turn and no slant), so every row stays a row. */
export const isSquare = (m: Matrix): boolean => near(m[1], 0) && near(m[2], 0);

/** True when the matrix only moves things by whole pixels: nothing is picked again. */
export const isWholeMove = (m: Matrix): boolean => near(m[0], 1) && near(m[3], 1) && isSquare(m) && near(m[4], Math.round(m[4]), 1e-3) && near(m[5], Math.round(m[5]), 1e-3);

/** True when the result is exact, not picked again: a whole-pixel move, a flip, or a turn by a right angle (on the pixel grid). */
export function isLossless(m: Matrix, box: PixelBox): boolean {
  const whole = (v: number) => near(v, Math.round(v), 1e-3);
  // Where the box's corners land must be on pixel edges, and the matrix must only turn by right angles or flip.
  const lin = [m[0], m[1], m[2], m[3]];
  const axis = (isSquare(m) && lin.every((v) => near(Math.abs(v), 0) || near(Math.abs(v), 1))) || (near(m[0], 0) && near(m[3], 0) && lin.every((v) => near(Math.abs(v), 0) || near(Math.abs(v), 1)));
  if (!axis) return false;
  const pts = [
    [box.x0, box.y0],
    [box.x1 + 1, box.y1 + 1],
  ];
  return pts.every(([x, y]) => whole(m[0] * x + m[2] * y + m[4]) && whole(m[1] * x + m[3] * y + m[5]));
}

interface Upscaled {
  key: string;
  cur: Uint32Array;
  cw: number;
  ch: number;
  bx: number;
  by: number;
}
const upscaled = new WeakMap<Uint8ClampedArray, Upscaled>();
const SCALE = 8;

/** The art inside the box (and a pixel round it) doubled three times with Scale2x. Kept for the next drag over the same pixels. */
function upscale(img: Img, box: PixelBox): Upscaled {
  const key = `${box.x0},${box.y0},${box.x1},${box.y1}`;
  const hit = upscaled.get(img.pixels);
  if (hit && hit.key === key) return hit;
  const { width: w, height: h } = img;
  const bx = Math.max(0, box.x0 - 1);
  const by = Math.max(0, box.y0 - 1);
  const bw = Math.min(w - 1, box.x1 + 1) - bx + 1;
  const bh = Math.min(h - 1, box.y1 + 1) - by + 1;
  const all = u32(img.pixels);
  let cur: Uint32Array = new Uint32Array(bw * bh);
  for (let y = 0; y < bh; y++) cur.set(all.subarray((by + y) * w + bx, (by + y) * w + bx + bw), y * bw);
  let cw = bw;
  let ch = bh;
  for (let i = 0; i < 3; i++) {
    cur = scale2x(cur, cw, ch);
    cw *= 2;
    ch *= 2;
  }
  const out = { key, cur, cw, ch, bx, by };
  upscaled.set(img.pixels, out);
  return out;
}

/**
 * The pixels of `img` inside `box` put through `m` (a matrix in art pixels), everything else clear. `img` holds only the
 * selected pixels (see applyInSelection), and what lands off the grid is dropped.
 */
export function resamplePixels(img: Img, box: PixelBox, m: Matrix, how: Resample = 'crisp'): Uint8ClampedArray {
  const { width: w, height: h, pixels: p } = img;
  const out = new Uint8ClampedArray(p.length);
  const inv = inverse(m);
  if (!inv) return out;
  // The part of the grid the box can land on.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [box.x0, box.y0],
    [box.x1 + 1, box.y0],
    [box.x1 + 1, box.y1 + 1],
    [box.x0, box.y1 + 1],
  ]) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  const dst = new Uint32Array(out.buffer);
  const src = u32(p);
  const smooth = how === 'crisp' && !isSquare(m);
  const up = smooth ? upscale(img, box) : null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const sx = inv[0] * cx + inv[2] * cy + inv[4];
      const sy = inv[1] * cx + inv[3] * cy + inv[5];
      let v = 0;
      if (up) {
        const ux = Math.floor((sx - up.bx) * SCALE);
        const uy = Math.floor((sy - up.by) * SCALE);
        if (ux < 0 || uy < 0 || ux >= up.cw || uy >= up.ch) continue;
        v = up.cur[uy * up.cw + ux];
      } else {
        const ix = Math.floor(sx + EPS);
        const iy = Math.floor(sy + EPS);
        if (ix < box.x0 || iy < box.y0 || ix > box.x1 || iy > box.y1) continue;
        v = src[iy * w + ix];
      }
      if (v) dst[y * w + x] = v;
    }
  }
  return out;
}

/** The pixel operation for `m`, in the shape `editPixels` and `applyInSelection` take. */
export const pixelOp =
  (m: Matrix, how: Resample = 'crisp'): PixelOp =>
  (img, box) =>
    box ? resamplePixels(img, box, m, how) : null;
