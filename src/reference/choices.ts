// Reference pictures' remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';

export type DropChoice = 'reference' | 'pixel';

registerChoice<DropChoice>({
  id: 'reference.drop',
  title: 'Dropping one JPG or PNG on the window',
  question: 'What should a picture dropped on the window be?',
  category: 'Files',
  default: 'reference',
  help: 'Several pictures at once, GIFs and sprite sheets always open the pixel picture window. File > Import has both ways whenever you want the other one.',
  options: [
    { value: 'reference', label: 'A reference behind my drawing', detail: 'To trace or copy from. It is never exported, and you can move, size and fade it.' },
    { value: 'pixel', label: 'Pixel art to work with', detail: 'Opens the picture window, to cut it into pixel frames or a sheet.' },
  ],
});

export type LongVideoChoice = 'extend' | 'keep';

registerChoice<LongVideoChoice>({
  id: 'reference.longVideo',
  title: 'A video longer than the animation',
  question: 'The video is longer than your animation. Make the animation as long as the video?',
  category: 'Files',
  default: 'extend',
  help: 'Frames added this way are empty, ready for you to draw on. Choosing "Keep it" leaves the end of the video hanging past the last frame, where it is not shown.',
  options: [
    { value: 'extend', label: 'Make it as long as the video', detail: 'Adds empty frames so every picture from the video has a frame to sit on.' },
    { value: 'keep', label: 'Keep my animation as it is', detail: 'The pictures that fall after the last frame are left out.' },
  ],
});
