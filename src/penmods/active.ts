// The pen modifier that is on right now, and what it does to how the pen behaves. This is the small leaf the drawing
// code reads: the canvas asks for the stabilizer and the wobble when a stroke starts, and the tool sizes ask for a size
// factor. Nothing here writes to the person's own settings (the stabilizer, the brush size). The modifier sits OVER them,
// so when it ends it is simply taken away and their settings are exactly as they were, even ones they changed meanwhile,
// and a crash cannot leave a changed setting behind. See ./registry.ts for how one is switched on and off.
import { createStore } from '../ui/mini';
import type { StabMode } from '../tablet/stabilizer';
import type { ToolPen } from '../tablet/settings';

/** What a modifier does. Anything left out is not touched. */
export interface PenEffect {
  /** At least this much stabilizer (0 to 100), so a steadier setting of your own still wins. */
  stabilizer?: number;
  /** Forces the way the stabilizer works (the pull string). */
  stabMode?: StabMode;
  /** How shaky the hand is, 0 to 1. */
  wobble?: number;
  /** Every tool size is multiplied by this (0.35 is thin, 2.5 is fat). */
  size?: number;
}

/** The effect in force, or null. A new object each time one starts, so "is it still mine" is an identity check. */
export const penEffect = createStore<PenEffect | null>(null);

export const getPenEffect = (): PenEffect | null => penEffect.get();

/** The factor every brush, pencil, eraser and outline size is multiplied by: 1 when nothing is on. */
export function penSizeFactor(): number {
  const s = penEffect.get()?.size;
  return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1;
}

/** A tool's pen settings as the stroke about to start should see them, with the modifier laid over. Unchanged (same object) when none is on. */
export function effectiveToolPen(tp: ToolPen, fx: PenEffect | null = penEffect.get()): ToolPen {
  if (!fx || (fx.stabilizer === undefined && fx.stabMode === undefined)) return tp;
  const stabilizer = fx.stabilizer === undefined ? tp.stabilizer : Math.max(tp.stabilizer, Math.min(100, Math.max(0, fx.stabilizer)));
  return { ...tp, stabilizer, stabMode: fx.stabMode ?? tp.stabMode };
}
