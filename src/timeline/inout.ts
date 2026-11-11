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
