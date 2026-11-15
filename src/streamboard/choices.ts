// The two things Stream control asks once and then remembers. Their words are in src/words/choices.json.
import { registerChoice, type ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const TOP_CHOICE = 'streamboard.top';
export const FRONT_CHOICE = 'streamboard.front';

export const streamboardChoices: ChoiceDef<string>[] = [
  {
    id: TOP_CHOICE,
    title: choiceWord('choice.streamboard.top.title'),
    question: choiceWord('choice.streamboard.top.question'),
    options: [
      { value: 'normal', label: choiceWord('choice.streamboard.top.normal.label'), detail: choiceWord('choice.streamboard.top.normal.detail'), did: choiceWord('choice.streamboard.top.normal.did') },
      { value: 'top', label: choiceWord('choice.streamboard.top.top.label'), detail: choiceWord('choice.streamboard.top.top.detail'), did: choiceWord('choice.streamboard.top.top.did') },
    ],
    default: 'normal',
    category: 'Streaming',
    help: 'stream-control',
  },
  {
    id: FRONT_CHOICE,
    title: choiceWord('choice.streamboard.front.title'),
    question: choiceWord('choice.streamboard.front.question'),
    options: [
      { value: 'front', label: choiceWord('choice.streamboard.front.front.label'), detail: choiceWord('choice.streamboard.front.front.detail'), did: choiceWord('choice.streamboard.front.front.did') },
      { value: 'stay', label: choiceWord('choice.streamboard.front.stay.label'), detail: choiceWord('choice.streamboard.front.stay.detail'), did: choiceWord('choice.streamboard.front.stay.did') },
    ],
    default: 'front',
    category: 'Streaming',
    help: 'stream-control',
  },
];

export const registerStreamboardChoices = (): void => {
  for (const c of streamboardChoices) registerChoice(c);
};
