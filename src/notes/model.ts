// Notes on the canvas: the plain logic. Which notes show on a frame, where one belongs, reading them back from a file,
// and `withoutNotes`, which every way out of the app (exports, templates, plugins) passes the document through. Nothing
// here draws or touches the store, so it is easy to test.
import type { CanvasNote, Doc, Id, Layer, NoteReply } from '../core/format';

export type NotePin = 'page' | 'frame' | 'layer';

/** Limits so a damaged or hand-made file can't hold a note the size of a book. */
export const MAX_NOTES = 2000;
export const MAX_TEXT = 4000;
export const MAX_REPLIES = 200;
const MAX_NAME = 80;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readReplies(raw: unknown): NoteReply[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: NoteReply[] = [];
  for (const r of raw) {
    if (!isObj(r) || typeof r.text !== 'string' || !r.text.trim()) continue;
    const reply: NoteReply = { id: typeof r.id === 'string' && r.id ? r.id : 'r' + out.length + Math.random().toString(36).slice(2, 8), text: r.text.slice(0, MAX_TEXT) };
    if (typeof r.by === 'string' && r.by.trim()) reply.by = r.by.slice(0, MAX_NAME);
    if (finite(r.at) && r.at > 0) reply.at = r.at;
    out.push(reply);
    if (out.length >= MAX_REPLIES) break;
  }
  return out.length ? out : undefined;
}

/** The notes of a file, keeping only well-formed ones (a note with no place on the page is dropped). */
export function readNotes(raw: unknown): CanvasNote[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CanvasNote[] = [];
  const seen = new Set<string>();
  for (const n of raw) {
    if (!isObj(n) || !finite(n.x) || !finite(n.y)) continue;
    let id = typeof n.id === 'string' && n.id ? n.id : 'n' + out.length + Math.random().toString(36).slice(2, 8);
    if (seen.has(id)) id += Math.random().toString(36).slice(2, 6);
    seen.add(id);
    const note: CanvasNote = { id, x: n.x, y: n.y, text: typeof n.text === 'string' ? n.text.slice(0, MAX_TEXT) : '' };
    if (n.pin === 'frame' && finite(n.frame) && n.frame >= 0) {
      note.pin = 'frame';
      note.frame = Math.round(n.frame);
    } else if (n.pin === 'layer' && typeof n.layer === 'string' && n.layer) {
      note.pin = 'layer';
      note.layer = n.layer;
    }
    if (typeof n.board === 'string' && n.board) note.board = n.board;
    if (typeof n.by === 'string' && n.by.trim()) note.by = n.by.slice(0, MAX_NAME);
    if (finite(n.at) && n.at > 0) note.at = n.at;
    if (n.done === true) note.done = true;
    const replies = readReplies(n.replies);
    if (replies) note.replies = replies;
    out.push(note);
    if (out.length >= MAX_NOTES) break;
  }
  return out.length ? out : undefined;
}

// ---------------------------------------------------------------- never exported

const bare = new WeakMap<object, object>();

/**
 * The document without its notes. Exports, templates, the Interactives package and plugins all take the document
 * through this, so a note can never reach them even if a format later learns to write more of the document. The same
 * object comes back when there is nothing to take out, and the same copy for the same document.
 */
export function withoutNotes<T extends { notes?: unknown }>(doc: T): T {
  if (doc.notes === undefined) return doc;
  let copy = bare.get(doc) as T | undefined;
  if (!copy) {
    copy = { ...doc };
    delete copy.notes;
    bare.set(doc, copy);
  }
  return copy;
}

// ---------------------------------------------------------------- where a note shows

/** The artboard that is open, or undefined when the document has just the one page. */
export function boardOf(doc: Pick<Doc, 'artboards' | 'activeArtboard'>): Id | undefined {
  const list = doc.artboards;
  if (!list?.length) return undefined;
  const open = list.filter((b) => !b.content);
  if (doc.activeArtboard && open.some((b) => b.id === doc.activeArtboard)) return doc.activeArtboard;
  return (open[0] ?? list[0]).id;
}

/** True when the note belongs on the artboard that is open (a note whose artboard is gone shows on whichever is open). */
export function onOpenBoard(note: CanvasNote, doc: Pick<Doc, 'artboards' | 'activeArtboard'>): boolean {
  if (!note.board || !doc.artboards?.some((b) => b.id === note.board)) return true;
  return note.board === boardOf(doc);
}

export const pinOf = (n: CanvasNote): NotePin => (n.pin === 'frame' && n.frame !== undefined ? 'frame' : n.pin === 'layer' && n.layer ? 'layer' : 'page');

/** Whether a layer has a drawing on a frame. */
export function layerShowsAt(layer: Layer, frame: number): boolean {
  return layer.cels.some((c) => frame >= c.start && frame < c.start + c.length);
}

/**
 * The notes to show on a frame of the open artboard: page notes always, frame notes on their frame, layer notes while
 * their layer has a drawing there (a note whose layer is gone becomes a page note). None while a symbol is open, since
 * the page is not the one the notes were left on.
 */
export function visibleNotes(doc: Doc, frame: number, opts: { hideDone?: boolean } = {}): CanvasNote[] {
  if (!doc.notes?.length || doc.editing?.length) return [];
  return doc.notes.filter((n) => {
    if (opts.hideDone && n.done) return false;
    if (!onOpenBoard(n, doc)) return false;
    const pin = pinOf(n);
    if (pin === 'frame') return n.frame === frame;
    if (pin === 'layer') {
      const layer = doc.layers.find((l) => l.id === n.layer);
      return !layer || layerShowsAt(layer, frame);
    }
    return true;
  });
}

/** The frames that have notes pinned to them on the open artboard: how many, and how many are still open. */
export function framesWithNotes(doc: Doc): Map<number, { total: number; open: number }> {
  const out = new Map<number, { total: number; open: number }>();
  if (doc.editing?.length) return out;
  for (const n of doc.notes ?? []) {
    if (pinOf(n) !== 'frame' || !onOpenBoard(n, doc)) continue;
    const at = out.get(n.frame!) ?? { total: 0, open: 0 };
    at.total++;
    if (!n.done) at.open++;
    out.set(n.frame!, at);
  }
  return out;
}

/** Notes in reading order for a list: by frame (page notes first, then layer notes, then frames), then oldest first. */
export function sortedNotes(notes: readonly CanvasNote[]): CanvasNote[] {
  const rank = (n: CanvasNote) => {
    const p = pinOf(n);
    return p === 'page' ? -2 : p === 'layer' ? -1 : n.frame!;
  };
  return notes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => rank(a.n) - rank(b.n) || (a.n.at ?? 0) - (b.n.at ?? 0) || a.i - b.i)
    .map((x) => x.n);
}

/** Where to take the playhead and the layer for a note: its frame, or the first frame its layer has a drawing on. */
export function jumpTarget(doc: Doc, note: CanvasNote, frame: number): { frame: number; layer?: Id } {
  const pin = pinOf(note);
  if (pin === 'frame') return { frame: Math.max(0, Math.min(doc.length - 1, note.frame!)) };
  if (pin === 'layer') {
    const layer = doc.layers.find((l) => l.id === note.layer);
    if (!layer) return { frame };
    if (layerShowsAt(layer, frame)) return { frame, layer: layer.id };
    const first = layer.cels.reduce<number | null>((m, c) => (m === null || c.start < m ? c.start : m), null);
    return { frame: first === null ? frame : Math.min(doc.length - 1, first), layer: layer.id };
  }
  return { frame };
}

/** Where a note belongs, in plain words ("The page", "Frame 12", "Layer Lines"). */
export function whereText(doc: Doc, n: CanvasNote): string {
  const pin = pinOf(n);
  if (pin === 'frame') return `Frame ${n.frame! + 1}${n.frame! >= doc.length ? ' (past the end)' : ''}`;
  if (pin === 'layer') {
    const layer = doc.layers.find((l) => l.id === n.layer);
    return layer ? `Layer ${layer.name}` : 'The page';
  }
  return 'The page';
}

// ---------------------------------------------------------------- who and when

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "just now", "5 minutes ago", "yesterday", "3 Nov" (and the year, when it is not this one). Empty when the time is not known. */
export function whenText(at: number | undefined, now = Date.now()): string {
  if (!at) return '';
  const ago = now - at;
  if (ago < 60_000) return 'just now';
  const min = Math.floor(ago / 60_000);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const d = new Date(at);
  const n = new Date(now);
  const day = (x: Date) => Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000);
  const days = day(n) - day(d);
  if (days === 1) return 'yesterday';
  if (days < 7 && days > 1) return `${days} days ago`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === n.getFullYear() ? '' : ' ' + d.getFullYear()}`;
}

/** "Shane, 2 hours ago", "Shane", "2 hours ago" or "" depending on what is known. */
export function byLine(by: string | undefined, at: number | undefined, now = Date.now()): string {
  return [by?.trim() || '', whenText(at, now)].filter(Boolean).join(', ');
}

/** The first line of a note, cut to fit a list row. */
export function noteTitle(n: CanvasNote, max = 60): string {
  const line = n.text.split('\n').find((l) => l.trim()) ?? '';
  const t = line.trim();
  if (!t) return 'Empty note';
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

// ---------------------------------------------------------------- making and changing (pure)

export interface NewNoteSpec {
  id: Id;
  x: number;
  y: number;
  pin: NotePin;
  frame: number;
  layer?: Id;
  board?: Id;
  by?: string;
  at?: number;
}

/** A new, empty note. A layer note with no layer to belong to is a page note. */
export function makeNote(s: NewNoteSpec): CanvasNote {
  const n: CanvasNote = { id: s.id, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, text: '' };
  if (s.pin === 'frame') {
    n.pin = 'frame';
    n.frame = Math.max(0, Math.round(s.frame));
  } else if (s.pin === 'layer' && s.layer) {
    n.pin = 'layer';
    n.layer = s.layer;
  }
  if (s.board) n.board = s.board;
  if (s.by?.trim()) n.by = s.by.trim().slice(0, MAX_NAME);
  if (s.at) n.at = s.at;
  return n;
}

/** The note moved to another place to belong to (the rest of it kept). */
export function repinned(n: CanvasNote, pin: NotePin, where: { frame: number; layer?: Id }): CanvasNote {
  const out: CanvasNote = { ...n };
  delete out.pin;
  delete out.frame;
  delete out.layer;
  if (pin === 'frame') {
    out.pin = 'frame';
    out.frame = Math.max(0, Math.round(where.frame));
  } else if (pin === 'layer' && where.layer) {
    out.pin = 'layer';
    out.layer = where.layer;
  }
  return out;
}

/** Counts for the panel's header: all, still open, done. */
export function countNotes(notes: readonly CanvasNote[] | undefined): { all: number; open: number; done: number } {
  const all = notes?.length ?? 0;
  const done = notes?.filter((n) => n.done).length ?? 0;
  return { all, open: all - done, done };
}
