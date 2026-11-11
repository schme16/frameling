// How tile mode looks on the canvas: the copies around the stage, and a thin frame marking the real one.
import { cssVar } from '../canvas/theme';

import { getPrefs } from '../ui/prefs';

/** How faded copies show when the "Fade tile copies" preference is on. */
export const FADED_TILE_COPIES = 0.45;
let override: number | null = null;

/** How strongly the copies around the stage show (1 = as strong as the stage itself). */
export function tileCopyAlpha(): number {
  return override ?? (getPrefs().fadeTileCopies ? FADED_TILE_COPIES : 1);
}

/** For looks comparisons and screenshots (null goes back to the preference). */
export function setTileCopyAlpha(a: number | null): void {
  override = a === null ? null : Math.max(0, Math.min(1, a));
}

/** A dashed frame around the stage, so you can tell the real tile from its copies. Device pixels. */
export function drawTileModeFrame(g: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, dpr: number): void {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.lineWidth = Math.max(1, Math.round(dpr));
  g.setLineDash([4 * dpr, 3 * dpr]);
  g.strokeStyle = cssVar('--accent', '#5ab8ff');
  g.globalAlpha = 0.9;
  const o = g.lineWidth / 2;
  g.strokeRect(Math.round(rect.x) - o, Math.round(rect.y) - o, Math.round(rect.w) + 2 * o, Math.round(rect.h) + 2 * o);
  g.restore();
}
