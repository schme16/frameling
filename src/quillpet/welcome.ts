// Coming back to his house. Runs once as the pet starts, before he notes you've arrived, so it can see that the day
// is new. It works out whether there's news, and from then on only ever says "he's got things to show you", as
// booleans and a place. The length of the break is read here once, handed to `comeBack` to choose how many nice
// things he did, and let go: it is never stored, never returned and never worded.
import { createStore } from '../ui/mini';
import { currentChoice } from '../core/choices';
import { dayKey } from './model';
import type { Spot } from './potter';
import { comeBack } from './whileAway';
import { daysAway, keepLately, petStore } from './store';

/** The choice about whether he gets up to things when you're out at all. */
export const LATELY_CHOICE = 'quill.lately';

let returned = false;
let greetUntil = 0;
let hello = false;

/** How long he waves hello for when the room opens on a return. */
export const GREET_MS = 6000;

/** For the tests and the shot scripts: back to a first meeting. */
export function forgetReturn(): void {
  returned = false;
  greetUntil = 0;
  hello = false;
  napStore.set({ spot: null });
}

/** Where he's been found asleep, when it's somewhere new. Only for this run: it wakes when you give him a scratch. */
export const napStore = createStore<{ spot: Spot | null }>({ spot: null });

/** Lets him get on with it: marks that you're back, and makes the news if there is some. */
export function settleIn(at: number = Date.now(), rng: () => number = Math.random): void {
  const gap = daysAway(at);
  if (gap < 1) return;
  returned = true;
  // The pet can switch this off. Then you still get the hello, and no news.
  if (currentChoice<'yes' | 'no'>(LATELY_CHOICE) === 'no') return;
  const pet = petStore.get();
  const next = comeBack(pet, gap, dayKey(at), rng);
  if (next === pet || !next.lately) return;
  keepLately(next.lately);
  const slept = next.lately.did.find((h) => h.kind === 'slept');
  if (slept && slept.kind === 'slept') napStore.set({ spot: slept.spot });
}

/** True when the room should say hello: you came back, or (for the shot scripts) the day he last saw you is an earlier one. */
export function cameBack(): boolean {
  return returned || daysAway() >= 1;
}

/** Says hello once per run. */
export function claimHello(): boolean {
  if (hello || !cameBack()) return false;
  hello = true;
  return true;
}

/** True for a few seconds after the room first opens on a return, for the wave. */
export function greeting(now: number = Date.now()): boolean {
  if (!cameBack()) return false;
  if (!greetUntil) greetUntil = now + GREET_MS;
  return now < greetUntil;
}

/** Wakes him from wherever he fell asleep. */
export const wakeNap = (): void => napStore.set({ spot: null });
