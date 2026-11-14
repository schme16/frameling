/**
 * Blend modes the canvas has no operation for (Linear dodge, Subtract, Divide), done pixel by pixel with the W3C compositing formula
 * (https://www.w3.org/TR/compositing-1/): the result colour is the backdrop's, moved towards
 * (1 - backdrop alpha) x source + backdrop alpha x blend(backdrop, source) by the source's share of the result alpha.
 * Pure arrays of straight (not premultiplied) RGBA bytes, no DOM.
 */
import type { BlendMode } from '../core/format';

/**
 * Rounding to a whole byte, half up, with a tiny nudge. A tie is common here (half opacity over a solid colour gives
 * 227.5 exactly), and whether the arithmetic lands a hair under or over .5 depends on the number format: doubles here,
 * 32-bit floats in the shader on a real card. The nudge, about a hundred times the float noise and far too small to see,
 * puts a tie on the same side in both. The GPU path (pixelBlendGL.ts) uses the same number.
 */
export const ROUND_NUDGE = 1e-3;
export const toByte = (x: number): number => Math.floor(x * 255 + 0.5 + ROUND_NUDGE);

/**
 * The straight colour byte behind premultiplied byte `p` under alpha byte `a`, rounded half up. A canvas stores
 * premultiplied bytes and hands straight ones back by its own rounding, which differs on exact ties (42.5 can come back
 * as 42 or 43, depending on the canvas and the browser), and Divide magnifies a one level slip. So neither path trusts
 * that rounding: the CPU path recovers the stored bytes from what it was given (the canvas's own error is under half a
 * level, so rounding p back out is exact) and both paths un-premultiply by this one rule, with whole numbers.
 */
export function straightByte(p: number, a: number): number {
  return a >= 255 ? p : a <= 0 ? 0 : Math.min(255, Math.floor((510 * p + a) / (2 * a)));
}

/** What a canvas stored for straight colour byte `s` at alpha byte `a`. */
export const premultipliedByte = (s: number, a: number): number => Math.round((s * a) / 255);

/**
 * Straight colour bytes read from a canvas, put through the shared rule in place: what a canvas stored is
 * recovered, then un-premultiplied by `straightByte`. Pure `blendPixels` takes its bytes as they are (so it matches
 * Aseprite on ideal input); the compositor calls this first on what a canvas gave it, so the GPU path, which sees the
 * stored bytes, starts from the same colours.
 */
export function settleCanvasBytes(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255 || a === 0) continue;
    for (let c = 0; c < 3; c++) data[i + c] = straightByte(premultipliedByte(data[i + c], a), a);
  }
}

/** The mix of one colour channel, both 0 to 1. */
function channel(mode: BlendMode, b: number, s: number): number {
  if (mode === 'linear-dodge') return b + s < 1 ? b + s : 1;
  if (mode === 'subtract') return b > s ? b - s : 0;
  // Divide: nothing under it stays black; a colour at least as bright as the layer's goes to full; else b / s.
  if (b === 0) return 0;
  return b >= s ? 1 : b / s;
}

/**
 * Mixes `src` onto `dst` in place. `alpha` is the layer's own see-through amount (0 to 1). Both arrays are RGBA bytes
 * of the same size.
 */
export function blendPixels(dst: Uint8ClampedArray, src: Uint8ClampedArray, mode: BlendMode, alpha: number): void {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i += 4) {
    const as = (src[i + 3] / 255) * alpha;
    if (as <= 0) continue;
    const ab = dst[i + 3] / 255;
    const ar = as + ab - as * ab;
    const k = as / ar;
    for (let c = 0; c < 3; c++) {
      const cb = dst[i + c] / 255;
      const cs = src[i + c] / 255;
      const v = (1 - k) * cb + k * ((1 - ab) * cs + ab * channel(mode, cb, cs));
      dst[i + c] = toByte(v);
    }
    dst[i + 3] = toByte(ar);
  }
}
