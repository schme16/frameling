// Every pen modifier the audience can set off, in one list. A copy-and-change pattern for one more: add an entry, nothing
// else. The commands, the list in Preferences, the help list, the actions door and the tests all read this one list.
//
// What a modifier IS: not an edit to the drawing, but a setting with a timer. It lies over the pen (see ./active.ts) for a
// while, and the strokes you draw while it is on come out a little different. Those strokes are ordinary strokes, one
// undo step each, and they are yours and permanent. That is exactly why every modifier is `touchesDrawing: true`: it
// is gated by "Let the audience interrupt your drawing", which is off until the streamer turns it on.
import type { PenEffect } from './active';

export interface PenModDef {
  /** `penmod.steady`, the audience gate's id. */
  id: string;
  /** Plain words: the audience action's label, the chip, and the palette command's name after "Try the pen modifier:". */
  label: string;
  /** One plain line on what it does, shown in Preferences and the help. */
  about: string;
  /** The short line on the chip, so nobody wonders why the pen feels odd. */
  feel: string;
  /** How long it lasts, against the streamer's "How long a dare lasts" choice (1 is as chosen). */
  factor: number;
  /** What it does to the pen. */
  effect: PenEffect;
  /** Extra words the palette finds it by. */
  keywords: string[];
}

/** One gate kind, so the cooldown is shared and two never start together. */
export const PEN_KIND = 'pen-modifier';
export const PEN_COOLDOWN = 45_000;

export const penMods: PenModDef[] = [
  {
    id: 'penmod.steady',
    label: 'Steady hand',
    about: 'The pen steadies itself a lot for a while, so your lines come out smooth and calm. A kind one.',
    feel: 'Your lines come out extra smooth.',
    factor: 1,
    effect: { stabilizer: 40, stabMode: 'string' },
    keywords: ['steady', 'smooth', 'smoothing', 'stabilizer', 'stabiliser', 'calm', 'buff', 'steady hand'],
  },
  {
    id: 'penmod.shaky',
    label: 'Shaky hand',
    about: 'A tremor in the pen for a while, so lines wobble as if you had had too much coffee. Only the strokes you draw while it is on.',
    feel: 'Your lines wobble.',
    factor: 0.66,
    effect: { wobble: 1 },
    keywords: ['shaky', 'shake', 'wobble', 'wobbly', 'tremor', 'jitter', 'coffee', 'debuff', 'shaky hand'],
  },
  {
    id: 'penmod.thin',
    label: 'Thin brush',
    about: 'Every line comes out about a third of the size, for a while. Your size setting is not changed.',
    feel: 'Your lines come out thin.',
    factor: 1,
    effect: { size: 0.35 },
    keywords: ['thin', 'small', 'skinny', 'tiny', 'fine', 'brush size', 'smaller', 'debuff'],
  },
  {
    id: 'penmod.fat',
    label: 'Fat brush',
    about: 'Every line comes out two and a half times the size, for a while. Your size setting is not changed.',
    feel: 'Your lines come out fat.',
    factor: 1,
    effect: { size: 2.5 },
    keywords: ['fat', 'thick', 'big', 'chunky', 'huge', 'brush size', 'bigger', 'marker', 'debuff'],
  },
  {
    id: 'penmod.rope',
    label: 'Long rope',
    about: 'The pen trails a long way behind your hand, as if it were dragged on a rope. Curves come out big and swooping.',
    feel: 'Your pen trails far behind your hand.',
    factor: 0.66,
    effect: { stabilizer: 100, stabMode: 'string' },
    keywords: ['rope', 'lazy', 'lag', 'drag', 'trail', 'string', 'lazy mouse', 'swoop', 'debuff'],
  },
];

export const penModById = (id: string): PenModDef | undefined => penMods.find((m) => m.id === id);
/** `penmod.shaky` becomes `shaky`, for command ids. */
export const shortId = (id: string): string => id.replace(/^penmod\./, '');
