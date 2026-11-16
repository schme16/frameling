// Two things here have two reasonable answers: whether chat's words for a sign are taken at all, and whether Quill says a new
// viewer's name when he welcomes them. Their words are in src/words/choices.json. Both are silent, so they are never asked in
// the middle of a stream: they sit in Preferences > Streaming.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

/** Whether Quill may say the name of somebody he welcomes: said straight out (the default), after a question to you, or never. */
export const NAMES_CHOICE = 'quillreacts.names';

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
  {
    id: NAMES_CHOICE,
    title: choiceWord('choice.quillreacts.names.title'),
    question: choiceWord('choice.quillreacts.names.question'),
    options: [
      { value: 'say', label: choiceWord('choice.quillreacts.names.say.label'), detail: choiceWord('choice.quillreacts.names.say.detail'), did: choiceWord('choice.quillreacts.names.say.did') },
      { value: 'ask', label: choiceWord('choice.quillreacts.names.ask.label'), detail: choiceWord('choice.quillreacts.names.ask.detail'), did: choiceWord('choice.quillreacts.names.ask.did') },
      { value: 'never', label: choiceWord('choice.quillreacts.names.never.label'), detail: choiceWord('choice.quillreacts.names.never.detail'), did: choiceWord('choice.quillreacts.names.never.did') },
    ],
    default: 'say',
    category: 'Streaming',
    help: 'quill-welcomes',
    silent: true,
  },
];
