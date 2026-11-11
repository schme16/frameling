// Timeline behaviours people like differently. Asked the first time, then remembered (Preferences > Behaviour).
import { registerChoice } from '../core/choices';

export type NewKeyChoice = 'blank' | 'copy';
export type HoldChoice = 'push' | 'cover';
export type FrameScopeChoice = 'all' | 'layer';

registerChoice<NewKeyChoice>({
  id: 'timeline.newKey',
  title: 'New drawing (N)',
  question: 'When you make a new drawing on a frame, should it start blank or as a copy of the drawing that was there?',
  options: [
    { value: 'blank', label: 'Start blank', detail: 'A clean page. The onion skin shows the last drawing faintly, so you can draw over it like a flipbook.' },
    { value: 'copy', label: 'Start as a copy', detail: 'Begin with the last drawing and change a little of it. Handy for small movements.' },
  ],
  default: 'blank',
  category: 'Timeline',
  help: 'timeline-frames',
});

registerChoice<HoldChoice>({
  id: 'timeline.holdLonger',
  title: 'Holding a drawing longer',
  question: 'When you make a drawing stay on screen for more frames, what should happen to the drawings after it?',
  options: [
    { value: 'push', label: 'Move them later', detail: 'Nothing is lost. The animation gets longer.' },
    { value: 'cover', label: 'Cover them', detail: 'The animation stays the same length. The drawings after it are shortened or covered.' },
  ],
  default: 'push',
  category: 'Timeline',
  help: 'timeline-frames',
});

registerChoice<FrameScopeChoice>({
  id: 'timeline.frameScope',
  title: 'Adding or removing a frame',
  question: 'When you add or remove a frame, should it happen on every layer, or only the layer you are on?',
  options: [
    { value: 'all', label: 'Every layer', detail: 'Like adding a page to the whole flipbook. Layers stay in step. Hold Alt to do just one layer.' },
    { value: 'layer', label: 'Just this layer', detail: 'Only the selected layer changes. Hold Alt to do every layer.' },
  ],
  default: 'all',
  category: 'Timeline',
  help: 'timeline-frames',
});

/** "Hold longer" choice in the words the edit code uses. */
export const clashFor = (c: HoldChoice): 'push' | 'trim' => (c === 'cover' ? 'trim' : 'push');
