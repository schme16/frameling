// The play range (in and out) as plain maths on the document, so playback and export read it the same way.
import type { Doc } from '../core/format';

/** The in and out range, kept inside the animation, or null when there isn't one (or it no longer fits). */
export function inOutRange(doc: Doc): { start: number; end: number } | null {
  const io = doc.inOut;
  if (!io) return null;
  const last = Math.max(0, doc.length - 1);
  const start = Math.max(0, Math.min(last, Math.min(io.start, io.end)));
  const end = Math.max(0, Math.min(last, Math.max(io.start, io.end)));
  // Covering everything is the same as no range at all.
  if (start === 0 && end === last) return null;
  return { start, end };
}

/**
 * Moves the play range when whole-animation frames go in or out at `frame` (delta +1 inserted, -1 removed).
 * Before the range it slides along; inside it the range grows or shrinks.
 */
export function shiftInOut(doc: Doc, frame: number, delta: number): void {
  const io = doc.inOut;
  if (!io || !delta) return;
  const s = Math.min(io.start, io.end);
  const e = Math.max(io.start, io.end);
  if (frame > e) return;
  if (frame < s) doc.inOut = { start: Math.max(0, s + delta), end: Math.max(0, e + delta) };
  else doc.inOut = { start: s, end: Math.max(s, e + delta) };
}
