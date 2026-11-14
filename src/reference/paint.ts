// Drawing a reference picture on the canvas. Only the editing canvas calls this: the one renderer that exports use
// (core/render.ts) never does, so a reference picture can't leak into a file. The picture is decoded once at its own size
// and drawn from that every time, so it stays sharp at any zoom.
import type { Doc, Layer, LayerPicture, ReferencePicture } from '../core/format';
import { shotAt } from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Entry {
  bitmap: ImageBitmap | null;
  state: 'loading' | 'ready' | 'broken';
  used: number;
  pixels: number;
}

/** Decoded pictures, by their bytes (so a picture that is replaced, or goes with undo, takes its bitmap with it). */
const cache = new WeakMap<Uint8Array, Entry>();
const live = new Set<Entry>();
const listeners = new Set<() => void>();
let clock = 0;

/** The most decoded pixels kept at once (4 bytes each): the picture furthest from being used again is let go first. */
export const PICTURE_BUDGET_PIXELS = 120_000_000;

/** Called when a picture finishes decoding, so the canvas can draw it. */
export function subscribePictures(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function trim(keep: Entry): void {
  let total = 0;
  for (const e of live) total += e.pixels;
  if (total <= PICTURE_BUDGET_PIXELS) return;
  for (const e of [...live].sort((a, b) => a.used - b.used)) {
    if (total <= PICTURE_BUDGET_PIXELS) break;
    if (e === keep) continue;
    total -= e.pixels;
    e.bitmap?.close();
    e.bitmap = null;
    e.state = 'loading';
    e.pixels = 0;
    live.delete(e);
  }
}

/** The decoded picture, or null while it is still being read (it asks the canvas to draw again when it is). */
export function pictureBitmap(pic: Pick<ReferencePicture, 'data' | 'mime'>): ImageBitmap | null {
  let e = cache.get(pic.data);
  if (!e) {
    e = { bitmap: null, state: 'loading', used: 0, pixels: 0 };
    cache.set(pic.data, e);
  }
  e.used = ++clock;
  if (e.state === 'ready') return e.bitmap;
  if (e.state === 'loading' && typeof createImageBitmap === 'function') void decode(pic, e);
  return null;
}

const decoding = new WeakSet<Entry>();
async function decode(pic: Pick<ReferencePicture, 'data' | 'mime'>, e: Entry): Promise<void> {
  if (decoding.has(e)) return;
  decoding.add(e);
  try {
    const bm = await createImageBitmap(new Blob([pic.data as BlobPart], { type: pic.mime }));
    e.bitmap = bm;
    e.state = 'ready';
    e.pixels = bm.width * bm.height;
    live.add(e);
    trim(e);
  } catch {
    e.state = 'broken';
  } finally {
    decoding.delete(e);
  }
  for (const fn of listeners) fn();
}

/** Draws a placed picture. `g` is in stage pixels. `alpha` is the layer's fade. */
export function drawPlaced(g: Ctx, bitmap: ImageBitmap, lp: Pick<LayerPicture, 'x' | 'y' | 'scale' | 'turn'>, alpha: number): void {
  g.save();
  g.globalAlpha *= alpha;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.translate(lp.x, lp.y);
  if (lp.turn) g.rotate((lp.turn * Math.PI) / 180);
  g.scale(lp.scale, lp.scale);
  g.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  g.restore();
}

/** What each layer showed last, so a picture that is still being read shows the one before it rather than a gap. */
const lastShown = new Map<string, ImageBitmap>();
/** How many shots ahead are read in advance, so playing a picture for each frame doesn't wait on each one. */
export const READ_AHEAD = 16;

/** The layer's picture on `frame`, drawn into `g` (stage pixels) at the layer's fade. Does nothing for a layer with no picture. */
export function paintLayerPicture(g: Ctx, doc: Doc, layer: Layer, frame: number, withFade = true): void {
  const lp = layer.picture;
  if (!lp) return;
  const shot = shotAt(lp, frame);
  if (!shot) return;
  const pic = doc.pictures?.find((p) => p.id === shot.picture);
  if (!pic) return;
  let bm = pictureBitmap(pic);
  if (lp.shots.length > 1) {
    const at = lp.shots.indexOf(shot);
    for (let i = at + 1; i < Math.min(lp.shots.length, at + 1 + READ_AHEAD); i++) {
      const next = doc.pictures?.find((p) => p.id === lp.shots[i].picture);
      if (next) pictureBitmap(next);
    }
  }
  if (bm) lastShown.set(layer.id, bm);
  else bm = lastShown.get(layer.id) ?? null;
  // A bitmap let go of to save memory reports no size.
  if (!bm || !bm.width) return;
  drawPlaced(g, bm, lp, withFade ? layer.opacity : 1);
}
