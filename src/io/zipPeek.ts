/**
 * Finds one entry of a zip without inflating anything, so the browser's own inflate can do it. Only plain zips (no
 * zip64, no encryption); anything else says null and the caller uses fflate.
 */
export interface ZipEntry {
  /** 0 = stored, 8 = deflate. */
  method: number;
  /** The entry's compressed bytes (a view, not a copy). */
  data: Uint8Array;
  /** Its size once inflated. */
  size: number;
}

export function findZipEntry(bytes: Uint8Array, name: string): ZipEntry | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-directory record sits at the very end (a comment of up to 64 KB may follow its fixed part).
  let e = -1;
  for (let i = bytes.length - 22, stop = Math.max(0, bytes.length - 22 - 65535); i >= stop; i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      e = i;
      break;
    }
  }
  if (e < 0) return null;
  const count = v.getUint16(e + 10, true);
  let at = v.getUint32(e + 16, true);
  if (count === 0xffff || at === 0xffffffff) return null;
  const want = new TextEncoder().encode(name);
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || v.getUint32(at, true) !== 0x02014b50) return null;
    const flags = v.getUint16(at + 8, true);
    const method = v.getUint16(at + 10, true);
    const csize = v.getUint32(at + 20, true);
    const size = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const extraLen = v.getUint16(at + 30, true);
    const commentLen = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    const next = at + 46 + nameLen + extraLen + commentLen;
    let same = nameLen === want.length;
    for (let i = 0; same && i < nameLen; i++) if (bytes[at + 46 + i] !== want[i]) same = false;
    if (same) {
      if (flags & 1 || (method !== 0 && method !== 8) || csize === 0xffffffff || size === 0xffffffff) return null;
      if (local + 30 > bytes.length || v.getUint32(local, true) !== 0x04034b50) return null;
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      if (start + csize > bytes.length) return null;
      return { method, data: bytes.subarray(start, start + csize), size };
    }
    at = next;
  }
  return null;
}

/** Inflates raw deflate bytes with the platform's own zlib; null when it is not there or fails. */
export async function inflateNative(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined' || typeof Blob === 'undefined') return null;
  try {
    const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
    return new Uint8Array(await out.arrayBuffer());
  } catch {
    return null;
  }
}
