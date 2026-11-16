/**
 * Turning a drawing key into one for another kind of layer, for pasting keys across vector and pixel layers. Vector
 * drawings become pixels on the layer's grid; pixel drawings become a vector drawing holding one picture. The same
 * conversions as pasting shapes and pixels (see commands.ts), so the two behave alike.
 */
import type { Doc, Layer, PixelDrawing, PixelLayer } from '../core/format';
import { pixelGrid, uid } from '../core/doc';
import { freeSymbolName } from '../core/symbols';
import { gridPixels, setGridPixels } from '../core/pixelBounds';
import type { ClipLayer, Convert, FrameClip } from '../timeline/frameClip';
import { pictureSymbol, shapesToPixels } from './convert';

export interface ConvertNotes {
  /** Pixels that were part see-through and became solid or clear. */
  softened: number;
  /** Drawings with shapes past the page edge. */
  offPage: number;
}

/** A `convert` for `pasteClip`, reading from `doc` (the document as it is before the paste) and adding up what it changed. */
export function keyConverter(doc: Doc, notes: ConvertNotes = { softened: 0, offPage: 0 }): Convert {
  const names = new Set<string>();
  return (clip: FrameClip, di: number, from: ClipLayer, to: Layer) => {
    const d = clip.drawings[di];
    if (d.kind === 'vector' && to.kind === 'pixel') {
      const grid = { ...pixelGrid(doc, to as PixelLayer), pixelSize: (to as PixelLayer).pixelSize };
      const r = shapesToPixels(doc, d.shapes, grid, !!(to as PixelLayer).paletteLock);
      notes.softened += r.softened;
      if (r.offPage) notes.offPage++;
      const out: PixelDrawing = { id: uid('p'), kind: 'pixel', width: 0, height: 0, pixels: new Uint8ClampedArray(0) };
      setGridPixels(out, r.pixels, grid.width, grid.height);
      return { drawing: out };
    }
    if (d.kind === 'pixel' && to.kind === 'vector' && from.grid) {
      let name = freeSymbolName(doc, 'Picture');
      for (let i = 2; names.has(name); i++) name = `Picture ${i + 1}`;
      names.add(name);
      const px = gridPixels(d, from.grid.width, from.grid.height);
      const sym = pictureSymbol(px, from.grid.width, from.grid.height, from.pixelSize ?? 1, name);
      // A drawing with nothing showing becomes an empty vector drawing, so the key still lands.
      if (!sym) return { drawing: { id: uid('v'), kind: 'vector', shapes: [] } };
      return { drawing: { id: uid('v'), kind: 'vector', shapes: [sym.instance] }, symbols: { [sym.symbolId]: sym.symbol }, drawings: [sym.drawing] };
    }
    return null;
  };
}

/** What a paste across kinds says it changed, in plain words. */
export function sayConverted(conv: { from: string; to: string; count: number }[], notes: ConvertNotes): string {
  const parts: string[] = [];
  for (const c of conv) {
    const n = c.count === 1 ? 'a drawing' : `${c.count} drawings`;
    if (c.from === 'vector' && c.to === 'pixel') parts.push(`Turned ${n} into pixels: curves became hard-edged pixels on this layer's grid, and they won't turn back into curves`);
    else if (c.from === 'pixel' && c.to === 'vector') parts.push(`Turned ${n} into ${c.count === 1 ? 'a picture' : 'pictures'}: they stay pixels, and you can move, turn and resize them`);
  }
  if (notes.offPage) parts.push('anything past the page edge was left out');
  return parts.length ? parts.join('; ') + '.' : '';
}
