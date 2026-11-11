// Small things most tools need.
import type { ToolContext } from '../core/registry';
import { store } from '../core/store';
import { activeLayer, EDIT_HINTS, type EditResult } from './edit';

/**
 * Checks the active layer can take an edit of this kind before a gesture starts, and says why not if it can't
 * (locked, hidden, wrong kind of layer). Returns true when it's fine to start.
 */
export function canEdit(ctx: ToolContext, kind: 'vector' | 'pixel', what: string): boolean {
  const { layer, problem } = activeLayer();
  if (problem) {
    ctx.hint(EDIT_HINTS[problem]);
    return false;
  }
  if (layer && layer.kind !== kind) {
    ctx.hint(kind === 'vector' ? `${what} draws on vector layers. Pick a vector layer in the timeline first.` : `${what} works on pixel layers. Pick a pixel layer in the timeline first.`);
    return false;
  }
  return true;
}

/** Shows the friendly reason when `editActiveDrawing` didn't do anything. */
export function reportEdit(ctx: ToolContext, r: EditResult): void {
  if (r !== 'ok') ctx.hint(EDIT_HINTS[r]);
}

/** The current frame, for keys that depend on it. */
export const currentFrame = (): number => store().get().ui.frame;

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
