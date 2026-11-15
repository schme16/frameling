// What to tell somebody who reaches for a greyed command: the one thing that would turn it on. A greyed control only
// teaches what the app can do if it also says what is missing, otherwise it looks like an answer and is a dead end.
//
// A command can carry its own `reason` (see registry.ts). Most share one of a handful of sentences, so those are here
// as helpers, and the table that hands them out by command id is in commandReasons.ts, where `reasonFor` finds
// whichever applies. Write the sentence as what to do, not what is wrong: "Select some shapes first", not "No selection".
import type { LayerKind } from './format';
import type { State } from './store';

export type Reason = (s: State) => string | undefined;

/** The same sentence whatever the state: for a command with only one thing that can be missing. */
export const say = (sentence: string): Reason => () => sentence;

const KIND_WORDS: Record<LayerKind, string> = { vector: 'a vector layer', pixel: 'a pixel layer', tilemap: 'a tile layer', camera: 'a camera layer' };

/** "a vector layer", "a vector or pixel layer": the layer kinds a command works on, in plain words. */
export function kindsInWords(kinds: LayerKind[]): string {
  if (kinds.length === 1) return KIND_WORDS[kinds[0]];
  const names = kinds.map((k) => KIND_WORDS[k].replace(/^an? /, '').replace(' layer', ''));
  return `a ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]} layer`;
}

/** For a tool or command that only works on some kinds of layer. */
export function pickKindReason(kinds: LayerKind[], what?: string): Reason {
  const words = kindsInWords(kinds);
  return say(what ? `${what} works on ${words}. Pick one in the Layers panel, or add one.` : `Pick ${words} first.`);
}

export const needSelection = (what = 'something'): Reason => say(`Select ${what} first.`);
export const needShapes: Reason = say('Select some shapes first.');
/** Two or more shapes picked, on a vector layer: says whichever of the two is missing. */
export const needManyShapes: Reason = (s) => (s.ui.selection.length < 2 ? 'Select two or more shapes first.' : 'Pick a vector layer first, because shapes can only be combined there.');
export const needPixelLayer: Reason = say('Pick a pixel layer first.');
export const nothingToUndo: Reason = say('Nothing to undo yet. Make a change first.');
export const nothingToRedo: Reason = say('Nothing to redo yet. Undo something first.');
