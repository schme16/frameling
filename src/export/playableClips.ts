// Which clips an Interactives package writes out frame by frame, and which are too long for that. Pure and small, so
// the export card can use it without loading the packer.
import { clipDirection, clipPlays, hasPlaySettings, playedCount, playWords } from '../core/clipPlay';
import type { Doc } from '../core/format';

/** A clip that would come to more frames than this when played out stays as it is (forward), so the file stays small. */
export const MAX_BAKED = 5000;

/** Each clip cut to the range, named the way the package names it, with how many frames it would come to when played out. */
export function clipRows(doc: Pick<Doc, 'clips'>, range: { start: number; end: number }): { name: string; c: Doc['clips'][number]; a: number; b: number; played?: number }[] {
  const out: { name: string; c: Doc['clips'][number]; a: number; b: number; played?: number }[] = [];
  const names = new Set<string>();
  for (const c of doc.clips) {
    const a = Math.max(range.start, Math.min(c.start, c.end));
    const b = Math.min(range.end, Math.max(c.start, c.end));
    if (a > b) continue;
    let name = c.name.trim() || 'clip';
    while (names.has(name)) name += '_';
    names.add(name);
    out.push({ name, c, a, b, ...(hasPlaySettings(c) ? { played: playedCount(b - a + 1, clipDirection(c), clipPlays(c)) } : {}) });
  }
  return out;
}

/**
 * The clips that play backward, back and forth or more than once and would come to more than MAX_BAKED frames played
 * out, so the package leaves them forward. For the Export dialog to say so before anyone exports.
 */
export function clipsTooLong(doc: Pick<Doc, 'clips'>, range: { start: number; end: number }): { name: string; frames: number; how: string }[] {
  return clipRows(doc, range)
    .filter((r) => r.played !== undefined && r.played > MAX_BAKED)
    .map((r) => ({ name: r.name, frames: r.played!, how: playWords(r.c) }));
}

