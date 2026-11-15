// The answers audience features ask for or remember: how careful the gate is, what your viewers can see (so secrets and
// unread words stay covered), and whether it starts switched off.
// Their words are in src/words/choices.json with the rest.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const audienceChoices: ChoiceDef<string>[] = [
  {
    id: 'audience.strictness',
    title: choiceWord('choice.audience.strictness.title'),
    question: choiceWord('choice.audience.strictness.question'),
    options: [
      { value: 'relaxed', label: choiceWord('choice.audience.strictness.relaxed.label'), detail: choiceWord('choice.audience.strictness.relaxed.detail'), did: choiceWord('choice.audience.strictness.relaxed.did') },
      { value: 'balanced', label: choiceWord('choice.audience.strictness.balanced.label'), detail: choiceWord('choice.audience.strictness.balanced.detail'), did: choiceWord('choice.audience.strictness.balanced.did') },
      { value: 'strict', label: choiceWord('choice.audience.strictness.strict.label'), detail: choiceWord('choice.audience.strictness.strict.detail'), did: choiceWord('choice.audience.strictness.strict.did') },
    ],
    default: 'balanced',
    category: 'Streaming',
    help: 'audience',
  },
  {
    id: 'audience.view',
    title: choiceWord('choice.audience.view.title'),
    question: choiceWord('choice.audience.view.question'),
    options: [
      { value: 'screen', label: choiceWord('choice.audience.view.screen.label'), detail: choiceWord('choice.audience.view.screen.detail'), did: choiceWord('choice.audience.view.screen.did') },
      { value: 'capture', label: choiceWord('choice.audience.view.capture.label'), detail: choiceWord('choice.audience.view.capture.detail'), did: choiceWord('choice.audience.view.capture.did') },
    ],
    default: 'screen',
    // Closing the question never means "uncover": it stays on the careful answer.
    dismiss: 'screen',
    category: 'Streaming',
    help: 'cover-spoilers',
  },
  {
    id: 'audience.startup',
    title: choiceWord('choice.audience.startup.title'),
    question: choiceWord('choice.audience.startup.question'),
    options: [
      { value: 'off', label: choiceWord('choice.audience.startup.off.label'), detail: choiceWord('choice.audience.startup.off.detail'), did: choiceWord('choice.audience.startup.off.did') },
      { value: 'keep', label: choiceWord('choice.audience.startup.keep.label'), detail: choiceWord('choice.audience.startup.keep.detail'), did: choiceWord('choice.audience.startup.keep.did') },
    ],
    default: 'off',
    category: 'Streaming',
    help: 'audience',
    silent: true,
  },
];
