// Inflating with a ceiling. A deflate stream can say "a billion zeros" in a few kilobytes, and a brush file that is a zip or
// a PNG is exactly where somebody would hide that. The input goes in small slices and the output is counted after each, so
// the work stops as soon as it passes what the caller allows, never after the memory is already spent. Pure, no DOM.
import { Inflate, Unzlib } from 'fflate';
import { BrushProblem } from './types';

/** How much compressed data goes in at a time. Deflate can at most grow about a thousand times, so a slice gives at most about 1 MB past the ceiling. */
const SLICE = 1024;

function run(make: (cb: (c: Uint8Array) => void) => { push(c: Uint8Array, final?: boolean): void }, data: Uint8Array, cap: number, what: string): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const tooBig = (): never => {
    throw new BrushProblem(`Part of that file (${what}) unpacks to far more than a brush file ever holds, so Frameling stopped: it is damaged or made to cause trouble.`);
  };
  const inf = make((c) => {
    total += c.length;
    if (total > cap) tooBig();
    parts.push(c);
  });
  try {
    for (let at = 0; at < data.length; at += SLICE) inf.push(data.subarray(at, Math.min(data.length, at + SLICE)), at + SLICE >= data.length);
    if (data.length === 0) inf.push(new Uint8Array(0), true);
  } catch (e) {
    if (e instanceof BrushProblem) throw e;
    throw new BrushProblem(`Part of that file (${what}) is damaged, so it can't be unpacked.`);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of parts) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Raw deflate (what a zip entry holds), at most `cap` bytes out. */
export const inflateCapped = (data: Uint8Array, cap: number, what: string): Uint8Array => run((cb) => { const i = new Inflate(); i.ondata = (c) => cb(c); return i; }, data, cap, what);

/** A zlib stream (what a PNG text chunk holds), at most `cap` bytes out. */
export const unzlibCapped = (data: Uint8Array, cap: number, what: string): Uint8Array => run((cb) => { const i = new Unzlib(); i.ondata = (c) => cb(c); return i; }, data, cap, what);
