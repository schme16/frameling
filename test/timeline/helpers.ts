import type { Doc, Id, Layer } from '../../src/core/format';
import { newDoc, newVectorDrawing, newPixelDrawing, pixelGrid } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';

/** Puts a cel (with a fresh drawing) on a layer. */
export function addCel(doc: Doc, layer: Layer, start: number, length: number): Id {
  const d = layer.kind === 'pixel' ? newPixelDrawing(pixelGrid(doc, layer).width, pixelGrid(doc, layer).height) : newVectorDrawing();
  doc.drawings[d.id] = d;
  const id = `c${start}_${length}_${Math.random().toString(36).slice(2, 6)}`;
  layer.cels.push({ id, start, length, drawingId: d.id });
  layer.cels.sort((a, b) => a.start - b.start);
  return id;
}

/** A doc with one layer and cels given as [start, length] pairs. */
export function docWith(cels: [number, number][], length = 24): Doc {
  const doc = newDoc({ length });
  for (const [s, l] of cels) addCel(doc, doc.layers[0], s, l);
  return doc;
}

export function storeWith(cels: [number, number][], length = 24) {
  return resetStore(docWith(cels, length));
}

/** The layer's cels as [start, length] pairs, for easy comparing. */
export function shape(layer: Layer): [number, number][] {
  return layer.cels.map((c) => [c.start, c.length]);
}

/** Cels are sorted, positive and never overlap. */
export function isTidy(layer: Layer): boolean {
  let at = 0;
  for (const c of layer.cels) {
    if (c.length < 1 || c.start < at) return false;
    at = c.start + c.length;
  }
  return true;
}
