// The marks' remembered choice (see core/choices.ts). Preferences > Behaviour lists it.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type MarksPinChoice = 'frame' | 'page' | 'layer';

registerChoice<MarksPinChoice>({
  id: 'marks.pin',
  title: choiceWord('choice.marks.pin.title'),
  question: choiceWord('choice.marks.pin.question'),
  category: 'Canvas',
  default: 'frame',
  help: 'A mark on a frame only shows while you are on that frame, which suits circling the thing that is wrong on that frame. A mark on the page shows all the time, for a note about the whole drawing. Marks are never part of an export either way.',
  options: [
    { value: 'frame', label: choiceWord('choice.marks.pin.frame.label'), detail: choiceWord('choice.marks.pin.frame.detail'), did: choiceWord('choice.marks.pin.frame.did') },
    { value: 'page', label: choiceWord('choice.marks.pin.page.label'), detail: choiceWord('choice.marks.pin.page.detail'), did: choiceWord('choice.marks.pin.page.did') },
    { value: 'layer', label: choiceWord('choice.marks.pin.layer.label'), detail: choiceWord('choice.marks.pin.layer.detail'), did: choiceWord('choice.marks.pin.layer.did') },
  ],
});
