// Zstandard tiles from a file somebody else made. The decoder (fzstd, MIT) trusts the sizes a frame declares and will
// allocate whatever they say, so the frame header and block list are checked here first: one frame only, a window that is
// small, a size (declared, or counted from the blocks when the writer left it out, as streaming writers do) that is small,
// and nothing after the end. Pure.
import { decompress } from 'fzstd';

export class ZstdProblem extends Error {}

const MAGIC = 0xfd2fb528;
/** The largest window a tile may ask the decoder to hold. A real tile is a few hundred kilobytes. */
const MAX_WINDOW = 16 * 1024 * 1024;
const MAX_BLOCK = 128 * 1024;

const u32 = (b: Uint8Array, i: number): number => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/**
 * What the frame header says about the frame (`size` is null when it doesn't say), and where the frame ends. Throws when it
 * is not one clean frame, or could give more than `max` bytes (plus the slack of one block).
 */
export function checkFrame(b: Uint8Array, max = Infinity): { size: number | null; end: number } {
  if (b.length < 9 || u32(b, 0) !== MAGIC) throw new ZstdProblem('not a zstandard frame');
  const flag = b[4];
  if (flag & 8) throw new ZstdProblem('a reserved bit is set');
  const single = (flag >> 5) & 1;
  const checksum = (flag >> 2) & 1;
  const dictBytes = [0, 1, 2, 4][flag & 3];
  const fcs = flag >> 6;
  let at = 5;
  let window = 0;
  if (!single) {
    const d = b[at++];
    const base = 2 ** (10 + (d >> 3));
    window = base + (base / 8) * (d & 7);
  }
  if (dictBytes) throw new ZstdProblem('it needs a dictionary');
  const fsBytes = fcs === 0 ? (single ? 1 : 0) : 1 << fcs;
  if (at + fsBytes > b.length) throw new ZstdProblem('it stops short');
  let size: number | null = null;
  if (fsBytes) {
    size = 0;
    for (let i = fsBytes - 1; i >= 0; i--) size = size * 256 + b[at + i];
    if (fcs === 1) size += 256;
    at += fsBytes;
    if (size > max) throw new ZstdProblem('it is bigger than a tile should be');
  }
  if (single) window = size ?? 0;
  if (window > MAX_WINDOW) throw new ZstdProblem('it asks for too much memory');
  // Walk the blocks: each has a 3 byte header saying its kind and size, so the end of the frame is known without decoding.
  let regenerated = 0;
  for (;;) {
    if (at + 3 > b.length) throw new ZstdProblem('it stops short');
    const h = b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
    const last = h & 1;
    const type = (h >> 1) & 3;
    const n = h >> 3;
    if (type === 3) throw new ZstdProblem('it has a block of a kind that does not exist');
    if (n > MAX_BLOCK) throw new ZstdProblem('it has a block that is too big');
    at += 3;
    if (type === 1) {
      at += 1;
      regenerated += n;
    } else {
      at += n;
      regenerated += type === 0 ? n : MAX_BLOCK;
    }
    if (at > b.length) throw new ZstdProblem('it stops short');
    if (last) break;
  }
  if (checksum) at += 4;
  if (at > b.length) throw new ZstdProblem('it stops short');
  // Raw and repeat blocks add up exactly; compressed ones can give up to a block each: a ceiling, so a runaway is stopped.
  if (regenerated > max + MAX_BLOCK) throw new ZstdProblem('it is bigger than a tile should be');
  if (size !== null && regenerated < size) throw new ZstdProblem('it is smaller than it says');
  return { size, end: at };
}

/** Decompresses one tile of at most `max` bytes. Throws ZstdProblem, in a few words, for anything else. */
export function unzstd(bytes: Uint8Array, max: number): Uint8Array {
  const { size, end } = checkFrame(bytes, max);
  if (end !== bytes.length) throw new ZstdProblem('there is more after the end of it');
  let out: Uint8Array;
  try {
    out = decompress(bytes);
  } catch {
    throw new ZstdProblem('it is damaged');
  }
  if (out.length > max + MAX_BLOCK || (size !== null && out.length !== size)) throw new ZstdProblem('it is not the size it says');
  return out;
}
