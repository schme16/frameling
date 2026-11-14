// What the two "Turn into" dialogs start on. Each is a remembered choice (src/core/choices.ts) but a quiet one: the
// dialog itself is where you answer, the answer sticks, and Preferences > Behaviour can change it too. Nothing pops up
// a second question on top of the dialog.
import { registerChoice } from '../core/choices';
import type { LandsWhere } from './apply';
import type { PixelEdges } from './rasterize';
import type { TraceEdges, TraceLayering, TraceSplit } from './shapes';
import type { FramesWhere } from './scope';
import { choiceWord } from '../words/choices';

registerChoice<LandsWhere>({
  id: 'convert.where',
  title: choiceWord('choice.convert.where.title'),
  question: choiceWord('choice.convert.where.question'),
  category: 'Draw',
  default: 'beside',
  silent: true,
  help: 'Where the Turn into dialogs start: on a new layer next to the original, or in its place. A new layer is the safe one, since the original is still there.',
  options: [
    { value: 'beside', label: choiceWord('choice.convert.where.beside.label'), detail: choiceWord('choice.convert.where.beside.detail') },
    { value: 'replace', label: choiceWord('choice.convert.where.replace.label'), detail: choiceWord('choice.convert.where.replace.detail') },
  ],
});

registerChoice<FramesWhere>({
  id: 'convert.frames',
  title: choiceWord('choice.convert.frames.title'),
  question: choiceWord('choice.convert.frames.question'),
  category: 'Draw',
  default: 'this',
  silent: true,
  help: 'Where the Turn into dialogs start: just the drawing you are on, the clip you are in, or every frame. Every frame can be slow, so this one starts small. With something selected it is always just this drawing.',
  options: [
    { value: 'this', label: choiceWord('choice.convert.frames.this.label'), detail: choiceWord('choice.convert.frames.this.detail') },
    { value: 'clip', label: choiceWord('choice.convert.frames.clip.label'), detail: choiceWord('choice.convert.frames.clip.detail') },
    { value: 'all', label: choiceWord('choice.convert.frames.all.label'), detail: choiceWord('choice.convert.frames.all.detail') },
  ],
});

registerChoice<'follow' | PixelEdges>({
  id: 'convert.edges.pixels',
  title: choiceWord('choice.convert.edges.pixels.title'),
  question: choiceWord('choice.convert.edges.pixels.question'),
  category: 'Draw',
  default: 'follow',
  silent: true,
  help: 'Hard edges: every pixel is fully painted or empty, the pixel art look. Soft edges: the edge pixels are partly see-through, so the shape looks smooth. Follow the drawing picks hard for chunky pixels and pixel art, soft for fine pixels on vector art.',
  options: [
    { value: 'follow', label: choiceWord('choice.convert.edges.pixels.follow.label'), detail: choiceWord('choice.convert.edges.pixels.follow.detail') },
    { value: 'hard', label: choiceWord('choice.convert.edges.pixels.hard.label'), detail: choiceWord('choice.convert.edges.pixels.hard.detail') },
    { value: 'smooth', label: choiceWord('choice.convert.edges.pixels.smooth.label'), detail: choiceWord('choice.convert.edges.pixels.smooth.detail') },
  ],
});

registerChoice<'follow' | TraceEdges>({
  id: 'convert.edges.shapes',
  title: choiceWord('choice.convert.edges.shapes.title'),
  question: choiceWord('choice.convert.edges.shapes.question'),
  category: 'Draw',
  default: 'follow',
  silent: true,
  help: 'Keep the steps: the shapes follow the pixel edges exactly, right for pixel art. Curves: the steps are rounded off, right for a scanned drawing. Follow the drawing picks steps for chunky pixel art and small flat-colour pictures, curves for the rest.',
  options: [
    { value: 'follow', label: choiceWord('choice.convert.edges.shapes.follow.label'), detail: choiceWord('choice.convert.edges.shapes.follow.detail') },
    { value: 'hug', label: choiceWord('choice.convert.edges.shapes.hug.label'), detail: choiceWord('choice.convert.edges.shapes.hug.detail') },
    { value: 'smooth', label: choiceWord('choice.convert.edges.shapes.smooth.label'), detail: choiceWord('choice.convert.edges.shapes.smooth.detail') },
  ],
});

registerChoice<TraceLayering>({
  id: 'convert.layering',
  title: choiceWord('choice.convert.layering.title'),
  question: choiceWord('choice.convert.layering.question'),
  category: 'Draw',
  default: 'stacked',
  silent: true,
  help: 'Stacked: every colour is a shape that also covers the colours above it, so there are never thin gaps between shapes. Side by side: each shape is only its own colour, which is cleaner to pull apart but can show hairlines between neighbours.',
  options: [
    { value: 'stacked', label: choiceWord('choice.convert.layering.stacked.label'), detail: choiceWord('choice.convert.layering.stacked.detail') },
    { value: 'pieces', label: choiceWord('choice.convert.layering.pieces.label'), detail: choiceWord('choice.convert.layering.pieces.detail') },
  ],
});

registerChoice<TraceSplit>({
  id: 'convert.split',
  title: choiceWord('choice.convert.split.title'),
  question: choiceWord('choice.convert.split.question'),
  category: 'Draw',
  default: 'colour',
  silent: true,
  help: 'One shape per colour keeps the layer tidy and is best for pixel art. One per blob gives you every separate piece to move on its own.',
  options: [
    { value: 'colour', label: choiceWord('choice.convert.split.colour.label'), detail: choiceWord('choice.convert.split.colour.detail') },
    { value: 'blob', label: choiceWord('choice.convert.split.blob.label'), detail: choiceWord('choice.convert.split.blob.detail') },
  ],
});
