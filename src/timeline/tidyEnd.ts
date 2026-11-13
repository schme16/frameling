// Where the animation really ends: the furthest thing that points at a frame. Plain maths on the document, so the
// timeline, the command and the tests all read it the same way.
import type { Doc } from '../core/format';
import { inOutRange } from './inout';

/**
 * The shortest the animation can be without losing or moving anything: the end of the furthest drawing (and its
 * hold), marker, clip, effect key, sound start and play range, and at least 1. Never longer than the animation is now.
 */
export function fitLength(doc: Doc): number {
  let n = 1;
  for (const layer of doc.layers) {
    for (const c of layer.cels) n = Math.max(n, c.start + c.length);
    for (const fx of layer.effects ?? []) for (const k of fx.keys ?? []) n = Math.max(n, k.frame + 1);
  }
  for (const m of doc.markers) n = Math.max(n, m.frame + 1);
  for (const c of doc.clips) n = Math.max(n, Math.max(c.start, c.end) + 1);
  for (const a of doc.audio ?? []) n = Math.max(n, a.start + 1);
  const io = inOutRange(doc);
  if (io) n = Math.max(n, io.end + 1);
  return Math.min(n, doc.length);
}

/** How many empty frames hang off the end (0 when the animation already ends where its content does). */
export function emptyTail(doc: Doc): number {
  return Math.max(0, doc.length - fitLength(doc));
}

/** Takes the empty frames off the end. Returns false when there were none. */
export function tidyEnd(doc: Doc): boolean {
  const n = fitLength(doc);
  if (n >= doc.length) return false;
  doc.length = n;
  return true;
}
