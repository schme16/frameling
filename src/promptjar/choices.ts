// The one thing here with two reasonable answers: does the jar survive closing Frameling? Silent, so it is never
// asked in the middle of a stream: it sits in Preferences > Streaming. Words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';
import { DEFAULT_PACE_SECONDS } from './logic';

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
  {
    id: 'promptjar.pace',
    title: choiceWord('choice.promptjar.pace.title'),
    question: choiceWord('choice.promptjar.pace.question'),
    options: [
      { value: '1', label: choiceWord('choice.promptjar.pace.1.label'), detail: choiceWord('choice.promptjar.pace.1.detail'), did: choiceWord('choice.promptjar.pace.1.did') },
      { value: '3', label: choiceWord('choice.promptjar.pace.3.label'), detail: choiceWord('choice.promptjar.pace.3.detail'), did: choiceWord('choice.promptjar.pace.3.did') },
      { value: '8', label: choiceWord('choice.promptjar.pace.8.label'), detail: choiceWord('choice.promptjar.pace.8.detail'), did: choiceWord('choice.promptjar.pace.8.did') },
      { value: '15', label: choiceWord('choice.promptjar.pace.15.label'), detail: choiceWord('choice.promptjar.pace.15.detail'), did: choiceWord('choice.promptjar.pace.15.did') },
      { value: '30', label: choiceWord('choice.promptjar.pace.30.label'), detail: choiceWord('choice.promptjar.pace.30.detail'), did: choiceWord('choice.promptjar.pace.30.did') },
    ],
    default: String(DEFAULT_PACE_SECONDS),
    category: 'Streaming',
    help: 'prompt-jar',
    silent: true,
  },
];
