/**
 * Moving a key's drawing without redrawing it (see core/offset.ts), as plain functions on a document. Like edit-core.ts
 * these change the doc they are given and know nothing about the store, locking or undo.
 *
 * The move belongs to a key. On a later frame of a held drawing the hold is cut there into two keys that share the one
 * drawing, so nothing is copied: the part sits somewhere else from that frame on, like drawing there would make a new
 * key. On a glide (a tween) the cut is the usual one, which keeps the glide's motion exactly as it was.
 */
import type { Cel, CelOffset, Doc, Id, Layer } from '../core/format';
import { celAt, findLayer, uid } from '../core/doc';
import { canOffset, cleanOffset, snapOffset } from '../core/offset';
import { celOffsetAt } from '../core/symbols';
import { layersUnder } from '../core/folders';
import { splitCel } from './propKeys';

const end = (c: Cel) => c.start + c.length;

/** The most a layer's key can be moved at once by one step: a pixel layer moves by whole art pixels, a vector layer by pixels. */
export function stepOf(layer: Layer): number {
  return layer.kind === 'pixel' ? Math.max(1, layer.pixelSize) : 1;
}

/**
 * The key to change on `frame` of `layer`: the key itself on its first frame, otherwise a new key cut out of the hold
 * (sharing its drawing). Undefined when the frame is empty or the layer can't be moved.
 */
function keyForMove(doc: Doc, layer: Layer, frame: number): Cel | undefined {
  const cel = celAt(layer, frame);
  if (!cel || !canOffset(layer)) return undefined;
  if (cel.start === frame) return cel;
  const inGlide = !!cel.tween && layer.cels.some((c) => c.start === end(cel));
  if (inGlide && layer.kind === 'vector') {
    const here = celOffsetAt(layer, frame);
    const cut = splitCel(doc, layer, frame);
    if (cut) {
      // The new key starts where the glide had got to, so it looks as it did before the move.
      if (here) cut.offset = { ...here };
      else delete cut.offset;
      return cut;
    }
  }
  const cut: Cel = { id: uid('c'), start: frame, length: end(cel) - frame, drawingId: cel.drawingId };
  if (cel.autoHold) cut.autoHold = true;
  if (cel.offset) cut.offset = { ...cel.offset };
  cel.length = frame - cel.start;
  layer.cels.splice(layer.cels.indexOf(cel) + 1, 0, cut);
  return cut;
}

/** Sets where the key under `frame` sits (no `to` puts it back where it was drawn). False when there is nothing to move. */
export function setOffset(doc: Doc, layerId: Id, frame: number, to: CelOffset | undefined): boolean {
  const layer = findLayer(doc, layerId);
  if (!layer) return false;
  const want = layer.kind === 'pixel' ? snapOffset(to, layer.pixelSize) : cleanOffset(to);
  const here = celOffsetAt(layer, frame);
  if (want?.x === here?.x && want?.y === here?.y) return false;
  const cel = keyForMove(doc, layer, frame);
  if (!cel) return false;
  if (want) cel.offset = want;
  else delete cel.offset;
  return true;
}

/** Moves the key under `frame` by (dx, dy) steps (a step is a pixel, or an art pixel on a pixel layer). */
export function nudge(doc: Doc, layerId: Id, frame: number, dx: number, dy: number): boolean {
  const layer = findLayer(doc, layerId);
  if (!layer) return false;
  const step = stepOf(layer);
  const here = celOffsetAt(layer, frame);
  return setOffset(doc, layerId, frame, { x: (here?.x ?? 0) + dx * step, y: (here?.y ?? 0) + dy * step });
}

/** The layers a folder move reaches: those in the folder and in the folders inside it that have a drawing on `frame`. */
export function folderLayers(doc: Doc, folderId: Id, frame: number): Layer[] {
  return layersUnder(doc, folderId).filter((l) => canOffset(l) && !l.locked && !!celAt(l, frame));
}

/** Moves every drawing in the folder (and the folders inside it) on `frame` by the same amount, so the group moves together. Returns how many moved. */
export function nudgeFolder(doc: Doc, folderId: Id, frame: number, dx: number, dy: number): number {
  let n = 0;
  for (const l of folderLayers(doc, folderId, frame)) if (nudge(doc, l.id, frame, dx, dy)) n++;
  return n;
}

/** Puts every drawing in the folder back where it was drawn on `frame`. Returns how many moved. */
export function resetFolder(doc: Doc, folderId: Id, frame: number): number {
  let n = 0;
  for (const l of folderLayers(doc, folderId, frame)) if (setOffset(doc, l.id, frame, undefined)) n++;
  return n;
}
