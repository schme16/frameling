// Help for adding animation to a drawing. The words are in help.bodies.ts, loaded when Help opens.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'animation-add',
    order: 0.5,
    title: 'Add animation to a drawing',
    section: 'Animating',
    media: 'animation-add.png',
    summary: 'A drawing starts as one picture, with no timeline in the way. Add animation gives it frames, and takes nothing away.',
    keywords: ['animate', 'animation', 'add animation', 'frames', 'frame', 'timeline', 'second frame', 'new frame', 'flipbook', 'move', 'make it move', 'still', 'still picture', 'turn off animation', 'hide timeline', 'where did the timeline go', 'no timeline', 'frame rate', 'fps', 'onion skin', 'playback'],
  },
]);
