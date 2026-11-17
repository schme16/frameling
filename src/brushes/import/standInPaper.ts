// A paper to stand in for one of Procreate's own, which a .brush only names. Frameling's built in papers are tidy
// patterns (a grid, an even speckle) made for chalk on pixel art; a photographed paper is neither tidy nor even. It
// has fibres that run one way, bumps at several sizes at once, and most of it is mid height. This draws one like that
// from a fixed recipe, so it is the same every time and nothing is copied out of Procreate. Pure, no DOM.
import { encodeBytes, type TexturePicture } from '../../dab/texturePicture';

const SIDE = 256;

/** A number from two whole numbers and a seed, the same every time (a small integer hash), 0 to 1. */
function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Smooth noise on a grid `sx` by `sy` pixels apart, wrapping at the edge so the paper repeats without a seam. */
function noise(x: number, y: number, sx: number, sy: number, seed: number): number {
  const cx = SIDE / sx;
  const cy = SIDE / sy;
  const gx = x / sx;
  const gy = y / sy;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = ease(gx - ix);
  const fy = ease(gy - iy);
  const at = (i: number, j: number): number => hash(((i % cx) + cx) % cx, ((j % cy) + cy) % cy, seed);
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

let fibre: TexturePicture | null = null;

/**
 * A soft fibrous paper (pastel paper, watercolour paper, cotton): long fibres lying across the sheet, wavy rather than
 * ruled, with a fine tooth over them. Light is high ground, where the paint catches.
 */
export function fibrePaper(): TexturePicture {
  if (fibre) return fibre;
  const out = new Uint8Array(SIDE * SIDE);
  for (let y = 0; y < SIDE; y++)
    for (let x = 0; x < SIDE; x++) {
      // The fibres wander up and down a little as they cross the sheet, so they never line up into a grid.
      const wy = y + (noise(x, y, 32, 32, 11) - 0.5) * 6;
      const long = noise(x, wy, 32, 4, 1) * 0.55 + noise(x, wy, 16, 2, 2) * 0.35 + noise(x, wy, 64, 8, 3) * 0.1;
      const tooth = noise(x, y, 2, 2, 4) * 0.6 + hash(x, y, 5) * 0.4;
      const h = long * 0.62 + tooth * 0.38;
      // Stretched so the ridges reach full height and the troughs go right down, the way a rubbing of paper does.
      out[y * SIDE + x] = Math.round(255 * Math.min(1, Math.max(0, (h - 0.2) / 0.42)));
    }
  fibre = { side: SIDE, data: encodeBytes(out) };
  return fibre;
}
