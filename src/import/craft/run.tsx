// Bringing a VectorCraft file in: as a drawing of its own (File > Open) or on top of the open one (File > Import). A file
// with one artboard asks once where it should go, like an SVG does; a file with several artboards is always a drawing of
// its own, since a drawing has only the one canvas to put them on.
import { store } from '../../core/store';
import type { Id } from '../../core/format';
import { baseName, stripExt } from '../../io/desktop';
import { askAboutUnsavedChanges } from '../../io/document';
import { notify } from '../../io/notify';
import { addPieces, STILL_LENGTH } from '../pieces';
import { pickFiles } from '../pick';
import { reportImport } from '../report';
import { hasDrawing, whereToPut, type ImportWhere } from '../where';
import { craftCounts, craftDoc, craftPieces } from './build';
import { CraftProblem, readVectorcraft, VECTORCRAFT_ACCEPT, type VectorcraftFile } from './vectorcraft';
import { plural } from '../layered/model';
import { displayFile } from '../../core/streamSafe';

/** The sentence under the toast: what came in. Pure. */
export function craftHeadline(name: string, where: ImportWhere, file: VectorcraftFile, scaled: number | undefined): string {
  const boards = file.boards.length;
  const c = craftCounts(file, where === 'new');
  const bits = [plural(c.shapes - c.text, 'shape')];
  if (c.text) bits.push(plural(c.text, 'piece of text', 'pieces of text'));
  const layers = file.boards[0].layers.length;
  const where2 = boards > 1 && where === 'new' ? `${plural(boards, 'artboard')}` : `${plural(layers, 'layer')}`;
  const sw = file.swatches.length ? ` ${plural(file.swatches.length, 'colour')} joined the swatches.` : '';
  const scaledNote = scaled ? ` It was made ${Math.round(scaled * 100)}% of its size to fit.` : '';
  return `${where === 'add' ? 'Added' : 'Opened'} "${name}": ${bits.join(' and ')} on ${where2}.${sw}${scaledNote}`;
}

/** Reads the bytes and brings the drawing in. `asked` false means File > Open, which always opens a new drawing. */
export async function importVectorcraftBytes(bytes: Uint8Array, path: string, asked = true): Promise<boolean> {
  let file: VectorcraftFile;
  try {
    file = readVectorcraft(bytes);
  } catch (e) {
    notify(e instanceof CraftProblem ? e.message : "Frameling couldn't read that file.", 'error', undefined, 10000);
    return false;
  }
  const name = file.title.trim() || stripExt(baseName(path)) || 'Drawing';
  if (!file.boards.some((b) => b.layers.some((l) => l.shapes.length))) {
    notify(`There is nothing drawn in "${displayFile(path)}" that Frameling can bring in.${file.left.length ? ' ' + file.left[0] : ''}`, 'warn', undefined, 10000);
    return false;
  }
  const doc = store().get().doc;
  const several = file.boards.length > 1;
  const where: ImportWhere = several ? 'new' : asked ? await whereToPut(doc) : 'new';
  if (where === 'add' && store().nestedTag()) {
    notify('Close the symbol you are editing first, then add the drawing to this one.', 'info');
    return false;
  }
  const info = [...file.info];
  if (several && asked && hasDrawing(doc)) info.unshift(`The file has ${file.boards.length} artboards, so it opened as a drawing of its own with each artboard kept, rather than being added to the one you had open.`);
  let scale: number | undefined;
  if (where === 'add') {
    const pieces = craftPieces(file, { stage: { width: doc.width, height: doc.height }, length: doc.length });
    scale = pieces.scale;
    store().update(`Add "${name}" from "${displayFile(path)}"`, (d) => addPieces(d, pieces));
    const added = pieces.layers[pieces.layers.length - 1];
    if (added) store().setUi({ activeLayerId: added.id as Id });
  } else {
    if (hasDrawing(doc) && !(await askAboutUnsavedChanges())) return false;
    const made = craftDoc(file, name);
    scale = made.scale < 1 ? made.scale : undefined;
    // A new drawing with no file yet, so Save asks where to put it.
    store().load(made.doc, null);
    store().setUi({ dirty: true });
  }
  reportImport({ headline: craftHeadline(name, where, file, scale), left: file.left, info });
  return true;
}

export const openVectorcraftBytes = (bytes: Uint8Array, path: string): Promise<boolean> => importVectorcraftBytes(bytes, path, false);

/** File > Import > VectorCraft file: pick a file and bring it in. */
export async function pickAndImportVectorcraft(): Promise<void> {
  const [f] = await pickFiles(VECTORCRAFT_ACCEPT);
  if (f) await importVectorcraftBytes(new Uint8Array(await f.file.arrayBuffer()), f.path);
}

/** VectorCraft files dropped on the window. */
export async function dropVectorcraft(files: File[]): Promise<void> {
  for (const f of files) if (!(await importVectorcraftBytes(new Uint8Array(await f.arrayBuffer()), f.name))) break;
}
