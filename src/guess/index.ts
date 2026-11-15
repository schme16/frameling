// Guess the drawing: you draw a secret word, your audience guesses in chat, and Frameling runs the game: it checks the
// guesses (a fair match: capitals, plurals, a letter out), counts them, and shows who got it. The guesses come through
// the audience gate (src/audience) and the actions door (src/streamdoor). It never touches the drawing, and the word is
// never on screen while a round runs. A feature you can turn off (Preferences > Features); off, there is no round, no
// action, no command and no help, and a round that was going is dropped.
import { defineFeature } from '../features/feature';
import { registerGuessAction } from './actions';
import { guessChoices } from './choices';
import { guessCommands, guessMenuItems } from './commands';
import { guessHelp } from './help';
import { closeRound, watchGate } from './state';

let unwatch: (() => void) | null = null;

export const guessFeature = defineFeature({
  id: 'stream-guess',
  name: 'Guess the drawing',
  about: 'Lets you draw a secret word while your audience guesses it in chat. Frameling checks the guesses and shows who got it. The word never shows on screen while a round runs. Needs the actions door.',
  optional: true,
  requires: ['stream-door'],
  commands: guessCommands,
  help: guessHelp,
  choices: guessChoices,
  menus: [{ menu: 'sub:guess', items: guessMenuItems }],
  activate: () => {
    registerGuessAction();
    unwatch = watchGate();
  },
  deactivate: () => {
    unwatch?.();
    unwatch = null;
    closeRound();
  },
});

export { GuessLayer } from './GuessLayer';
