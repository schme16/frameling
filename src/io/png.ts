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
  const okDepth = ctype === 3 ? [1, 2, 4, 8].includes(depth) : ctype === 0 ? [1, 2, 4, 8, 16].includes(depth) : depth === 8 || depth === 16;
  if (!okDepth || !CHANNELS[ctype]) throw new Error('This kind of PNG picture is not supported');
  if (width < 1 || height < 1 || width * height > 1 << 28) throw new Error('The PNG picture has an odd size');
  const idat = join(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return decodePngData({ width, height, depth, ctype, interlaced: head[12] === 1 }, idat, chunks.find((c) => c.type === 'PLTE')?.data, chunks.find((c) => c.type === 'tRNS')?.data);
}

/** The picture kind of a PNG (its IHDR), for reading picture data that is not in the IDAT chunks (APNG frames). */
export interface PngKind {
  width: number;
  height: number;
  depth: number;
  ctype: number;
  /** Adam7 interlacing: the picture comes in seven smaller pictures that fill in over each other. */
  interlaced?: boolean;
}

/** Adam7: the first column, first row, column step and row step of each of the seven passes. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

/** Undoes the row filters of `h` rows (each `stride` bytes after a filter byte) that start at `from` in `raw`. */
export function unfilter(raw: Uint8Array, from: number, stride: number, bpp: number, h: number): Uint8Array {
  const rows = new Uint8Array(stride * h);
  // One tight loop per filter type (the type is picked per row), with the first row and the first pixel split off so the
  // loops have no edge checks. A big drawing has millions of bytes to go through here when a file opens.
  const lead = Math.min(bpp, stride);
  for (let y = 0; y < h; y++) {
    const f = raw[from + y * (stride + 1)];
    const src = from + y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    switch (f) {
      case 0:
        rows.set(raw.subarray(src, src + stride), dst);
        break;
      case 1:
        for (let i = 0; i < lead; i++) rows[dst + i] = raw[src + i];
        for (let i = bpp; i < stride; i++) rows[dst + i] = raw[src + i] + rows[dst + i - bpp];
        break;
      case 2:
        if (y === 0) rows.set(raw.subarray(src, src + stride), dst);
        else for (let i = 0; i < stride; i++) rows[dst + i] = raw[src + i] + rows[prev + i];
        break;
      case 3:
        if (y === 0) {
          for (let i = 0; i < lead; i++) rows[dst + i] = raw[src + i];
          for (let i = bpp; i < stride; i++) rows[dst + i] = raw[src + i] + (rows[dst + i - bpp] >> 1);
        } else {
          for (let i = 0; i < lead; i++) rows[dst + i] = raw[src + i] + (rows[prev + i] >> 1);
          for (let i = bpp; i < stride; i++) rows[dst + i] = raw[src + i] + ((rows[dst + i - bpp] + rows[prev + i]) >> 1);
        }
        break;
      case 4:
        if (y === 0) {
          // With nothing above, the Paeth guess is the pixel to the left.
          for (let i = 0; i < lead; i++) rows[dst + i] = raw[src + i];
          for (let i = bpp; i < stride; i++) rows[dst + i] = raw[src + i] + rows[dst + i - bpp];
        } else {
          for (let i = 0; i < lead; i++) rows[dst + i] = raw[src + i] + rows[prev + i];
          for (let i = bpp; i < stride; i++) {
            const a = rows[dst + i - bpp];
            const b = rows[prev + i];
            const c = rows[prev + i - bpp];
            const pa = b > c ? b - c : c - b;
            const pb = a > c ? a - c : c - a;
            const pc = a + b - c - c;
            const pcAbs = pc < 0 ? -pc : pc;
            rows[dst + i] = raw[src + i] + (pa <= pb && pa <= pcAbs ? a : pb <= pcAbs ? b : c);
          }
        }
        break;
      default:
        throw new Error('The PNG picture is damaged');
    }
  }
  return rows;
}

/** The rows of an Adam7 picture laid out as one ordinary picture: every pass's pixels go to where they belong. */
function deinterlace(raw: Uint8Array, width: number, height: number, depth: number, channels: number, bpp: number): Uint8Array {
  const bits = depth * channels;
  const stride = Math.ceil((width * bits) / 8);
  const out = new Uint8Array(stride * height);
  let at = 0;
  for (const [x0, y0, dx, dy] of ADAM7) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    // A pass with no pixels has no rows at all, not even filter bytes.
    if (pw <= 0 || ph <= 0) continue;
    const pstride = Math.ceil((pw * bits) / 8);
    if (raw.length < at + (pstride + 1) * ph) throw new Error('The PNG picture is cut short');
    const rows = unfilter(raw, at, pstride, bpp, ph);
    at += (pstride + 1) * ph;
    for (let j = 0; j < ph; j++) {
      const oy = (y0 + j * dy) * stride;
      for (let i = 0; i < pw; i++) {
        const ox = x0 + i * dx;
        if (bits >= 8) {
          const n = bits >> 3;
          for (let k = 0; k < n; k++) out[oy + ox * n + k] = rows[j * pstride + i * n + k];
        } else {
          // Several pixels share a byte: copy one pixel's bits.
          const from = i * bits;
          const to = ox * bits;
          const v = (rows[j * pstride + (from >> 3)] >> (8 - bits - (from & 7))) & ((1 << bits) - 1);
          out[oy + (to >> 3)] |= v << (8 - bits - (to & 7));
        }
      }
    }
  }
  return out;
}

/** Turns the joined, still-compressed picture data of a width x height block of the given kind into RGBA. */
export function decodePngData(kind: PngKind, idat: Uint8Array, plte?: Uint8Array, trns?: Uint8Array): RawImage {
  const { width, height, depth, ctype } = kind;
  const channels = CHANNELS[ctype];
  // Bytes in a row, and the distance back to "the pixel to the left" for the row filters (a whole byte at least).
  const stride = Math.ceil((width * channels * depth) / 8);
  const bpp = Math.max(1, (channels * depth) >> 3);
  // The size of the unpacked rows is known, so the inflater gets a buffer that size and never has to grow its own.
  const raw = unzlibSync(idat, kind.interlaced ? undefined : { out: new Uint8Array((stride + 1) * height) });
  // Undo the row filters (of each of the seven smaller pictures first, for an interlaced one).
  let rows: Uint8Array;
  if (kind.interlaced) rows = deinterlace(raw, width, height, depth, channels, bpp);
  else {
    if (raw.length < (stride + 1) * height) throw new Error('The PNG picture is cut short');
    rows = unfilter(raw, 0, stride, bpp, height);
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  if (ctype === 6 && depth === 8) {
    pixels.set(rows);
    return { width, height, pixels };
  }
  if (ctype === 3 && !plte) throw new Error('The PNG picture has no colours');
  // The sample at `i` of a row, as its full value (up to 16 bits).
  const sample = (y: number, i: number): number => {
    const row = y * stride;
    if (depth === 8) return rows[row + i];
    if (depth === 16) return (rows[row + i * 2] << 8) | rows[row + i * 2 + 1];
    const bit = i * depth;
    return (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const to8 = (v: number): number => (depth === 16 ? v >> 8 : depth === 8 ? v : Math.round((v * 255) / ((1 << depth) - 1)));
  // A "transparent colour" from tRNS for grey and RGB pictures.
  const key = trns && (ctype === 0 || ctype === 2) ? Array.from({ length: channels }, (_, k) => (trns[k * 2] << 8) | trns[k * 2 + 1]) : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const at = x * channels;
      if (ctype === 3) {
        const p = sample(y, x);
        pixels[o] = plte![p * 3];
        pixels[o + 1] = plte![p * 3 + 1];
        pixels[o + 2] = plte![p * 3 + 2];
        pixels[o + 3] = trns && p < trns.length ? trns[p] : 255;
      } else if (ctype === 0 || ctype === 4) {
        const g = sample(y, at);
        pixels[o] = pixels[o + 1] = pixels[o + 2] = to8(g);
        pixels[o + 3] = ctype === 4 ? to8(sample(y, at + 1)) : key && g === key[0] ? 0 : 255;
      } else {
        const r = sample(y, at);
        const g = sample(y, at + 1);
        const b = sample(y, at + 2);
        pixels[o] = to8(r);
        pixels[o + 1] = to8(g);
        pixels[o + 2] = to8(b);
        pixels[o + 3] = ctype === 6 ? to8(sample(y, at + 3)) : key && r === key[0] && g === key[1] && b === key[2] ? 0 : 255;
      }
    }
  }
  return { width, height, pixels };
}
