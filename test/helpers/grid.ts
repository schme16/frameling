// Pixel drawings hold only their painted block. Tests that look at pixels by grid position read them through this.
import { pixelGrid } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { gridPixels } from '../../src/core/pixelBounds';
import { store } from '../../src/core/store';

/** The drawing as a whole-grid picture (x and y gone, width and height the layer's art grid). */
export function asGrid<T extends PixelDrawing | undefined>(d: T, doc: Doc = store().get().doc): T {
  if (!d) return d;
  const layer = doc.layers.find((l) => l.kind === 'pixel' && l.cels.some((c) => c.drawingId === d.id));
  if (!layer || layer.kind !== 'pixel') return d;
  const g = pixelGrid(doc, layer);
  return { id: d.id, kind: 'pixel', width: g.width, height: g.height, pixels: gridPixels(d, g.width, g.height) } as T;
}
