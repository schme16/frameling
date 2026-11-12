// Bringing an Aseprite file in: as a new drawing, or added to the open one. Each says what it could not carry over.
import { choose, registerChoice } from '../core/choices';
import { store } from '../core/store';
import { baseName, desktop, stripExt } from '../io/desktop';
import { askAboutUnsavedChanges, registerOpener } from '../io/document';
import { notify } from '../io/notify';
import { pickUpload } from '../platform';
import { setDocPalette } from '../pixel/commands';
import { isAdobeSwatches } from '../pixel/ase-swatches';
import { swatchesIntoPalette } from '../pixel/palette-files';
import { asepriteDoc, asepritePieces, mergePieces, paletteColors } from './convert';
import { AsepriteProblem, parseAseprite, paletteAt, type AseFile } from './parse';
import { showWhatChanged } from './WhatChanged';
import { moment } from '../pixel/moments';
import { line } from '../ui/mascot/lines';

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

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function read(bytes: Uint8Array): AseFile | null {
  try {
    return parseAseprite(bytes);
  } catch (e) {
    notify(e instanceof AsepriteProblem ? e.message : 'Frameling could not read that Aseprite file.', 'error', undefined, 8000);
    return null;
  }
}

/** One short line for a toast, with a way to see the whole list when something was approximated. */
function report(headline: string, notes: string[]): void {
  if (!notes.length) {
    notify(headline, 'success', undefined, 6000);
    return;
  }
  notify(`${headline} ${plural(notes.length, 'thing was', 'things were')} approximated.`, 'warn', { label: 'See what changed', run: () => showWhatChanged(headline, notes) }, 12000);
}

/** Opens the file's bytes as a new drawing (asks about unsaved changes first). */
export async function openAsepriteBytes(bytes: Uint8Array, path: string): Promise<boolean> {
  // Adobe swatch files share the .ase ending: they are palettes, not drawings.
  if (isAdobeSwatches(bytes)) return swatchesIntoPalette(bytes, path);
  const file = read(bytes);
  if (!file) return false;
  const name = stripExt(baseName(path)) || 'Aseprite drawing';
  let made;
  try {
    made = asepriteDoc(file, name);
  } catch (e) {
    notify(e instanceof AsepriteProblem ? e.message : 'Frameling could not open that Aseprite file.', 'error', undefined, 8000);
    return false;
  }
  if (!(await askAboutUnsavedChanges())) return false;
  // It is a new drawing with no file yet, so Save asks where to put it.
  store().load(made.doc, null);
  store().setUi({ dirty: true });
  moment('ase.open', () => line('pixel.ase.open'), 'session', 'wave');
  report(`Opened "${baseName(path)}": ${plural(made.doc.layers.length, 'layer')}, ${plural(file.frames.length, 'frame')} at ${made.doc.fps} fps.`, made.notes);
  return true;
}

/** Adds the file's layers, frames, tags and colours to the open drawing as one undo step. */
export async function addAsepriteBytes(bytes: Uint8Array, path: string): Promise<boolean> {
  if (isAdobeSwatches(bytes)) return swatchesIntoPalette(bytes, path);
  const file = read(bytes);
  if (!file) return false;
  if (store().nestedTag()) {
    notify('Close the symbol you are editing first, then add the Aseprite file to the drawing.', 'info');
    return false;
  }
  const doc = store().get().doc;
  const name = baseName(path);
  let pieces;
  try {
    pieces = asepritePieces(file, stripExt(name), { width: doc.width, height: doc.height, fps: doc.fps, tileset: doc.tileset });
  } catch (e) {
    notify(e instanceof AsepriteProblem ? e.message : 'Frameling could not add that Aseprite file.', 'error', undefined, 8000);
    return false;
  }
  store().update(`Add Aseprite file "${name}"`, (d) => mergePieces(d, pieces, name));
  report(`Added "${name}": ${plural(pieces.layers.length, 'layer')} and ${plural(file.frames.length, 'frame')}.`, pieces.notes);
  return true;
}

/** Uses just the colours of the file's palette as the drawing's palette. */
export async function paletteFromAsepriteBytes(bytes: Uint8Array, path: string): Promise<boolean> {
  if (isAdobeSwatches(bytes)) return swatchesIntoPalette(bytes, path);
  const file = read(bytes);
  if (!file) return false;
  const p = paletteAt(file, 0);
  if (!p?.length) {
    notify('That Aseprite file has no palette of its own.', 'info');
    return false;
  }
  const colors = paletteColors(p).slice(0, 256);
  setDocPalette({ name: stripExt(baseName(path)) || 'Aseprite palette', colors }, 'Use palette from Aseprite file');
  notify(`Loaded the palette from "${baseName(path)}": ${plural(colors.length, 'colour')}${p.length > 256 ? ' (the first 256)' : ''}.`, 'success');
  return true;
}

type Use = (bytes: Uint8Array, path: string) => Promise<boolean>;

/** Asks for an Aseprite file and hands it to `use`. */
async function pick(use: Use, title: string): Promise<void> {
  const api = desktop();
  if (api?.files.openOther) {
    const r = await api.files.openOther({ filters: ASE_FILTERS, title });
    if (!r) return;
    if ('error' in r) return notify(r.error, 'error');
    await use(r.bytes, r.path);
    return;
  }
  const f = await pickUpload('.aseprite,.ase');
  if (f) await use(new Uint8Array(await f.arrayBuffer()), f.name);
}

export const pickAndOpen = () => pick(openAsepriteBytes, 'Open an Aseprite file');
export const pickAndAdd = () => pick(addAsepriteBytes, 'Add an Aseprite file to this drawing');
export const pickForPalette = () => pick(paletteFromAsepriteBytes, 'Use the palette from an Aseprite file');

/** Dropping Aseprite files on the window: open or add, as remembered. */
export function installAsepriteDrop(target: Window = window): () => void {
  const over = (e: DragEvent) => {
    if (e.defaultPrevented) return;
    const items = e.dataTransfer?.items;
    if (!items || ![...items].some((i) => i.kind === 'file' && (i.type === '' || i.type === 'application/x-aseprite'))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const drop = (e: DragEvent) => {
    if (e.defaultPrevented) return;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => ASE_EXT.test(f.name));
    if (!files.length) return;
    e.preventDefault();
    void (async () => {
      // Swatch files go to the palette without asking; drawings ask open or add.
      const all = await Promise.all(files.map(async (f) => ({ f, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const drawings = all.filter((a) => !isAdobeSwatches(a.bytes));
      for (const a of all) if (isAdobeSwatches(a.bytes)) swatchesIntoPalette(a.bytes, a.f.name);
      if (!drawings.length) return;
      const how = await choose<DropChoice>('aseprite.drop');
      for (const { f, bytes } of drawings) {
        if (how === 'add') await addAsepriteBytes(bytes, f.name);
        else if (!(await openAsepriteBytes(bytes, f.name))) break;
        // Only the first one can open as the drawing; the rest would replace it.
        if (how === 'open') break;
      }
    })();
  };
  target.addEventListener('dragover', over);
  target.addEventListener('drop', drop);
  return () => {
    target.removeEventListener('dragover', over);
    target.removeEventListener('drop', drop);
  };
}

/** Double-clicked files, File > Open and Open recent hand Aseprite files over by path. */
export function registerAsepriteOpener(): void {
  registerOpener((p) => ASE_EXT.test(p), openAsepriteBytes);
}
