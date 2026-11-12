// What the Preview plays when a sprite has several boards. Frames on boards play in order as one animation (each
// board is a frame, or as many frames as its own timeline has); sprites on a sheet play one sprite at a time, with a
// picker. Pure functions on a document, no DOM, so they can be tested.
import type { Doc, Id } from '../core/format';
import { artboardsOf, hasArtboards, sizeOf } from '../artboards/model';
import { createStore } from '../ui/mini';
import { boardLengths, isPixelDoc, wayOf } from './way';

/** One board: a plain document, the boards played in order, or sprites to choose between. */
export type PreviewKind = 'plain' | 'boards' | 'sprites';

export function previewKind(doc: Doc): PreviewKind {
  if (doc.editing?.length || !isPixelDoc(doc) || !hasArtboards(doc)) return 'plain';
  const way = wayOf(doc);
  return way === 'boards' ? 'boards' : way === 'sheet' ? 'sprites' : 'plain';
}

/** A board's place in the one long animation. */
export interface BoardSlot {
  id: Id;
  name: string;
  /** The first frame of this board in the long animation. */
  start: number;
  /** How many frames it holds. */
  length: number;
}

/** Every board in order, with where it starts in the one long animation. */
export function boardSlots(doc: Doc): BoardSlot[] {
  const lengths = boardLengths(doc);
  let at = 0;
  return artboardsOf(doc).map((a, i) => {
    const length = Math.max(1, lengths[i]);
    const slot = { id: a.id, name: a.name, start: at, length };
    at += length;
    return slot;
  });
}

/** Frames in the one long animation. */
export const slotsLength = (slots: BoardSlot[]): number => slots.reduce((n, s) => n + s.length, 0);

/** Which board a frame of the long animation is on, and the frame within that board. */
export function slotAt(slots: BoardSlot[], frame: number): { index: number; local: number } {
  for (let i = slots.length - 1; i >= 0; i--) if (frame >= slots[i].start) return { index: i, local: Math.min(slots[i].length - 1, frame - slots[i].start) };
  return { index: 0, local: 0 };
}

/** The sprite the Preview plays on a sheet: the one picked in the picker, else the open board. */
export interface PreviewPin {
  docId: string;
  id: Id | null;
}
export const previewPin = createStore<PreviewPin>({ docId: '', id: null });

/** The board a pin names in this document, or null (follow the open board). */
export function pinnedBoard(doc: Doc, pin: PreviewPin): Id | null {
  if (pin.docId !== doc.id || !pin.id) return null;
  return artboardsOf(doc).some((a) => a.id === pin.id) ? pin.id : null;
}

/** Picks a sprite to preview. Picking the open one, or the one already picked, goes back to following the open board. */
export function pickSprite(doc: Doc, open: Id, id: Id): void {
  const now = pinnedBoard(doc, previewPin.get());
  previewPin.set({ docId: doc.id, id: id === open || id === now ? null : id });
}

/** The biggest board's size, for scaling the preview so every board fits. */
export function boardsBox(doc: Doc): { w: number; h: number } {
  let w = 1;
  let h = 1;
  for (const a of artboardsOf(doc)) {
    const s = sizeOf(doc, a);
    w = Math.max(w, s.w);
    h = Math.max(h, s.h);
  }
  return { w, h };
}
