/**
 * A picture as a texture for the pixel brush: grain from an image, or a dual tip from an image. The picture is boiled down to
 * a small square of greys (a power of two across, 8 to 64) so a saved brush stays small and a picture off the internet can
 * never grow the brush, then repeated into the same 256 by 256 tile the papers and the dots use. The dab loop never sees
 * it: it only ever looks up a tile. Pure functions, no DOM.
 */
import { TILE } from '../dry/paper';

export const TEXTURE_SIDES = [8, 16, 32, 64, 128, 256] as const;
/** The most a picture you pick is boiled down to. */
export const MAX_TEXTURE_SIDE = 64;
/** The most a grain read from a brush file keeps: the whole tile, so the fine tooth of a photographed paper survives. */
export const MAX_FILE_TEXTURE_SIDE = 256;
const SIDE_MIN = TEXTURE_SIDES[0];

/** A texture picture as it is saved: `data` is how light each pixel is (0 black, 255 white), one byte a pixel, row by row, in base 64. */
export interface TexturePicture {
  /** Pixels across and down: 8, 16, 32 or 64. */
  side: number;
  data: string;
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const b64Length = (bytes: number): number => 4 * Math.ceil(bytes / 3);

export function encodeBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3000) s += String.fromCharCode(...bytes.subarray(i, i + 3000));
  return btoa(s);
}

/** The bytes in a base 64 string, or null when it is not base 64 or is not exactly `length` bytes. Never allocates by what the string claims. */
export function decodeBytes(data: string, length: number): Uint8Array | null {
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
  if (!decodeBytes(r.data, side * side)) return null;
  return { side, data: r.data };
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
  return { ok: true, picture: { side, data: encodeBytes(out) } };
}

// ---------------------------------------------------------------- tiles

const MAX_KEPT = 24;
const kept = new Map<string, Uint8Array>();
function keep(key: string, make: () => Uint8Array): Uint8Array {
  const have = kept.get(key);
  if (have) return have;
  const t = make();
  if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value as string);
  kept.set(key, t);
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
