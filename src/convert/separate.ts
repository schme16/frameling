// Colour separation: which colours stand for a picture, and which one each pixel belongs to. Pure functions on RGBA
// bytes. The picking of the colours is the palette quantiser the pixel tools already use (src/pixel/quantise.ts);
// what is added here is giving every pixel to its nearest colour, and putting the colours in a stacking order.
import { pickColours, tableOf } from '../pixel/quantise';

/** Alpha at or above this counts as a painted pixel (the same line the quantiser uses). */
export const SOLID = 128;

export interface Separated {
  /** Packed 0xRRGGBB, biggest area first (so the biggest is the bottom of a stack). */
  colours: number[];
  /** Per pixel: an index into `colours`, or -1 for a see-through pixel. */
  index: Int16Array;
  /** Pixels each colour holds. */
  counts: number[];
  /** Every colour of the picture is kept exactly as it is (nothing was merged). */
  exact: boolean;
  /** How many different colours the picture had (a count of bins past 65,000, so a very rough figure then). */
  distinct: number;
  /** Painted pixels. */
  solid: number;
}

const wr = 3;
const wg = 4;
const wb = 2;

/** The colour as #rrggbb. */
export function hexOf(k: number): string {
  return `#${(k & 0xffffff).toString(16).padStart(6, '0')}`;
}

/**
 * Gives each painted pixel of `pixels` (w x h RGBA) to the nearest of at most `max` colours. With a `mask` (one byte a
 * pixel) only the pixels it marks are looked at. See-through pixels get -1.
 */
export function separateColours(pixels: ArrayLike<number>, w: number, h: number, max: number, mask?: ArrayLike<number> | null): Separated {
  const n = w * h;
  let src: ArrayLike<number> = pixels;
  if (mask) {
    const c = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      c[i * 4] = pixels[i * 4];
      c[i * 4 + 1] = pixels[i * 4 + 1];
      c[i * 4 + 2] = pixels[i * 4 + 2];
      c[i * 4 + 3] = pixels[i * 4 + 3];
    }
    src = c;
  }
  const table = tableOf(src);
  const picked = pickColours(table, Math.max(1, Math.floor(max)));
  const index = new Int16Array(n).fill(-1);
  const nearest = new Map<number, number>();
  const pr = picked.map((k) => (k >> 16) & 255);
  const pg = picked.map((k) => (k >> 8) & 255);
  const pb = picked.map((k) => k & 255);
  const counts = new Array<number>(picked.length).fill(0);
  let solid = 0;
  const exact = picked.length === table.keys.length && table.exact;
  for (let i = 0; i < n; i++) {
    if (src[i * 4 + 3] < SOLID) continue;
    const k = (src[i * 4] << 16) | (src[i * 4 + 1] << 8) | src[i * 4 + 2];
    let c = nearest.get(k);
    if (c === undefined) {
      const r = src[i * 4];
      const g = src[i * 4 + 1];
      const b = src[i * 4 + 2];
      let best = Infinity;
      c = 0;
      for (let j = 0; j < picked.length; j++) {
        const d = wr * (r - pr[j]) ** 2 + wg * (g - pg[j]) ** 2 + wb * (b - pb[j]) ** 2;
        if (d < best) {
          best = d;
          c = j;
          if (d === 0) break;
        }
      }
      nearest.set(k, c);
    }
    index[i] = c;
    counts[c]++;
    solid++;
  }
  // Biggest first. A colour nobody ended up with is dropped.
  const order = picked.map((_, i) => i).filter((i) => counts[i] > 0).sort((a, b) => counts[b] - counts[a] || picked[a] - picked[b]);
  const rank = new Int16Array(picked.length).fill(-1);
  order.forEach((old, r) => (rank[old] = r));
  for (let i = 0; i < n; i++) if (index[i] >= 0) index[i] = rank[index[i]];
  return { colours: order.map((i) => picked[i]), index, counts: order.map((i) => counts[i]), exact, distinct: table.keys.length, solid };
}
