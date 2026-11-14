// The picture window's two remembered choices (see core/choices.ts). Preferences > Behaviour lists them. They are only asked
// when they matter: a drawing with no camera never asks about the camera, one with no marks never asks about marks.
import { registerChoice } from '../core/choices';
import type { CameraChoice, MarksChoice } from './show';

registerChoice<CameraChoice>({
  id: 'popout.camera',
  title: 'Second window and the camera',
  question: 'This drawing has a camera. In the second window, should the picture be what the camera sees, or the same as your drawing window?',
  category: 'Canvas',
  default: 'camera',
  help: 'canvas-popout',
  options: [
    { value: 'camera', label: 'What the camera sees', detail: 'The finished picture, as an export would show it, even while you work on the whole page.', did: 'The second window shows what the camera sees.' },
    { value: 'same', label: 'Same as my drawing window', detail: 'It looks through the camera when your drawing window does, and shows the whole page when it does.', did: 'The second window shows what your drawing window shows.' },
  ],
});

registerChoice<MarksChoice>({
  id: 'popout.marks',
  title: 'Second window and marks',
  question: 'This drawing has marks (arrows, circles and words you drew over it). Should the second window show them?',
  category: 'Canvas',
  default: 'hide',
  help: 'canvas-popout',
  options: [
    { value: 'hide', label: 'Hide them', detail: 'The second window shows the picture only, clean, like an export.', did: 'The second window hides marks.' },
    { value: 'show', label: 'Show them', detail: 'Marks sit over the picture while it is still. They never show while it plays or through the camera.', did: 'The second window shows marks.' },
  ],
});
