// Bringing a layered file in (Photoshop .psd, OpenRaster .ora): as a new drawing (File > Open) or on top of the open one
// (File > Import), every picture layer as a pixel layer.
import { store } from '../../core/store';
import type { Id } from '../../core/format';
import { baseName, stripExt } from '../../io/desktop';
import { askAboutUnsavedChanges } from '../../io/document';
import { notify } from '../../io/notify';
import { addPieces, centreOn, docFromPieces, STILL_LENGTH } from '../pieces';
import { pickFiles } from '../pick';
import { reportImport } from '../report';
import { hasDrawing, whereToPut, type ImportWhere } from '../where';
import { layeredPieces, countNodes } from './build';
import { LayeredProblem, plural, type LayeredFile } from './model';
import { LAYERED_ACCEPT, readLayered } from './read';

/** What came in, in a sentence. Pure. */
export function layeredHeadline(name: string, where: ImportWhere, file: LayeredFile, cutOff: boolean): string {
  const c = countNodes(file.nodes);
  const what = `${plural(c.layers, 'layer')}${c.groups ? ` in ${plural(c.groups, 'group')}` : ''}, ${file.width} x ${file.height}`;
  return `${where === 'add' ? 'Added' : 'Opened'} "${name}": ${what}.${cutOff ? ' It is bigger than the drawing, so the edges were cut off.' : ''}`;
}

/** Reads the bytes and brings the layers in. `asked` false means File > Open, which always opens a new drawing. */
export async function importLayeredBytes(bytes: Uint8Array, path: string, asked = true): Promise<boolean> {
  const name = stripExt(baseName(path)) || 'Layers';
  let file: LayeredFile;
  try {
    file = await readLayered(bytes, path);
  } catch (e) {
    notify(e instanceof LayeredProblem ? e.message : "Frameling couldn't read that file.", 'error', undefined, 10000);
    return false;
  }
  const doc = store().get().doc;
  const where: ImportWhere = asked ? await whereToPut(doc) : 'new';
  if (where === 'add' && store().nestedTag()) {
    notify('Close the symbol you are editing first, then add the layers to the drawing.', 'info');
    return false;
  }
  let pieces = layeredPieces(file, where === 'add' ? doc.length : STILL_LENGTH);
  if (!pieces.layers.length) {
    notify(`There are no picture layers in "${baseName(path)}" that Frameling can bring in.${file.left.length ? ' ' + file.left[0] : ''}`, 'warn', undefined, 10000);
    return false;
  }
  let cutOff = false;
  if (where === 'add') {
    const c = centreOn(pieces, { width: doc.width, height: doc.height });
    pieces = c.pieces;
    cutOff = c.cutOff;
    store().update(`Add layers from "${baseName(path)}"`, (d) => addPieces(d, pieces));
    const added = pieces.layers[pieces.layers.length - 1];
    if (added) store().setUi({ activeLayerId: added.id as Id });
  } else {
    if (hasDrawing(doc) && !(await askAboutUnsavedChanges())) return false;
    // A new drawing with no file yet, so Save asks where to put it.
    store().load(docFromPieces(pieces, name), null);
    store().setUi({ dirty: true });
  }
  reportImport({ headline: layeredHeadline(name, where, file, cutOff), left: file.left, info: file.info });
  return true;
}

export const openLayeredBytes = (bytes: Uint8Array, path: string): Promise<boolean> => importLayeredBytes(bytes, path, false);

/** File > Import > Layered file: pick a file and bring it in. */
export async function pickAndImportLayered(): Promise<void> {
  const [f] = await pickFiles(LAYERED_ACCEPT);
  if (f) await importLayeredBytes(new Uint8Array(await f.file.arrayBuffer()), f.path);
}

/** Layered files dropped on the window. */
export async function dropLayered(files: File[]): Promise<void> {
  for (const f of files) if (!(await importLayeredBytes(new Uint8Array(await f.arrayBuffer()), f.name))) break;
}
