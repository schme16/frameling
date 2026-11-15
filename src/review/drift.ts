// Did the drawing move under a note? The reviewer's window writes a short signature of the frames and layers it was looking at
// into each note, and the sharer's side compares it with the drawing as it is when the note arrives. Pure, and small enough to
// live in the reviewer's window.
import type { Doc } from '../core/format';

/** A short signature of the structure a note was written against: how many frames, and which layers in which order. Drawing on a frame does not change it. */
export function structureSig(doc: Pick<Doc, 'length' | 'layers'>): string {
  const s = `${doc.length}|${doc.layers.map((l) => l.id).join(',')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${doc.length}.${(h >>> 0).toString(36)}`;
}

/** True when the structure has changed since a note was written (no signature, or the same one, says no). */
export const driftOf = (sig: string | undefined, now: Pick<Doc, 'length' | 'layers'>): boolean => !!sig && sig !== structureSig(now);

/** The words for the inbox when a note has drifted, in the file review's own phrasing. */
export const DRIFT_NOTE = 'Frames have moved since, so this may be a frame off.';
