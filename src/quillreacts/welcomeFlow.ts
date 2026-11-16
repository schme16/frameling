// Quill welcoming somebody on air: the part that shows it. Arrivals come in through the audience gate (see actions.ts),
// are gathered into turns (welcome.ts) and played one at a time, so a crowd is a number and never a pile of him. A name
// is somebody else's words: it is always cleaned. By default Quill just says it. With the answer Ask me first it is asked
// about covered (the same question as a sign), and only a yes puts it on the screen or the stream overlay; without a yes
// the same turn is welcomed with no name. Nothing is written anywhere.
import { currentChoice } from '../core/choices';
import { lasts } from '../audience/gate';
import { NAMES_CHOICE } from './choices';
import { askToSayName, endReaction, showWelcome } from './react';
import { addArrival, askWords, DECLINED_CAP, addName, newRecent, lookFor, newNames, newPile, parseArrival, pileSize, takeTurn, welcomeWords, type Arrival, type Turn, type WelcomeKind } from './welcome';

/** How names are handled: `say` (the default) just says them, `ask` asks first, `never` uses none and reads none. */
export type NamesMode = 'say' | 'ask' | 'never';
export const namesMode = (): NamesMode => {
  const v = currentChoice(NAMES_CHOICE);
  return v === 'ask' || v === 'never' ? v : 'say';
};

/** Whether Quill may say names at all right now. The answer `never` also stops Frameling reading names from Twitch. */
export const namesAllowed = (): boolean => namesMode() !== 'never';

/** Always empty: what the short "left out" check sees when nobody is being asked, so it does no work. */
const noNames = newNames(0);

let pile = newPile();
const recent = newRecent();
const declined = newNames(DECLINED_CAP);
let waiting = new Map<WelcomeKind, (() => void)[]>();
let busy = false;
let stop = new AbortController();
/** The most arrivals whose promises are held open for Stop to reach. Past it they are counted into a turn and let go. */
const HELD_MAX = 200;
/** A short breath between turns, so two welcomes never run into one another. */
export const GAP_MS = 500;

/** For the tests and Stop: forget everyone waiting, and what was remembered. */
export function resetWelcomes(): void {
  stopWelcomes();
  recent.follow.list = [];
  recent.sub.list = [];
  declined.list = [];
}

/** Stop: nobody waiting is welcomed, and what is on screen ends. Remembered names stay for the session. */
export function stopWelcomes(): void {
  pile = newPile();
  stop.abort();
  stop = new AbortController();
  for (const fns of waiting.values()) for (const f of fns) f();
  waiting = new Map();
  endReaction();
}

/**
 * One arrival, already cleaned by `parseArrival`, from the gate. Resolves when its turn has been played (or dropped), so
 * Stop reaches it through the gate's own signal. Never throws.
 */
export function arrive(a: Arrival, signal: AbortSignal): Promise<void> {
  const kind = a.kind;
  // The names left out only mean something while names are asked about, so under any other answer the list is dropped.
  const asking = namesMode() === 'ask';
  if (!asking && declined.list.length > 0) declined.list = [];
  if (!addArrival(pile, a, recent, asking ? declined : noNames)) return Promise.resolve();
  // Remembered as soon as it is taken, so the same person coming round again is skipped even while the first still waits.
  // In memory only, up to RECENT_CAP names, gone when Frameling closes.
  if (a.name && (kind === 'follow' || kind === 'sub')) addName(recent[kind], a.name);
  if (signal.aborted) {
    stopWelcomes();
    return Promise.resolve();
  }
  signal.addEventListener('abort', stopWelcomes, { once: true });
  const held = waiting.get(kind) ?? [];
  const done = new Promise<void>((resolve) => {
    if (held.length >= HELD_MAX) resolve();
    else held.push(resolve);
  });
  waiting.set(kind, held);
  void pump();
  return done;
}

async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  const mine = stop;
  try {
    for (let t = takeTurn(pile); t; t = takeTurn(pile)) {
      if (mine.signal.aborted) break;
      const fns = waiting.get(t.kind) ?? [];
      // A raid turn lets its own waiter go; the others let the whole group go, because the turn took them all.
      waiting.set(t.kind, t.kind === 'raid' ? fns.slice(1) : []);
      await play(t, mine.signal);
      for (const f of t.kind === 'raid' ? fns.slice(0, 1) : fns) f();
      if (mine.signal.aborted) break;
      await lasts(GAP_MS, mine.signal);
    }
  } finally {
    busy = false;
  }
  // Something may have arrived after Stop and before the loop ended.
  if (!stop.signal.aborted && pileSize(pile) > 0) void pump();
}

/** One turn: say the name if there is one (asking first only under Ask me first), then show the welcome. */
async function play(t: Turn, signal: AbortSignal): Promise<void> {
  let named = !!t.name && namesMode() === 'say';
  if (t.name && namesMode() === 'ask') {
    const answer = await askToSayName(askWords(t), signal);
    if (signal.aborted) return;
    named = answer === 'yes';
    // Not that one: that person is welcomed without a name for the rest of this session.
    if (answer === 'no') addName(declined, t.name);
  }
  const look = lookFor(t.kind);
  showWelcome(welcomeWords(t, named), look.anim, look.moment, look.ms);
  await lasts(look.ms, signal);
}

/** For the Try commands and the shots: a welcome that goes through the same flow, with no gate. */
export const tryWelcome = (kind: WelcomeKind, raw: unknown, signal: AbortSignal = new AbortController().signal): Promise<void> => arrive(parseArrival(kind, raw, namesAllowed()), signal);
