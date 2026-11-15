// The prompt jar itself: what is in it, and the one slip in the streamer's hand. It lives in memory. The words are
// kept to disk only when the streamer chose "Keep the jar" (Preferences > Streaming), and then it is the words and
// nothing else. Nothing here ever puts words on screen by itself: the card in JarCard.tsx shows them when it is asked to.
import { currentChoice } from '../core/choices';
import { createStore, readRaw, writeJson } from '../ui/mini';
import { canAdd, fromStored, pickSlip, toStored, type AddResult, type Slip } from './logic';

export const JAR_KEY = 'frameling.promptjar.v1';

export interface JarState {
  /** Waiting in the jar. */
  slips: Slip[];
  /** The one pulled out and in the streamer's hand, or null. */
  hand: Slip | null;
  /** True once the jar turned something away for being full, until there is room again (so it is said once, not each time). */
  saidFull: boolean;
}

let nextId = 1;
const slip = (text: string): Slip => ({ id: nextId++, text });

export const jar = createStore<JarState>({ slips: [], hand: null, saidFull: false });

/** Whether the jar should be kept between sessions. Off unless the streamer said so. */
const keeping = (): boolean => currentChoice('promptjar.keep') === 'keep';

function remember(): void {
  if (keeping()) writeJson(JAR_KEY, toStored(jar.get().slips));
}

/** Wipes the saved copy, whatever the choice is now. */
export function forgetSaved(): void {
  try {
    localStorage.removeItem(JAR_KEY);
  } catch {
    // Storage is not there: nothing to wipe.
  }
}

/** Puts a cleaned prompt in. Says what happened. A full jar throws away nothing already inside. */
export function addToJar(text: string): AddResult {
  const s = jar.get();
  const r = canAdd(s.hand ? [...s.slips, s.hand] : s.slips, text, s.slips.length);
  if (r === 'added') jar.set({ ...s, slips: [...s.slips, slip(text)], saidFull: false });
  else if (r === 'full' && !s.saidFull) jar.set({ ...s, saidFull: true });
  if (r === 'added') remember();
  return r;
}

/** How many are in the jar (the one in your hand is out of it). */
export const jarCount = (): number => jar.get().slips.length;

/** Takes one out at random into the streamer's hand. A slip already in hand is done with and goes. Null when the jar is empty. */
export function pullOne(rand: () => number = Math.random): Slip | null {
  const s = jar.get();
  const picked = pickSlip(s.slips, rand());
  if (!picked) return null;
  jar.set({ slips: s.slips.filter((x) => x !== picked), hand: picked, saidFull: false });
  remember();
  return picked;
}

/** Puts the slip in hand back in the jar. */
export function putBack(): void {
  const s = jar.get();
  if (!s.hand) return;
  jar.set({ ...s, slips: [...s.slips, s.hand], hand: null });
  remember();
}

/** Throws the slip in hand away: "not this one". */
export function passOn(): void {
  const s = jar.get();
  if (!s.hand) return;
  jar.set({ ...s, hand: null });
  remember();
}

/** Empties the jar and the hand in one go, and the saved copy too. Returns how many words went. */
export function emptyJar(): number {
  const s = jar.get();
  const n = s.slips.length + (s.hand ? 1 : 0);
  jar.set({ slips: [], hand: null, saidFull: false });
  forgetSaved();
  return n;
}

/** Brings back a kept jar at start, when the streamer chose to keep it. Everything is cleaned again on the way in. */
export function loadKept(): void {
  if (!keeping()) return forgetSaved();
  const words = fromStored(readRaw<unknown>(JAR_KEY, []));
  jar.set({ slips: words.map(slip), hand: null, saidFull: false });
}

/** Called when the keep choice changes: saves what is here now, or wipes the saved copy. */
export function keepChanged(): void {
  if (keeping()) remember();
  else forgetSaved();
}

/** Lets go of everything in memory, without touching a kept copy. For when the feature is switched off. */
export function dropFromMemory(): void {
  jar.set({ slips: [], hand: null, saidFull: false });
}
