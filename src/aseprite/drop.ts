// What start-up needs of Aseprite files without the reader: the file ending, the drop choice and the file filters.
import { registerChoice } from '../core/choices';

export const ASE_EXT = /\.(aseprite|ase)$/i;
export const ASE_FILTERS = [{ name: 'Aseprite files', extensions: ['aseprite', 'ase'] }];

export type DropChoice = 'open' | 'add';

registerChoice<DropChoice>({
  id: 'aseprite.drop',
  title: 'An Aseprite file dropped on the window',
  question: 'You dropped an Aseprite file. What should Frameling do with it?',
  category: 'Files',
  default: 'open',
  help: 'Open it as a new drawing, or add its layers and frames to the drawing you have open. File > Import > Aseprite file does the adding any time.',
  options: [
    { value: 'open', label: 'Open it as a new drawing', detail: 'Asks to save changes to the open drawing first.' },
    { value: 'add', label: 'Add it to this drawing', detail: 'Its layers go on top, its tiles and colours join yours.' },
  ],
});
