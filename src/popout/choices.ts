// The picture window's two remembered choices (see core/choices.ts). Preferences > Behaviour lists them. They are only asked
// when they matter: a drawing with no camera never asks about the camera, one with no marks never asks about marks.
import { registerChoice } from '../core/choices';
import type { CameraChoice, MarksChoice } from './show';
import { choiceWord } from '../words/choices';

registerChoice<CameraChoice>({
  id: 'popout.camera',
  title: choiceWord('choice.popout.camera.title'),
  question: choiceWord('choice.popout.camera.question'),
  category: 'Canvas',
  default: 'camera',
  help: 'canvas-popout',
  options: [
    { value: 'camera', label: choiceWord('choice.popout.camera.camera.label'), detail: choiceWord('choice.popout.camera.camera.detail'), did: choiceWord('choice.popout.camera.camera.did') },
    { value: 'same', label: choiceWord('choice.popout.camera.same.label'), detail: choiceWord('choice.popout.camera.same.detail'), did: choiceWord('choice.popout.camera.same.did') },
  ],
});

registerChoice<MarksChoice>({
  id: 'popout.marks',
  title: choiceWord('choice.popout.marks.title'),
  question: choiceWord('choice.popout.marks.question'),
  category: 'Canvas',
  default: 'hide',
  help: 'canvas-popout',
  options: [
    { value: 'hide', label: choiceWord('choice.popout.marks.hide.label'), detail: choiceWord('choice.popout.marks.hide.detail'), did: choiceWord('choice.popout.marks.hide.did') },
    { value: 'show', label: choiceWord('choice.popout.marks.show.label'), detail: choiceWord('choice.popout.marks.show.detail'), did: choiceWord('choice.popout.marks.show.did') },
  ],
});
