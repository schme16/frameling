// The counting, with no screen, no clock of its own and no Electron: a vote is made, people cast into it, it ends.
// Pure enough to test with nothing but a fake clock.
//
// What this file will and will not do, in one place:
//   - It COUNTS. It never decides anything, and nothing in src/votes touches the drawing (a test reads every file here
//     and fails if one imports the store or the document).
//   - ONE VOTE EACH comes from a voter id the streamer's tool sends. The id is turned into a mark with a salt made fresh
//     for this vote (see ./hash.ts) the moment it arrives, and only the mark is kept. The id is never stored.
//   - When the vote ends, the salt and every mark are thrown away. What is left is the question, the options and the
//     counts, which the screen shows until the streamer closes it.
import { freshSalt, voterMark } from './hash';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const QUESTION_MAX = 80;
export const OPTION_MAX = 40;
/** The most different voters one vote remembers a mark for. Past it, new voters are turned away. Keeps memory small. */
export const MAX_VOTERS = 5000;
/** The longest a voter id may be, in characters. Real ones are a few digits. */
export const VOTER_ID_MAX = 64;

/** How a request to cast is turned away. All are counted (never who). */
export type Turned = 'closed' | 'no-option' | 'no-voter' | 'again' | 'full';

/** How a person who votes twice is treated. `first`: the first vote stands. `latest`: they may change their mind. */
export type AgainWay = 'first' | 'latest';
/** What to do with a vote that has no voter id. `refuse`: turn it away. `count`: count it, with no way to stop doubles. */
export type NoIdWay = 'refuse' | 'count';
export interface Ways {
  again: AgainWay;
  noId: NoIdWay;
}

export interface VoteSetup {
  question: string;
  options: string[];
  /** How long it runs, in seconds, or null to run until the streamer ends it. */
  seconds: number | null;
}

const ODD = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');
const HAS_ODD = new RegExp(ODD.source);
const tidy = (s: unknown, max: number): string => (typeof s === 'string' ? Array.from(s.replace(ODD, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim() : '');

/** The streamer's own words, tidied: one line, cut to length, empty options dropped, repeats dropped. Null with a plain reason when it cannot be a vote. */
export function cleanSetup(raw: unknown): { ok: true; setup: VoteSetup } | { ok: false; reason: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const question = tidy(r.question, QUESTION_MAX);
  if (!question) return { ok: false, reason: 'Give the vote a question.' };
  const options: string[] = [];
  const seen = new Set<string>();
  for (const o of Array.isArray(r.options) ? r.options : []) {
    const t = tidy(o, OPTION_MAX);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    options.push(t);
  }
  if (options.length < MIN_OPTIONS) return { ok: false, reason: `A vote needs at least ${MIN_OPTIONS} different options.` };
  if (options.length > MAX_OPTIONS) return { ok: false, reason: `A vote can have at most ${MAX_OPTIONS} options.` };
  const s = r.seconds;
  const seconds = typeof s === 'number' && Number.isFinite(s) && s >= 5 ? Math.min(3600, Math.round(s)) : null;
  return { ok: true, setup: { question, options, seconds } };
}

export type Outcome = { kind: 'none' } | { kind: 'winner'; index: number } | { kind: 'tie'; indices: number[] };

/** Who is ahead. Pure. No votes at all is `none`; the top count shared is a `tie`. Never picks a winner out of a tie. */
export function outcomeOf(counts: readonly number[]): Outcome {
  const top = Math.max(0, ...counts);
  if (top === 0) return { kind: 'none' };
  const at = counts.flatMap((c, i) => (c === top ? [i] : []));
  return at.length === 1 ? { kind: 'winner', index: at[0] } : { kind: 'tie', indices: at };
}

/** Whole-number percentages of the total that add up to 100 (the biggest remainders get the spare points). Zeros for no votes. */
export function percents(counts: readonly number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const out = exact.map(Math.floor);
  let spare = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (spare <= 0) break;
    out[i]++;
    spare--;
  }
  return out;
}

/** What the screen may know about a vote. Counts and words only: no marks, no salt, no ids. */
export interface VoteView {
  status: 'open' | 'ended';
  question: string;
  options: string[];
  counts: number[];
  total: number;
  startedAt: number;
  /** When it will end by itself, or null when it runs until the streamer ends it. */
  endsAt: number | null;
  endedAt: number | null;
  /** How many requests were turned away, by reason. Counts only. */
  turnedAway: Record<Turned, number>;
  outcome: Outcome;
}

/** What `prepare` hands back: the option (0-based) and the voter's mark for this vote, or null for a voter with no id. */
export interface Prepared {
  option: number;
  mark: string | null;
}

export interface Vote {
  readonly view: () => VoteView;
  readonly isOpen: () => boolean;
  /**
   * Checks a request without counting it. The raw voter id is turned into a mark here and goes no further. Returns the
   * prepared vote to hand to `cast`, or why it is turned away (and counts that).
   */
  prepare(option: unknown, voter: unknown, ways: Ways): Prepared | Turned;
  /** Counts a prepared vote. Returns `counted`, `changed` (a voter changed their mind) or why not. */
  cast(p: Prepared, ways: Ways): 'counted' | 'changed' | Turned;
  /** Ends the vote: the salt and every mark are thrown away. Safe to call twice. */
  end(now: number): void;
  /** For tests only: what is held in memory right now. */
  _held(): { salt: Uint8Array | null; marks: string[] };
}

export interface VoteDeps {
  now(): number;
  salt?: () => Uint8Array;
}

/** The index (0-based) an option request means, or -1. A number or digits are the option's place (1 is the first); words match an option's label. */
export function optionIndex(raw: unknown, options: readonly string[]): number {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw >= 1 && raw <= options.length ? raw - 1 : -1;
  if (typeof raw !== 'string') return -1;
  const t = tidy(raw, OPTION_MAX).toLowerCase();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= options.length ? n - 1 : -1;
  }
  return t ? options.findIndex((o) => o.toLowerCase() === t) : -1;
}

/** A voter id as it may be used: a short string or a whole number, with nothing odd in it. Null for none. */
export function cleanVoter(raw: unknown): string | null {
  const v = typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : raw;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= VOTER_ID_MAX && !HAS_ODD.test(t) ? t : null;
}

export function createVote(setup: VoteSetup, deps: VoteDeps): Vote {
  const startedAt = deps.now();
  const counts = setup.options.map(() => 0);
  const turned: Record<Turned, number> = { closed: 0, 'no-option': 0, 'no-voter': 0, again: 0, full: 0 };
  // mark -> the option that voter chose. Cleared when the vote ends.
  let marks: Map<string, number> | null = new Map();
  let salt: Uint8Array | null = (deps.salt ?? freshSalt)();
  let endedAt: number | null = null;

  const total = () => counts.reduce((a, b) => a + b, 0);
  const refuse = (why: Turned): Turned => {
    turned[why]++;
    return why;
  };

  const vote: Vote = {
    view: () => ({
      status: endedAt === null ? 'open' : 'ended',
      question: setup.question,
      options: [...setup.options],
      counts: [...counts],
      total: total(),
      startedAt,
      endsAt: setup.seconds === null ? null : startedAt + setup.seconds * 1000,
      endedAt,
      turnedAway: { ...turned },
      outcome: outcomeOf(counts),
    }),
    isOpen: () => endedAt === null,

    prepare(optionRaw, voterRaw, ways) {
      if (endedAt !== null || !salt || !marks) return refuse('closed');
      const option = optionIndex(optionRaw, setup.options);
      if (option < 0) return refuse('no-option');
      const id = cleanVoter(voterRaw);
      if (id === null) return ways.noId === 'count' ? { option, mark: null } : refuse('no-voter');
      const mark = voterMark(salt, id);
      const before = marks.get(mark);
      if (before !== undefined && (ways.again === 'first' || before === option)) return refuse('again');
      if (before === undefined && marks.size >= MAX_VOTERS) return refuse('full');
      return { option, mark };
    },

    cast(p, ways) {
      if (endedAt !== null || !marks) return refuse('closed');
      if (p.mark === null) {
        // No id, so no way to tell doubles apart: counted, and that is all that is known.
        if (ways.noId !== 'count') return refuse('no-voter');
        counts[p.option]++;
        return 'counted';
      }
      const before = marks.get(p.mark);
      if (before !== undefined) {
        if (ways.again === 'first' || before === p.option) return refuse('again');
        counts[before]--;
        counts[p.option]++;
        marks.set(p.mark, p.option);
        return 'changed';
      }
      if (marks.size >= MAX_VOTERS) return refuse('full');
      marks.set(p.mark, p.option);
      counts[p.option]++;
      return 'counted';
    },

    end(now) {
      if (endedAt !== null) return;
      endedAt = now;
      marks?.clear();
      marks = null;
      salt?.fill(0);
      salt = null;
    },

    _held: () => ({ salt: salt ? new Uint8Array(salt) : null, marks: marks ? [...marks.keys()] : [] }),
  };
  return vote;
}
