/**
 * A picture as a texture for the pixel brush: grain from an image, or a dual tip from an image. The picture is boiled down to
 * a small square of greys (a power of two across, 8 to 64) so a saved brush stays small and a picture off the internet can
 * never grow the brush, then repeated into the same 256 by 256 tile the papers and the dots use. The dab loop never sees
 * it: it only ever looks up a tile. Pure functions, no DOM.
 */
import { deflateSync, inflateSync } from 'fflate';
import { TILE } from '../dry/paper';

export const TEXTURE_SIDES = [8, 16, 32, 64, 128, 256] as const;
/** The most a picture you pick is boiled down to. */
export const MAX_TEXTURE_SIDE = 64;
/** The most a grain read from a brush file keeps: the whole tile, so the fine tooth of a photographed paper survives. */
export const MAX_FILE_TEXTURE_SIDE = 256;
const SIDE_MIN = TEXTURE_SIDES[0];

/** A texture picture as it is saved: `data` is how light each pixel is (0 black, 255 white), one byte a pixel, row by row, in base 64. When that is shorter squeezed it is saved packed, as `"z1:..."` (the same packing a soft tip's cells get). A picture is held in the form it is saved in, so nothing is packed or unpacked until a tile is made. */
export interface TexturePicture {
  /** Pixels across and down: 8 to 256, a power of two. */
  side: number;
  data: string;
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const b64Length = (bytes: number): number => 4 * Math.ceil(bytes / 3);

/** What a packed list of bytes starts with when it is saved, so a later way of packing can be told apart. */
export const PACKED = 'z1:';

/** The bytes squeezed (deflate) and in base 64 after `"z1:"`. The same text for the same bytes. */
export function packBytes(bytes: Uint8Array): string {
  return PACKED + encodeBytes(deflateSync(bytes, { level: 9 }));
}

/** `length` bytes from a packed string (`"z1:..."`), or null when it is not one, is not exactly that long or is made up. The size is checked before anything is allocated, and a squeezed bomb stops at one byte over. */
export function unpackBytes(text: string, length: number): Uint8Array | null {
  if (!text.startsWith(PACKED)) return null;
  const b64 = text.slice(PACKED.length);
  // A squeezed list can be a touch longer than the bytes it holds when they will not squeeze; never much more.
  if (b64.length > b64Length(length + 64) || !B64.test(b64)) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const raw = inflateSync(bytes, { out: new Uint8Array(length + 1) });
    return raw.length === length ? raw : null;
  } catch {
    return null;
  }
}

export function encodeBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3000) s += String.fromCharCode(...bytes.subarray(i, i + 3000));
  return btoa(s);
}

/** A picture's text: packed when that is shorter than plain base 64, plain otherwise. */
export function packedData(bytes: Uint8Array): string {
  const plain = encodeBytes(bytes);
  const packed = packBytes(bytes);
  return packed.length < plain.length ? packed : plain;
}

/** A texture picture of this side from its bytes, held in the form it is saved in. */
export const pictureFromBytes = (side: number, bytes: Uint8Array): TexturePicture => ({ side, data: packedData(bytes) });

/** The bytes in a picture's text (plain base 64 or packed), or null when it is neither or is not exactly `length` bytes. Never allocates by what the string claims. */
export function decodeBytes(data: string, length: number): Uint8Array | null {
  if (data.startsWith(PACKED)) return unpackBytes(data, length);
  if (data.length !== b64Length(length) || !B64.test(data)) return null;
  let s: string;
  try {
    s = atob(data);
  } catch {
    return null;
  }
  if (s.length !== length) return null;
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A saved texture picture read back, or null when it is not one (wrong side, wrong length, not base 64). */
export function cleanPicture(raw: unknown): TexturePicture | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const side = r.side;
  if (typeof side !== 'number' || !(TEXTURE_SIDES as readonly number[]).includes(side)) return null;
  if (typeof r.data !== 'string') return null;
  const bytes = decodeBytes(r.data, side * side);
  if (!bytes) return null;
  // An older picture is plain base 64; held packed it saves packed next time.
  return r.data.startsWith(PACKED) ? { side, data: r.data } : pictureFromBytes(side, bytes);
}

export const samePicture = (a: TexturePicture | undefined, b: TexturePicture | undefined): boolean => (!a || !b ? !a && !b : a.side === b.side && a.data === b.data);

/** The side a picture of this longer side is boiled down to: the nearest power of two, from 8 to 64. */
export function sideFor(longer: number, most: number = MAX_TEXTURE_SIDE): number {
  const p = 2 ** Math.round(Math.log2(Math.max(1, longer)));
  return Math.min(most, Math.max(SIDE_MIN, p));
}

export type PictureResult = { ok: true; picture: TexturePicture } | { ok: false; why: 'empty' | 'flat' };

/**
 * A texture picture from pixels (RGBA, `w` by `h`). Each cell is the average lightness of the patch of picture under it, with
 * see-through counting as white paper, so a dark shape on a clear background is dark where the shape is. Flat pictures are
 * refused: they would make no texture at all.
 */
export function pictureFromPixels(w: number, h: number, rgba: Uint8ClampedArray | Uint8Array, most: number = MAX_TEXTURE_SIDE): PictureResult {
  if (!(w >= 1 && h >= 1) || rgba.length < w * h * 4) return { ok: false, why: 'empty' };
  const side = sideFor(Math.max(w, h), most);
  const out = new Uint8Array(side * side);
  let lo = 255;
  let hi = 0;
  for (let sy = 0; sy < side; sy++) {
    const y0 = Math.floor((sy * h) / side);
    const y1 = Math.max(y0 + 1, Math.floor(((sy + 1) * h) / side));
    for (let sx = 0; sx < side; sx++) {
      const x0 = Math.floor((sx * w) / side);
      const x1 = Math.max(x0 + 1, Math.floor(((sx + 1) * w) / side));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < h; y++)
        for (let x = x0; x < x1 && x < w; x++) {
          const i = (y * w + x) * 4;
          const a = rgba[i + 3] / 255;
          sum += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) * a + 255 * (1 - a);
          n++;
        }
      const v = Math.round(n ? sum / n : 0);
      out[sy * side + sx] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (hi - lo < 8) return { ok: false, why: 'flat' };
  return { ok: true, picture: pictureFromBytes(side, out) };
}

// ---------------------------------------------------------------- tiles

const MAX_KEPT = 24;
/** A scaled paper can be 2048 pixels across (4 MB), so what is kept is capped by size as well as by count. */
const MAX_KEPT_BYTES = 48 * 1024 * 1024;
const kept = new Map<string, Uint8Array>();
let keptBytes = 0;
function keep(key: string, make: () => Uint8Array): Uint8Array {
  const have = kept.get(key);
  if (have) return have;
  const t = make();
  while (kept.size > 0 && (kept.size >= MAX_KEPT || keptBytes + t.length > MAX_KEPT_BYTES)) {
    const old = kept.keys().next().value as string;
    keptBytes -= kept.get(old)!.length;
    kept.delete(old);
  }
  kept.set(key, t);
  keptBytes += t.length;
  return t;
}

/** How light each pixel of a picture is, flipped when asked. Always `side * side` long: a picture that does not read gives mid grey. */
function greys(pic: TexturePicture, invert: boolean): Uint8Array {
  const b = decodeBytes(pic.data, pic.side * pic.side) ?? new Uint8Array(pic.side * pic.side).fill(128);
  return invert ? b.map((v) => 255 - v) : b;
}

/**
 * Spreads the greys evenly over 0 to 255 (histogram equalising), so the share of pixels a stroke reaches at a given pressure
 * is the same for any picture, the way the papers are made. Equal greys stay equal. The order of the greys is untouched.
 */
export function evenOut(v: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < v.length; i++) hist[v[i]]++;
  const to = new Uint8Array(256);
  let below = 0;
  for (let g = 0; g < 256; g++) {
    to[g] = Math.round(((below + hist[g] / 2) / v.length) * 255);
    below += hist[g];
  }
  return v.map((x) => to[x]);
}

/** Repeats a `side` square of values across a whole tile, each value `scale` by `scale` pixels. `side * scale` must divide the tile. */
export function repeatInto(src: Uint8Array, side: number, scale = 1): Uint8Array {
  const t = new Uint8Array(TILE * TILE);
  const span = side * scale;
  for (let y = 0; y < TILE; y++) {
    const sy = Math.floor((y % span) / scale);
    for (let x = 0; x < TILE; x++) t[y * TILE + x] = src[sy * side + Math.floor((x % span) / scale)];
  }
  return t;
}

/**
 * A square tile of greys (`TILE` across, repeating) scaled by `scale` into one `round(TILE * scale)` across that still repeats
 * without a seam, so it can be read a pixel at a time. Bigger than 1 blows it up with bilinear filtering (soft, not blocks);
 * smaller averages the pixels each new one covers. `even` spreads the greys evenly again afterwards, since smoothing pulls
 * them toward the middle and a paper's share of pixels reached at a given pressure is meant to stay the same. At scale 1 it
 * is the tile itself. Made once and kept, under `key`.
 */
export function scaleTile(key: string, src: Uint8Array, scale: number, even = true): Uint8Array {
  const n = Math.max(8, Math.min(TILE * 8, Math.round(TILE * scale)));
  if (n === TILE) return src;
  return keep(`s|${n}|${even ? 1 : 0}|${key}`, () => {
    const out = scaled(src, n);
    return even ? evenOut(out) : out;
  });
}

/** `src` (TILE square, wrapping) resampled to `n` square, wrapping. */
export function scaled(src: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n * n);
  const ratio = TILE / n;
  // Taps along each axis: one bilinear read when blowing up, enough to cover the footprint when shrinking.
  const taps = Math.max(1, Math.ceil(ratio));
  const i0 = new Int32Array(n * taps);
  const i1 = new Int32Array(n * taps);
  const f = new Float32Array(n * taps);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < taps; k++) {
      // The middle of this output pixel (or this slice of it) in source pixels, the centre of a source pixel being at .5.
      const u = (i + (k + 0.5) / taps) * ratio - 0.5;
      const fl = Math.floor(u);
      i0[i * taps + k] = ((fl % TILE) + TILE) % TILE;
      i1[i * taps + k] = (((fl + 1) % TILE) + TILE) % TILE;
      f[i * taps + k] = u - fl;
    }
  const share = 1 / (taps * taps);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let sum = 0;
      for (let ky = 0; ky < taps; ky++) {
        const a = y * taps + ky;
        const r0 = i0[a] * TILE;
        const r1 = i1[a] * TILE;
        const fy = f[a];
        for (let kx = 0; kx < taps; kx++) {
          const b = x * taps + kx;
          const fx = f[b];
          const top = src[r0 + i0[b]] * (1 - fx) + src[r0 + i1[b]] * fx;
          const bot = src[r1 + i0[b]] * (1 - fx) + src[r1 + i1[b]] * fx;
          sum += top * (1 - fy) + bot * fy;
        }
      }
      out[y * n + x] = Math.round(sum * share);
    }
  }
  return out;
}

/**
 * The paper tile for a grain made from a picture. Light parts are the high values and dark parts the low ones (flipped with
 * `invert`), and the paint lands on the high values first, the same way it does on a paper, so the light parts of a picture
 * are where it catches: a photo of canvas lights the thread tops, and that is where the paint lands.
 */
export function grainTileFromPicture(pic: TexturePicture, invert: boolean, asIs = false): Uint8Array {
  // `asIs` keeps the picture's own greys (a paper that thins the paint means them as they are: a picture that is
  // nearly all white barely bites). Otherwise they are spread evenly, the way the papers are made.
  return keep(`g|${pic.side}|${invert ? 1 : 0}|${asIs ? 1 : 0}|${pic.data}`, () => repeatInto(asIs ? greys(pic, invert) : evenOut(greys(pic, invert)), pic.side));
}

/** How many pixels one picture pixel covers in a dual tip: a power of two, 1 to 8, and small enough that the picture fits the tile. */
export function dualPictureScale(side: number, want: number | undefined): number {
  const most = Math.max(1, Math.min(8, TILE / side));
  let s = 1;
  while (s * 2 <= Math.min(most, Math.max(1, want ?? 1))) s *= 2;
  return s;
}

/**
 * The dot tile for a dual tip made from a picture: 255 where paint goes through. The darkest parts of the picture count
 * first, as many as `density` says (0.05 to 1), so a high density is most of the picture and a low one only its blackest
 * marks, and never the plain background of a picture that is mostly one shade. `cut` turns it into holes. Every picture pixel is `scale` pixels across.
 */
export function dualTileFromPicture(pic: TexturePicture, density: number, invert: boolean, cut: boolean, scale: number | undefined): Uint8Array {
  const sc = dualPictureScale(pic.side, scale);
  return keep(`d|${pic.side}|${density}|${invert ? 1 : 0}|${cut ? 1 : 0}|${sc}|${pic.data}`, () => {
    // Ink: how dark each pixel is. The darkest count first.
    const v = greys(pic, invert).map((x) => 255 - x);
    const sorted = Uint8Array.from(v).sort();
    const d = Math.min(1, Math.max(0, density));
    const cutoff = sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((1 - d) * sorted.length)))];
    // When the cutoff lands on the picture's plain background (most of it is one shade), only the marks on it count, never the background.
    const strict = d < 1 && cutoff === sorted[0];
    const on = v.map((x) => ((strict ? x > cutoff : x >= cutoff) ? 255 : 0));
    const t = repeatInto(on, pic.side, sc);
    if (cut) for (let i = 0; i < t.length; i++) t[i] = 255 - t[i];
    return t;
  });
}
