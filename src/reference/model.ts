// Reference pictures, the plain part: which picture shows on a frame, where it sits, and the sums behind dragging it
// about. No DOM and no store, so all of it is tested directly.
import type { Doc, Id, Layer, LayerPicture, PictureShot, ReferencePicture } from '../core/format';

export interface Pt {
  x: number;
  y: number;
}

/** What Frameling reads as a reference picture. */
export const PICTURE_ACCEPT = '.jpg,.jpeg,.png,image/jpeg,image/png';
export const PICTURE_NAME = /\.(jpe?g|png)$/i;

/** The kind of picture these bytes are, from their first few bytes (not their name), or null. */
export function sniffPicture(b: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

export const extOf = (mime: string): string => (mime === 'image/png' ? 'png' : 'jpg');

/** A layer's name from the file it came from: "model-sheet.png" becomes "model-sheet". */
export function nameFromFile(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1).replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  return base || 'Reference';
}

export const MIN_SCALE = 0.01;
export const MAX_SCALE = 100;
const clampScale = (k: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));

// ---------------------------------------------------------------- which picture shows

/** The shot that shows on `frame`, if any. */
export function shotAt(lp: LayerPicture | undefined, frame: number): PictureShot | undefined {
  if (!lp) return undefined;
  let hit: PictureShot | undefined;
  for (const s of lp.shots) {
    if (s.start > frame) break;
    hit = s;
  }
  if (hit && hit.length !== undefined && frame >= hit.start + hit.length) return undefined;
  return hit;
}

/** The picture a layer shows on `frame`, with where it sits. */
export function pictureAt(doc: Pick<Doc, 'pictures'>, layer: Pick<Layer, 'picture'>, frame: number): ReferencePicture | undefined {
  const shot = shotAt(layer.picture, frame);
  return shot ? doc.pictures?.find((p) => p.id === shot.picture) : undefined;
}

/**
 * Puts a picture on `frame` and from there on (until the next shot). A shot before it that was set to run past this
 * frame is cut short, and one that starts exactly here is replaced. Returns a new list in order.
 */
export function putShot(shots: PictureShot[], frame: number, picture: Id, length?: number): PictureShot[] {
  const out: PictureShot[] = [];
  for (const s of shots) {
    if (s.start === frame) continue;
    if (s.start < frame && s.length !== undefined && s.start + s.length > frame) out.push({ ...s, length: frame - s.start });
    else out.push(s);
  }
  out.push({ picture, start: frame, ...(length !== undefined ? { length } : {}) });
  return out.sort((a, b) => a.start - b.start);
}

/** Takes away the shot that starts on `frame`, so the one before it holds on (or the frame goes empty). */
export function dropShot(shots: PictureShot[], frame: number): PictureShot[] {
  return shots.filter((s) => s.start !== frame);
}

/** Every picture id the layers use, in every shot. */
export function usedPictures(layers: Layer[]): Set<Id> {
  const used = new Set<Id>();
  for (const l of layers) for (const s of l.picture?.shots ?? []) used.add(s.picture);
  return used;
}

/** Whether any picture shows on the frames of this layer more than once (a picture per frame, or one held), for the words in the panel. */
export function shotCount(lp: LayerPicture | undefined): number {
  return lp?.shots.length ?? 0;
}

// ---------------------------------------------------------------- where it sits

/** Fits a picture inside the stage, as big as it can go without cropping, in the middle. */
export function fitPlacement(pic: { width: number; height: number }, stage: { width: number; height: number }): Pick<LayerPicture, 'x' | 'y' | 'scale'> {
  const k = Math.min(stage.width / Math.max(1, pic.width), stage.height / Math.max(1, pic.height));
  return { x: stage.width / 2, y: stage.height / 2, scale: clampScale(k) };
}

/** Fills the stage, cropping what is left over. */
export function fillPlacement(pic: { width: number; height: number }, stage: { width: number; height: number }): Pick<LayerPicture, 'x' | 'y' | 'scale'> {
  const k = Math.max(stage.width / Math.max(1, pic.width), stage.height / Math.max(1, pic.height));
  return { x: stage.width / 2, y: stage.height / 2, scale: clampScale(k) };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The picture's four corners on the stage (top left, top right, bottom right, bottom left), turned as it is. */
export function cornersOf(lp: Pick<LayerPicture, 'x' | 'y' | 'scale' | 'turn'>, pic: { width: number; height: number }): [Pt, Pt, Pt, Pt] {
  const hw = (pic.width * lp.scale) / 2;
  const hh = (pic.height * lp.scale) / 2;
  const a = rad(lp.turn ?? 0);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (dx: number, dy: number): Pt => ({ x: lp.x + dx * c - dy * s, y: lp.y + dx * s + dy * c });
  return [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)];
}

/** Whether a stage point is on the picture. */
export function hits(lp: Pick<LayerPicture, 'x' | 'y' | 'scale' | 'turn'>, pic: { width: number; height: number }, p: Pt): boolean {
  const a = rad(-(lp.turn ?? 0));
  const dx = p.x - lp.x;
  const dy = p.y - lp.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= (pic.width * lp.scale) / 2 && Math.abs(ly) <= (pic.height * lp.scale) / 2;
}

/** Dragging a corner: the picture grows or shrinks about its middle by how much closer or further the pointer is than where it was picked up. */
export function scaleByDrag(lp: LayerPicture, grab: Pt, now: Pt): number {
  const d0 = Math.hypot(grab.x - lp.x, grab.y - lp.y);
  const d1 = Math.hypot(now.x - lp.x, now.y - lp.y);
  if (d0 < 1e-6) return lp.scale;
  return clampScale(lp.scale * (d1 / d0));
}

/** Dragging the turn handle: the angle the pointer has swept about the middle. With `snap` it lands on whole steps (15 degrees). */
export function turnByDrag(lp: LayerPicture, grab: Pt, now: Pt, snap = false, step = 15): number {
  const a0 = Math.atan2(grab.y - lp.y, grab.x - lp.x);
  const a1 = Math.atan2(now.y - lp.y, now.x - lp.x);
  let t = (lp.turn ?? 0) + ((a1 - a0) * 180) / Math.PI;
  if (snap) t = Math.round(t / step) * step;
  return normaliseTurn(t);
}

/** A turn kept between -180 and 180, with no negative zero. */
export function normaliseTurn(t: number): number {
  let r = ((((t + 180) % 360) + 360) % 360) - 180;
  if (r === -180 && t > 0) r = 180;
  return r === 0 ? 0 : Math.round(r * 1000) / 1000;
}

/** The placement as it stands with a change: scale 0 or non-numbers are refused (the old value stays). */
export function withPlacement(lp: LayerPicture, change: Partial<Pick<LayerPicture, 'x' | 'y' | 'scale' | 'turn'>>): LayerPicture {
  const next = { ...lp };
  if (change.x !== undefined && Number.isFinite(change.x)) next.x = change.x;
  if (change.y !== undefined && Number.isFinite(change.y)) next.y = change.y;
  if (change.scale !== undefined && Number.isFinite(change.scale) && change.scale > 0) next.scale = clampScale(change.scale);
  if (change.turn !== undefined && Number.isFinite(change.turn)) {
    const t = normaliseTurn(change.turn);
    if (t) next.turn = t;
    else delete next.turn;
  }
  return next;
}

// ---------------------------------------------------------------- a new picture layer

/** A fresh layer picture: fitted in the stage and showing `picture` on every frame. */
export function newLayerPicture(pic: ReferencePicture, stage: { width: number; height: number }): LayerPicture {
  return { ...fitPlacement(pic, stage), shots: [{ picture: pic.id, start: 0 }] };
}

/**
 * Pictures as the frames of a clip: each shows from its own start frame until the next one starts, and the last one holds
 * for `lastLength` frames. Placed fitted in the stage.
 */
export function framesPicture(pics: ReferencePicture[], starts: number[], lastLength: number, stage: { width: number; height: number }): LayerPicture {
  const n = Math.min(pics.length, starts.length);
  const shots: PictureShot[] = [];
  for (let i = 0; i < n; i++) shots.push({ picture: pics[i].id, start: starts[i], ...(i === n - 1 ? { length: Math.max(1, lastLength) } : {}) });
  return { ...fitPlacement(pics[0], stage), shots };
}
