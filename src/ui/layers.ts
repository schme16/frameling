// What sits on top of what. Every floating thing in the app used to pick its own number, which is how the brush and tip
// pickers ended up over a dialog's dimmed backdrop: 1000 happened to beat 100. The ladder lives here now, in one place,
// in the order a person reads the screen from back to front.
//
// The CSS side of this is the matching custom properties on :root in ui.css, named --z-panel, --z-flyout and so on.
// A rule should reach for one of those rather than writing a number, so there is one place to look and one to change.

/** The ladder, back to front. The numbers are the ones the app already used: this names them, it does not move them. */
export const LAYER = {
  /** Bits drawn inside a panel: a row handle, a scroll shadow, a drag ghost within its own list. */
  inPanel: 6,
  /** The docked panels and the rails round the canvas. */
  panel: 50,
  /** A panel floating free of the dock, and the toolbars that go with it. */
  panelFloat: 60,
  /** The little chip that says where a panel will land while you drag it. */
  dockChip: 90,
  /** A picker, menu or popover opened from the page: above every panel, UNDER a dialog's backdrop, so a modal really
   *  does put the page out of reach. */
  flyout: 95,
  /** The dimmed sheet behind a dialog. Everything below this is out of reach while a dialog is open. */
  backdrop: 100,
  /** A dialog's own content, on top of its backdrop. */
  modal: 110,
  /** A menu opened from inside a dialog, so the menu a card in Preferences opens is seen. */
  menuOverModal: 150,
  /** Tooltips, which may explain something in a dialog. */
  tip: 200,
  /** Toasts, which are the app talking to you and must never be hidden. */
  toast: 300,
  /** The big dialogs that sit above the plain backdrop: Export, Save as, an ask-the-first-time question. */
  bigDialog: 900,
  /** A picker or popover opened from inside one of those big dialogs, so it is seen above it. */
  flyoutOverModal: 990,
  /** Quill's quest ring, bar and card, which walk you through the app and so sit over all of it. */
  quest: 1000,
} as const;

export type LayerName = keyof typeof LAYER;

/** The ladder in order, for a test that keeps it honest. */
export const LAYER_ORDER: LayerName[] = ['inPanel', 'panel', 'panelFloat', 'dockChip', 'flyout', 'backdrop', 'modal', 'menuOverModal', 'tip', 'toast', 'bigDialog', 'flyoutOverModal', 'quest'];

/**
 * What counts as a dialog: the thing a flyout has to climb over when it is opened from inside one. It is the real
 * modals only, the ones that dim the page behind them. A plain `role="dialog"` is not enough, because half the app's
 * popovers carry it (the snapping popover, the prompt jar card, the panel picker) and those are page flyouts
 * themselves: a colour picker opened from one of those still belongs under a backdrop.
 */
const MODAL_SELECTOR = '.ui-backdrop, .ui-modal, .io-backdrop, .io-modal, [aria-modal="true"]';

/**
 * How high a picker, menu or popover should sit. Opened from the page it stays under a dialog's backdrop, so a modal
 * really does put the page behind it out of reach. Opened from inside a dialog it climbs above that dialog instead.
 *
 * `opener` is the button or field the flyout belongs to. With nothing to go on it stays on the page level, which is the
 * safe answer: a flyout that is too low is visibly wrong, one that is too high quietly floats over a backdrop.
 */
export function flyoutLayer(opener: Element | null | undefined): number {
  return opener?.closest?.(MODAL_SELECTOR) ? LAYER.flyoutOverModal : LAYER.flyout;
}

/** True when this element was opened from inside a dialog. Handy for a test, and for anything that wants the reason rather than the number. */
export const insideModal = (el: Element | null | undefined): boolean => !!el?.closest?.(MODAL_SELECTOR);
