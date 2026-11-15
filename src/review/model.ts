// Reviews without servers: the plain logic. What a comments file looks like, reading one from somebody else (it is
// untrusted, so it goes through the same readers a document file does), merging it into the drawing by id, noticing
// when frames have moved since the review page was sent, and what goes on the review page. Nothing here touches the
// store or the screen, so all of it is easy to test.
import type { CanvasMark, CanvasNote, Doc, Id, NoteReply } from '../core/format';
import { MAX_MARKS, readMarks } from '../notes/marks';
import { MAX_NAME, MAX_NOTES, MAX_REPLIES, MAX_TEXT, onOpenBoard, pinOf, readNotes, readReplies, shownAt } from '../notes/model';

export const REVIEW_FORMAT = 'frameling-review';
/** The most a comments file may weigh. A hundred comments is a few KB; this is the ceiling for something pasted in. */
export const MAX_REVIEW_BYTES = 4_000_000;
/** The most answers one comments file can carry, in all. */
export const MAX_REVIEW_REPLIES = 2000;
export const DEFAULT_REVIEWER = 'A reviewer';

/** An answer in a comments file: it says which note it belongs to. */
export interface ReviewReply extends NoteReply {
  note: Id;
}

/** What a reviewer sends back. Only the notes, answers and marks they added, plus which notes they ticked off. */
export interface ReviewFile {
  format: typeof REVIEW_FORMAT;
  /** The drawing it is about (`Doc.id`). */
  doc: Id;
  /** Who it is from. */
  from: string;
  /** When the review page was sent (milliseconds since 1970): the version that was looked at. */
  sent?: number;
  /** When the comments were made. */
  made?: number;
  /** How many frames the drawing had, and a fingerprint of where its drawings sit in time, when it was sent. */
  length?: number;
  sig?: string;
  notes: CanvasNote[];
  replies: ReviewReply[];
  marks: CanvasMark[];
  /** Notes (by id) the reviewer ticked off. */
  done: Id[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------- reading a comments file

export type ReadReview = { ok: true; review: ReviewFile } | { ok: false; why: string };

/** The JSON inside pasted text: it may have a sentence round it or a code fence, and chat apps like to curl quotes. */
export function jsonInside(text: string): string {
  const t = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  return a >= 0 && b > a ? t.slice(a, b + 1) : t.trim();
}

/**
 * Reads a comments file or pasted text. Anything wrong comes back as a plain reason, never a throw. What is kept is
 * what `readNotes` and `readMarks` keep, so sizes are capped and malformed notes are dropped.
 */
export function readReview(input: unknown): ReadReview {
  let raw: unknown = input;
  if (input instanceof Uint8Array) {
    if (input.length > MAX_REVIEW_BYTES) return { ok: false, why: 'That file is far bigger than a comments file ever is.' };
    input = new TextDecoder().decode(input);
  }
  if (typeof input === 'string') {
    if (input.length > MAX_REVIEW_BYTES) return { ok: false, why: 'That is far bigger than a comments file ever is.' };
    try {
      raw = JSON.parse(jsonInside(input));
    } catch {
      return { ok: false, why: 'That does not look like a comments file. It should be the file or the text from a Frameling review page.' };
    }
  }
  if (!isObj(raw) || raw.format !== REVIEW_FORMAT) return { ok: false, why: 'That is not a Frameling comments file.' };
  if (typeof raw.doc !== 'string' || !raw.doc) return { ok: false, why: 'That comments file does not say which drawing it is about.' };
  const from = typeof raw.from === 'string' && raw.from.trim() ? raw.from.trim().slice(0, MAX_NAME) : DEFAULT_REVIEWER;
  const made = finite(raw.made) && raw.made > 0 ? raw.made : undefined;
  const board = typeof raw.board === 'string' && raw.board ? raw.board : undefined;

  const notes = (readNotes(raw.notes) ?? [])
    .filter((n) => n.text.trim() || n.replies?.length)
    .map((n) => {
      const out: CanvasNote = { ...n, by: n.by ?? from };
      if (n.at === undefined && made) out.at = made;
      if (!n.board && board) out.board = board;
      return out;
    });
  // Answers are read a note at a time, so each note keeps its own cap and one noisy note cannot crowd out the rest.
  const byNote = new Map<Id, unknown[]>();
  let seen = 0;
  for (const r of Array.isArray(raw.replies) ? raw.replies : []) {
    if (++seen > MAX_REVIEW_REPLIES) break;
    if (!isObj(r) || typeof r.note !== 'string' || !r.note) continue;
    (byNote.get(r.note) ?? byNote.set(r.note, []).get(r.note)!).push(r);
  }
  const replies: ReviewReply[] = [];
  for (const [note, list] of byNote)
    for (const r of readReplies(list) ?? []) replies.push({ ...r, note, by: r.by ?? from, ...(r.at === undefined && made ? { at: made } : {}) });

  const marks = (readMarks(raw.marks) ?? []).map((m) => {
    const out: CanvasMark = { ...m, by: m.by ?? from };
    if (m.at === undefined && made) out.at = made;
    if (!m.board && board) out.board = board;
    return out;
  });
  const done = (Array.isArray(raw.done) ? raw.done : []).filter((d): d is string => typeof d === 'string' && !!d).slice(0, MAX_NOTES);

  const review: ReviewFile = { format: REVIEW_FORMAT, doc: raw.doc, from, notes, replies, marks, done };
  if (finite(raw.sent) && raw.sent > 0) review.sent = raw.sent;
  if (made) review.made = made;
  if (finite(raw.length) && raw.length >= 1) review.length = Math.round(raw.length);
  if (typeof raw.sig === 'string' && raw.sig) review.sig = raw.sig.slice(0, 40);
  return { ok: true, review };
}

/** True when a comments file holds nothing to bring in. */
export const isEmptyReview = (r: ReviewFile): boolean => !r.notes.length && !r.replies.length && !r.marks.length && !r.done.length;

// ---------------------------------------------------------------- which version was reviewed

/**
 * A short fingerprint of when things happen in a drawing: how long it is, and for each layer where its drawings start
 * and how long they last. Moving or adding frames changes it; drawing on a frame does not. A comment pinned to a frame
 * is only trustworthy while this has not changed since the review page was sent.
 */
export function structureSig(doc: Pick<Doc, 'length' | 'layers'>): string {
  let s = `${doc.length}|`;
  for (const l of doc.layers) s += `${l.id}:${l.cels.map((c) => `${c.start}-${c.length}`).join(',')};`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + doc.length.toString(36);
}

export interface Drift {
  /** The comments are about a different drawing. */
  otherDoc: boolean;
  /** Frames moved since the page was sent, so frame-pinned comments may be a frame off. Only said when it is known. */
  drifted: boolean;
  /** When the reviewed version was sent. */
  sent?: number;
  /** How many frames it had then and has now. */
  was?: number;
  now: number;
}

export function driftOf(doc: Pick<Doc, 'id' | 'length' | 'layers'>, r: Pick<ReviewFile, 'doc' | 'sig' | 'sent' | 'length'>): Drift {
  const out: Drift = { otherDoc: r.doc !== doc.id, drifted: false, now: doc.length };
  if (r.sent) out.sent = r.sent;
  if (r.length) out.was = r.length;
  if (r.sig && r.sig !== structureSig(doc)) out.drifted = true;
  else if (!r.sig && r.length && r.length !== doc.length) out.drifted = true;
  return out;
}

// ---------------------------------------------------------------- merging by id

export interface MergeSummary {
  notes: number;
  replies: number;
  marks: number;
  /** Notes the reviewer ticked that were still open here. */
  ticked: number;
  /** Answers that belong to a note this drawing does not have. */
  orphans: number;
}

export interface Merged {
  notes: CanvasNote[];
  marks: CanvasMark[];
  summary: MergeSummary;
}

export const mergedAnything = (s: MergeSummary): boolean => !!(s.notes || s.replies || s.marks || s.ticked);

/**
 * The drawing's notes and marks with a reviewer's added. A union by id: what is already here is never replaced, so
 * bringing the same file in twice changes nothing and two reviewers can never clash. `done` is ticked when either side
 * ticked it; the owner unticking it is just a normal edit afterwards. The inputs are not changed.
 */
export function mergeReview(have: { notes?: readonly CanvasNote[]; marks?: readonly CanvasMark[] }, r: ReviewFile): Merged {
  const notes: CanvasNote[] = (have.notes ?? []).map((n) => ({ ...n, ...(n.replies ? { replies: [...n.replies] } : {}) }));
  const marks: CanvasMark[] = [...(have.marks ?? [])];
  const summary: MergeSummary = { notes: 0, replies: 0, marks: 0, ticked: 0, orphans: 0 };
  const index = new Map(notes.map((n) => [n.id, n]));

  for (const n of r.notes) {
    if (index.has(n.id) || notes.length >= MAX_NOTES) continue;
    const added: CanvasNote = { ...n, text: n.text.slice(0, MAX_TEXT) };
    notes.push(added);
    index.set(added.id, added);
    summary.notes++;
  }
  for (const rep of r.replies) {
    const target = index.get(rep.note);
    if (!target) {
      summary.orphans++;
      continue;
    }
    if (target.replies?.some((x) => x.id === rep.id) || (target.replies?.length ?? 0) >= MAX_REPLIES) continue;
    const { note: _note, ...answer } = rep;
    void _note;
    (target.replies ??= []).push(answer);
    summary.replies++;
  }
  const have_ = new Set(marks.map((m) => m.id));
  for (const m of r.marks) {
    if (have_.has(m.id) || marks.length >= MAX_MARKS) continue;
    marks.push(m);
    have_.add(m.id);
    summary.marks++;
  }
  for (const id of r.done) {
    const n = index.get(id);
    if (n && !n.done) {
      n.done = true;
      summary.ticked++;
    }
  }
  return { notes, marks, summary };
}

/** "3 notes, 2 answers and 1 mark" for what came in; "nothing new" when it was all here already. */
export function summaryWords(s: MergeSummary): string {
  const bit = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const parts = [bit(s.notes, 'note', 'notes'), bit(s.replies, 'answer', 'answers'), bit(s.marks, 'mark', 'marks'), s.ticked ? `${s.ticked} ticked off` : ''].filter(Boolean);
  if (!parts.length) return 'nothing new';
  return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

// ---------------------------------------------------------------- the review page's data

/** A note or mark as the review page holds it: no layer ids, and `f` (the frames it shows on) only for a layer pin. */
export type PageNote = Omit<CanvasNote, 'layer'> & { f?: number[] };
export type PageMark = Omit<CanvasMark, 'layer'> & { f?: number[] };

export interface PageData {
  v: 1;
  doc: { id: Id; name: string; width: number; height: number; length: number; fps: number };
  /** When the page was made: the version that gets reviewed. */
  sent: number;
  sig: string;
  board?: Id;
  /** The pictures, and for each frame which picture it shows (frames that look the same share one). */
  images: string[];
  frames: number[];
  /** Draw the picture with hard pixel edges (a pixel drawing). */
  pixelated?: boolean;
  notes: PageNote[];
  marks: PageMark[];
}

function pinFor<T extends CanvasNote | CanvasMark>(item: T, doc: Doc): Omit<T, 'layer'> & { f?: number[] } {
  const { layer: _l, ...rest } = item;
  void _l;
  const out = rest as Omit<T, 'layer'> & { f?: number[] };
  if (pinOf(item) === 'layer') {
    const f: number[] = [];
    for (let i = 0; i < doc.length; i++) if (shownAt(item, doc, i)) f.push(i);
    delete out.pin;
    if (f.length < doc.length) out.f = f;
  }
  return out;
}

/** The notes and marks a reviewer should see: the ones on the open page, ready for the page's own small script. */
export function reviewItems(doc: Doc): { notes: PageNote[]; marks: PageMark[] } {
  if (doc.editing?.length) return { notes: [], marks: [] };
  return {
    notes: (doc.notes ?? []).filter((n) => onOpenBoard(n, doc)).map((n) => pinFor(n, doc)),
    marks: (doc.marks ?? []).filter((m) => onOpenBoard(m, doc)).map((m) => pinFor(m, doc)),
  };
}

// ---------------------------------------------------------------- words

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov, 3:04 pm": a moment in plain words, in this computer's time. */
export function momentWords(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** A file name for a review page: the drawing's name, made safe, then "review". */
export function reviewFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'Drawing';
  return `${base} review.html`;
}
