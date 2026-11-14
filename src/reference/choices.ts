// Reference pictures' remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type DropChoice = 'reference' | 'pixel';

registerChoice<DropChoice>({
  id: 'reference.drop',
  title: choiceWord('choice.reference.drop.title'),
  question: choiceWord('choice.reference.drop.question'),
  category: 'Files',
  default: 'reference',
  help: 'Several pictures at once, GIFs and sprite sheets always open the pixel picture window. File > Import has both ways whenever you want the other one.',
  options: [
    { value: 'reference', label: choiceWord('choice.reference.drop.reference.label'), detail: choiceWord('choice.reference.drop.reference.detail') },
    { value: 'pixel', label: choiceWord('choice.reference.drop.pixel.label'), detail: choiceWord('choice.reference.drop.pixel.detail') },
  ],
});

export type LongVideoChoice = 'extend' | 'keep';

registerChoice<LongVideoChoice>({
  id: 'reference.longVideo',
  title: choiceWord('choice.reference.longVideo.title'),
  question: choiceWord('choice.reference.longVideo.question'),
  category: 'Files',
  default: 'extend',
  help: 'Frames added this way are empty, ready for you to draw on. Choosing "Keep it" leaves the end of the video hanging past the last frame, where it is not shown.',
  options: [
    { value: 'extend', label: choiceWord('choice.reference.longVideo.extend.label'), detail: choiceWord('choice.reference.longVideo.extend.detail') },
    { value: 'keep', label: choiceWord('choice.reference.longVideo.keep.label'), detail: choiceWord('choice.reference.longVideo.keep.detail') },
  ],
});
