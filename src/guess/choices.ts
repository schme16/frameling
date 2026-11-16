// The three answers a guessing round remembers: when it ends, whether the winner's name shows, and whether you may peek
// at the word. All preferences (never asked in the middle of a stream), changed in Preferences > Streaming or, for the
// first two, in the box that starts a round. Their words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const guessChoices: ChoiceDef<string>[] = [
  {
    id: 'guess.ending',
    title: choiceWord('choice.guess.ending.title'),
    question: choiceWord('choice.guess.ending.question'),
    options: [
      { value: 'first', label: choiceWord('choice.guess.ending.first.label'), detail: choiceWord('choice.guess.ending.first.detail'), did: choiceWord('choice.guess.ending.first.did') },
      { value: 'timer', label: choiceWord('choice.guess.ending.timer.label'), detail: choiceWord('choice.guess.ending.timer.detail'), did: choiceWord('choice.guess.ending.timer.did') },
    ],
    default: 'first',
    category: 'Streaming',
    help: 'guess',
    silent: true,
  },
  {
    id: 'guess.winnerName',
    title: choiceWord('choice.guess.winnerName.title'),
    question: choiceWord('choice.guess.winnerName.question'),
    options: [
      { value: 'hide', label: choiceWord('choice.guess.winnerName.hide.label'), detail: choiceWord('choice.guess.winnerName.hide.detail'), did: choiceWord('choice.guess.winnerName.hide.did') },
      { value: 'show', label: choiceWord('choice.guess.winnerName.show.label'), detail: choiceWord('choice.guess.winnerName.show.detail'), did: choiceWord('choice.guess.winnerName.show.did') },
    ],
    default: 'hide',
    category: 'Streaming',
    help: 'guess',
    silent: true,
  },
  {
    id: 'guess.peek',
    title: choiceWord('choice.guess.peek.title'),
    question: choiceWord('choice.guess.peek.question'),
    options: [
      { value: 'never', label: choiceWord('choice.guess.peek.never.label'), detail: choiceWord('choice.guess.peek.never.detail'), did: choiceWord('choice.guess.peek.never.did') },
      { value: 'allow', label: choiceWord('choice.guess.peek.allow.label'), detail: choiceWord('choice.guess.peek.allow.detail'), did: choiceWord('choice.guess.peek.allow.did') },
    ],
    default: 'never',
    category: 'Streaming',
    help: 'guess',
    silent: true,
  },
];
