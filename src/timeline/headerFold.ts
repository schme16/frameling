// How the timeline header folds into its "more" menu: which buttons go first, and when to fold or unfold.

/** In the order they fold as the header gets narrower: the rarely used ones first, then the edit group, then hold and onion skin. */
export const FOLD_STEPS = ['pingpong', 'sound', 'clean', 'fit', 'edit', 'hold', 'onion', 'zoom'] as const;
export type FoldStep = (typeof FOLD_STEPS)[number];

/**
 * The words beside icons, in the order they drop as the header gets narrower (before anything folds away): the least
 * needed first, so "New drawing" keeps its word longest.
 */
export const WORD_STEPS = ['onion', 'frame', 'copy', 'new'] as const;
export type WordStep = (typeof WORD_STEPS)[number];

/** The words dropped at a level: levels 0 to 3 drop one more word each, and the folding steps come after them. */
export const droppedAt = (level: number): WordStep[] => WORD_STEPS.slice(0, Math.max(0, Math.min(WORD_STEPS.length, level)));

/** How many levels there are in all: every word drops, then every step folds. */
export const LEVELS = WORD_STEPS.length + FOLD_STEPS.length;

/** The steps folded away at a level (0 folds nothing). The last step only hides the zoom slider, so it is never clipped. */
export const foldedAt = (level: number): FoldStep[] => FOLD_STEPS.slice(0, Math.max(0, Math.min(FOLD_STEPS.length, level)));

/** The folded steps for a whole-header level, which counts the word levels first. */
export const foldedAtLevel = (level: number): FoldStep[] => foldedAt(level - WORD_STEPS.length);

/** Spare room (px) needed before a folded button comes back. Folding happens the moment it doesn't fit; this stops flicker. */
export const foldSlack = 28;

/**
 * Picks the fold level. Folds further as soon as the current level doesn't fit; unfolds only to a level that fits with
 * `slack` to spare. `widthAt(level)` is the width that level needs; `probeDown` says whether room may have appeared.
 */
export function chooseFold(current: number, max: number, widthAt: (level: number) => number, available: number, slack: number, probeDown: boolean): number {
  if (widthAt(current) > available) {
    for (let l = current + 1; l < max; l++) if (widthAt(l) <= available) return l;
    return max;
  }
  if (probeDown) for (let l = 0; l < current; l++) if (widthAt(l) + slack <= available) return l;
  return current;
}

/** The accessible name of the "more" button: says when a switch folded inside it is on. */
export const switchLabel = (on: number) => (on > 0 ? `More, ${on} switch${on === 1 ? '' : 'es'} on` : 'More timeline buttons');

/** The bits of a mutation record the header cares about (so a test can hand in plain objects). */
export interface HeaderMutation {
  type: string;
  addedNodes: ArrayLike<{ nodeType: number }>;
  removedNodes: ArrayLike<{ nodeType: number }>;
}

/**
 * What a batch of changes inside the header means for its folding. A button or chip coming or going (an element added
 * or removed) can free or need room: 'structure'. Only text changing (the frame counter) can need room only if the text
 * got longer: 'grow'. Anything else (a number going from 12 to 13, an attribute) needs no measuring at all: 'none'.
 * Measuring forces the page to lay out, which is the expensive part while scrubbing.
 */
export function headerChange(records: readonly HeaderMutation[], textGrew: boolean): 'structure' | 'grow' | 'none' {
  for (const r of records) {
    if (r.type !== 'childList') continue;
    for (const n of Array.from(r.addedNodes)) if (n.nodeType === 1) return 'structure';
    for (const n of Array.from(r.removedNodes)) if (n.nodeType === 1) return 'structure';
  }
  return textGrew ? 'grow' : 'none';
}
