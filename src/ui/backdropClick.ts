/**
 * Pressing the dim area around a dialog. Two things make that kinder:
 *  - a ring of dead space round the dialog, so a press that just misses an edge does nothing at all;
 *  - asking, the first time it happens, whether pressing the backdrop should close the dialog or leave it alone.
 */
import { registerChoice, withChoice } from '../core/choices';

export type BackdropMode = 'close' | 'stay';

/** How far outside a dialog a press still counts as a near miss, in pixels. */
export const NEAR_MISS = 24;

registerChoice<BackdropMode>({
  id: 'ui.backdropClick',
  title: 'Pressing beside a dialog',
  question: 'You pressed the dim area beside the dialog. Should that close it?',
  category: 'Dialogs',
  quill: true,
  default: 'close',
  dismiss: 'stay',
  help: 'Escape and the close button always work, whichever you choose.',
  options: [
    { value: 'close', label: 'Close it', detail: 'Pressing beside a dialog closes it, as it does today.' },
    { value: 'stay', label: 'Leave it open', detail: 'Only Escape and the close button close a dialog, so nothing is lost by a stray press.' },
  ],
});

/** True when a press at this point is a near miss of the dialog, and so should do nothing. */
export function nearMiss(x: number, y: number, dialog: Element | null | undefined, ring = NEAR_MISS): boolean {
  const r = dialog?.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return false;
  return x >= r.left - ring && x <= r.right + ring && y >= r.top - ring && y <= r.bottom + ring;
}

/**
 * The backdrop was pressed well clear of the dialog: close it, or not, as the person likes. The first press asks.
 */
export function pressedBackdrop(x: number, y: number, dialog: Element | null | undefined, close: () => void): void {
  if (nearMiss(x, y, dialog)) return;
  withChoice<BackdropMode>('ui.backdropClick', (v) => {
    if (v === 'close') close();
  });
}
