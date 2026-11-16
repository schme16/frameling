// The comments file: what a reviewer saves when the link would not come back (or never came), and what the sharer brings in. It
// holds what the reviewer wrote and nothing of the drawing. It is read the way the live link is, through the closed list of what
// a reviewer can say, so a file somebody made by hand can do no more than a live reviewer can: put words and marks in the inbox.
import { cleanReviewerName } from '../audience/cleanText';
import { readFromReviewer, type ReviewItem } from './wire';

export const COMMENTS_FORMAT = 'frameling-review';
/** The most a file may hold, and its size, so one cannot fill the memory. */
export const MAX_COMMENTS = 2000;
export const MAX_COMMENTS_BYTES = 8 * 1024 * 1024;

export interface CommentsFile {
  from: string;
  items: ReviewItem[];
}

/** What to write: the reviewer's name and everything they wrote, handed over or not. */
export function writeComments(from: string, items: readonly ReviewItem[], now: number): string {
  return JSON.stringify({ format: COMMENTS_FORMAT, version: 1, from, made: now, items }, null, 2);
}

/** Reads a comments file, or says null when it is not one. Anything in it that is not on the reviewer's list is left out. */
export function readComments(text: string, now: number): CommentsFile | null {
  if (text.length > MAX_COMMENTS_BYTES) return null;
  let raw: { format?: unknown; version?: unknown; from?: unknown; items?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || raw.format !== COMMENTS_FORMAT || raw.version !== 1 || !Array.isArray(raw.items)) return null;
  const items: ReviewItem[] = [];
  for (const r of raw.items.slice(0, MAX_COMMENTS)) {
    const m = readFromReviewer(r, now);
    if (m && (m.t === 'note' || m.t === 'reply' || m.t === 'mark' || m.t === 'tick')) items.push(m);
  }
  return { from: cleanReviewerName(raw.from, 'A reviewer'), items };
}
