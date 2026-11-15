// The two choices Twitch asks about. Their words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const twitchChoices: ChoiceDef<string>[] = [
  {
    id: 'twitch.starter',
    title: choiceWord('choice.twitch.starter.title'),
    question: choiceWord('choice.twitch.starter.question'),
    options: [
      { value: 'suggest', label: choiceWord('choice.twitch.starter.suggest.label'), detail: choiceWord('choice.twitch.starter.suggest.detail'), did: choiceWord('choice.twitch.starter.suggest.did') },
      { value: 'empty', label: choiceWord('choice.twitch.starter.empty.label'), detail: choiceWord('choice.twitch.starter.empty.detail'), did: choiceWord('choice.twitch.starter.empty.did') },
    ],
    default: 'suggest',
    category: 'Streaming',
    help: 'twitch',
  },
  {
    id: 'twitch.refusedNote',
    title: choiceWord('choice.twitch.refusedNote.title'),
    question: choiceWord('choice.twitch.refusedNote.question'),
    options: [
      { value: 'count', label: choiceWord('choice.twitch.refusedNote.count.label'), detail: choiceWord('choice.twitch.refusedNote.count.detail'), did: choiceWord('choice.twitch.refusedNote.count.did') },
      { value: 'toast', label: choiceWord('choice.twitch.refusedNote.toast.label'), detail: choiceWord('choice.twitch.refusedNote.toast.detail'), did: choiceWord('choice.twitch.refusedNote.toast.did') },
    ],
    default: 'count',
    // A preference, not a question: it must never pop up in the middle of a stream.
    silent: true,
    category: 'Streaming',
    help: 'twitch',
  },
];
