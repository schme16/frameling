// Pen modifiers: the audience can change how your pen feels for a while (steady hand, shaky hand, thin brush, fat brush,
// long rope), through the audience gate (src/audience). Not an edit to the drawing but a setting with a timer, laid over
// the pen (see ./active.ts); the strokes you draw meanwhile are normal undoable strokes, which is why they all sit behind
// "Let the audience interrupt your drawing". A feature you can turn off (Preferences > Streaming): off, there are no
// modifiers, no commands, no chip and no list. See ./catalogue.ts for every one.
import { defineFeature } from '../features/feature';
import { penModCommands } from './commands';
import { penModHelp } from './help';
import { registerPenMods, stopPenMods, watchGate } from './registry';

let unwatch: (() => void) | null = null;

export const penModsFeature = defineFeature({
  id: 'stream-penmods',
  name: 'Pen modifiers',
  about: 'Your audience can make your pen steadier, shakier, thinner or fatter for a while. Each has its own switch, and they need you to allow interruptions.',
  optional: true,
  commands: penModCommands,
  help: penModHelp,
  activate: () => {
    registerPenMods();
    unwatch = watchGate();
  },
  deactivate: () => {
    unwatch?.();
    unwatch = null;
    stopPenMods();
  },
});

export { PenModsPrefsRow } from './PrefsRow';
export { PenModChip } from './PenModChip';
