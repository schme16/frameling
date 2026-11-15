// Dares: small challenges the audience can set off, through the audience gate (src/audience). A feature you can turn
// off (Preferences > Features): off, there are no dares, no commands and no list. See ./catalogue.ts for every dare.
import { defineFeature } from '../features/feature';
import { daresChoices } from './choices';
import { daresCommands } from './commands';
import { stopDares, registerDares, watchGate } from './registry';
import { daresHelp } from './help';

let unwatch: (() => void) | null = null;

export const daresFeature = defineFeature({
  id: 'stream-dares',
  name: 'Audience dares',
  about: 'Small challenges your audience can set off while you draw: flip the view, a countdown, googly eyes. Each has its own switch.',
  optional: true,
  commands: daresCommands,
  help: daresHelp,
  choices: daresChoices,
  activate: () => {
    registerDares();
    unwatch = watchGate();
  },
  deactivate: () => {
    unwatch?.();
    unwatch = null;
    stopDares();
  },
});

export { DaresPrefsRow } from './PrefsRow';
export { DareLayer } from './DareLayer';
