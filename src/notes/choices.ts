// Notes' remembered choice (see core/choices.ts). Preferences > Behaviour lists it.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type PinChoice = 'frame' | 'page' | 'layer';

registerChoice<PinChoice>({
  id: 'notes.pin',
  title: choiceWord('choice.notes.pin.title'),
  question: choiceWord('choice.notes.pin.question'),
  category: 'Canvas',
  default: 'frame',
  help: 'You can move any note to the page, a frame or a layer later, from its card. A note on a frame only shows while you are on that frame. A note on the page shows all the time.',
  options: [
    { value: 'frame', label: choiceWord('choice.notes.pin.frame.label'), detail: choiceWord('choice.notes.pin.frame.detail'), did: choiceWord('choice.notes.pin.frame.did') },
    { value: 'page', label: choiceWord('choice.notes.pin.page.label'), detail: choiceWord('choice.notes.pin.page.detail'), did: choiceWord('choice.notes.pin.page.did') },
    { value: 'layer', label: choiceWord('choice.notes.pin.layer.label'), detail: choiceWord('choice.notes.pin.layer.detail'), did: choiceWord('choice.notes.pin.layer.did') },
  ],
});
