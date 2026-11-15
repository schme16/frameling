// The two things here with two reasonable answers: whether Quill is on the overlay, and whether a prompt you pull goes
// up straight away or waits for you. Both silent, so neither is asked in the middle of a stream: they sit in
// Preferences > Behaviour. Their words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const overlayChoices: ChoiceDef<string>[] = [
  {
    id: 'streamoverlay.quill',
    title: choiceWord('choice.streamoverlay.quill.title'),
    question: choiceWord('choice.streamoverlay.quill.question'),
    options: [
      { value: 'show', label: choiceWord('choice.streamoverlay.quill.show.label'), detail: choiceWord('choice.streamoverlay.quill.show.detail'), did: choiceWord('choice.streamoverlay.quill.show.did') },
      { value: 'hide', label: choiceWord('choice.streamoverlay.quill.hide.label'), detail: choiceWord('choice.streamoverlay.quill.hide.detail'), did: choiceWord('choice.streamoverlay.quill.hide.did') },
    ],
    default: 'show',
    category: 'Streaming',
    help: 'stream-overlay',
    silent: true,
  },
  {
    id: 'streamoverlay.prompt',
    title: choiceWord('choice.streamoverlay.prompt.title'),
    question: choiceWord('choice.streamoverlay.prompt.question'),
    options: [
      { value: 'ask', label: choiceWord('choice.streamoverlay.prompt.ask.label'), detail: choiceWord('choice.streamoverlay.prompt.ask.detail'), did: choiceWord('choice.streamoverlay.prompt.ask.did') },
      { value: 'now', label: choiceWord('choice.streamoverlay.prompt.now.label'), detail: choiceWord('choice.streamoverlay.prompt.now.detail'), did: choiceWord('choice.streamoverlay.prompt.now.did') },
    ],
    default: 'ask',
    category: 'Streaming',
    help: 'stream-overlay',
    silent: true,
  },
];
