import { withChoice } from '../core/choices';
import { clashFor, type FrameScopeChoice, type HoldChoice, type NewKeyChoice } from './choices';
/** Everything you can do from the timeline as commands: they feed the shortcuts, the palette and the tooltips. */
import { registerCommands } from '../core/registry';
import { findLayer } from '../core/doc';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import * as ops from './ops';
import * as pb from './playback';
import { setTl } from './state';

/** Runs an op and, when it was refused for a reason worth knowing, says so gently. */
export function say(o: ops.Outcome): ops.Outcome {
  if (!o.ok && o.reason && o.reason !== 'no-change') toast(ops.whyNot(o));
  return o;
}

const exposure = (n: number) => ({
  id: `timeline.hold${n}`,
  label: n === 1 ? 'Hold drawing for 1 frame (on ones)' : `Hold drawing for ${n} frames (on ${['', 'ones', 'twos', 'threes', 'fours'][n]})`,
  category: 'Timeline',
  keys: [`Alt+${n}`],
  description: `Show this drawing for ${n} frame${n === 1 ? '' : 's'} before the next one.`,
  help: 'timeline-frames',
  keywords: ['exposure', 'hold', 'twos', 'threes', 'ones', 'duration'],
  run: () => withChoice<HoldChoice>('timeline.holdLonger', (c) => void say(ops.setExposure(n, undefined, undefined, clashFor(c)))),
});

/** Adds or removes a frame on every layer or just this one, per the remembered choice (`other` flips it, for Alt). */
function frameEdit(kind: 'insert' | 'remove', other: boolean) {
  withChoice<FrameScopeChoice>('timeline.frameScope', (scope) => {
    const all = (scope === 'all') !== other;
    if (kind === 'insert') say(all ? ops.insertFrameAll() : ops.insertFrame());
    else say(all ? ops.removeFrameAll() : ops.removeFrame());
  });
}

registerCommands([
  {
    id: 'timeline.play',
    label: 'Play or pause',
    category: 'Timeline',
    keys: ['Enter'],
    description: 'Watch your animation, or stop watching it.',
    help: 'timeline-playing',
    keywords: ['preview', 'run'],
    checked: (s) => s.ui.playing,
    run: () => pb.togglePlay(),
  },
  { id: 'timeline.prevFrame', label: 'Previous frame', category: 'Timeline', keys: [','], description: 'Step back one frame.', help: 'timeline-playing', run: () => pb.stepFrame(-1) },
  { id: 'timeline.nextFrame', label: 'Next frame', category: 'Timeline', keys: ['.'], description: 'Step forward one frame.', help: 'timeline-playing', run: () => pb.stepFrame(1) },
  {
    id: 'timeline.prevKey',
    label: 'Previous drawing (key)',
    category: 'Timeline',
    keys: ['<'],
    description: 'Jump back to where the previous drawing starts on this layer. Shift+comma.',
    help: 'timeline-frames',
    keywords: ['keyframe'],
    run: () => void pb.stepKey('prev'),
  },
  {
    id: 'timeline.nextKey',
    label: 'Next drawing (key)',
    category: 'Timeline',
    keys: ['>'],
    description: 'Jump forward to where the next drawing starts on this layer. Shift+full stop.',
    help: 'timeline-frames',
    keywords: ['keyframe'],
    run: () => void pb.stepKey('next'),
  },
  { id: 'timeline.firstFrame', label: 'Go to the first frame', category: 'Timeline', keys: ['Home'], description: 'Jump to the start (or the start of the chosen clip).', help: 'timeline-playing', run: () => pb.firstFrame() },
  { id: 'timeline.lastFrame', label: 'Go to the last frame', category: 'Timeline', keys: ['End'], description: 'Jump to the end (or the end of the chosen clip).', help: 'timeline-playing', run: () => pb.lastFrame() },
  {
    id: 'timeline.toggleLoop',
    label: 'Loop playback',
    category: 'Timeline',
    description: 'Start again from the beginning when playback reaches the end.',
    help: 'timeline-playing',
    checked: (s) => s.ui.loopPlayback,
    run: () => store().setUi((ui) => ({ loopPlayback: !ui.loopPlayback })),
  },
  {
    id: 'timeline.toggleOnion',
    label: 'See the frames around this one (onion skin)',
    category: 'Timeline',
    keys: ['Shift+O'],
    description: 'Show faint ghosts of the frames before and after, to help you draw the next pose.',
    help: 'timeline-onion',
    keywords: ['onion skin', 'ghost', 'see through', 'tracing'],
    checked: (s) => s.ui.onion.enabled,
    run: () => store().setUi((ui) => ({ onion: { ...ui.onion, enabled: !ui.onion.enabled } })),
  },
  {
    id: 'timeline.newKey',
    label: 'New drawing here (new key)',
    category: 'Timeline',
    keys: ['N'],
    description: 'Start a new drawing on this frame, blank or as a copy (your choice in Preferences, Behaviour). A held drawing is split in two.',
    help: 'timeline-frames',
    keywords: ['keyframe', 'blank', 'new frame', 'empty', 'copy'],
    run: () => withChoice<NewKeyChoice>('timeline.newKey', (c) => void say(ops.newBlankKey(undefined, undefined, c === 'copy'))),
  },
  {
    id: 'timeline.duplicateKey',
    label: 'Copy this drawing to the next frame (duplicate key)',
    category: 'Timeline',
    keys: ['D'],
    // With shapes selected, Ctrl+D belongs to the canvas, and plain D stays out of its way too.
    enabled: (s) => s.ui.selection.length === 0,
    description: 'Make a copy of this drawing on the next frame, ready for you to change a little. On an empty frame, copies the last drawing to this frame.',
    help: 'timeline-frames',
    keywords: ['copy', 'clone', 'duplicate frame'],
    run: () => void say(ops.duplicateKey()),
  },
  { id: 'timeline.clearKey', label: 'Clear this drawing', category: 'Timeline', description: 'Wipe this drawing clean. The frame stays, with the same hold.', help: 'timeline-frames', keywords: ['erase', 'empty'], run: () => void say(ops.clearKey()) },
  { id: 'timeline.emptyFrame', label: 'Make these frames empty', category: 'Timeline', description: 'Take the drawing away, so these frames show nothing on this layer.', help: 'timeline-frames', run: () => void say(ops.deleteKey()) },
  {
    id: 'timeline.insertFrame',
    label: 'Add a frame (hold one longer)',
    category: 'Timeline',
    keys: ['='],
    description: 'Show this drawing for one more frame. Everything after it moves along. Every layer or just this one, as you chose; hold Alt for the other.',
    help: 'timeline-frames',
    keywords: ['insert', 'extend', 'longer'],
    run: () => frameEdit('insert', false),
  },
  {
    id: 'timeline.insertFrameOther',
    label: 'Add a frame (the other way: all layers or just this one)',
    category: 'Timeline',
    keys: ['Alt+='],
    description: 'Like Add a frame, but on every layer if you usually do one, or one layer if you usually do all.',
    help: 'timeline-frames',
    run: () => frameEdit('insert', true),
  },
  {
    id: 'timeline.removeFrame',
    label: 'Remove a frame',
    category: 'Timeline',
    keys: ['-'],
    description: 'Take one frame out. Everything after it moves back. Every layer or just this one, as you chose; hold Alt for the other.',
    help: 'timeline-frames',
    keywords: ['delete frame', 'shorter'],
    run: () => frameEdit('remove', false),
  },
  {
    id: 'timeline.removeFrameOther',
    label: 'Remove a frame (the other way: all layers or just this one)',
    category: 'Timeline',
    keys: ['Alt+-'],
    description: 'Like Remove a frame, but on every layer if you usually do one, or one layer if you usually do all.',
    help: 'timeline-frames',
    run: () => frameEdit('remove', true),
  },
  exposure(1),
  exposure(2),
  exposure(3),
  exposure(4),
  {
    id: 'timeline.addMarker',
    label: 'Add a marker here',
    category: 'Timeline',
    description: 'Name this moment (a footstep, a hit). Games and Interactives get it as an event.',
    help: 'timeline-markers',
    keywords: ['event', 'flag', 'note'],
    run: () => {
      const o = ops.addMarker();
      if (o.id) setTl({ editing: { kind: 'marker', id: o.id } });
    },
  },
  {
    id: 'layers.addVector',
    label: 'New vector layer',
    category: 'Layers',
    keys: ['Mod+Shift+N'],
    description: 'A layer for smooth, sharp drawing you can resize and edit later.',
    help: 'timeline-layers',
    keywords: ['add layer', 'drawing layer'],
    run: () => void ops.addVectorLayer(),
  },
  {
    id: 'layers.addPixel',
    label: 'New pixel layer',
    category: 'Layers',
    description: 'A layer for pixel art, drawn one square at a time.',
    help: 'timeline-layers',
    keywords: ['add layer', 'pixel art', 'sprite'],
    run: () => void ops.addPixelLayer(),
  },
  { id: 'layers.delete', label: 'Delete layer', category: 'Layers', description: 'Remove this layer and everything drawn on it. You can undo it.', help: 'timeline-layers', enabled: (s) => s.doc.layers.length > 1, run: () => void say(ops.deleteLayer()) },
  { id: 'layers.duplicate', label: 'Duplicate layer', category: 'Layers', description: 'Make a copy of this layer with all its drawings.', help: 'timeline-layers', run: () => void say(ops.duplicateLayer()) },
  { id: 'layers.up', label: 'Move layer up', category: 'Layers', description: 'Bring this layer in front of the one above.', help: 'timeline-layers', run: () => void ops.stepLayer('up') },
  { id: 'layers.down', label: 'Move layer down', category: 'Layers', description: 'Send this layer behind the one below.', help: 'timeline-layers', run: () => void ops.stepLayer('down') },
  {
    id: 'layers.toggleVisible',
    label: 'Show or hide layer',
    category: 'Layers',
    description: 'Hide the layer to look at the others. Nothing is deleted.',
    help: 'timeline-layers',
    keywords: ['eye', 'visible'],
    checked: (s) => !!findLayer(s.doc, s.ui.activeLayerId)?.visible,
    run: () => void ops.toggleLayerVisible(),
  },
  {
    id: 'layers.toggleLocked',
    label: 'Lock or unlock layer',
    category: 'Layers',
    description: 'A locked layer can not be drawn on by accident.',
    help: 'timeline-layers',
    keywords: ['padlock', 'protect'],
    checked: (s) => !!findLayer(s.doc, s.ui.activeLayerId)?.locked,
    run: () => void ops.toggleLayerLocked(),
  },
  {
    id: 'layers.toggleReference',
    label: 'Reference layer (leave out of exports)',
    category: 'Layers',
    description: 'You still see it while drawing, but videos, pictures and sprite sheets leave it out. Good for ground lines and sketches.',
    help: 'reference-layers',
    keywords: ['guide', 'guide layer', 'not exported', 'sketch', 'ground', 'helper', 'reference'],
    checked: (s) => !!findLayer(s.doc, s.ui.activeLayerId)?.reference,
    run: () => void ops.toggleLayerReference(),
  },
]);
