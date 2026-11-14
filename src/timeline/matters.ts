// When does a timeline question make a difference? Plain maths on the document, so the answer is the same for the
// commands, the grid and the tests. When every answer would do the same thing, Frameling just does it and asks nothing.
import { celAt } from '../core/doc';
import type { Cel, Doc, Drawing, Id } from '../core/format';

/** Whether a drawing has nothing in it: no shapes, no painted pixel, no tile, no pose. A camera key is never blank (it always carries its view). */
export function drawingIsBlank(d: Drawing | undefined): boolean {
  if (!d) return true;
  if (d.kind === 'camera') return false;
  if (d.kind === 'vector') return d.shapes.length === 0 && !d.pose && !(d.kept && d.kept.length);
  if (d.kind === 'pixel') {
    for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i] !== 0) return false;
    return !d.ext;
  }
  for (let i = 0; i < d.cells.length; i++) if (d.cells[i] !== 0) return false;
  return !d.ext;
}

/**
 * "Start blank or as a copy" only differs when there is a drawing with something in it to copy. On an empty frame, and
 * on a drawing with nothing drawn yet, a copy and a blank page are the same page.
 */
export function newKeyMatters(doc: Doc, layerId: Id, frame: number): boolean {
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer || layer.kind === 'camera') return false;
  const cel = celAt(layer, frame);
  if (!cel) return false;
  return !drawingIsBlank(doc.drawings[cel.drawingId]);
}

/** "Every layer or just this one" only differs when there is another layer to leave out. */
export function frameScopeMatters(doc: Doc): boolean {
  return doc.layers.length > 1;
}

/**
 * "Move the drawings after it later, or cover them" only differs when the drawing, placed at `start` for `length`
 * frames, runs into another one on the layer. `cels` are the layer's drawings (the placed one may be among them).
 */
export function holdLongerMatters(cels: readonly Cel[], placedId: Id, start: number, length: number): boolean {
  const end = start + Math.max(1, Math.round(length));
  return cels.some((c) => c.id !== placedId && c.start >= start && c.start < end);
}
