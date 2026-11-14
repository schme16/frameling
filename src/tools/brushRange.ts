// How big the brush, pencil and pen sliders reach. The range follows the drawing: from 1 up to the longer side of the
// canvas plus a tenth. The number beside a slider can be typed into for anything bigger, up to TYPED_MAX. Pure.

/** The smallest size any of these tools draws. */
export const MIN_BRUSH = 1;
/** The slider always reaches at least this far, so a tiny canvas still gets a slider you can use. */
export const MIN_REACH = 8;
/** How far past the canvas the slider goes: a tenth, so the brush can cover it edge to edge from any spot. */
export const OVERSHOOT_PERCENT = 110;
/** The biggest size the number box accepts. No canvas is this big, it only guards against a slip of the keys. */
export const TYPED_MAX = 100000;

export interface BrushRange {
  min: number;
  /** Where the slider ends. */
  max: number;
  /** Where the number box stops accepting. */
  typedMax: number;
}

/**
 * The range for a canvas `width` by `height`. The longer side decides, because a brush as wide as the longer side
 * covers the picture either way round. A pixel layer passes its art pixel size (stage pixels per art pixel), so its
 * sizes are in art pixels like the brush itself.
 */
export function brushRange(width: number, height: number, pixelSize = 1): BrushRange {
  const unit = pixelSize >= 1 ? pixelSize : 1;
  const longer = Math.max(Number.isFinite(width) ? width : 0, Number.isFinite(height) ? height : 0);
  const side = Math.max(1, Math.ceil(longer / unit));
  const max = Math.min(TYPED_MAX, Math.max(MIN_REACH, Math.ceil((side * OVERSHOOT_PERCENT) / 100)));
  return { min: MIN_BRUSH, max, typedMax: TYPED_MAX };
}

/** A typed size, kept to the range (no further than TYPED_MAX), and rounded to whole units when `whole`. */
export function typedSize(n: number, whole = false): number {
  const v = Math.min(TYPED_MAX, Math.max(MIN_BRUSH, n));
  return whole ? Math.round(v) : v;
}
