// The one round that may be going, and what the screen shows about it. This is the only place that holds a round.
//
// How long things live in memory, and where:
//   While a round runs: the word, a salted mark per guesser (no ids, no names), counts, how warm the closest guess was,
//     and the first winner's name if the streamer allowed names. The word is NEVER in `guessScreen`: the screen gets a
//     view with blanks and the letters you chose to give away. The word is only read by `peekWord` (when you allow it)
//     and by the reveal.
//   The moment it ends (solved, time up, you reveal it, Stop, or audience features go off): the salt and every mark are
//     thrown away. The word, counts and winner's name stay so the result can be shown.
//   When you close the result: all of it is gone, the word and the name too.
// Nothing here is written to the drawing, a file, the log, or anywhere that outlives the window. The only thing kept
// across runs is how long you last let a round run (see ./setup.ts).
import { audience, setAudienceOn } from '../audience';
import { currentChoice } from '../core/choices';
import { streamSafe } from '../core/streamSafe';
import { lines } from '../ui/mascot/lines';
import { createStore } from '../ui/mini';
import { quillSays } from '../quillreacts/react';
import { cleanSetup, createRound, type Reason, type Round, type RoundView } from './round';

export type GuessScreen = { phase: 'none' } | { phase: 'open' | 'result'; view: RoundView };

export const guessScreen = createStore<GuessScreen>({ phase: 'none' });
/** Until when the word is being peeked at (ms on the clock), or 0. A time, never the word. */
export const peekUntil = createStore<number>(0);
export const PEEK_MS = 3000;

let round: Round | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let publishTimer: ReturnType<typeof setTimeout> | null = null;
let peekTimer: ReturnType<typeof setTimeout> | null = null;
let saidHot = false;

export const currentRound = (): Round | null => round;
export const roundIsOpen = (): boolean => !!round?.isOpen();
export const roundIsShowing = (): boolean => round !== null;
export const namesAllowed = (): boolean => currentChoice('guess.winnerName') === 'show';

const pick = <T,>(xs: T[]): T => xs[Math.min(xs.length - 1, Math.floor(Math.random() * xs.length))];

function publish(): void {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  if (!round) return guessScreen.set({ phase: 'none' });
  guessScreen.set({ phase: round.isOpen() ? 'open' : 'result', view: round.view() });
}

/** Guesses can arrive many a second; the screen is told at most every 100 ms, so it stays smooth. */
export function schedulePublish(): void {
  if (!publishTimer) publishTimer = setTimeout(publish, 100);
}

/** Shows what has been counted this very moment (tests, and the end of a round). */
export const flushRound = publish;

function stopPeek(): void {
  if (peekTimer) clearTimeout(peekTimer);
  peekTimer = null;
  peekUntil.set(0);
}

/** Starts a round from what the streamer typed. One at a time. Says why not in plain words. */
export function startRound(raw: unknown): { ok: true } | { ok: false; reason: string } {
  if (round) return { ok: false, reason: round.isOpen() ? 'A round is already going. Reveal it first.' : 'Close the last result first.' };
  const cleaned = cleanSetup(raw);
  if (!cleaned.ok) return cleaned;
  const { setup } = cleaned;
  round = createRound(setup, { now: () => Date.now() });
  saidHot = false;
  stopPeek();
  if (setup.seconds !== null) endTimer = setTimeout(() => endRound('timeup'), setup.seconds * 1000);
  publish();
  return { ok: true };
}

/** Ends the round and shows the word. Quill joins in: a cheer for a winner, a shrug for nobody. */
export function endRound(reason: Reason = 'revealed'): void {
  if (!round?.isOpen()) return;
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  stopPeek();
  round.end(reason, Date.now());
  publish();
  const v = round.view();
  if (v.winner) {
    const name = v.winner.name;
    quillSays(name ? pick(lines('stream.guess.winNamed', { name })) : pick(lines('stream.guess.win')), 'cheer');
  } else {
    quillSays(pick(lines('stream.guess.nobody')), 'oops');
  }
}

/** Gives away one more letter on the panel. */
export function giveHint(): boolean {
  const ok = !!round?.isOpen() && round.hint();
  if (ok) publish();
  return ok;
}

export const hintsLeft = (): number => (round?.isOpen() ? round.view().hintsLeft : 0);

/** Why the word cannot be peeked at right now, in plain words, or null when it can. */
export function peekWhy(): string | null {
  if (!roundIsOpen()) return 'No round is going right now.';
  if (streamSafe()) return 'Stream-safe is on, so the word stays hidden.';
  if (currentChoice('guess.peek') !== 'allow') return 'You chose to keep the word hidden while a round runs (Preferences > Behaviour).';
  return null;
}

/** The word, for the peek button only, and only when you allow it and Stream-safe is off. Null otherwise. */
export function peekWord(): string | null {
  if (peekWhy() !== null) return null;
  return round?.secret() || null;
}

/** Starts a peek: the panel shows the word for a few seconds and then hides it again. False when it is not allowed. */
export function peek(): boolean {
  if (peekWhy() !== null) return false;
  if (peekTimer) clearTimeout(peekTimer);
  peekUntil.set(Date.now() + PEEK_MS);
  peekTimer = setTimeout(stopPeek, PEEK_MS);
  return true;
}

/** Called after a guess is counted: Quill reacts to the first near miss, and a right guess may end the round. */
export function afterGuess(result: 'right' | 'wrong'): void {
  if (!round?.isOpen()) return;
  const v = round.view();
  if (result === 'right' && v.ending === 'first') return endRound('solved');
  if (result === 'right') {
    // The round goes on: the first winner is shown on the panel and Quill is glad, once.
    if (v.solvers === 1) quillSays(pick(lines('stream.guess.win')), 'cheer');
  } else if (v.warmth === 'hot' && !saidHot) {
    saidHot = true;
    quillSays(pick(lines('stream.guess.close')), 'hop');
  }
  schedulePublish();
}

/** Puts the round or its result away. Everything about it is gone, the word and the name too. */
export function closeRound(): void {
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  stopPeek();
  round?.forget();
  round = null;
  publish();
}

/** Turns audience features on if they are off (asking how careful the first time), then runs `then`. A round nobody can reach is no use. */
export function withAudienceOn(then: () => void): void {
  if (audience.isOn()) return then();
  setAudienceOn(true);
  if (audience.isOn()) return then();
  const off = audience.subscribe(() => {
    if (!audience.isOn()) return;
    off();
    then();
  });
}

/** Stop, or audience features going off, drops a round that is going: nothing is left guessing and the word is forgotten without a reveal. Returns the way to stop watching. */
export function watchGate(): () => void {
  let lastOn = audience.isOn();
  let lastKills = audience.snapshot().counts.kills;
  return audience.subscribe(() => {
    const s = audience.snapshot();
    const stopped = (lastOn && !s.on) || s.counts.kills !== lastKills;
    lastOn = s.on;
    lastKills = s.counts.kills;
    if (stopped && round?.isOpen()) closeRound();
  });
}

export function _resetGuessForTests(): void {
  closeRound();
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  saidHot = false;
}
