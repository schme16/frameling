/**
 * The app's own copy and paste for shapes. It lives in memory, so it works from one frame (or layer) to another and
 * doesn't depend on the system clipboard.
 */
import type { Id, Shape } from '../core/format';
import { uid } from '../core/doc';
import { carryRepeat, cloneShape, transformShape, translate } from '../canvas/geometry';

interface Clip {
  shapes: Shape[];
  /** The drawing they were copied from. */
  from: Id | null;
  /** How many times they've been pasted into each drawing since the copy (so repeated pastes step across instead of stacking). */
  pastes: Map<Id, number>;
}

let clip: Clip | null = null;

/** How far a paste or duplicate that lands on top of the original is nudged, in document pixels. */
export const PASTE_STEP = 14;

export function copyToClipboard(shapes: Shape[], fromDrawing: Id | null): void {
  clip = { shapes: shapes.map((s) => cloneShape(s, s.id)), from: fromDrawing, pastes: new Map() };
}

/** Copies get groups of their own, so a pasted group doesn't join the one it was copied from. */
function regroup(shapes: Shape[]): Shape[] {
  const fresh = new Map<Id, Id>();
  return shapes.map((s) => {
    if (!s.group) return s;
    if (!fresh.has(s.group)) fresh.set(s.group, uid('g'));
    return { ...s, group: fresh.get(s.group) };
  });
}

/**
 * Words on a curve follow the copy of their line when the line was copied with them. With no line in the batch they keep
 * the curve they have and follow nothing (a lone copy left following the original line would snap back onto it).
 */
function relinkPathText(copies: Shape[], renamed: Map<Id, Id>): Shape[] {
  return copies.map((s) => {
    if (s.type !== 'text' || !s.onPath?.source) return s;
    const { source, ...rest } = s.onPath;
    const next = renamed.get(source);
    return { ...s, onPath: next ? { ...rest, source: next } : rest };
  });
}

/** Moved copies of shapes under new ids, with groups and words-on-a-curve pointing at the copies and not the originals. */
function freshCopies(shapes: Shape[], move: ReturnType<typeof translate>): Shape[] {
  const renamed = new Map<Id, Id>();
  const copies = shapes.map((s) => {
    const c = cloneShape(s, uid('sh'));
    renamed.set(s.id, c.id);
    return carryRepeat(transformShape(c, move), move);
  });
  return regroup(relinkPathText(copies, renamed));
}

export function clipboardHasShapes(): boolean {
  return !!clip && clip.shapes.length > 0;
}

/** Fresh copies of the clipboard shapes (new ids), moved to where a paste into `target` should land. */
export function pasteFromClipboard(target: Id | null): Shape[] {
  if (!clip) return [];
  // The first paste into another frame lands in the same place. Into the frame it came from, the original is already
  // there, so it steps aside.
  const n = (target ? (clip.pastes.get(target) ?? 0) : 0) + (clip.from !== null && clip.from === target ? 1 : 0);
  const move = translate(n * PASTE_STEP, n * PASTE_STEP);
  return freshCopies(clip.shapes, move);
}

/** Tells the clipboard a paste landed in this drawing, so the next one steps along. */
export function notePasted(target: Id | null | undefined): void {
  if (clip && target) clip.pastes.set(target, (clip.pastes.get(target) ?? 0) + 1);
}

/** Copies of shapes with new ids, nudged aside (Duplicate). */
export function duplicateShapes(shapes: Shape[]): Shape[] {
  const move = translate(PASTE_STEP, PASTE_STEP);
  return freshCopies(shapes, move);
}

export function clearClipboard(): void {
  clip = null;
}
