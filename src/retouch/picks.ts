// The three "what does this pixel become" functions the retouch brushes give the dab engine (DabParams.pick).
import type { Surface } from '../dab/stroke';
import { blurAt, blurRadius, sharpenGain, sharpenOf, sharpenRadius, StrokeMemo, type Pt, type Reader } from './maths';

type Pick = (x: number, y: number, was: Uint8ClampedArray, out: Uint8ClampedArray | number[]) => void;

const readerFor = (s: Surface): Reader => (x, y, out) => s.read(x, y, out);

/** Clone: the pixel `offset` away, read from `source` (the layer as it was before the stroke, or a picture of everything visible). */
export function clonePick(source: Reader, offset: Pt): Pick {
  return (x, y, _was, out) => source(x + offset.x, y + offset.y, out);
}

/** Blur: the average of the pixels round it, as the picture was before the stroke. */
export function blurPick(s: Surface, amount: number): Pick {
  const memo = new StrokeMemo(s.width);
  const read = readerFor(s);
  const r = blurRadius(amount);
  return (x, y, _was, out) => memo.get(x, y, (t) => blurAt(read, s.width, s.height, x, y, r, t), out);
}

/** Sharpen: the pixel pushed away from the average round it. */
export function sharpenPick(s: Surface, amount: number): Pick {
  const memo = new StrokeMemo(s.width);
  const read = readerFor(s);
  const r = sharpenRadius(amount);
  const gain = sharpenGain(amount);
  const mean = new Uint8ClampedArray(4);
  return (x, y, was, out) =>
    memo.get(
      x,
      y,
      (t) => {
        blurAt(read, s.width, s.height, x, y, r, mean);
        sharpenOf(was, mean, gain, t);
      },
      out,
    );
}
