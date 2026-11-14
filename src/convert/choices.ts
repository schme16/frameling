// What the two "Turn into" dialogs start on. Each is a remembered choice (src/core/choices.ts) but a quiet one: the
// dialog itself is where you answer, the answer sticks, and Preferences > Behaviour can change it too. Nothing pops up
// a second question on top of the dialog.
import { registerChoice } from '../core/choices';
import type { LandsWhere } from './apply';
import type { PixelEdges } from './rasterize';
import type { TraceEdges, TraceLayering, TraceSplit } from './shapes';
import type { FramesWhere } from './scope';

registerChoice<LandsWhere>({
  id: 'convert.where',
  title: 'Turn into pixels or shapes: where it goes',
  question: 'When you turn shapes into pixels, or pixels into shapes, where should the result go?',
  category: 'Draw',
  default: 'beside',
  silent: true,
  help: 'Where the Turn into dialogs start: on a new layer next to the original, or in its place. A new layer is the safe one, since the original is still there.',
  options: [
    { value: 'beside', label: 'A new layer beside it', detail: 'The original stays (it is hidden when all of it was turned), so you can compare or go back.' },
    { value: 'replace', label: 'In its place', detail: 'What was turned comes out of the original, and the result takes its place.' },
  ],
});

registerChoice<FramesWhere>({
  id: 'convert.frames',
  title: 'Turn into pixels or shapes: how many frames',
  question: 'How many frames should it reach?',
  category: 'Draw',
  default: 'this',
  silent: true,
  help: 'Where the Turn into dialogs start: just the drawing you are on, the clip you are in, or every frame. Every frame can be slow, so this one starts small. With something selected it is always just this drawing.',
  options: [
    { value: 'this', label: 'This drawing', detail: 'Just the drawing on this layer at this frame.' },
    { value: 'clip', label: 'The clip', detail: 'Every frame of the clip you are in.' },
    { value: 'all', label: 'Every frame', detail: 'The whole layer. Slow for a long animation.' },
  ],
});

registerChoice<'follow' | PixelEdges>({
  id: 'convert.edges.pixels',
  title: 'Turn into pixels: edges',
  question: 'Should the pixels have hard edges or soft ones?',
  category: 'Draw',
  default: 'follow',
  silent: true,
  help: 'Hard edges: every pixel is fully painted or empty, the pixel art look. Soft edges: the edge pixels are partly see-through, so the shape looks smooth. Follow the drawing picks hard for chunky pixels and pixel art, soft for fine pixels on vector art.',
  options: [
    { value: 'follow', label: 'Follow the drawing', detail: 'Hard for chunky pixels and pixel art, soft for fine pixels on a vector drawing.' },
    { value: 'hard', label: 'Hard edges', detail: 'Every pixel is painted or empty.' },
    { value: 'smooth', label: 'Soft edges', detail: 'Edge pixels are partly see-through.' },
  ],
});

registerChoice<'follow' | TraceEdges>({
  id: 'convert.edges.shapes',
  title: 'Turn into shapes: edges',
  question: 'Should the shapes keep the pixel stair steps, or be rounded into curves?',
  category: 'Draw',
  default: 'follow',
  silent: true,
  help: 'Keep the steps: the shapes follow the pixel edges exactly, right for pixel art. Curves: the steps are rounded off, right for a scanned drawing. Follow the drawing picks steps for chunky pixel art and small flat-colour pictures, curves for the rest.',
  options: [
    { value: 'follow', label: 'Follow the drawing', detail: 'Steps for pixel art, curves for everything else.' },
    { value: 'hug', label: 'Keep the pixel steps', detail: 'Straight edges exactly where the pixels were.' },
    { value: 'smooth', label: 'Round into curves', detail: 'Smooth edges with far fewer points.' },
  ],
});

registerChoice<TraceLayering>({
  id: 'convert.layering',
  title: 'Turn into shapes: stacking',
  question: 'Should each colour sit on top of the one below, or beside it?',
  category: 'Draw',
  default: 'stacked',
  silent: true,
  help: 'Stacked: every colour is a shape that also covers the colours above it, so there are never thin gaps between shapes. Side by side: each shape is only its own colour, which is cleaner to pull apart but can show hairlines between neighbours.',
  options: [
    { value: 'stacked', label: 'Stacked, no gaps', detail: 'Each colour also sits under the ones above it.' },
    { value: 'pieces', label: 'Side by side', detail: 'Each shape is only its own colour.' },
  ],
});

registerChoice<TraceSplit>({
  id: 'convert.split',
  title: 'Turn into shapes: one shape for',
  question: 'Should each colour be one shape, or each blob of colour?',
  category: 'Draw',
  default: 'colour',
  silent: true,
  help: 'One shape per colour keeps the layer tidy and is best for pixel art. One per blob gives you every separate piece to move on its own.',
  options: [
    { value: 'colour', label: 'Each colour', detail: 'All the red is one shape, even in two places.' },
    { value: 'blob', label: 'Each blob', detail: 'Every separate piece is its own shape.' },
  ],
});
