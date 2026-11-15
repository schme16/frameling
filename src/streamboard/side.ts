// The private side of the board: what is laid out here before it is agreed to. The vote being written and counted, the
// guessing game's word and guesses, and the whole waiting list of the prompt jar. Pure functions from plain facts, so the
// rules (what is covered, what is never sent) are tested without a window (test/streamboard/side.test.ts).
//
// Two rules hold all the way through. The board shows counts and never who. And words that came from viewers are only
// in a message while the board is private, or after the streamer pressed to read them: covered words are left out here, at
// the source, so they never reach the board's page at all.
import { percents, type Outcome, type VoteView } from '../votes/tally';
import type { RoundView } from '../guess/round';

/** One option of a vote, as the board lists it. */
export interface VoteOption {
  text: string;
  count: number;
  /** Whole percent of the votes in, all adding up to 100. */
  percent: number;
}

export interface VoteSetupFacts {
  lengths: { seconds: number; label: string }[];
  seconds: number;
}

export interface VoteSide {
  phase: 'none' | 'open' | 'result';
  question: string;
  options: VoteOption[];
  total: number;
  /** When it ends by itself (ms on the clock), or null. */
  endsAt: number | null;
  /** The result in words, once it ends. Empty before. */
  outcome: string;
  setup: VoteSetupFacts;
}

export type VoteScreenFacts = { phase: 'none' } | { phase: 'open' | 'result'; view: VoteView };

/** Who won, in words. A tie names every option in it and never picks one. */
export function outcomeWords(o: Outcome, options: readonly string[]): string {
  if (o.kind === 'winner') return `${options[o.index] ?? 'One option'} won`;
  if (o.kind === 'tie') return `A tie: ${o.indices.map((i) => options[i] ?? '?').join(', ')}`;
  return 'Nobody voted';
}

export function voteSide(screen: VoteScreenFacts, setup: VoteSetupFacts): VoteSide {
  if (screen.phase === 'none') return { phase: 'none', question: '', options: [], total: 0, endsAt: null, outcome: '', setup };
  const v = screen.view;
  const pct = percents(v.counts);
  return {
    phase: screen.phase,
    question: v.question,
    options: v.options.map((text, i) => ({ text, count: v.counts[i] ?? 0, percent: pct[i] ?? 0 })),
    total: v.total,
    endsAt: screen.phase === 'open' ? v.endsAt : null,
    outcome: screen.phase === 'result' ? outcomeWords(v.outcome, v.options) : '',
    setup,
  };
}

/** One guess in the list. `text` is null while covered, and for a right guess that would give the word away. */
export interface GuessRow {
  text: string | null;
  right: boolean;
}

export interface GuessSide {
  phase: 'none' | 'open' | 'result';
  players: number;
  guesses: number;
  solvers: number;
  warmth: string;
  hintsLeft: number;
  endsAt: number | null;
  /** The blanks, one list per word, a letter where a hint gave it away. */
  shown: (string | null)[][];
  /** The secret word while a round runs, only on a private board. Null otherwise. */
  word: string | null;
  /** The word after the reveal. */
  answer: string | null;
  /** Newest first. */
  rows: GuessRow[];
  /** True when the guesses are being held back (the board is not private and they are unread). */
  rowsCovered: boolean;
  setup: { lengths: { seconds: number; label: string }[]; seconds: number };
  /** The word can be typed on the board: it is private, so typing it here is safe. */
  canWrite: boolean;
}

export interface GuessFacts {
  screen: { phase: 'none' } | { phase: 'open' | 'result'; view: RoundView };
  secret: string | null;
  recent: readonly { text: string; right: boolean }[];
  covers: boolean;
  read: boolean;
  scrub?: (t: string) => string;
  setup: { lengths: { seconds: number; label: string }[]; seconds: number };
}

/**
 * The guesses as the board may list them, newest first. While covered, no word is in them. When read (or private), a wrong
 * guess shows its words; a right guess shows only that it was right unless the word itself is showing here anyway.
 */
export function guessRows(recent: readonly { text: string; right: boolean }[], covers: boolean, read: boolean, secretShowing: boolean, scrub: (t: string) => string = (t) => t): GuessRow[] {
  const open = !covers || read;
  return [...recent].reverse().map((g) => ({ right: g.right, text: !open ? null : g.right && !secretShowing ? null : scrub(g.text) }));
}

export function guessSide(f: GuessFacts): GuessSide {
  const none = f.screen.phase === 'none';
  const v = none ? null : (f.screen as { view: RoundView }).view;
  const open = f.screen.phase === 'open';
  // The word is only ever sent while a round runs on a private board. It is left out here, not hidden later.
  const word = open && !f.covers ? f.secret : null;
  return {
    phase: f.screen.phase,
    players: v?.players ?? 0,
    guesses: v?.guesses ?? 0,
    solvers: v?.solvers ?? 0,
    warmth: v?.warmth ?? 'none',
    hintsLeft: open ? (v?.hintsLeft ?? 0) : 0,
    endsAt: open ? (v?.endsAt ?? null) : null,
    shown: v?.shown ?? [],
    word,
    answer: f.screen.phase === 'result' ? (v?.answer ?? null) : null,
    rows: open ? guessRows(f.recent, f.covers, f.read, word !== null, f.scrub) : [],
    rowsCovered: open && f.covers && !f.read && f.recent.length > 0,
    setup: f.setup,
    canWrite: !f.covers,
  };
}

/** One waiting prompt. `text` is null while covered. */
export interface SlipRow {
  id: number;
  covered: boolean;
  text: string | null;
}

export interface JarSide {
  count: number;
  max: number;
  slips: SlipRow[];
  /** At least one is covered, so "Read them all" has something to do. */
  anyCovered: boolean;
  /** At least one that was covered has been read, so "Cover them again" has something to do. */
  anyRead: boolean;
}

/** The whole waiting list. Covered slips carry no words; a slip is read one at a time, or all at once. */
export function jarSide(slips: readonly { id: number; text: string }[], max: number, covers: boolean, read: ReadonlySet<number>, scrub: (t: string) => string = (t) => t): JarSide {
  const rows: SlipRow[] = slips.map((s) => {
    const covered = covers && !read.has(s.id);
    return { id: s.id, covered, text: covered ? null : scrub(s.text) };
  });
  return { count: rows.length, max, slips: rows, anyCovered: rows.some((r) => r.covered), anyRead: covers && slips.some((s) => read.has(s.id)) };
}

/** Which slips stay read after the list changes: only those still in the jar. */
export const keepRead = (read: ReadonlySet<number>, slips: readonly { id: number }[]): Set<number> => {
  const ids = new Set(slips.map((s) => s.id));
  return new Set([...read].filter((id) => ids.has(id)));
};
