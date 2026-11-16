// Repeating a shape: rows and columns, a ring round a centre you can snap, or a mirror image across a line you can snap.
// The copies are made when the picture is drawn (src/core/repeats.ts), so the original stays the one thing you edit.
// This area holds the commands, the panel, the Repeat tool for the stage, and the help.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerPanel } from '../core/registry';
import { say } from '../core/reasons';
import { activeLayer } from '../tools/edit';
import { pickTool } from '../tools/pick';
import './tool';
import './help';
import { currentRepeat, pickedRepeatable, repeatAsGrid, repeatAsMirror, repeatAsRing, takeRepeatOff, turnIntoShapes } from './ops';
import { openPanel } from './show';

registerPanel({ id: 'repeat', title: 'Repeat', icon: 'repeat', component: lazyPanel(() => import('./RepeatControls').then((m) => m.RepeatControls)), zone: 'right', order: 38, help: 'repeat' });

const canPick = () => pickedRepeatable().length > 0;
const needShape = say('Select a shape on a vector layer first.');
const hasRepeat = () => !!currentRepeat();
const noRepeat = say('Select a shape that repeats first.');
const KEYWORDS = ['repeat', 'pattern', 'array', 'duplicate many', 'copies', 'copy many', 'tile', 'row', 'column', 'grid', 'ring', 'circle', 'circular', 'polar', 'radial', 'round', 'mirror', 'symmetry', 'reflect', 'flip', 'kaleidoscope', 'wheel', 'petals', 'fan'];

registerCommands([
  {
    id: 'repeat.grid',
    label: 'Repeat in rows and columns (grid pattern)',
    category: 'Vector',
    keys: ['Alt+Shift+G'],
    description: 'Make so many copies across and so many down of the picked shapes. The copies stay joined to the original, so change it and they all follow. Change the count and the step any time.',
    help: 'repeat',
    keywords: [...KEYWORDS, 'rectangular pattern', 'rectangular array', 'grid pattern', 'tiles'],
    enabled: canPick,
    reason: needShape,
    run: () => {
      if (repeatAsGrid()) openPanel();
    },
  },
  {
    id: 'repeat.ring',
    label: 'Repeat round a ring (circular pattern)',
    category: 'Vector',
    keys: ['Alt+Shift+O'],
    description: 'Make copies of the picked shapes round a centre, a full ring or a fan. Drag the centre on the stage and it snaps to points, guides and the page middle. The copies stay joined to the original.',
    help: 'repeat',
    keywords: [...KEYWORDS, 'circular pattern', 'circular array', 'polar array', 'radial repeat', 'around a point'],
    enabled: canPick,
    reason: needShape,
    run: () => repeatAsRing(openPanel),
  },
  {
    id: 'repeat.mirror',
    label: 'Repeat as a mirror image (mirror a shape)',
    category: 'Vector',
    keys: ['Alt+Shift+F'],
    description: 'Add a flipped copy of the picked shapes across a line, or through a point. Drag the line on the stage and it snaps to guides, line ends and points. The copy stays joined to the original.',
    help: 'repeat',
    keywords: [...KEYWORDS, 'mirror image', 'mirror a shape', 'flip copy', 'reflect', 'symmetrical', 'other side', 'across a line'],
    enabled: canPick,
    reason: needShape,
    run: () => {
      if (repeatAsMirror()) openPanel();
    },
  },
  {
    id: 'repeat.tool',
    label: 'Move a repeat’s centre, line or step on the stage (Repeat tool)',
    category: 'Vector',
    description: 'Pick the Repeat tool: drag a ring’s centre, a mirror line, or a grid’s step on the stage, and watch every copy follow. They snap to points, guides and the page.',
    help: 'repeat',
    keywords: [...KEYWORDS, 'repeat tool', 'move the centre', 'move the mirror', 'pick the centre', 'snap the centre'],
    enabled: () => activeLayer().layer?.kind === 'vector',
    reason: say('Pick a vector layer first, because repeats are made of vector shapes.'),
    run: () => pickTool('repeat'),
  },
  {
    id: 'repeat.expand',
    label: 'Turn a repeat into shapes of their own',
    category: 'Vector',
    description: 'Make every copy of a repeat a shape of its own, so you can pick and change each one. The repeat is gone after it. Undo brings it back.',
    help: 'repeat',
    keywords: ['expand', 'expand repeat', 'release', 'break apart', 'make real', 'bake', 'apply', 'ungroup copies', 'edit one copy', 'copies into shapes'],
    enabled: hasRepeat,
    reason: noRepeat,
    run: turnIntoShapes,
  },
  {
    id: 'repeat.off',
    label: 'Take the repeat off a shape',
    category: 'Vector',
    description: 'Keep the shape and drop all its copies.',
    help: 'repeat',
    keywords: ['remove repeat', 'stop repeating', 'undo pattern', 'delete copies', 'clear repeat', 'no repeat', 'release'],
    enabled: hasRepeat,
    reason: noRepeat,
    run: takeRepeatOff,
  },
]);
