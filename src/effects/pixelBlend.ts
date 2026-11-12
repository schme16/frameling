/**
 * Blend modes the canvas has no operation for (Linear dodge, Subtract, Divide), done pixel by pixel with the W3C compositing formula
 * (https://www.w3.org/TR/compositing-1/): the result colour is the backdrop's, moved towards
 * (1 - backdrop alpha) x source + backdrop alpha x blend(backdrop, source) by the source's share of the result alpha.
 * Pure arrays of straight (not premultiplied) RGBA bytes, no DOM.
 */
import type { BlendMode } from '../core/format';

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
      dst[i + c] = Math.round(v * 255);
    }
    dst[i + 3] = Math.round(ar * 255);
  }
}
