// The one thing here with two reasonable answers: does the jar survive closing Frameling? Silent, so it is never
// asked in the middle of a stream: it sits in Preferences > Behaviour. Words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const jarChoices: ChoiceDef<string>[] = [
  {
    id: 'promptjar.keep',
    title: choiceWord('choice.promptjar.keep.title'),
    question: choiceWord('choice.promptjar.keep.question'),
    options: [
      { value: 'forget', label: choiceWord('choice.promptjar.keep.forget.label'), detail: choiceWord('choice.promptjar.keep.forget.detail'), did: choiceWord('choice.promptjar.keep.forget.did') },
      { value: 'keep', label: choiceWord('choice.promptjar.keep.keep.label'), detail: choiceWord('choice.promptjar.keep.keep.detail'), did: choiceWord('choice.promptjar.keep.keep.did') },
    ],
    default: 'forget',
    category: 'Streaming',
    help: 'prompt-jar',
    silent: true,
  },
];
