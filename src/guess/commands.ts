// The commands: start a round, give a hint, peek at the word, reveal it, put it away. All in the Audience menu.
import type { Command } from '../core/registry';
import { openGuessSetup } from './setupState';
import { closeRound, endRound, giveHint, hintsLeft, peek, peekWhy, roundIsOpen, roundIsShowing } from './state';

const common = { category: 'Audience', help: 'guess', global: true } as const;
const KEYS = ['guess', 'guessing', 'game', 'word', 'chat', 'audience', 'stream', 'viewers', 'gartic', 'pictionary', 'charades'];

export const guessCommands: Command[] = [
  {
    id: 'guess.start',
    label: 'Start a guessing game',
    description: 'Pick a secret word and draw it. Your audience guesses in chat, and Frameling checks the guesses and shows who got it. The word never shows on screen while the round runs.',
    keywords: [...KEYS, 'start', 'play', 'game', 'new', 'round', 'draw this', 'secret word'],
    keys: ['Mod+Alt+Q'],
    enabled: () => !roundIsShowing(),
    reason: () => (roundIsOpen() ? 'A round is already going. Reveal it first.' : 'Close the last result first.'),
    run: openGuessSetup,
    ...common,
  },
  {
    id: 'guess.hint',
    label: 'Give a hint',
    description: 'Shows one more letter of the word on the panel, so everyone watching can see it. A few a round at most.',
    keywords: [...KEYS, 'hint', 'clue', 'letter', 'help them'],
    enabled: () => hintsLeft() > 0,
    reason: () => (roundIsOpen() ? 'No more hints for this word.' : 'No round is going right now.'),
    run: giveHint,
    ...common,
  },
  {
    id: 'guess.peek',
    label: 'Peek at the word',
    description: 'Shows the word to you for three seconds, then hides it again. Only when you allow it in Preferences, and never while Stream-safe is on.',
    keywords: [...KEYS, 'peek', 'remind', 'look', 'forgot', 'what was it', 'show me'],
    enabled: () => peekWhy() === null,
    reason: () => peekWhy() ?? '',
    run: () => void peek(),
    ...common,
  },
  {
    id: 'guess.end',
    label: 'Reveal the word',
    description: 'Ends the round and shows the word and who got it, or that nobody did. Use it to give up or to finish a round that has no timer.',
    keywords: [...KEYS, 'reveal', 'end', 'finish', 'give up', 'answer', 'result', 'show the word'],
    keys: ['Mod+Alt+Shift+Q'],
    enabled: roundIsOpen,
    reason: () => 'No round is going right now.',
    run: () => endRound('revealed'),
    ...common,
  },
  {
    id: 'guess.close',
    label: 'Close the guessing game',
    description: 'Puts the round or its result away. Everything about it is forgotten, the word and any winner too.',
    keywords: [...KEYS, 'close', 'dismiss', 'hide', 'throw away', 'cancel'],
    enabled: roundIsShowing,
    reason: () => 'There is no round on screen.',
    run: closeRound,
    ...common,
  },
];

export const guessMenuItems = ['-', 'guess.start', 'guess.hint', 'guess.peek', 'guess.end', 'guess.close'];
