// Adding reference pictures to the open drawing and changing where they sit. Each one is a single undo step.
import type { Doc, Id, Layer, LayerPicture, ReferencePicture } from '../core/format';
import { findLayer, newVectorLayer, uid } from '../core/doc';
import { store } from '../core/store';
import { notify } from '../io/notify';
import { pickFiles } from '../import/pick';
import { readSystemPicture } from '../clipboard/system';
import { dropShot, fitPlacement, fillPlacement, newLayerPicture, nameFromFile, PICTURE_ACCEPT, putShot, sniffPicture, withPlacement } from './model';
import { setPlacing } from './state';
import './choices';

/** How strong a new reference picture shows: faint enough to draw over, clear enough to see. */
export const REFERENCE_FADE = 0.6;
/** The biggest file taken, so a huge scan can't use up the memory. */
export const MAX_PICTURE_BYTES = 120 * 1024 * 1024;
/** The most pixels one picture may hold (a 12000 by 12000 picture). */
export const MAX_PICTURE_PIXELS = 144_000_000;

export type PictureProblem = { problem: string };

/** What can be said about the bytes before reading the picture: its kind, or why it can't be used. Pure. */
export function checkPictureBytes(bytes: Uint8Array, name: string): { mime: 'image/png' | 'image/jpeg' } | PictureProblem {
  if (bytes.length > MAX_PICTURE_BYTES) return { problem: `"${name}" is bigger than Frameling can hold as a reference (over ${Math.round(MAX_PICTURE_BYTES / 1048576)} MB).` };
  const mime = sniffPicture(bytes);
  if (!mime) return { problem: `"${name}" isn't a JPG or PNG, so it can't be a reference picture. Frameling reads those two.` };
  return { mime };
}

/** Whether two byte lists are the same picture (so adding it twice shares the one copy). */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The picture already in the document with these bytes, if there is one. */
export function findSame(doc: Pick<Doc, 'pictures'>, bytes: Uint8Array): ReferencePicture | undefined {
  return doc.pictures?.find((p) => sameBytes(p.data, bytes));
}

/** Reads a picture's own size (as it shows, after a phone photo's turn). Returns a problem when it can't be read. */
export async function measurePicture(bytes: Uint8Array, mime: string, name: string): Promise<{ width: number; height: number } | PictureProblem> {
  try {
    const bm = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const size = { width: bm.width, height: bm.height };
    bm.close();
    if (size.width * size.height > MAX_PICTURE_PIXELS) return { problem: `"${name}" is ${size.width} x ${size.height}, which is too big to hold as a reference. Shrink it first.` };
    return size;
  } catch {
    return { problem: `Frameling couldn't read "${name}". It may be damaged.` };
  }
}

/** Checks and measures a file's bytes, ready to add. The same copy is reused when the picture is already in the document. */
export async function makePicture(bytes: Uint8Array, name: string, doc: Pick<Doc, 'pictures'> = store().get().doc): Promise<{ picture: ReferencePicture; isNew: boolean } | PictureProblem> {
  const ok = checkPictureBytes(bytes, name);
  if ('problem' in ok) return ok;
  const same = findSame(doc, bytes);
  if (same) return { picture: same, isNew: false };
  const size = await measurePicture(bytes, ok.mime, name);
  if ('problem' in size) return size;
  return { picture: { id: uid('p'), name, data: bytes, mime: ok.mime, ...size }, isNew: true };
}

/** Puts new pictures in the document's list (those it doesn't hold already). */
export function addPictures(d: { pictures?: ReferencePicture[] }, pics: { picture: ReferencePicture; isNew: boolean }[]): void {
  for (const p of pics) if (p.isNew && !d.pictures?.some((x) => x.id === p.picture.id)) (d.pictures ??= []).push(p.picture);
}

/** A new reference layer at the back of the stack (so it is behind the drawing), showing `build(doc)`'s picture. Returns its id. */
export function addReferenceLayer(label: string, name: string, pics: { picture: ReferencePicture; isNew: boolean }[], build: (doc: Doc) => LayerPicture, extendTo?: number): Id {
  const layer: Layer = { ...newVectorLayer(name), reference: true, opacity: REFERENCE_FADE };
  store().update(label, (d) => {
    addPictures(d, pics);
    layer.picture = build(d as Doc);
    d.layers.unshift(layer);
    if (extendTo && extendTo > d.length) d.length = Math.min(extendTo, 100_000);
  });
  return layer.id;
}

/** Adds a picture as a new reference layer and opens it for moving and sizing. */
export async function addReferencePicture(bytes: Uint8Array, name: string): Promise<boolean> {
  const made = await makePicture(bytes, name);
  if ('problem' in made) {
    notify(made.problem, 'warn', undefined, 8000);
    return false;
  }
  const id = addReferenceLayer(`Add reference "${nameFromFile(name)}"`, nameFromFile(name), [made], (d) => newLayerPicture(made.picture, d));
  setPlacing(id);
  return true;
}

/** File > Import > Reference picture: pick one or more. */
export async function pickReferencePictures(): Promise<void> {
  const files = await pickFiles(PICTURE_ACCEPT, { multiple: true });
  for (const f of files) await addReferencePicture(new Uint8Array(await f.file.arrayBuffer()), f.path);
}

/** A picture on the system clipboard (a screenshot, a copied image) becomes a reference. */
export async function pasteReferencePicture(): Promise<boolean> {
  const pic = await readSystemPicture();
  if (!pic) {
    notify('There is no picture on the clipboard. Copy one (a screenshot works) and try again.', 'info', undefined, 6000);
    return false;
  }
  return addReferencePicture(pic.png, `Pasted picture ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
}

// ---------------------------------------------------------------- changing one

function edit(label: string, id: Id, fn: (l: Layer, d: Doc) => void, coalesce?: string): void {
  store().update(label, (d) => {
    const l = d.layers.find((x) => x.id === id);
    if (l?.picture) fn(l as Layer, d as Doc);
  }, coalesce ? { coalesce } : {});
}

/** Moves, sizes or turns the picture. Dragging passes a `coalesce` key so a whole drag is one undo step. */
export function setPlacement(id: Id, change: Partial<Pick<LayerPicture, 'x' | 'y' | 'scale' | 'turn'>>, coalesce?: string): void {
  edit('Move reference picture', id, (l) => void (l.picture = withPlacement(l.picture!, change)), coalesce);
}

/** Fits the picture in the page (or fills the page with it). */
export function fitPicture(id: Id, how: 'fit' | 'fill' = 'fit'): void {
  edit(how === 'fit' ? 'Fit reference to the page' : 'Fill the page with the reference', id, (l, d) => {
    const pic = pictureOf(d, l);
    if (!pic) return;
    const { x, y, scale } = (how === 'fit' ? fitPlacement : fillPlacement)(pic, d);
    l.picture = withPlacement(l.picture!, { x, y, scale, turn: 0 });
  });
}

/** Back to its own size, in the middle of the page, not turned. */
export function resetPicture(id: Id): void {
  edit('Reset reference picture', id, (l, d) => void (l.picture = withPlacement(l.picture!, { x: d.width / 2, y: d.height / 2, scale: 1, turn: 0 })));
}

/** The picture a layer holds first (for fitting and the layer's size): its first shot's. */
function pictureOf(d: Pick<Doc, 'pictures'>, l: Layer): ReferencePicture | undefined {
  const first = l.picture?.shots[0];
  return first ? d.pictures?.find((p) => p.id === first.picture) : undefined;
}

/** From `frame` on, the layer shows this picture instead (a picture for each of a few frames). */
export async function showPictureFrom(layerId: Id, frame: number, bytes: Uint8Array, name: string): Promise<boolean> {
  const made = await makePicture(bytes, name);
  if ('problem' in made) {
    notify(made.problem, 'warn', undefined, 8000);
    return false;
  }
  edit(`Picture from frame ${frame + 1}`, layerId, (l, d) => {
    addPictures(d, [made]);
    l.picture!.shots = putShot(l.picture!.shots, frame, made.picture.id);
  });
  return true;
}

/** Takes the picture that starts on `frame` away again, so the one before it holds on. The last one can't be taken away: remove the layer. */
export function removePictureFrom(layerId: Id, frame: number): boolean {
  const l = findLayer(store().get().doc, layerId);
  if (!l?.picture || l.picture.shots.length < 2 || !l.picture.shots.some((s) => s.start === frame)) return false;
  edit(`Remove picture at frame ${frame + 1}`, layerId, (lay) => void (lay.picture!.shots = dropShot(lay.picture!.shots, frame)));
  return true;
}

/** File > Import > ... a picture just for this frame on, for the active reference layer. */
export async function pickPictureForFrame(): Promise<void> {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  if (!layer?.picture) return void notify('Pick a reference layer first, then choose a picture for this frame.', 'info');
  const files = await pickFiles(PICTURE_ACCEPT);
  if (!files[0]) return;
  if (await showPictureFrom(layer.id, ui.frame, new Uint8Array(await files[0].file.arrayBuffer()), files[0].path)) notify(`That picture shows from frame ${ui.frame + 1} on.`, 'success');
}

/** The reference layer to work on: the active one if it has a picture, else the first layer that does (from the top). */
export function referenceLayerToEdit(doc: Doc, activeId: Id | null | undefined): Layer | undefined {
  const active = findLayer(doc, activeId);
  if (active?.picture) return active;
  return [...doc.layers].reverse().find((l) => l.picture);
}
