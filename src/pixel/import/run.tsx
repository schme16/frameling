// Bringing a picture in: File > Open, File > Import, a drop on the window and the palette all end up here. The picture
// is read, the dialog shows how it will be cut, and what is chosen becomes a new drawing or part of the open one.
import { store } from '../../core/store';
import type { Doc, Id } from '../../core/format';
import { baseName, desktop, stripExt } from '../../io/desktop';
import { askAboutUnsavedChanges, registerOpener } from '../../io/document';
import { mountModal } from '../../io/mount';
import { notify } from '../../io/notify';
import { pickUpload } from '../../platform';
import { setDocPalette } from '../commands';
import { docPalette } from '../palette';
import { mergePalette, spriteDoc, spriteInto, spritePalette } from './build';
import { ImportDialog, type ImportMode, type ImportRequest } from './ImportDialog';
import { decodePicture, PICTURE_ACCEPT, PICTURE_EXT, PictureProblem } from './picture';
import { readSheetJson, type SheetData } from './sheetJson';

export const PICTURE_FILTERS = [{ name: 'Pictures and sprite sheets', extensions: ['png', 'gif', 'webp', 'jpg', 'jpeg', 'bmp'] }];
const JSON_FILTERS = [{ name: 'Sprite sheet data', extensions: ['json'] }];

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Asks for a JSON file that describes a sprite sheet, and reads it. Null when cancelled or not a sheet description. */
export async function pickSheetJson(): Promise<SheetData | null> {
  let text: string | null = null;
  const api = desktop();
  if (api?.files.openOther) {
    const r = await api.files.openOther({ filters: JSON_FILTERS, title: 'Pick the JSON that comes with the sheet' });
    if (!r) return null;
    if ('error' in r) {
      notify(r.error, 'error');
      return null;
    }
    text = new TextDecoder().decode(r.bytes);
  } else {
    const f = await pickUpload('.json');
    if (f) text = await f.text();
  }
  if (text === null) return null;
  const data = readSheetJson(text);
  if (!data) notify('That file does not describe a sprite sheet. Frameling reads the JSON from Frameling, Aseprite, TexturePacker, Phaser and Pixi.', 'warn', undefined, 8000);
  return data;
}

/** The sprite as a new drawing, or added to the open one. */
async function apply(req: ImportRequest, name: string): Promise<boolean> {
  const { sprite, options } = req;
  if (req.into) {
    if (store().nestedTag()) {
      notify('Close the symbol you are editing first, then add the picture to the drawing.', 'info');
      return false;
    }
    const frame = store().get().ui.frame;
    let notes: string[] = [];
    store().update(`Add picture "${name}"`, (d) => {
      notes = spriteInto(d, sprite, options, frame);
    });
    // The new layer is the one to draw on next (a layer-making way); boards open as they are.
    const doc = store().get().doc;
    const added = options.way === 'picture' || options.way === 'animation' ? doc.layers[doc.layers.length - 1] : null;
    if (added) store().setUi({ activeLayerId: added.id as Id });
    notify(`Added "${name}": ${plural(sprite.frames.length, 'frame')}.${notes.length ? ' ' + notes.join(' ') : ''}`, notes.length ? 'warn' : 'success', undefined, notes.length ? 10000 : 6000);
    return true;
  }
  let made: { doc: Doc; notes: string[] };
  try {
    made = spriteDoc(sprite, options);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Frameling could not make a drawing from that picture.', 'error');
    return false;
  }
  if (!(await askAboutUnsavedChanges())) return false;
  // A new drawing with no file yet, so Save asks where to put it.
  store().load(made.doc, null);
  store().setUi({ dirty: true });
  notify(`Opened "${name}": ${plural(sprite.frames.length, 'frame')} of ${sprite.width} x ${sprite.height}.${made.notes.length ? ' ' + made.notes.join(' ') : ''}`, made.notes.length ? 'warn' : 'success', undefined, made.notes.length ? 10000 : 6000);
  return true;
}

/** Takes the picture's colours as the drawing's palette: added to it, or in its place. */
function colours(req: ImportRequest, name: string): void {
  const p = spritePalette(req.sprite, name);
  if (!p) return notify('The picture has no solid colours to take.', 'warn');
  const doc = store().get().doc;
  const next = req.paletteMode === 'add' ? { ...docPalette(doc), ...mergePalette(docPalette(doc), p) } : { ...p };
  setDocPalette(next, req.paletteMode === 'add' ? 'Add colours from a picture' : 'Use colours from a picture');
  notify(`${req.paletteMode === 'add' ? 'Added colours: the palette now has' : 'The palette now has'} ${plural(next.colors.length, 'colour')}.`, 'success');
}

/** Reads the bytes and shows the dialog. Resolves true once something was brought in. */
export async function importPicture(bytes: Uint8Array, path: string, mode: ImportMode, companion: SheetData | null = null): Promise<boolean> {
  let pic;
  try {
    pic = await decodePicture(bytes);
  } catch (e) {
    notify(e instanceof PictureProblem ? e.message : 'Frameling could not read that picture.', 'error', undefined, 8000);
    return false;
  }
  const name = stripExt(baseName(path)) || 'Picture';
  const hasDrawing = !store().nestedTag();
  return new Promise<boolean>((resolve) => {
    let done = false;
    mountModal((close) => (
      <ImportDialog
        pic={pic}
        fileName={name}
        mode={mode}
        hasDrawing={hasDrawing}
        companion={companion}
        pickJson={pickSheetJson}
        close={() => {
          close();
          if (!done) resolve(false);
        }}
        finish={(req) => {
          done = true;
          void (mode === 'palette' ? Promise.resolve(colours(req, name)).then(() => true) : apply(req, name)).then(resolve);
        }}
      />
    ));
  });
}

export const openPictureBytes = (bytes: Uint8Array, path: string): Promise<boolean> => importPicture(bytes, path, 'new');
export const addPictureBytes = (bytes: Uint8Array, path: string): Promise<boolean> => importPicture(bytes, path, 'add');
export const paletteFromPictureBytes = (bytes: Uint8Array, path: string): Promise<boolean> => importPicture(bytes, path, 'palette');

type Use = (bytes: Uint8Array, path: string) => Promise<boolean>;

/** Asks for a picture and hands it to `use`. */
async function pick(use: Use, title: string): Promise<void> {
  const api = desktop();
  if (api?.files.openOther) {
    const r = await api.files.openOther({ filters: PICTURE_FILTERS, title });
    if (!r) return;
    if ('error' in r) return notify(r.error, 'error');
    await use(r.bytes, r.path);
    return;
  }
  const f = await pickUpload(PICTURE_ACCEPT);
  if (f) await use(new Uint8Array(await f.arrayBuffer()), f.name);
}

export const pickAndOpenPicture = () => pick(openPictureBytes, 'Bring in a picture or sprite sheet');
export const pickAndAddPicture = () => pick(addPictureBytes, 'Add a picture or sprite sheet to this drawing');
export const pickPictureForPalette = () => pick(paletteFromPictureBytes, 'Take the colours of a picture');

const IMAGE_TYPE = /^image\/(png|gif|webp|jpeg|bmp)$/;

/** Dropping a picture on the window opens the dialog. A .json dropped with it is the sheet's data. */
export function installPictureDrop(target: Window = window): () => void {
  const over = (e: DragEvent) => {
    if (e.defaultPrevented) return;
    const items = e.dataTransfer?.items;
    if (!items || ![...items].some((i) => i.kind === 'file' && IMAGE_TYPE.test(i.type))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const drop = (e: DragEvent) => {
    if (e.defaultPrevented) return;
    const files = [...(e.dataTransfer?.files ?? [])];
    const image = files.find((f) => PICTURE_EXT.test(f.name));
    if (!image) return;
    e.preventDefault();
    void (async () => {
      const json = files.find((f) => /\.json$/i.test(f.name));
      const companion = json ? readSheetJson(await json.text()) : null;
      await importPicture(new Uint8Array(await image.arrayBuffer()), image.name, 'new', companion);
    })();
  };
  target.addEventListener('dragover', over);
  target.addEventListener('drop', drop);
  return () => {
    target.removeEventListener('dragover', over);
    target.removeEventListener('drop', drop);
  };
}

/** File > Open and Open recent hand pictures over by path. */
export function registerPictureOpener(): void {
  registerOpener((p) => PICTURE_EXT.test(p), openPictureBytes);
}
