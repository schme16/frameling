// Quill's reactions, shown as a little toast with him in it. Everything here only moves Quill and puts words on the
// screen: no document, no pet memory (nothing makes him closer, nothing is counted), no network. He talks on screen
// only. There is deliberately no way in this folder to say anything into a chat.
import { lines } from '../ui/mascot/lines';
import type { Script } from '../ui/mascot/timing';
import { dismissToast, toast } from '../ui/toast';

export const REACTIONS = ['cheer', 'hop', 'snack', 'nuzzle', 'wave'] as const;
export type Reaction = (typeof REACTIONS)[number];

interface Look {
  /** What he does. Loops (eating, nuzzling) get a `hold` so they stop by themselves. */
  anim: Script;
  /** How long the toast stays, in ms. */
  ms: number;
  /** The set of lines to pick from. */
  words: () => string[];
}

const LOOKS: Record<Reaction, Look> = {
  cheer: { anim: 'cheer', ms: 4200, words: () => lines('stream.cheer') },
  hop: { anim: 'hop', ms: 3600, words: () => lines('stream.hop') },
  snack: { anim: [{ anim: 'eat', hold: 2600 }], ms: 3800, words: () => lines('stream.snack') },
  nuzzle: { anim: [{ anim: 'nuzzle', hold: 2600 }], ms: 3800, words: () => lines('stream.nuzzle') },
  wave: { anim: 'wave', ms: 3600, words: () => lines('stream.wave') },
};

/** Which one of a set, from a number between 0 and 1. Pure, so a test can pick. */
export const pickOf = <T>(xs: readonly T[], rand: number): T => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(rand * xs.length)))];

/** The toast on screen now. There is one of him, so a new reaction takes the place of the last one instead of piling up. */
let current: number | null = null;

function replaceCurrent(id: number): void {
  if (current !== null && current !== id) dismissToast(current);
  current = id;
}

/** Quill reacts. Returns the words he said. */
export function react(which: Reaction, rand: () => number = Math.random): string {
  const look = LOOKS[which];
  const words = pickOf(look.words(), rand());
  replaceCurrent(toast(words, { quill: look.anim, duration: look.ms, sound: null }));
  return words;
}

/** Quill says something at a moment of his own (a game round, say), taking the place of the one on screen. The words are his, from lines.json. */
export function quillSays(words: string, anim: Script, ms = 4200): void {
  replaceCurrent(toast(words, { quill: anim, duration: ms, sound: null }));
}

/** How long a sign stays up, in ms. */
export const SIGN_UP_MS = 9000;
/** How long the question "hold up this sign?" waits for a yes before it is dropped, in ms. */
export const SIGN_ASK_MS = 15_000;

/** Quill holds up a sign with these words, which have already been through `cleanSign` and said yes. */
export function showSign(text: string): void {
  replaceCurrent(toast(`“${text}”`, { quill: [{ anim: 'holding', hold: SIGN_UP_MS - 800 }], duration: SIGN_UP_MS, sound: null, sign: true }));
}

let pendingAsk: ((yes: boolean) => void) | null = null;

/**
 * Asks the streamer whether to hold up this sign, on screen, with the words in the question. Resolves true on yes. No
 * answer in time, "Not that one", the toast being closed and kill all mean no. A new question drops the old one. The
 * words live in this closure until the question is over, and nowhere else.
 */
export function askToShowSign(text: string, signal: AbortSignal, waitMs = SIGN_ASK_MS): Promise<boolean> {
  pendingAsk?.(false);
  return new Promise<boolean>((resolve) => {
    let id = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (yes: boolean): void => {
      if (pendingAsk === finish) pendingAsk = null;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      dismissToast(id);
      if (current === id) current = null;
      resolve(yes);
    };
    const onAbort = (): void => finish(false);
    pendingAsk = finish;
    if (signal.aborted) return finish(false);
    if (current !== null) dismissToast(current);
    id = toast(`${lines('stream.sign.ask')[0]} “${text}”`, {
      quill: 'think',
      duration: 0,
      sound: null,
      action: { label: 'Hold it up', id: 'sign-yes', run: () => finish(true) },
      decline: { label: 'Not that one', id: 'sign-no', run: () => finish(false) },
    });
    current = id;
    timer = setTimeout(() => finish(false), waitMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Asks, then shows it on a yes. The streamer's own preview and a real sign from chat both go through here. */
export async function signFlow(text: string, signal: AbortSignal): Promise<boolean> {
  if (!(await askToShowSign(text, signal))) return false;
  if (signal.aborted) return false;
  showSign(text);
  return true;
}
