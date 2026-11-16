// Reads one small entry out of a zip without reading the zip: the end of the file holds a directory of where each entry
// is, so a few small reads find it. A .frameling file can be tens of megabytes; its preview picture is a few KB. Plain
// zips only (no zip64, no encryption); anything else says null. No Node or DOM in here: the reading is handed in.

export interface ZipPiece {
  /** 0 = stored, 8 = deflate (raw). */
  method: number;
  /** The entry's bytes as they sit in the zip. */
  data: Uint8Array;
  /** Its size once inflated. */
  size: number;
}

/** Reads `length` bytes from `position` (fewer at the end of the file). */
export type ReadAt = (position: number, length: number) => Uint8Array;

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** Finds `name` in a zip of `size` bytes. `maxBytes` caps how much of the entry it will read (a preview is small; a huge one is refused). */
export function peekZipEntry(read: ReadAt, size: number, name: string, maxBytes = 262144): ZipPiece | null {
  if (size < 22) return null;
  // The end-of-directory record is the last 22 bytes, unless a comment (up to 64 KB) follows it: look in a small tail
  // first, and only read more when it isn't there.
  let tail: Uint8Array = new Uint8Array(0);
  let e = -1;
  for (const want of [Math.min(size, 1024), Math.min(size, 22 + 65535)]) {
    tail = read(size - want, want);
    for (let i = tail.length - 22; i >= 0; i--) {
      if (u32(tail, i) === 0x06054b50) {
        e = i;
        break;
      }
    }
    if (e >= 0 || want === size) break;
  }
  if (e < 0) return null;
  const count = u16(tail, e + 10);
  const dirSize = u32(tail, e + 12);
  const dirAt = u32(tail, e + 16);
  if (count === 0xffff || dirAt === 0xffffffff || dirSize === 0xffffffff || dirAt + dirSize > size || dirSize > 8 * 1024 * 1024) return null;
  const dir = read(dirAt, dirSize);
  const want = new TextEncoder().encode(name);
  let at = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > dir.length || u32(dir, at) !== 0x02014b50) return null;
    const flags = u16(dir, at + 8);
    const method = u16(dir, at + 10);
    const csize = u32(dir, at + 20);
    const usize = u32(dir, at + 24);
    const nameLen = u16(dir, at + 28);
    const extraLen = u16(dir, at + 30);
    const commentLen = u16(dir, at + 32);
    const local = u32(dir, at + 42);
    let same = nameLen === want.length && at + 46 + nameLen <= dir.length;
    for (let i = 0; same && i < nameLen; i++) if (dir[at + 46 + i] !== want[i]) same = false;
    if (same) {
      if (flags & 1 || (method !== 0 && method !== 8) || csize === 0xffffffff || usize === 0xffffffff || csize > maxBytes || usize > maxBytes * 8) return null;
      const head = read(local, 30);
      if (head.length < 30 || u32(head, 0) !== 0x04034b50) return null;
      const start = local + 30 + u16(head, 26) + u16(head, 28);
      if (start + csize > size) return null;
      const data = read(start, csize);
      return data.length === csize ? { method, data, size: usize } : null;
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** True when the bytes start like a PNG. */
export function isPng(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
}
