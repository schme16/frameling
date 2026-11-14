/**
 * Every blend mode on plain RGBA bytes, with the W3C compositing formula (https://www.w3.org/TR/compositing-1/), for code
 * that has no canvas: the mascot's sheet builder. Straight (not premultiplied) bytes, no DOM. Linear dodge, Subtract and
 * Divide are `pixelBlend.ts`'s own; the rest are here.
 */
import type { BlendMode } from '../core/format';
import { blendPixels, toByte } from './pixelBlend';

type RGB = [number, number, number];

const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function clipColour(c: RGB): RGB {
  const l = lum(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  let out: RGB = [c[0], c[1], c[2]];
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
}

function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  return clipColour([c[0] + d, c[1] + d, c[2] + d]);
}

const sat = (c: RGB) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

function setSat(c: RGB, s: number): RGB {
  const order = [0, 1, 2].sort((a, b) => c[a] - c[b]);
  const [lo, mid, hi] = order;
  const out: RGB = [0, 0, 0];
  if (c[hi] > c[lo]) {
    out[mid] = ((c[mid] - c[lo]) * s) / (c[hi] - c[lo]);
    out[hi] = s;
  }
  return out;
}

function softLight(b: number, s: number): number {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
}

function hardLight(b: number, s: number): number {
  return s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1);
}

/** The blend of one colour channel for the separable modes. */
function channel(mode: BlendMode, b: number, s: number): number {
  switch (mode) {
    case 'multiply':
      return b * s;
    case 'screen':
      return b + s - b * s;
    case 'overlay':
      return hardLight(s, b);
    case 'darken':
      return Math.min(b, s);
    case 'lighten':
      return Math.max(b, s);
    case 'color-dodge':
      return b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case 'color-burn':
      return b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case 'hard-light':
      return hardLight(b, s);
    case 'soft-light':
      return softLight(b, s);
    case 'difference':
      return Math.abs(b - s);
    case 'exclusion':
      return b + s - 2 * b * s;
    default:
      return s;
  }
}

/** The blend of a whole colour: the four modes that work on hue, saturation and lightness, or per channel for the rest. */
function blendColour(mode: BlendMode, b: RGB, s: RGB): RGB {
  if (mode === 'hue') return setLum(setSat(s, sat(b)), lum(b));
  if (mode === 'saturation') return setLum(setSat(b, sat(s)), lum(b));
  if (mode === 'color') return setLum(s, lum(b));
  if (mode === 'luminosity') return setLum(b, lum(s));
  return [channel(mode, b[0], s[0]), channel(mode, b[1], s[1]), channel(mode, b[2], s[2])];
}

/**
 * Mixes `src` onto `dst` in place with a blend mode. `alpha` is the layer's own opacity (0 to 1). Both are RGBA bytes
 * of the same size. Normal is plain source-over.
 */
export function blendOnto(dst: Uint8ClampedArray, src: Uint8ClampedArray, mode: BlendMode | undefined, alpha: number): void {
  const m = mode ?? 'normal';
  if (m === 'linear-dodge' || m === 'subtract' || m === 'divide') return blendPixels(dst, src, m, alpha);
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i += 4) {
    const as = (src[i + 3] / 255) * alpha;
    if (as <= 0) continue;
    const ab = dst[i + 3] / 255;
    if (m === 'add') {
      // The canvas's "lighter": premultiplied colours add, and the result is held to what the alpha allows.
      const ar = Math.min(1, as + ab);
      for (let c = 0; c < 3; c++) dst[i + c] = ar > 0 ? toByte(Math.min(ar, (src[i + c] / 255) * as + (dst[i + c] / 255) * ab) / ar) : 0;
      dst[i + 3] = toByte(ar);
      continue;
    }
    const ar = as + ab - as * ab;
    const k = as / ar;
    const cb: RGB = [dst[i] / 255, dst[i + 1] / 255, dst[i + 2] / 255];
    const cs: RGB = [src[i] / 255, src[i + 1] / 255, src[i + 2] / 255];
    const mix = m === 'normal' ? cs : blendColour(m, cb, cs);
    for (let c = 0; c < 3; c++) dst[i + c] = toByte((1 - k) * cb[c] + k * ((1 - ab) * cs[c] + ab * mix[c]));
    dst[i + 3] = toByte(ar);
  }
}
