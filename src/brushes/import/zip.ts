// Reading a zip (a Krita resource bundle is one) for a file that cannot be trusted. Only the plain kind: stored or deflate,
// no encryption, no zip64. The directory is checked against the real size of the file before anything is used, every name
// is only ever compared (never made into a path), and each entry is inflated with a ceiling, with a ceiling on all of them
// together. Pure, no DOM.
import { inflateCapped } from './inflate';
import { BrushProblem } from './types';

export const MAX_ZIP_ENTRIES = 4096;
/** The most one entry may unpack to. */
export const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
/** The most all the entries one file is asked for may unpack to together. */
export const MAX_UNPACKED_TOTAL = 256 * 1024 * 1024;

export interface ZipItem {
  name: string;
  method: number;
  /** Where the compressed bytes start, and how many there are. */
  from: number;
  length: number;
}

export class Zip {
  private unpacked = 0;
  constructor(readonly bytes: Uint8Array, readonly items: ZipItem[]) {}

  /** The entry's bytes, unpacked (counted against the total). Null when it cannot be read as a plain entry. */
  read(item: ZipItem, cap = MAX_ENTRY_BYTES): Uint8Array {
    const raw = this.bytes.subarray(item.from, item.from + item.length);
    let out: Uint8Array;
    if (item.method === 0) {
      if (raw.length > cap) throw new BrushProblem(`"${item.name.slice(0, 60)}" in that file is too big to be part of a brush set.`);
      out = raw;
    } else out = inflateCapped(raw, cap, `"${item.name.slice(0, 60)}"`);
    this.unpacked += out.length;
    if (this.unpacked > MAX_UNPACKED_TOTAL) throw new BrushProblem('That file unpacks to far more than a brush set ever holds, so Frameling stopped: it is damaged or made to cause trouble.');
    return out;
  }
}

/** Walks the directory of a zip. Throws a `BrushProblem` for anything that is not one, or is a kind this does not read. */
export function openZip(bytes: Uint8Array, what = 'file'): Zip {
  const damaged = (): never => {
    throw new BrushProblem(`That ${what} is damaged: its list of contents does not add up.`);
  };
  if (bytes.length < 22) return damaged();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = -1;
  for (let i = bytes.length - 22, stop = Math.max(0, bytes.length - 22 - 65535); i >= stop; i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      e = i;
      break;
    }
  }
  if (e < 0) return damaged();
  const count = v.getUint16(e + 10, true);
  const dirSize = v.getUint32(e + 12, true);
  const dirAt = v.getUint32(e + 16, true);
  if (count === 0xffff || dirAt === 0xffffffff) throw new BrushProblem(`That ${what} is a zip64 file, which a brush set never needs, so Frameling doesn't read it.`);
  if (count > MAX_ZIP_ENTRIES) throw new BrushProblem(`That ${what} lists ${count} files, far more than a brush set holds.`);
  if (dirAt + dirSize > e || dirAt > bytes.length) return damaged();
  const items: ZipItem[] = [];
  let at = dirAt;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || v.getUint32(at, true) !== 0x02014b50) return damaged();
    const flags = v.getUint16(at + 8, true);
    const method = v.getUint16(at + 10, true);
    const csize = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const extraLen = v.getUint16(at + 30, true);
    const commentLen = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    if (at + 46 + nameLen + extraLen + commentLen > e) return damaged();
    const name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new BrushProblem(`That ${what} is locked with a password, so Frameling can't read it.`);
    if (method !== 0 && method !== 8) continue;
    if (csize === 0xffffffff) continue;
    if (local + 30 > bytes.length || v.getUint32(local, true) !== 0x04034b50) return damaged();
    const from = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (from + csize > bytes.length) return damaged();
    items.push({ name, method, from, length: csize });
  }
  return new Zip(bytes, items);
}
