/**
 * A small PNG encoder and decoder (RGBA, 8 bits per channel) so files and exports work the same in Node tests and in
 * the app, with no canvas needed. zlib comes from fflate.
 *
 * The encoder always writes RGBA8 with the best-looking row filter per row. The decoder reads what it writes, and also
 * the common non-interlaced 8 bit layouts (grey, grey+alpha, RGB, palette) so pictures from elsewhere still open.
 */
import { unzlibSync, zlibSync } from 'fflate';

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface RawImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, rows top to bottom. */
  pixels: Uint8ClampedArray;
}

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length, seed = 0): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = ~seed >>> 0;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

export function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

export function put32(bytes: Uint8Array, at: number, v: number): void {
  bytes[at] = (v >>> 24) & 0xff;
  bytes[at + 1] = (v >>> 16) & 0xff;
  bytes[at + 2] = (v >>> 8) & 0xff;
  bytes[at + 3] = v & 0xff;
}

/** One PNG chunk: length, type, data, crc. */
export function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  put32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  put32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

export interface Chunk {
  type: string;
  data: Uint8Array;
}

/** Splits a PNG into its chunks, checking the signature and every crc. Throws a plain Error when it is damaged. */
export function readChunks(bytes: Uint8Array): Chunk[] {
  if (bytes.length < 20 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error('Not a PNG picture');
  const chunks: Chunk[] = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const len = u32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    if (at + 12 + len > bytes.length) throw new Error('The PNG picture is cut short');
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (crc32(bytes, at + 4, at + 8 + len) !== u32(bytes, at + 8 + len)) throw new Error('The PNG picture is damaged');
    chunks.push({ type, data });
    at += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

// ---------------------------------------------------------------- filters

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export type PngFilter = 'adaptive' | 'none';

/** Filtered scanlines, ready for zlib: one filter byte then the row, per row. */
function filterRows(data: Uint8ClampedArray, width: number, height: number, mode: PngFilter): Uint8Array {
  const bpp = 4;
  const stride = width * bpp;
  const out = new Uint8Array((stride + 1) * height);
  const cand: Uint8Array[] = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = row - stride;
    const o = y * (stride + 1);
    if (mode === 'none') {
      out[o] = 0;
      for (let i = 0; i < stride; i++) out[o + 1 + i] = data[row + i];
      continue;
    }
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    const [c0, c1, c2, c3, c4] = cand;
    for (let i = 0; i < stride; i++) {
      const x = data[row + i];
      const a = i >= bpp ? data[row + i - bpp] : 0;
      const b = y > 0 ? data[prev + i] : 0;
      const c = y > 0 && i >= bpp ? data[prev + i - bpp] : 0;
      const v1 = (x - a) & 255;
      const v2 = (x - b) & 255;
      const v3 = (x - ((a + b) >> 1)) & 255;
      const v4 = (x - paeth(a, b, c)) & 255;
      c0[i] = x;
      c1[i] = v1;
      c2[i] = v2;
      c3[i] = v3;
      c4[i] = v4;
      s0 += x < 128 ? x : 256 - x;
      s1 += v1 < 128 ? v1 : 256 - v1;
      s2 += v2 < 128 ? v2 : 256 - v2;
      s3 += v3 < 128 ? v3 : 256 - v3;
      s4 += v4 < 128 ? v4 : 256 - v4;
    }
    const sums = [s0, s1, s2, s3, s4];
    let best = 0;
    for (let f = 1; f < 5; f++) if (sums[f] < sums[best]) best = f;
    out[o] = best;
    out.set(cand[best], o + 1);
  }
  return out;
}

/** The zlib stream that goes inside IDAT (or fdAT) for a picture. */
export function pngImageData(img: RawImage, filter: PngFilter = 'adaptive', level: 1 | 6 = 6): Uint8Array {
  return zlibSync(filterRows(img.pixels, img.width, img.height, filter), { level });
}

export function ihdr(width: number, height: number): Uint8Array {
  const d = new Uint8Array(13);
  put32(d, 0, width);
  put32(d, 4, height);
  d[8] = 8; // bit depth
  d[9] = 6; // RGBA
  return d;
}

function join(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export { join as joinBytes };

export function encodePng(img: RawImage, opts: { filter?: PngFilter; level?: 1 | 6 } = {}): Uint8Array {
  if (img.pixels.length !== img.width * img.height * 4) throw new Error('Picture size and pixel data do not match');
  return join([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdr(img.width, img.height)),
    makeChunk('IDAT', pngImageData(img, opts.filter ?? 'adaptive', opts.level ?? 6)),
    makeChunk('IEND', new Uint8Array(0)),
  ]);
}

// ---------------------------------------------------------------- decode

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(bytes: Uint8Array): RawImage {
  const chunks = readChunks(bytes);
  const head = chunks.find((c) => c.type === 'IHDR')?.data;
  if (!head || head.length < 13) throw new Error('The PNG picture has no header');
  const width = u32(head, 0);
  const height = u32(head, 4);
  const depth = head[8];
  const ctype = head[9];
  if (head[12] !== 0) throw new Error('Interlaced PNG pictures are not supported');
  if (depth !== 8 || !CHANNELS[ctype]) throw new Error('This kind of PNG picture is not supported');
  if (width < 1 || height < 1 || width * height > 1 << 28) throw new Error('The PNG picture has an odd size');
  const idat = join(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const bpp = CHANNELS[ctype];
  const stride = width * bpp;
  const raw = unzlibSync(idat);
  if (raw.length < (stride + 1) * height) throw new Error('The PNG picture is cut short');

  // Undo the row filters in place.
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? rows[dst + i - bpp] : 0;
      const b = y > 0 ? rows[prev + i] : 0;
      const c = y > 0 && i >= bpp ? rows[prev + i - bpp] : 0;
      let v: number;
      switch (f) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error('The PNG picture is damaged');
      }
      rows[dst + i] = v & 255;
    }
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  if (ctype === 6) {
    pixels.set(rows);
    return { width, height, pixels };
  }
  const plte = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    if (ctype === 2) {
      pixels[o] = rows[i * 3];
      pixels[o + 1] = rows[i * 3 + 1];
      pixels[o + 2] = rows[i * 3 + 2];
      pixels[o + 3] = 255;
    } else if (ctype === 0) {
      pixels[o] = pixels[o + 1] = pixels[o + 2] = rows[i];
      pixels[o + 3] = 255;
    } else if (ctype === 4) {
      pixels[o] = pixels[o + 1] = pixels[o + 2] = rows[i * 2];
      pixels[o + 3] = rows[i * 2 + 1];
    } else {
      if (!plte) throw new Error('The PNG picture has no colours');
      const p = rows[i];
      pixels[o] = plte[p * 3];
      pixels[o + 1] = plte[p * 3 + 1];
      pixels[o + 2] = plte[p * 3 + 2];
      pixels[o + 3] = trns && p < trns.length ? trns[p] : 255;
    }
  }
  return { width, height, pixels };
}
