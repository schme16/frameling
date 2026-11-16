// A bitmap tip from a brush file becomes a picture tip, the way a tip made from a selection does: shrunk to fit the most a
// picture tip holds (32 by 32), the empty margin trimmed off so "size" means the part you can see, and the colours cut to
// what a saved brush can keep. A grey tip (one that is only a shape, with shades for how much paint) becomes a soft
// tip, so its shading stays; a colour tip keeps its own colours. Pure, no DOM.
import { MAX_STAMP, type PixelStamp } from '../stamps';
import { BrushProblem } from './types';

/** Fills `out` with the pixel at x, y as 0 to 255 red, green, blue and see-through. */
export type PixelReader = (x: number, y: number, out: number[]) => void;

export interface Tip {
  stamp: PixelStamp;
  /** How many pixels across the visible part was in the file, longer side: the brush's size. */
  size: number;
  /** The picture was shrunk to fit. */
  shrunk: boolean;
  /** The colours were cut down to fit. */
  reduced: boolean;
}

/** Cells fainter than this (out of 255) count as empty, so a dusting of near-clear pixels doesn't widen the tip. */
const FAINT = 6;
const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

export function tipFrom(w: number, h: number, read: PixelReader, colour: boolean): Tip {
  if (!(w >= 1 && h >= 1)) throw new BrushProblem('That brush has no picture in it.');
  const longer = Math.max(w, h);
  const f = longer > MAX_STAMP ? longer / MAX_STAMP : 1;
  const ow = Math.max(1, Math.min(MAX_STAMP, Math.round(w / f)));
  const oh = Math.max(1, Math.min(MAX_STAMP, Math.round(h / f)));
  const sum = new Float64Array(ow * oh * 4);
  const count = new Float64Array(ow * oh);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    const cy = Math.min(oh - 1, Math.floor((y * oh) / h));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(ow - 1, Math.floor((x * ow) / w));
      read(x, y, px);
      const i = cy * ow + cx;
      const a = px[3];
      sum[i * 4] += px[0] * a;
      sum[i * 4 + 1] += px[1] * a;
      sum[i * 4 + 2] += px[2] * a;
      sum[i * 4 + 3] += a;
      count[i]++;
    }
  }
  // One RGBA cell each, average colour weighted by how solid each pixel was.
  const cells = new Uint8Array(ow * oh * 4);
  for (let i = 0; i < ow * oh; i++) {
    const a = sum[i * 4 + 3];
    if (!count[i] || a <= 0) continue;
    cells[i * 4] = Math.round(sum[i * 4] / a);
    cells[i * 4 + 1] = Math.round(sum[i * 4 + 1] / a);
    cells[i * 4 + 2] = Math.round(sum[i * 4 + 2] / a);
    cells[i * 4 + 3] = Math.round(a / count[i]);
  }
  // Trim the empty margin.
  let x0 = ow;
  let y0 = oh;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++)
      if (cells[(y * ow + x) * 4 + 3] > FAINT) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new BrushProblem('That brush is empty: there is nothing in its picture to paint with.');
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const size = Math.max(1, Math.round(Math.max((cw * w) / ow, (ch * h) / oh)));
  const index = new Map<string, number>();
  const colours: string[] = [];
  const out: number[] = new Array(cw * ch).fill(0);
  let reduced = false;
  // Colour tips: fewer bits per channel until the colours fit what a saved brush holds (256), as a last resort 2 bits and 4 see-through levels.
  const depths = colour ? [8, 5, 4, 3, 2] : [0];
  for (const bits of depths) {
    index.clear();
    colours.length = 0;
    let over = false;
    for (let y = 0; y < ch && !over; y++)
      for (let x = 0; x < cw; x++) {
        const k = ((y0 + y) * ow + x0 + x) * 4;
        const a0 = cells[k + 3];
        if (a0 <= FAINT) {
          out[y * cw + x] = 0;
          continue;
        }
        let key: string;
        if (!colour) {
          // 32 levels of paint is plenty to look smooth, and keeps the saved brush small.
          const a = Math.max(8, Math.round((a0 / 255) * 31) * 8);
          key = `#000000${hex2(Math.min(255, a))}`;
        } else {
          const q = (v: number): number => (bits >= 8 ? v : Math.round((v >> (8 - bits)) * (255 / ((1 << bits) - 1))));
          const aq = bits >= 8 ? a0 : bits >= 5 ? (a0 >> 3) * 8 + 4 : Math.min(255, Math.round(a0 / 85) * 85);
          const a = Math.max(8, Math.min(255, aq));
          key = `#${hex2(q(cells[k]))}${hex2(q(cells[k + 1]))}${hex2(q(cells[k + 2]))}${a < 255 ? hex2(a) : ''}`;
        }
        let n = index.get(key);
        if (n === undefined) {
          if (colours.length >= 256) {
            over = true;
            break;
          }
          colours.push(key);
          n = colours.length;
          index.set(key, n);
        }
        out[y * cw + x] = n;
      }
    if (!over) {
      reduced = colour && bits < 8;
      break;
    }
    if (bits === depths[depths.length - 1]) throw new BrushProblem('That brush has too many colours to keep.');
  }
  const stamp: PixelStamp = { w: cw, h: ch, colours: [...colours], cells: out, keep: colour && colours.length > 1 };
  if (!colour) stamp.soft = true;
  return { stamp, size, shrunk: f > 1, reduced };
}
