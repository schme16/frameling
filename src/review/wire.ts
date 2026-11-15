// Live review: the two closed lists of what can cross the link, and the readers that turn anything arriving into one of them
// or into nothing. Plain data only. Nothing here imports the store, immer or Electron, so the reviewer's window can use it.
//
// What a reviewer can say is this list and no other: there is no member that carries a document, a patch or a command.
// The sharer's side reads every message through `readFromReviewer`, which keeps only the fields it knows, with the same
// caps the file readers use. A peer that is not an honest Frameling can fill the inbox with capped, cleaned junk and move
// a pointer dot, and nothing else.
import type { CanvasMark, Id } from '../core/format';
import { cleanReviewText, cleanReviewerName } from '../audience/cleanText';
import { MAX_REPLIES, MAX_TEXT } from '../notes/model';
import { readMarks } from '../notes/marks';
import type { ToPopout } from '../popout/protocol';

/** The most reviewers at once. The user's decision: up to four. */
export const MAX_REVIEWERS = 4;

/** Colours of the four pointers, in the order people join. Chosen to stay apart from each other and from a mark's red. */
export const POINTER_COLOURS = ['#2f7dff', '#12a56a', '#e08a00', '#b34fd6'] as const;

/** What the sharer's side tells a reviewer: the picture messages the picture window already understands, and a few of its own. */
export type ToReviewer =
  | ToPopout
  /** The sharer's own pointer, in stage pixels. `n` counts up so an old one never replaces a newer one. `off` = it left the picture. */
  | { t: 'pointer'; n: number; x: number; y: number; off?: true }
  /** Let in: which seat this is (0 to 3), and the sharer's name for the review window's title. */
  | { t: 'admitted'; seat: number; name: string }
  /** These ids arrived and are safe: the outbox may forget them. */
  | { t: 'ack'; ids: string[] }
  /** The review is over, or you are not wanted. */
  | { t: 'bye'; why: ByeWhy };

export type ByeWhy = 'ended' | 'refused' | 'full' | 'removed';

/** A note the reviewer wrote. `x`, `y` are stage pixels. A reviewer can pin to the page or one frame, never a layer. */
export interface ReviewNote {
  t: 'note';
  id: string;
  x: number;
  y: number;
  text: string;
  frame?: number;
  /** A signature of the frames and layers they were looking at, so the sharer can say if those have since moved. */
  sig?: string;
  at: number;
}

export interface ReviewReply {
  t: 'reply';
  id: string;
  /** The reviewer's own note this answers. */
  to: string;
  text: string;
  at: number;
}

export interface ReviewMark {
  t: 'mark';
  mark: CanvasMark;
  sig?: string;
}

/** A reviewer ticking one of their own notes done (or un-ticking it). */
export interface ReviewTick {
  t: 'tick';
  id: string;
  to: string;
  done: boolean;
}

/** What a reviewer says that is worth keeping: it is held until the other side acknowledges its id. */
export type ReviewItem = ReviewNote | ReviewReply | ReviewMark | ReviewTick;

export type FromReviewer =
  /** First message after the code is proved. `gid` is the reviewer's random id for this review, so a dropped link comes back as the same person. */
  | { t: 'join'; name: string; gid: string }
  /** Out of step: send the whole drawing again. */
  | { t: 'hello' }
  | { t: 'point'; n: number; x: number; y: number; off?: true }
  | ReviewItem
  /** The reviewer is finished. */
  | { t: 'done' };

/** Which ids a reviewer item carries, for the acknowledgement. */
export const itemId = (i: ReviewItem): string => (i.t === 'mark' ? i.mark.id : i.id);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const SANE = 1e6;
const coord = (v: unknown): v is number => finite(v) && Math.abs(v) <= SANE;
const idOf = (v: unknown): string | null => (typeof v === 'string' && /^[\w.:-]{1,64}$/.test(v) ? v : null);
const sigOf = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 200 ? v : undefined);

/** Words a reviewer writes in a note or answer: cleaned, and no longer than a note may be. */
const words = (v: unknown): string | null => cleanReviewText(v, MAX_TEXT);

/**
 * Anything that arrives from a reviewer, read as one of the closed list or null. Unknown fields are dropped, unknown
 * kinds are refused, every number is checked, words are cleaned. `now` stamps `at` when the peer's own is wrong, so a
 * reviewer cannot claim another time (the sharer's clock is the only one that counts for ordering).
 */
export function readFromReviewer(raw: unknown, now: number): FromReviewer | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'join': {
      const gid = idOf(raw.gid);
      return gid ? { t: 'join', name: cleanReviewerName(raw.name), gid } : null;
    }
    case 'hello':
      return { t: 'hello' };
    case 'done':
      return { t: 'done' };
    case 'point': {
      if (!finite(raw.n) || !coord(raw.x) || !coord(raw.y)) return null;
      return { t: 'point', n: raw.n, x: raw.x, y: raw.y, ...(raw.off === true ? { off: true as const } : {}) };
    }
    case 'note': {
      const id = idOf(raw.id);
      const text = words(raw.text);
      if (!id || !text || !coord(raw.x) || !coord(raw.y)) return null;
      return { t: 'note', id, x: raw.x, y: raw.y, text, ...(finite(raw.frame) && raw.frame >= 0 && raw.frame < 1e6 ? { frame: Math.round(raw.frame) } : {}), ...(sigOf(raw.sig) ? { sig: sigOf(raw.sig) } : {}), at: now };
    }
    case 'reply': {
      const id = idOf(raw.id);
      const to = idOf(raw.to);
      const text = words(raw.text);
      if (!id || !to || !text) return null;
      return { t: 'reply', id, to, text, at: now };
    }
    case 'tick': {
      const id = idOf(raw.id);
      const to = idOf(raw.to);
      if (!id || !to || typeof raw.done !== 'boolean') return null;
      return { t: 'tick', id, to, done: raw.done };
    }
    case 'mark': {
      if (!isObj(raw.mark) || !idOf(raw.mark.id)) return null;
      const m = readMarks([{ ...raw.mark, text: raw.mark.kind === 'text' ? words(raw.mark.text) ?? '' : undefined }])?.[0];
      if (!m) return null;
      // Their marks sit on the page or one frame: a layer id means nothing to them. By and at are set by the receiver, never read.
      delete m.layer;
      delete m.board;
      delete m.by;
      delete m.at;
      if (m.pin === 'layer') delete m.pin;
      return { t: 'mark', mark: m, ...(sigOf(raw.sig) ? { sig: sigOf(raw.sig) } : {}) };
    }
    default:
      return null;
  }
}

/** A reply count never beyond the file's own cap, so a keep can never write more than a reader would take back. */
export const REPLY_CAP = MAX_REPLIES;

/** Anything the sharer's side sends to a reviewer, checked on the reviewer's side before the window sees it. */
const TO_KINDS = new Set(['doc', 'patch', 'look', 'ink', 'pixels', 'live', 'pointer', 'admitted', 'ack', 'bye']);
export const isToReviewer = (m: unknown): m is ToReviewer => isObj(m) && typeof m.t === 'string' && TO_KINDS.has(m.t);

/** A fresh id for something a reviewer writes. `rand` is for tests. */
export function newItemId(prefix: string, rand: () => number = Math.random): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(rand() * 36 ** 5).toString(36).padStart(5, '0')}`;
}

export type { Id };
