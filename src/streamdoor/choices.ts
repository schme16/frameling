// The one choice the door asks about: what to do when its port is already taken. Its words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const doorChoices: ChoiceDef<string>[] = [
  {
    id: 'streamdoor.portBusy',
    title: choiceWord('choice.streamdoor.portBusy.title'),
    question: choiceWord('choice.streamdoor.portBusy.question'),
    options: [
      { value: 'next', label: choiceWord('choice.streamdoor.portBusy.next.label'), detail: choiceWord('choice.streamdoor.portBusy.next.detail'), did: choiceWord('choice.streamdoor.portBusy.next.did') },
      { value: 'stay', label: choiceWord('choice.streamdoor.portBusy.stay.label'), detail: choiceWord('choice.streamdoor.portBusy.stay.detail'), did: choiceWord('choice.streamdoor.portBusy.stay.did') },
    ],
    default: 'next',
    category: 'Streaming',
    help: 'actions-door',
  },
];
