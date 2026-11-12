// Commands for the four ways to build a sprite: start one, change how it is built, make it move.
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { openPixelChooser } from './Chooser';
import { openChangeWay } from './ChangeWay';
import { changeWay, makeItMove } from './wayOps';
import { boardCount, isPixelDoc, wayOf } from './way';

const pixelDoc = () => isPixelDoc(store().get().doc);

registerCommands([
  {
    id: 'pixel.new',
    label: 'New pixel art...',
    category: 'File',
    description: 'Quill asks what you are making: one picture, an animation, frames on boards or sprites on a sheet. Then you pick a size.',
    help: 'pixel-new',
    keywords: ['pixel', 'sprite', 'new', 'chooser', 'aseprite', 'animation', 'tile', 'sheet', 'game'],
    run: openPixelChooser,
  },
  {
    id: 'pixel.changeWay',
    label: 'Change how this sprite is built...',
    category: 'Pixel',
    description: 'Turn one picture into an animation, timeline frames into boards, boards back into frames, and more. One undo step.',
    help: 'pixel-ways',
    keywords: ['way', 'mode', 'convert', 'frames', 'boards', 'artboards', 'timeline', 'sprite sheet', 'picture', 'animation'],
    enabled: pixelDoc,
    run: openChangeWay,
  },
  {
    id: 'pixel.makeItMove',
    label: 'Make it move',
    category: 'Pixel',
    description: 'Turn a one-picture sprite into an animation: the timeline comes back with a few frames to draw on.',
    help: 'pixel-ways',
    keywords: ['animate', 'frames', 'timeline', 'one picture', 'animation'],
    enabled: () => pixelDoc() && wayOf(store().get().doc) === 'picture',
    run: makeItMove,
  },
  {
    id: 'pixel.framesToBoards',
    label: 'Turn timeline frames into boards',
    category: 'Pixel',
    description: 'Every frame of the timeline becomes its own board, side by side, named Frame 1, Frame 2 and so on.',
    help: 'pixel-ways',
    keywords: ['frames', 'boards', 'artboards', 'split', 'convert'],
    enabled: () => pixelDoc() && boardCount(store().get().doc) <= 1 && store().get().doc.length > 1,
    run: () => void changeWay('boards'),
  },
  {
    id: 'pixel.boardsToFrames',
    label: 'Turn boards into timeline frames',
    category: 'Pixel',
    description: 'Every board becomes frames on one timeline, in order. The boards must all be the same size.',
    help: 'pixel-ways',
    keywords: ['boards', 'artboards', 'frames', 'timeline', 'join', 'convert'],
    enabled: () => pixelDoc() && boardCount(store().get().doc) > 1,
    run: () => void changeWay('animation'),
  },
]);
