// The "Save changes?" question as Quill's dialog (SaveQuestionDialog), asked in the page. New, Open and Close drawing ask
// it straight away; closing the window and Quit ask it when the desktop side hands the question over (closeQuestion.ts).
import { createStore } from '../ui/mini';
import type { SaveChoice } from '../shared/saveQuestion';

export interface PendingSave {
  /** Tells the dialog apart from the one before it. */
  id: number;
  name: string;
  neverSaved: boolean;
  resolve: (c: SaveChoice) => void;
  /** Called once the dialog is on screen. */
  onShown?: () => void;
}

export const saveAsking = createStore<PendingSave | null>(null);
let mounted = false;
let nextId = 0;

/** The dialog tells us when it is on the page. Without it (tests, a page still starting) there is nothing to ask with. */
export function setSaveAskMounted(on: boolean): void {
  mounted = on;
}

export const saveAskAvailable = (): boolean => mounted;

/**
 * Shows the question and resolves with the answer. Rejects at once when the dialog isn't there, so the caller can use
 * the system box instead. One question at a time: a newer one answers the older with Cancel, so nothing is ever
 * saved or thrown away by a question the person never saw. `signal` takes the dialog down (the desktop side gave up on
 * us and asked another way); that counts as Cancel for this dialog only.
 */
export function askSaveInPage(name: string, neverSaved: boolean, opts: { onShown?: () => void; signal?: AbortSignal } = {}): Promise<SaveChoice> {
  if (!mounted) return Promise.reject(new Error('The save question has nowhere to show.'));
  return new Promise<SaveChoice>((resolve) => {
    const before = saveAsking.get();
    before?.resolve('cancel');
    const mine: PendingSave = { id: ++nextId, name, neverSaved, resolve, onShown: opts.onShown };
    saveAsking.set(mine);
    opts.signal?.addEventListener(
      'abort',
      () => {
        if (saveAsking.get() === mine) saveAsking.set(null);
        resolve('cancel');
      },
      { once: true },
    );
  });
}

/** An answer from the dialog's buttons, Escape, or a click beside it. */
export function answerSave(choice: SaveChoice): void {
  const p = saveAsking.get();
  saveAsking.set(null);
  p?.resolve(choice);
}
