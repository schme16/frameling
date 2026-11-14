// Where something brought in from elsewhere goes: on top of the drawing that is open, or into a drawing of its own. Two
// fair answers, so it is asked once and remembered (Preferences > Behaviour). A drawing with nothing in it yet is
// replaced without asking: there is nothing to add to.
import { choose, registerChoice } from '../core/choices';
import type { Doc } from '../core/format';
import { drawingIsBlank } from '../timeline/matters';
import { choiceWord } from '../words/choices';

export type ImportWhere = 'add' | 'new';

registerChoice<ImportWhere>({
  id: 'import.where',
  title: choiceWord('choice.import.where.title'),
  question: choiceWord('choice.import.where.question'),
  category: 'Files',
  default: 'add',
  help: 'import-sequence',
  options: [
    { value: 'add', label: choiceWord('choice.import.where.add.label'), detail: choiceWord('choice.import.where.add.detail'), did: choiceWord('choice.import.where.add.did') },
    { value: 'new', label: choiceWord('choice.import.where.new.label'), detail: choiceWord('choice.import.where.new.detail'), did: choiceWord('choice.import.where.new.did') },
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
