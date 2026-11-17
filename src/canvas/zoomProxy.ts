/**
 * Zooming in far enough that the whole stage no longer fits a bitmap means every frame is drawn from the shapes, and a
 * slow shape (paper tooth, an effect) costs a new picture per zoom step: a fraction of a second a frame. So while the
 * zoom is moving the picture already made is stretched instead (the overview: the whole stage at a size that is
 * cheap to keep), and the sharp one is worked out in short slices once the zoom stops. The sums are here, pure.
 */

/** How long one catch-up slice may spend on new pictures, in ms. A frame is about 16, and a stroke's picture is the smallest piece. */
export const SLICE_MS = 8;
/** Catch-up gives up after this many slices or this long (ms), and draws the sharp picture in one go, so it always ends. */
export const MAX_SLICES = 90;
export const MAX_CATCH_UP_MS = 2500;

/** The overview's size: the stage's shape at about one screen of pixels (never more than the cacheable limit). */
export function overviewSize(stageW: number, stageH: number, screenW: number, screenH: number): { w: number; h: number } {
  const aspect = stageW > 0 && stageH > 0 ? stageW / stageH : 1;
  const area = Math.max(1, Math.min(screenW * screenH, 4_000_000));
  const w = Math.max(1, Math.round(Math.sqrt(area * aspect)));
  const h = Math.max(1, Math.round(w / aspect));
  return { w, h };
}

/**
 * The part of a stretched picture that lands on the screen. `rect` is where the whole picture goes (it can be hundreds of
 * thousands of pixels wide, far off the screen), `src` is the picture's own size. Null when none of it shows.
 */
export function visibleSlice(rect: { x: number; y: number; w: number; h: number }, src: { w: number; h: number }, screen: { w: number; h: number }): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } | null {
  const dx = Math.max(0, rect.x);
  const dy = Math.max(0, rect.y);
  const dw = Math.min(screen.w, rect.x + rect.w) - dx;
  const dh = Math.min(screen.h, rect.y + rect.h) - dy;
  if (!(dw > 0) || !(dh > 0) || !(rect.w > 0) || !(rect.h > 0)) return null;
  const kx = src.w / rect.w;
  const ky = src.h / rect.h;
  return { sx: (dx - rect.x) * kx, sy: (dy - rect.y) * ky, sw: dw * kx, sh: dh * ky, dx, dy, dw, dh };
}

/** Whether catch-up has gone on long enough to stop slicing and just draw (a view whose pictures will not all stay kept). */
export function giveUp(slices: number, sinceMs: number): boolean {
  return slices >= MAX_SLICES || sinceMs >= MAX_CATCH_UP_MS;
}
