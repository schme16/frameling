// One round of the guessing game, with no screen, no clock of its own and no Electron: a round is made with a word,
// people guess into it, it ends. Pure enough to test with nothing but a fake clock.
//
// What this file will and will not do, in one place:
//   - THE WORD stays inside this closure. `view()` never carries it while the round runs (only the letters the streamer
//     chose to give away with a hint), and it is in the view only once the round has ended, for the reveal.
//   - ONE PERSON, ONE PLACE: a person is told apart by a mark, a hash of this round's salt and the player id the
//     streamer's tool sends (see ../votes/hash.ts). The id is never kept. A person's guesses are counted (up to
//     MAX_GUESSES_EACH, so nobody can read the dictionary at it) and a person who got it is done.
//   - THE GUESS ITSELF is matched the moment it arrives and dropped. Not the text, not who sent it, not a log of wrong
//     ones: only how many there were and how warm the closest one was.
//   - A NAME is only ever read from the guess that got it right, only when the streamer allows names, and only the first
//     such name is kept (for the reveal).
//   - WHEN IT ENDS the salt and every mark are thrown away. What is left is the word, the counts and the winner's name
//     (if any), for the reveal card, until the streamer closes it. Closing forgets all of it.
import { cleanChatText } from '../audience/cleanText';
import { freshSalt, voterMark } from '../votes/hash';
import { letterCounts, matchGuess, warmer, warmthOf, type How, type Warmth } from './match';

export const WORD_MAX = 40;
export const GUESS_MAX = 60;
export const NAME_MAX = 24;
export const PLAYER_ID_MAX = 64;
/** The most different people one round remembers a mark for. Past it, new people are turned away. */
export const MAX_PLAYERS = 5000;
/** The most guesses one person may make in a round. Past it they are turned away, so nobody can read the dictionary at it. */
export const MAX_GUESSES_EACH = 25;

export type Ending = 'first' | 'timer';
/** How a round ended: `solved` (someone got it), `timeup` (the clock ran out), `revealed` (you gave up and showed it). */
export type Reason = 'solved' | 'timeup' | 'revealed';
/** How a guess is turned away. All are counted (never who). `solved` is a person who already got it. */
export type Turned = 'closed' | 'no-guess' | 'no-player' | 'too-many' | 'full' | 'solved';

export interface RoundSetup {
  word: string;
  /** How long it runs, in seconds, or null to run until the streamer ends it. */
  seconds: number | null;
  ending: Ending;
}

const ODD = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');
const HAS_ODD = new RegExp(ODD.source);
const tidy = (s: unknown, max: number): string => (typeof s === 'string' ? Array.from(s.replace(ODD, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim() : '');

/** The streamer's own words, tidied: one line, cut to length. Says why not in plain words when it cannot be a word. */
export function cleanSetup(raw: unknown): { ok: true; setup: RoundSetup } | { ok: false; reason: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const word = tidy(r.word, WORD_MAX);
  if (!word) return { ok: false, reason: 'Give the round a word to draw.' };
  if (letterCounts(word).length === 0) return { ok: false, reason: 'The word needs some letters in it.' };
  const s = r.seconds;
  const seconds = typeof s === 'number' && Number.isFinite(s) && s >= 10 ? Math.min(3600, Math.round(s)) : null;
  return { ok: true, setup: { word, seconds, ending: r.ending === 'timer' ? 'timer' : 'first' } };
}

/** A player id as it may be used: a short string or a whole number, with nothing odd in it. Null for none. */
export function cleanPlayer(raw: unknown): string | null {
  const v = typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : raw;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= PLAYER_ID_MAX && !HAS_ODD.test(t) ? t : null;
}

/** What the screen may know about a round. While it runs there is no word in here, only hinted letters. */
export interface RoundView {
  status: 'open' | 'ended';
  /** Letters in each word of the answer, so the panel can draw the blanks. */
  letters: number[];
  /** What the blanks show: a letter where a hint gave it away, otherwise null. One list per word. */
  shown: (string | null)[][];
  hintsLeft: number;
  /** People who have guessed. */
  players: number;
  guesses: number;
  /** How many got it. */
  solvers: number;
  /** The closest wrong guess so far, by spelling. Never the guess. */
  warmth: Warmth;
  startedAt: number;
  endsAt: number | null;
  endedAt: number | null;
  ending: Ending;
  /** How it ended, or null while it runs. */
  reason: Reason | null;
  /** Who got it first: how long it took, and their name when the streamer allowed names and the tool sent one. */
  winner: { name: string | null; afterMs: number } | null;
  /** The word. Only once the round has ended. */
  answer: string | null;
  turnedAway: Record<Turned, number>;
}

/** What `prepare` hands back: the verdict on the guess and the person's mark. The guess text is not in it. */
export interface Prepared {
  mark: string;
  right: boolean;
  alike: number;
  how: How | null;
  name: string | null;
}

export interface Round {
  readonly view: () => RoundView;
  readonly isOpen: () => boolean;
  /** Checks a guess without counting it. The raw id is turned into a mark here and goes no further. Prepared, or why it is turned away (counted). */
  prepare(guess: unknown, player: unknown, name: unknown, opts: { names: boolean }): Prepared | Turned;
  /** Counts a prepared guess. */
  cast(p: Prepared): 'right' | 'wrong' | Turned;
  /** Gives away one more letter, chosen at random. False when none are left. */
  hint(rand?: () => number): boolean;
  /** Ends the round: the salt and every mark are thrown away. Safe to call twice. */
  end(reason: Reason, now: number): void;
  /** The word. Only for the streamer's peek (when allowed) and nothing else: the screen's view never carries it. */
  secret(): string;
  /** Forgets the word and the name too. For when the result is closed. */
  forget(): void;
  /** For tests only: what is held in memory right now. */
  _held(): { salt: Uint8Array | null; marks: string[]; word: string; name: string | null };
}

export interface RoundDeps {
  now(): number;
  salt?: () => Uint8Array;
}

export function createRound(setup: RoundSetup, deps: RoundDeps): Round {
  const startedAt = deps.now();
  let word = setup.word;
  const letters = letterCounts(word);
  const total = letters.reduce((a, b) => a + b, 0);
  const maxHints = Math.max(1, Math.floor(total / 3));
  // Which letters are given away, as "word index:letter index" -> the letter.
  const given = new Map<string, string>();
  const turned: Record<Turned, number> = { closed: 0, 'no-guess': 0, 'no-player': 0, 'too-many': 0, full: 0, solved: 0 };
  // mark -> how many guesses and whether they got it. Cleared when the round ends.
  let marks: Map<string, { n: number; solved: boolean }> | null = new Map();
  let salt: Uint8Array | null = (deps.salt ?? freshSalt)();
  let endedAt: number | null = null;
  let reason: Reason | null = null;
  let players = 0;
  let guesses = 0;
  let solvers = 0;
  let warmth: Warmth = 'none';
  let winner: { name: string | null; afterMs: number } | null = null;

  const refuse = (why: Turned): Turned => {
    turned[why]++;
    return why;
  };
  /** The letters of each word, so a hint can pick one. */
  const grid = (): string[][] => word.split(/\s+/).map((w) => Array.from(w).filter((c) => /[\p{L}\p{N}]/u.test(c))).filter((w) => w.length > 0);

  const round: Round = {
    view: () => ({
      status: endedAt === null ? 'open' : 'ended',
      letters: [...letters],
      shown: letters.map((n, wi) => Array.from({ length: n }, (_, li) => given.get(`${wi}:${li}`) ?? null)),
      hintsLeft: Math.max(0, maxHints - given.size),
      players,
      guesses,
      solvers,
      warmth,
      startedAt,
      endsAt: setup.seconds === null ? null : startedAt + setup.seconds * 1000,
      endedAt,
      ending: setup.ending,
      reason,
      winner: winner ? { ...winner } : null,
      answer: endedAt === null ? null : word || null,
      turnedAway: { ...turned },
    }),
    isOpen: () => endedAt === null,

    prepare(guessRaw, playerRaw, nameRaw, opts) {
      if (endedAt !== null || !salt || !marks) return refuse('closed');
      const text = cleanChatText(guessRaw, GUESS_MAX);
      if (!text) return refuse('no-guess');
      const id = cleanPlayer(playerRaw);
      if (id === null) return refuse('no-player');
      const mark = voterMark(salt, id);
      const before = marks.get(mark);
      if (before?.solved) return refuse('solved');
      if (before && before.n >= MAX_GUESSES_EACH) return refuse('too-many');
      if (!before && marks.size >= MAX_PLAYERS) return refuse('full');
      const m = matchGuess(text.text, word);
      // A name is read only from a right guess, and only when names are allowed.
      const name = m.right && opts.names ? (cleanChatText(nameRaw, NAME_MAX)?.text ?? null) : null;
      return { mark, right: m.right, alike: m.alike, how: m.how ?? null, name };
    },

    cast(p) {
      if (endedAt !== null || !marks) return refuse('closed');
      const before = marks.get(p.mark);
      if (before?.solved) return refuse('solved');
      if (before && before.n >= MAX_GUESSES_EACH) return refuse('too-many');
      if (!before && marks.size >= MAX_PLAYERS) return refuse('full');
      const entry = before ?? { n: 0, solved: false };
      if (!before) {
        marks.set(p.mark, entry);
        players++;
      }
      entry.n++;
      guesses++;
      if (p.right) {
        entry.solved = true;
        solvers++;
        if (!winner) winner = { name: p.name, afterMs: Math.max(0, deps.now() - startedAt) };
        return 'right';
      }
      warmth = warmer(warmth, warmthOf(p.alike));
      return 'wrong';
    },

    hint(rand = Math.random) {
      if (endedAt !== null || given.size >= maxHints) return false;
      const g = grid();
      const free: [number, number][] = [];
      g.forEach((w, wi) => w.forEach((_, li) => !given.has(`${wi}:${li}`) && free.push([wi, li])));
      if (!free.length) return false;
      const [wi, li] = free[Math.min(free.length - 1, Math.floor(rand() * free.length))];
      given.set(`${wi}:${li}`, g[wi][li]);
      return true;
    },

    end(why, now) {
      if (endedAt !== null) return;
      endedAt = now;
      reason = why;
      marks?.clear();
      marks = null;
      salt?.fill(0);
      salt = null;
    },

    secret: () => word,

    forget() {
      round.end('revealed', deps.now());
      word = '';
      winner = null;
      given.clear();
    },

    _held: () => ({ salt: salt ? new Uint8Array(salt) : null, marks: marks ? [...marks.keys()] : [], word, name: winner?.name ?? null }),
  };
  return round;
}

/** Whole seconds, the way a person says how long it took: "23 seconds", "1 minute 5 seconds". */
export function took(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const sec = (n: number) => (n === 1 ? '1 second' : `${n} seconds`);
  if (!m) return sec(s);
  return r ? `${m === 1 ? '1 minute' : `${m} minutes`} ${sec(r)}` : m === 1 ? '1 minute' : `${m} minutes`;
}
