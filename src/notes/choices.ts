// Notes' remembered choice (see core/choices.ts). Preferences > Behaviour lists it.
import { registerChoice } from '../core/choices';

export type PinChoice = 'frame' | 'page' | 'layer';

registerChoice<PinChoice>({
  id: 'notes.pin',
  title: 'Where a new note belongs',
  question: 'A note can belong to this frame, to the whole page, or to this layer. Which should a new note start as?',
  category: 'Canvas',
  default: 'frame',
  help: 'You can move any note to the page, a frame or a layer later, from its card. A note on a frame only shows while you are on that frame. A note on the page shows all the time.',
  options: [
    { value: 'frame', label: 'This frame', detail: 'It shows only on the frame you are on, and the timeline marks the frame.', did: 'Pinned the note to this frame.' },
    { value: 'page', label: 'The page', detail: 'It shows on every frame, for things about the whole drawing.', did: 'Put the note on the page.' },
    { value: 'layer', label: 'This layer', detail: 'It shows on the frames where that layer has a drawing.', did: 'Pinned the note to this layer.' },
  ],
});
