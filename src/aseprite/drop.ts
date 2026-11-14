// What start-up needs of Aseprite files without the reader: the file ending, the drop choice and the file filters.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export const ASE_EXT = /\.(aseprite|ase)$/i;
export const ASE_FILTERS = [{ name: 'Aseprite files', extensions: ['aseprite', 'ase'] }];

export type DropChoice = 'open' | 'add';

registerChoice<DropChoice>({
  id: 'aseprite.drop',
  title: choiceWord('choice.aseprite.drop.title'),
  question: choiceWord('choice.aseprite.drop.question'),
  category: 'Files',
  default: 'open',
  help: 'Open it as a new drawing, or add its layers and frames to the drawing you have open. File > Import > Aseprite file does the adding any time.',
  options: [
    { value: 'open', label: choiceWord('choice.aseprite.drop.open.label'), detail: choiceWord('choice.aseprite.drop.open.detail') },
    { value: 'add', label: choiceWord('choice.aseprite.drop.add.label'), detail: choiceWord('choice.aseprite.drop.add.detail') },
  ],
});
