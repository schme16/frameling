// Bringing an SVG in: as a new drawing (File > Open) or on top of the open one (File > Import), as vector layers.
import { gunzipSync } from 'fflate';
import { store } from '../../core/store';
import type { Id } from '../../core/format';
import { baseName, stripExt } from '../../io/desktop';
import { askAboutUnsavedChanges } from '../../io/document';
import { notify } from '../../io/notify';
import { addPieces, docFromPieces, STILL_LENGTH, vectorPieces } from '../pieces';
import { pickFiles } from '../pick';
import { reportImport } from '../report';
import { hasDrawing, whereToPut, type ImportWhere } from '../where';
import { importSvg, svgTextOf, SvgProblem, type SvgImport } from './convert';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** The sentence under the toast: what came in. Pure. */
export function svgHeadline(name: string, where: ImportWhere, svg: SvgImport, scaled: number | undefined): string {
  const layers = svg.layers.length;
  const bits = [plural(svg.counts.shapes - svg.counts.text, 'shape')];
  if (svg.counts.text) bits.push(plural(svg.counts.text, 'piece of text', 'pieces of text'));
  const scaledNote = scaled ? ` It was made ${Math.round(scaled * 100)}% of its size to fit.` : '';
  return `${where === 'add' ? 'Added' : 'Opened'} "${name}": ${bits.join(' and ')} on ${plural(layers, 'layer')}.${scaledNote}`;
}

/** Reads the bytes and brings the SVG in. `asked` false means File > Open, which always opens a new drawing. */
export async function importSvgBytes(bytes: Uint8Array, path: string, asked = true): Promise<boolean> {
  const name = stripExt(baseName(path)) || 'Drawing';
  let svg: SvgImport;
  try {
    svg = importSvg(svgTextOf(bytes, gunzipSync), name);
  } catch (e) {
    notify(e instanceof SvgProblem ? e.message : "Frameling couldn't read that SVG.", 'error', undefined, 9000);
    return false;
  }
  if (!svg.counts.shapes) {
    notify(`There is nothing drawn in "${baseName(path)}" that Frameling can bring in.${svg.left.length ? ' ' + svg.left[0] : ''}`, 'warn', undefined, 9000);
    return false;
  }
  const doc = store().get().doc;
  const where: ImportWhere = asked ? await whereToPut(doc) : 'new';
  if (where === 'add' && store().nestedTag()) {
    notify('Close the symbol you are editing first, then add the SVG to the drawing.', 'info');
    return false;
  }
  const pieces = vectorPieces(svg.layers, { width: svg.width, height: svg.height }, { stage: where === 'add' ? { width: doc.width, height: doc.height } : null, length: where === 'add' ? doc.length : STILL_LENGTH });
  if (where === 'add') {
    store().update(`Add SVG "${name}"`, (d) => addPieces(d, pieces));
    const added = pieces.layers[pieces.layers.length - 1];
    if (added) store().setUi({ activeLayerId: added.id as Id });
  } else {
    if (hasDrawing(doc) && !(await askAboutUnsavedChanges())) return false;
    // A new drawing with no file yet, so Save asks where to put it.
    store().load(docFromPieces(pieces, name), null);
    store().setUi({ dirty: true });
  }
  reportImport({ headline: svgHeadline(name, where, svg, pieces.scale), left: svg.left, info: svg.info });
  return true;
}

export const openSvgBytes = (bytes: Uint8Array, path: string): Promise<boolean> => importSvgBytes(bytes, path, false);

/** File > Import > SVG: pick a file and bring it in. */
export async function pickAndImportSvg(): Promise<void> {
  const [f] = await pickFiles('.svg,.svgz,image/svg+xml');
  if (f) await importSvgBytes(new Uint8Array(await f.file.arrayBuffer()), f.path);
}

/** SVG files dropped on the window. */
export async function dropSvg(files: File[]): Promise<void> {
  for (const f of files) if (!(await importSvgBytes(new Uint8Array(await f.arrayBuffer()), f.name))) break;
}
