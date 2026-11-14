/**
 * Pressing the dim area around a dialog. Two things make that kinder:
 *  - a ring of dead space round the dialog, so a press that just misses an edge does nothing at all;
 *  - a quiet rule instead of a question: the dialog closes if nothing has been typed or changed in it, and stays open
 *    if something has. Nobody has an opinion about a stray press until it costs them something, so it never asks. The
 *    setting is in Preferences > Behaviour for anyone who wants it always one way.
 */
import { registerChoice, withChoice } from '../core/choices';

export type BackdropMode = 'smart' | 'close' | 'stay';

/** How far outside a dialog a press still counts as a near miss, in pixels. */
export const NEAR_MISS = 24;

registerChoice<BackdropMode>({
  id: 'ui.backdropClick',
  title: 'Pressing beside a dialog',
  question: 'What should pressing the dim area beside a dialog do?',
  category: 'Dialogs',
  silent: true,
  default: 'smart',
  help: 'Escape and the close button always work, whichever you choose.',
  options: [
    { value: 'smart', label: 'Close it, unless you have typed something', detail: 'An untouched dialog closes. One with a name, a number or a changed setting in it stays open, so a stray press loses nothing.' },
    { value: 'close', label: 'Always close it', detail: 'Pressing beside a dialog closes it, even with something typed in.' },
    { value: 'stay', label: 'Never close it', detail: 'Only Escape and the close button close a dialog, so nothing is lost by a stray press.' },
  ],
});

/** True when a press at this point is a near miss of the dialog, and so should do nothing. */
export function nearMiss(x: number, y: number, dialog: Element | null | undefined, ring = NEAR_MISS): boolean {
  const r = dialog?.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return false;
  return x >= r.left - ring && x <= r.right + ring && y >= r.top - ring && y <= r.bottom + ring;
}

// Dialogs that something has been typed or changed in. An input event only comes from a person, never from code, so
// a dialog that filled itself in still counts as untouched.
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

/** What a press well clear of the dialog does for this mode, given whether something has been typed in it. */
export function backdropCloses(mode: BackdropMode, typed: boolean): boolean {
  return mode === 'close' || (mode === 'smart' && !typed);
}

/**
 * The backdrop was pressed well clear of the dialog: close it, or not, by the person's setting. It never asks.
 */
export function pressedBackdrop(x: number, y: number, dialog: Element | null | undefined, close: () => void): void {
  if (nearMiss(x, y, dialog)) return;
  withChoice<BackdropMode>('ui.backdropClick', (v) => {
    if (backdropCloses(v, hasTypedIn(dialog))) close();
  });
}
