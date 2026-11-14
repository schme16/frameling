// Where something brought in from elsewhere goes: on top of the drawing that is open, or into a drawing of its own. Two
// fair answers, so it is asked once and remembered (Preferences > Behaviour). A drawing with nothing in it yet is
// replaced without asking: there is nothing to add to.
import { choose, registerChoice } from '../core/choices';
import type { Doc } from '../core/format';
import { drawingIsBlank } from '../timeline/matters';

export type ImportWhere = 'add' | 'new';

registerChoice<ImportWhere>({
  id: 'import.where',
  title: 'Bringing in a sequence, an SVG or a layered file',
  question: 'Where should it go?',
  category: 'Files',
  default: 'add',
  help: 'import-sequence',
  options: [
    { value: 'add', label: 'Add it to this drawing', detail: 'Its layers go on top of yours, as one undo step.', did: 'Added it to this drawing.' },
    { value: 'new', label: 'Open it as a new drawing', detail: 'Asks to save changes to the open drawing first.', did: 'Opened it as a new drawing.' },
  ],
});

/** Whether there is anything drawn yet: a blank page has nothing to add to. */
export function hasDrawing(doc: Doc): boolean {
  return Object.values(doc.drawings).some((d) => !drawingIsBlank(d));
}

/** The answer for this moment: new for a blank page, else what was remembered or asked. */
export async function whereToPut(doc: Doc): Promise<ImportWhere> {
  if (!hasDrawing(doc)) return 'new';
  return choose<ImportWhere>('import.where');
}
