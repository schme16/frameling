// The one answer dares remember: how long a dare that lasts lasts. A preference (never asked as a dialog), changed in
// Preferences > Streaming. Its words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const daresChoices: ChoiceDef<string>[] = [
  {
    id: 'dares.length',
    title: choiceWord('choice.dares.length.title'),
    question: choiceWord('choice.dares.length.question'),
    options: [
      { value: 'short', label: choiceWord('choice.dares.length.short.label'), detail: choiceWord('choice.dares.length.short.detail'), did: choiceWord('choice.dares.length.short.did') },
      { value: 'normal', label: choiceWord('choice.dares.length.normal.label'), detail: choiceWord('choice.dares.length.normal.detail'), did: choiceWord('choice.dares.length.normal.did') },
      { value: 'long', label: choiceWord('choice.dares.length.long.label'), detail: choiceWord('choice.dares.length.long.detail'), did: choiceWord('choice.dares.length.long.did') },
    ],
    default: 'normal',
    category: 'Streaming',
    help: 'dares',
    silent: true,
  },
];
