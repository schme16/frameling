// Asking about unsaved work when the window is closing (the window button, Quit). The page owns the document and has
// the pretty dialog, so it is asked first; the system's own box is the fallback, so a close is never let through
// without a question. Nothing here touches Electron: the pieces it needs are handed in, so it can be tested.
import { asSaveChoice, type SaveChoice } from '../shared/saveQuestion';

/**
 * How long the page has to put its dialog on screen before we give up on it and use the system box. This waits only for
 * the dialog to appear, never for the person to decide: once it is up there is no time limit at all. A page that is
 * working properly shows it within a frame or two; 2.5 seconds is long enough that a busy page (a big export, a heavy
 * save) is not given up on at once, and short enough that someone who pressed the window's close button does not
 * wonder whether anything happened.
 */
export const DIALOG_WITHIN_MS = 2500;

export interface CloseQuestionDeps {
  /** Hands the question to the page. False when there is no page to ask (no window, or its process is gone). */
  sendToPage(id: number): boolean;
  /** Tells the page to take down the dialog for this question. */
  withdrawFromPage(id: number): void;
  /** The system's own box. */
  system(): Promise<SaveChoice>;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
}

export interface CloseAsker {
  /** Asks once. Resolves with the person's answer, whichever way it was asked. */
  ask(): Promise<SaveChoice>;
  /** The page's dialog is up. */
  shown(id: number): void;
  /** The page's answer: one of the three, or anything else ('unavailable') when it couldn't ask. */
  answered(id: number, value: unknown): void;
  /** The page went away or stopped answering while a question was open. */
  pageLost(): void;
  /** Whether a question is open at the moment. */
  readonly open: boolean;
}

export function createCloseAsker(deps: CloseQuestionDeps, withinMs = DIALOG_WITHIN_MS): CloseAsker {
  let next = 0;
  let current: { pageId: number | null; shown: boolean; timer: unknown; resolve: (c: SaveChoice) => void; promise: Promise<SaveChoice> } | null = null;

  const finish = (c: SaveChoice) => {
    const cur = current;
    if (!cur) return;
    current = null;
    if (cur.timer !== null) deps.clearTimer(cur.timer);
    cur.resolve(c);
  };

  // The page is not going to do it: take its dialog down if it has one, and ask with the system box. Closing without an
  // answer is never an option, so a box that fails to open counts as Cancel.
  const fallBack = () => {
    const cur = current;
    if (!cur || cur.pageId === null) return;
    if (cur.timer !== null) deps.clearTimer(cur.timer);
    cur.timer = null;
    deps.withdrawFromPage(cur.pageId);
    cur.pageId = null;
    void deps.system().then(finish, () => finish('cancel'));
  };

  return {
    get open() {
      return current !== null;
    },
    ask() {
      if (current) return current.promise;
      let resolve!: (c: SaveChoice) => void;
      const promise = new Promise<SaveChoice>((r) => (resolve = r));
      const pageId = ++next;
      current = { pageId, shown: false, timer: null, resolve, promise };
      if (!deps.sendToPage(pageId)) {
        current.pageId = pageId;
        fallBack();
        return promise;
      }
      current.timer = deps.setTimer(() => {
        if (current?.pageId === pageId && !current.shown) fallBack();
      }, withinMs);
      return promise;
    },
    shown(id) {
      if (current?.pageId !== id) return;
      current.shown = true;
      if (current.timer !== null) deps.clearTimer(current.timer);
      current.timer = null;
    },
    answered(id, value) {
      // An answer to a question we have already given up on is ignored: the system box has the floor.
      if (current?.pageId !== id) return;
      const choice = asSaveChoice(value);
      if (choice) finish(choice);
      else fallBack();
    },
    pageLost() {
      fallBack();
    },
  };
}

/** What the desktop side does with an answer to the close question. */
export type CloseStep = 'save-then-close' | 'keep-then-close' | 'stay-open';

export function closeStep(choice: SaveChoice): CloseStep {
  return choice === 'save' ? 'save-then-close' : choice === 'discard' ? 'keep-then-close' : 'stay-open';
}

/** Whether a close should be held for the question: only unsaved work that has not already been answered for. */
export function holdClose(s: { approved: boolean; dirty: boolean }): boolean {
  return !s.approved && s.dirty;
}
