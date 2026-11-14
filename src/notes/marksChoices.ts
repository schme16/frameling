// The marks' remembered choice (see core/choices.ts). Preferences > Behaviour lists it.
import { registerChoice } from '../core/choices';

export type MarksPinChoice = 'frame' | 'page' | 'layer';

registerChoice<MarksPinChoice>({
  id: 'marks.pin',
  title: 'Where a new mark belongs',
  question: 'A mark can belong to this frame, to the whole page, or to this layer. Which should a new mark start as?',
  category: 'Canvas',
  default: 'frame',
  help: 'A mark on a frame only shows while you are on that frame, which suits circling the thing that is wrong on that frame. A mark on the page shows all the time, for a note about the whole drawing. Marks are never part of an export either way.',
  options: [
    { value: 'frame', label: 'This frame', detail: 'It shows only on the frame you are on.', did: 'Put the mark on this frame.' },
    { value: 'page', label: 'The page', detail: 'It shows on every frame, for things about the whole drawing.', did: 'Put the mark on the page.' },
    { value: 'layer', label: 'This layer', detail: 'It shows on the frames where that layer has a drawing.', did: 'Put the mark on this layer.' },
  ],
});
