// Taking your name off a copy you send. A note or a mark is stamped with whoever left it and when (src/notes/ops.ts),
// so a drawing with notes in it carries your name out of the door. Somebody asking for "a copy with the personal bits
// taken out" means this, so a copy loses those stamps unless you say otherwise.
//
// What it does NOT touch: the drawing's own name, which you chose and probably want, and the words of the notes
// themselves, which are the point of sending it. Marks carry no name today, so there is nothing to take off them.
// Pure: no store, no screen, and the drawing passed in is never changed.
import type { CanvasNote, Doc, NoteReply } from '../core/format';

/** The one place that says which fields are a person rather than the work. */
const PERSONAL = ['by', 'at'] as const;

function withoutNames<T extends { by?: string; at?: number }>(item: T): T {
  const out = { ...item };
  for (const f of PERSONAL) delete out[f];
  return out;
}

const replyWithout = (r: NoteReply): NoteReply => withoutNames(r);

const noteWithout = (n: CanvasNote): CanvasNote => ({
  ...withoutNames(n),
  ...(n.replies ? { replies: n.replies.map(replyWithout) } : {}),
});

/**
 * The drawing with every "who left this and when" taken off its notes and their answers. Returns the very same object
 * when nothing is stamped, so a drawing with no notes costs nothing.
 */
export function withNamesOff(doc: Doc): Doc {
  if (!doc.notes?.length) return doc;
  return { ...doc, notes: doc.notes.map(noteWithout) };
}

/** True when a drawing has anybody's name or time stamped on it, so the work is only worth doing then. */
export function hasNames(doc: Doc): boolean {
  const stamped = (x: { by?: string; at?: number }): boolean => x.by !== undefined || x.at !== undefined;
  return !!doc.notes?.some((n) => stamped(n) || !!n.replies?.some(stamped));
}
