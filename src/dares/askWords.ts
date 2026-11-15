// Words from chat never go on a banner by themselves. The streamer is asked first, with the words in the question, the
// same promise Quill's signs make: a banner is bigger and more public than a sign, so it gets the same gate.
//
// No answer in time, "Not that one", the question being closed and Stop all mean no. A new question drops the old one.
// The words live in this closure while the question is up, and nowhere else: nothing is stored and no sender is read.
import { dismissToast, toast } from '../ui/toast';

/** How long the question waits before it answers no for you. */
export const ASK_WORDS_MS = 15_000;

let pendingAsk: ((yes: boolean) => void) | null = null;
let current: number | null = null;

/** Asks whether to put these words on screen. Resolves true only on a deliberate yes. */
export function askToShowWords(text: string, signal: AbortSignal, waitMs = ASK_WORDS_MS): Promise<boolean> {
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
    id = toast(`Chat would like this on your screen: “${text}”`, {
      quill: 'think',
      duration: 0,
      sound: null,
      action: { label: 'Put it up', id: 'words-yes', run: () => finish(true) },
      decline: { label: 'Not that one', id: 'words-no', run: () => finish(false) },
    });
    current = id;
    timer = setTimeout(() => finish(false), waitMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** For tests: drops any question still up. */
export function _resetAskWords(): void {
  pendingAsk?.(false);
  pendingAsk = null;
  current = null;
}
