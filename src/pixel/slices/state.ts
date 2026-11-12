// Which slice is picked (the one the panel edits and the tool handles), and the edits themselves as undo steps.
import { current } from 'immer';
import { useSyncExternalStore } from 'react';
import { findLayer } from '../../core/doc';
import type { Doc, Id, PixelLayer, Slice } from '../../core/format';
import { store } from '../../core/store';
import { addKeyAt, addSlice, borders, defaultBorders, findSlice, moveSlice, removeKeyAt, removeSlice, setBorders, sliceAt, stopMoving, tidy, writeSliceAt, type Rect } from './model';

let picked: Id | null = null;
const listeners = new Set<() => void>();

export const pickedSlice = (): Id | null => picked;
export function pickSlice(id: Id | null): void {
  if (picked === id) return;
  picked = id;
  for (const fn of listeners) fn();
}
export function usePickedSlice(): Id | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => picked,
  );
}

/** The pixel layer the slices belong to now: the active one when it is a pixel layer. */
export function sliceLayer(): PixelLayer | null {
  const { doc, ui } = store().get();
  const l = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  return l?.kind === 'pixel' ? l : null;
}

/** Runs an edit on the slice with this id, on any board, as one undo step. Returns false when there is no such slice. */
export function editSlice(label: string, id: Id, fn: (s: Slice) => void, coalesce?: string): boolean {
  if (!findSlice(store().get().doc, id)) return false;
  store().update(
    label,
    (d) => {
      const found = findSlice(d as Doc, id);
      if (!found) return;
      const s = found.slice;
      if (s.keys?.length) {
        // A slice that changes between frames is edited as it looks at this frame; a changed rectangle, middle or pivot goes
        // into that frame's key, and name and colour stay the slice's own. On a board that is not open there is no frame to
        // key at, so it is edited at its first key.
        const frame = found.open ? store().get().ui.frame : 0;
        const view = structuredClone(sliceAt(current(s), frame)) as Slice;
        delete view.keys;
        fn(view);
        s.name = view.name;
        if (view.color) s.color = view.color;
        else delete s.color;
        writeSliceAt(s, frame, view);
      } else fn(s);
      tidy(s);
    },
    coalesce ? { coalesce } : {},
  );
  return true;
}

/** True when a slice with this id exists on any board. */
export const sliceExists = (id: Id): boolean => !!findSlice(store().get().doc, id);

/** Makes a slice on the active pixel layer and picks it. */
export function createSlice(r: Rect, name?: string): Slice | null {
  const layer = sliceLayer();
  if (!layer) return null;
  let made: Slice | null = null;
  store().update('Add slice', (d) => {
    const l = findLayer(d, layer.id) as PixelLayer;
    made = addSlice(l, r, name);
  });
  const slice = made as Slice | null;
  if (slice) pickSlice(slice.id);
  return slice;
}

export function deleteSlice(id: Id): void {
  if (!sliceExists(id)) return;
  store().update('Delete slice', (d) => {
    const found = findSlice(d as Doc, id);
    if (found) removeSlice(found.layer, id);
  });
  if (picked === id) pickSlice(null);
}

export const renameSlice = (id: Id, name: string) => editSlice('Rename slice', id, (s) => void (s.name = name.trim() || s.name), `slice-name-${id}`);
export const setSliceRect = (id: Id, r: Partial<Rect>) => editSlice('Change slice', id, (s) => Object.assign(s, r), `slice-rect-${id}`);
export const setSliceColor = (id: Id, color: string | null) => editSlice('Change slice colour', id, (s) => (color ? (s.color = color) : delete s.color), `slice-color-${id}`);
export const nudgeSlice = (id: Id, dx: number, dy: number) => editSlice('Move slice', id, (s) => moveSlice(s, dx, dy), `slice-move-${id}`);

export function toggleNine(id: Id, on: boolean): void {
  editSlice(on ? 'Make slice a 9-patch' : 'Make slice a plain slice', id, (s) => {
    if (on) setBorders(s, defaultBorders(s));
    else delete s.center;
  });
}
export const setNineBorders = (id: Id, b: Partial<NonNullable<ReturnType<typeof borders>>>) =>
  editSlice('Change 9-patch borders', id, (s) => {
    const cur = borders(s);
    if (cur) setBorders(s, { ...cur, ...b });
  }, `slice-nine-${id}`);

export function togglePivot(id: Id, on: boolean): void {
  editSlice(on ? 'Add slice pivot' : 'Remove slice pivot', id, (s) => {
    // A new pivot sits at the middle of the bottom edge, where a standing sprite rests.
    if (on) s.pivot = { x: s.x + Math.floor(s.w / 2), y: s.y + s.h };
    else delete s.pivot;
  });
}
export const setPivot = (id: Id, p: { x?: number; y?: number }) => editSlice('Move slice pivot', id, (s) => void (s.pivot && (s.pivot = { x: p.x ?? s.pivot.x, y: p.y ?? s.pivot.y })), `slice-pivot-${id}`);

/** Makes the slice start a new place at this frame (it keeps where it was until here). */
export const keySliceHere = (id: Id) => keyEdit(id, 'Key slice at this frame', (s, f) => addKeyAt(s, f));
/** Takes this frame's key away; the last one left makes the slice stay in one place again. */
export const unkeySliceHere = (id: Id) => keyEdit(id, 'Remove slice key', (s, f) => removeKeyAt(s, f));
/** Back to one place on every frame, the place it has now. */
export const stopSliceMoving = (id: Id) => keyEdit(id, 'Keep slice in one place', (s, f) => stopMoving(s, f));

/** Keys belong to the open board's timeline, so they can only be set on a slice of the open board. */
function keyEdit(id: Id, label: string, fn: (s: Slice, frame: number) => void): boolean {
  const here = findSlice(store().get().doc, id);
  if (!here?.open) return false;
  const frame = store().get().ui.frame;
  store().update(label, (d) => {
    const s = findSlice(d as Doc, id)?.slice;
    if (!s) return;
    fn(s, frame);
    tidy(s);
  });
  return true;
}
