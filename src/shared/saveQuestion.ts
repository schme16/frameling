// The "Save changes?" question, worded once for the window button, Quit, New, Open and Close drawing, so they all ask
// the same thing with the same three answers. The page shows it as Quill's dialog (src/io/SaveQuestionDialog.tsx); the
// desktop side uses the same words for the system box it falls back to when the page can't answer (src/main).
export type SaveChoice = 'save' | 'discard' | 'cancel';

export interface SaveQuestion {
  title: string;
  message: string;
  detail: string;
  /** Save, Don't save, Cancel, in that order. */
  buttons: [string, string, string];
}

/** The answers in the same order as the buttons. */
export const SAVE_ANSWERS: readonly [SaveChoice, SaveChoice, SaveChoice] = ['save', 'discard', 'cancel'];

/** `neverSaved` is a drawing with no file yet: say so, so Save doesn't sound like it writes over something. */
export function saveChangesQuestion(name: string, neverSaved: boolean): SaveQuestion {
  return {
    title: 'Save changes?',
    message: `Save changes to "${String(name).slice(0, 80)}"?`,
    detail: neverSaved
      ? `This drawing hasn't been saved yet, so Save will ask where to put it. If you don't save, your latest changes will be lost.`
      : `If you don't save, your latest changes will be lost.`,
    buttons: ['Save', `Don't save`, 'Cancel'],
  };
}

/** The answer for the button at this position. Anything unexpected is a Cancel, so nothing is ever lost by a slip. */
export function choiceAt(index: number): SaveChoice {
  return SAVE_ANSWERS[index] ?? 'cancel';
}

/** Anything a page or a message hands us, as one of the three answers, or null when it isn't one. */
export function asSaveChoice(v: unknown): SaveChoice | null {
  return v === 'save' || v === 'discard' || v === 'cancel' ? v : null;
}
