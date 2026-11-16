// The sharer's inbox: what reviewers have said, held in memory, never written into the drawing until the sharer says Keep.
//
// This is deliberately not `store().update`. An update from outside the sharer's own hands would clear their redo stack and
// become their next Undo, so a reviewer's note would turn into the sharer's last action. The inbox is in-memory state, like
// the notes layer's own, and Keep is one undoable step that writes the lot.
//
// Pure: it knows nothing of the store or the screen. `keepInto` works on a draft of the document.
import type { CanvasMark, CanvasNote, Doc, Id, NoteReply } from '../core/format';
import { MAX_NOTES, MAX_REPLIES, MAX_TEXT, boardOf } from '../notes/model';
import { MAX_MARKS } from '../notes/marks';
import { QUIET_PREFIX } from '../core/quiet';
import { itemId, type ReviewItem } from './wire';

export interface InboxEntry {
  /** Seat plus id, so two reviewers' ids can never meet. */
  key: string;
  seat: number;
  /** The name they joined with, cleaned. */
  by: string;
  /** When it arrived by the sharer's clock. */
  at: number;
  item: ReviewItem;
  /** The frames or layers have changed since it was written (see `driftOf`). */
  drift: boolean;
  /** Written into the drawing already. */
  kept: boolean;
  /** Seen by the sharer (it has been opened or the list was). */
  read: boolean;
}

/** The most that wait in the inbox: past that the oldest unkept ones are not taken (a reviewer cannot fill the memory). */
export const MAX_INBOX = 1000;

const keyOf = (seat: number, id: string) => `${seat}:${id}`;

export class Inbox {
  private list: InboxEntry[] = [];
  private by = new Map<string, InboxEntry>();
  /** Who wrote each note, so an answer or a tick can only go to a note of the same reviewer. */
  private owner = new Map<string, number>();

  /**
   * Takes what a reviewer said. Returns the id to acknowledge (the item was taken now or was already here), or null when it
   * is refused (a full inbox, or an answer to a note that is not theirs). Sending twice is harmless.
   */
  add(seat: number, name: string, item: ReviewItem, now: number, drift = false): string | null {
    const id = itemId(item);
    const key = keyOf(seat, id);
    if (this.by.has(key)) return id;
    if (item.t === 'reply' || item.t === 'tick') {
      if (this.owner.get(keyOf(seat, item.to)) === undefined) return null;
    }
    if (this.list.length >= MAX_INBOX) return null;
    if (item.t === 'note') this.owner.set(keyOf(seat, id), seat);
    const stamped = item.t === 'mark' ? { ...item, mark: { ...item.mark, by: name, at: now } } : item;
    const e: InboxEntry = { key, seat, by: name, at: now, item: stamped, drift, kept: false, read: false };
    this.list.push(e);
    this.by.set(key, e);
    return id;
  }

  get entries(): readonly InboxEntry[] {
    return this.list;
  }

  /** How many have not been read yet. */
  get unread(): number {
    return this.list.reduce((n, e) => n + (e.read ? 0 : 1), 0);
  }

  /** How many are waiting to be kept. */
  get waiting(): number {
    return this.list.reduce((n, e) => n + (e.kept ? 0 : 1), 0);
  }

  markRead(key?: string): void {
    for (const e of this.list) if (!key || e.key === key) e.read = true;
  }

  /** Entries that were kept. */
  markKept(keys?: readonly string[]): void {
    const set = keys ? new Set(keys) : null;
    for (const e of this.list) if (!set || set.has(e.key)) e.kept = true;
  }

  clear(): void {
    this.list = [];
    this.by.clear();
    this.owner.clear();
  }
}

/**
 * Writes entries into a draft of the document, as notes, marks, answers and ticks, each stamped with who and when. Merging
 * is by id: an entry already there is left alone, so keeping twice changes nothing. Returns how many things were written.
 * Frame notes land on the frame the reviewer was looking at; everything else on the page (a reviewer cannot pin to a layer).
 *
 * `quiet` is for the ones that go in without a step in Undo (see src/core/quiet.ts): their ids start with `rq`, which is
 * how Undo knows to leave them be. Either kind is found when an answer or a tick looks for its note.
 */
export function keepInto(d: Doc, entries: readonly InboxEntry[], quiet = false): number {
  let wrote = 0;
  const board = boardOf(d);
  const tag = quiet ? QUIET_PREFIX : 'rv';
  const rawId = (e: InboxEntry, own: string): string => `${e.seat}-${own}`;
  const ids = (e: InboxEntry, own: string): [string, string] => [`${tag}${rawId(e, own)}`, `${quiet ? 'rv' : QUIET_PREFIX}${rawId(e, own)}`];
  const noteFor = (e: InboxEntry, to: string) => d.notes?.find((n) => n.id === `rv${rawId(e, to)}` || n.id === `${QUIET_PREFIX}${rawId(e, to)}`);
  for (const e of entries) {
    const it = e.item;
    if (it.t === 'note') {
      d.notes ??= [];
      const [id, other] = ids(e, it.id);
      if (d.notes.some((n) => n.id === id || n.id === other) || d.notes.length >= MAX_NOTES) continue;
      const n: CanvasNote = { id, x: it.x, y: it.y, text: it.text.slice(0, MAX_TEXT), by: e.by.slice(0, 80), at: e.at };
      if (it.frame !== undefined) {
        n.pin = 'frame';
        n.frame = Math.min(Math.max(0, d.length - 1), it.frame);
      }
      if (board) n.board = board;
      d.notes.push(n);
      wrote++;
    } else if (it.t === 'reply') {
      const note = noteFor(e, it.to);
      const [rid, other] = ids(e, it.id);
      if (!note || note.replies?.some((r) => r.id === rid || r.id === other) || (note.replies?.length ?? 0) >= MAX_REPLIES) continue;
      const r: NoteReply = { id: rid, text: it.text.slice(0, MAX_TEXT), by: e.by.slice(0, 80), at: e.at };
      (note.replies ??= []).push(r);
      wrote++;
    } else if (it.t === 'tick') {
      const note = noteFor(e, it.to);
      if (!note || (note.done === true) === it.done) continue;
      if (it.done) note.done = true;
      else delete note.done;
      wrote++;
    } else {
      d.marks ??= [];
      const [id, other] = ids(e, it.mark.id);
      if (d.marks.some((m) => m.id === id || m.id === other) || d.marks.length >= MAX_MARKS) continue;
      const m: CanvasMark = { ...it.mark, id, by: e.by.slice(0, 80), at: e.at };
      if (it.mark.pin === 'frame' && it.mark.frame !== undefined) m.frame = Math.min(Math.max(0, d.length - 1), it.mark.frame);
      if (board) m.board = board;
      d.marks.push(m);
      wrote++;
    }
  }
  return wrote;
}

export { DRIFT_NOTE, driftOf, structureSig } from './drift';
