// The join link for a live review: frameling://review?code=river-lantern-copper-owl
//
// A link arrives from outside and anybody can send one, so this only ever reads a code out of it: four of our own words,
// joined with dashes, once. Nothing else in the link is used (no name, no path, no address), and a link is only ever a
// question put to the person ("Join this review?"), never a join. No Node here, so the page can check a pasted link too.
import { formatCode, parseCode, type ShareCode } from './code';

export const LINK_SCHEME = 'frameling';
export const REVIEW_ACTION = 'review';
/** A real link is about 55 characters. Anything much longer is not one of ours. */
export const MAX_LINK_CHARS = 200;

/** The link for a code. */
export const reviewLink = (code: ShareCode | string): string => {
  const text = typeof code === 'string' ? code : formatCode(code);
  return `${LINK_SCHEME}://${REVIEW_ACTION}?code=${text}`;
};

/** Whether this text looks like a frameling:// link at all (so the join box knows to read it as one). */
export const looksLikeLink = (text: string): boolean => /^\s*frameling:/i.test(text);

/**
 * The code a review link carries, as the four dashed words, or null for anything else: another action, another scheme, a
 * name or password or port in the address, a path, a second code, or words that are not ours.
 */
export function codeFromLink(link: string): string | null {
  const text = link.trim();
  if (!text || text.length > MAX_LINK_CHARS) return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== `${LINK_SCHEME}:`) return null;
  const action = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase();
  if (action !== REVIEW_ACTION) return null;
  if (u.username || u.password || u.port) return null;
  // `frameling://review?code=...` and `frameling://review/?code=...` are the same; a longer path is somebody making things up.
  if (u.hostname && u.pathname.replace(/\/+$/, '') !== '') return null;
  const all = u.searchParams.getAll('code');
  if (all.length !== 1) return null;
  const raw = all[0].toLowerCase();
  // Strict about the shape: only letters and single dashes. (What people type into the join box is looser; a link is made by a program.)
  if (!/^[a-z]+(-[a-z]+)*$/.test(raw)) return null;
  const parsed = parseCode(raw);
  return parsed.ok ? formatCode(parsed.code) : null;
}

/** The first review link in a list of command line arguments, as its code. */
export function codeFromArgs(args: string[]): string | null {
  for (const a of args) {
    if (typeof a !== 'string' || !looksLikeLink(a)) continue;
    const c = codeFromLink(a);
    if (c) return c;
  }
  return null;
}

/** What somebody pasted into the join box: a review link or the four words, as text parseCode can read. A link that is not a good one comes back as it was, so the box says what is wrong. */
export function codeFromPaste(text: string): string {
  if (!looksLikeLink(text)) return text;
  return codeFromLink(text) ?? '';
}
