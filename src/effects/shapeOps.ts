/**
 * Effect edits on the picked shapes (see shapeFx.ts), each one undo step on the drawing showing now. They go through
 * `editActiveDrawing`, so a shape on a held frame, or on a drawing other places show, asks the same questions drawing
 * does. The same effect goes on every picked shape with the same id, so sliders edit them together.
 */
import type { EffectKind, Id, Shape } from '../core/format';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { activeDrawing, EDIT_HINTS, editActiveDrawing } from '../tools/edit';
import * as edit from './edit';
import { effectInfo } from './model';
import { hasShapeFx } from './shapeFx';

/** What the Effects panel and the effect commands work on besides a layer or a folder: the shapes picked right now. */
export type ShapesTarget = { shapes: true };

/** The picked shapes of the drawing showing on the active layer now (none on a pixel layer). */
export function pickedShapes(): Shape[] {
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return [];
  const ids = new Set(store().get().ui.selection);
  return ids.size ? d.shapes.filter((s) => ids.has(s.id)) : [];
}

/** Does any picked shape hold an effect that does something? */
export const pickedHaveFx = (): boolean => pickedShapes().some(hasShapeFx);

function run(label: string, fn: (holders: edit.Holder[]) => unknown, coalesce?: string): boolean {
  const ids = new Set<Id>(store().get().ui.selection);
  if (!ids.size) return false;
  const r = editActiveDrawing(
    label,
    'vector',
    (d) => {
      const hs = d.shapes.filter((s) => ids.has(s.id)) as unknown as edit.Holder[];
      if (hs.length) fn(hs);
    },
    { coalesce },
  );
  if (r !== 'ok') toast(EDIT_HINTS[r]);
  return r === 'ok';
}

const ckey = (id: Id, key: string) => `fx:shapes:${id}:${key}`;

export const addEffect = (kind: EffectKind): boolean => run(`Add ${effectInfo(kind).label.toLowerCase()} to the shape`, (hs) => edit.addEffectTo(hs, kind));
export const removeEffect = (id: Id): boolean => run('Remove effect', (hs) => edit.removeEffectFrom(hs, id));
export const moveEffect = (id: Id, dir: -1 | 1): boolean => run('Reorder effects', (hs) => edit.moveEffectIn(hs, id, dir));
export const setEffectOn = (id: Id, on: boolean): boolean => run(on ? 'Turn effect on' : 'Turn effect off', (hs) => edit.setEffectOnIn(hs, id, on));
export const setEffectValue = (id: Id, key: string, v: number | string): boolean => run('Change effect', (hs) => edit.setEffectValueIn(hs, id, key, v, 0), ckey(id, key));
export const resetEffect = (id: Id): boolean => run('Reset effect', (hs) => edit.resetEffectIn(hs, id));
export const clearEffects = (): boolean => run('Take the effects off the shapes', (hs) => edit.clearEffectsOf(hs));
