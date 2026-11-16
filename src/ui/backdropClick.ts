/**
 * Pressing the dim area around a dialog. Two things make that kinder:
 *  - a ring of dead space round the dialog, so a press that just misses an edge does nothing at all;
 *  - one answer, asked the first time it comes up and then remembered. The rule never changes under you: whatever you
 *    answer is what a press beside a dialog does from then on, and it is in Preferences > Behaviour to change.
 */
import { registerChoice, withChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type BackdropMode = 'close' | 'stay';

/** How far outside a dialog a press still counts as a near miss, in pixels. */
export const NEAR_MISS = 24;

registerChoice<BackdropMode>({
  id: 'ui.backdropClick',
  title: choiceWord('choice.ui.backdropClick.title'),
  question: choiceWord('choice.ui.backdropClick.question'),
  category: 'Dialogs',
  default: 'stay',
  // Closing the question without picking leaves the dialog open, so nothing is ever lost by not answering.
  dismiss: 'stay',
  help: 'behaviour#dialogs',
  options: [
    { value: 'close', label: choiceWord('choice.ui.backdropClick.close.label'), detail: choiceWord('choice.ui.backdropClick.close.detail') },
    { value: 'stay', label: choiceWord('choice.ui.backdropClick.stay.label'), detail: choiceWord('choice.ui.backdropClick.stay.detail') },
  ],
});

/** True when a press at this point is a near miss of the dialog, and so should do nothing. */
export function nearMiss(x: number, y: number, dialog: Element | null | undefined, ring = NEAR_MISS): boolean {
  const r = dialog?.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return false;
  return x >= r.left - ring && x <= r.right + ring && y >= r.top - ring && y <= r.bottom + ring;
}

// Dialogs that something has been typed or changed in. An input event only comes from a person, never from code, so
// a dialog that filled itself in still counts as untouched. Kept for the first ask, which says what is at stake.
const touched = new WeakSet<Element>();
if (typeof document !== 'undefined') {
  document.addEventListener(
    'input',
    (e) => {
      const d = (e.target as Element | null)?.closest?.('[role="dialog"]');
      if (d) touched.add(d);
    },
    true,
  );
}

/** Whether anything has been typed or changed in this dialog by hand. */
export const hasTypedIn = (dialog: Element | null | undefined): boolean => !!dialog && touched.has(dialog);

/** What a press well clear of the dialog does for this answer. The same every time, whatever is in the dialog. */
export function backdropCloses(mode: BackdropMode): boolean {
  return mode === 'close';
}

/**
 * The backdrop was pressed well clear of the dialog. The first time, Frameling asks what that should do and
 * remembers the answer; after that it does the same thing every time.
 */
export function pressedBackdrop(x: number, y: number, dialog: Element | null | undefined, close: () => void): void {
  if (nearMiss(x, y, dialog)) return;
  withChoice<BackdropMode>('ui.backdropClick', (v) => {
    if (backdropCloses(v)) close();
  });
}
