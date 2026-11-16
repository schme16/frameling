/**
 * How a pixel brush's paint joins what is already on the layer. Normal lays paint over it (the way every brush did before).
 * The others are the same blend modes a layer has (Multiply, Screen, Overlay...), worked out pixel by pixel as the brush
 * paints, so a brush can darken, lighten, tint or cut light out of what is under it without a layer of its own. It blends
 * with the pixels on this layer; on an empty spot there is nothing to blend with and the paint lands as it is.
 * Pure functions on bytes, no DOM. The maths is the layer blend maths (src/effects/blendPure.ts), so the two always agree.
 */
import type { BlendMode } from '../core/format';
import { BLEND_MODES } from '../effects/model';
import { blendOnto } from '../effects/blendPure';

/** The modes a brush offers, in the order of the layer blend list. "Add" is left out: Glow brighter, plain (linear dodge) is the same job. */
export const BRUSH_BLENDS: readonly BlendMode[] = BLEND_MODES.map((b) => b.mode).filter((m) => m !== 'add');

export const isBrushBlend = (v: unknown): v is BlendMode => typeof v === 'string' && (BRUSH_BLENDS as readonly string[]).includes(v);

/** The mode read from saved or shared data, normal for anything that is not one we offer. */
export const cleanBlend = (v: unknown, fallback: BlendMode = 'normal'): BlendMode => (isBrushBlend(v) ? v : fallback);

const dst = new Uint8ClampedArray(4);
const src = new Uint8ClampedArray(4);

/**
 * `base` with `colour` painted on it in a blend mode, `cov` (0 to 1) of the way, written into `out`. Colour and base are r, g, b, a bytes.
 * The colour's own see-through counts, as it does for plain paint.
 */
export function blendPaint(mode: BlendMode, base: ArrayLike<number>, colour: ArrayLike<number>, cov: number, out: Uint8ClampedArray | number[]): void {
  dst[0] = base[0];
  dst[1] = base[1];
  dst[2] = base[2];
  dst[3] = base[3];
  src[0] = colour[0];
  src[1] = colour[1];
  src[2] = colour[2];
  src[3] = colour[3];
  blendOnto(dst, src, mode, cov < 0 ? 0 : cov > 1 ? 1 : cov);
  out[0] = dst[0];
  out[1] = dst[1];
  out[2] = dst[2];
  out[3] = dst[3];
}

/** The mode after this one in the list (or before it), going round at the ends. */
export function stepBlend(now: BlendMode, by: 1 | -1): BlendMode {
  const i = BRUSH_BLENDS.indexOf(now);
  return BRUSH_BLENDS[(((i < 0 ? 0 : i) + by) % BRUSH_BLENDS.length + BRUSH_BLENDS.length) % BRUSH_BLENDS.length];
}
