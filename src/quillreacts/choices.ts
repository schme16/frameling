// The one thing here with two reasonable answers: whether chat's words for a sign are taken at all. Its words are in
// src/words/choices.json. Silent, so it is never asked in the middle of a stream: it sits in Preferences > Streaming.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const reactChoices: ChoiceDef<string>[] = [
  {
    id: 'quillreacts.signs',
    title: choiceWord('choice.quillreacts.signs.title'),
    question: choiceWord('choice.quillreacts.signs.question'),
    options: [
      { value: 'ask', label: choiceWord('choice.quillreacts.signs.ask.label'), detail: choiceWord('choice.quillreacts.signs.ask.detail'), did: choiceWord('choice.quillreacts.signs.ask.did') },
      { value: 'off', label: choiceWord('choice.quillreacts.signs.off.label'), detail: choiceWord('choice.quillreacts.signs.off.detail'), did: choiceWord('choice.quillreacts.signs.off.did') },
    ],
    default: 'ask',
    category: 'Streaming',
    help: 'quill-reacts',
    silent: true,
  },
];
