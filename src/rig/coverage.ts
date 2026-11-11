// Which squares of a mesh have art in them: the layer's drawing drawn small once, then looked up. Needs a canvas, so
// without one (tests) every square counts.
import type { Doc, Layer } from '../core/format';
import { celAt } from '../core/doc';
import { drawDrawing } from '../core/render';

export function artCoverage(doc: Doc, layer: Layer, frame: number): ((x: number, y: number, w: number, h: number) => boolean) | undefined {
  if (typeof OffscreenCanvas === 'undefined') return undefined;
  const cel = celAt(layer, frame) ?? layer.cels[0];
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  if (!d) return undefined;
  const k = Math.min(1, 512 / Math.max(doc.width, doc.height));
  const w = Math.max(1, Math.ceil(doc.width * k));
  const h = Math.max(1, Math.ceil(doc.height * k));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.scale(k, k);
  drawDrawing(g, d, layer.kind === 'pixel' ? layer.pixelSize : 1);
  const px = g.getImageData(0, 0, w, h).data;
  return (x, y, cw, ch) => {
    const x0 = Math.max(0, Math.floor(x * k) - 1);
    const y0 = Math.max(0, Math.floor(y * k) - 1);
    const x1 = Math.min(w - 1, Math.ceil((x + cw) * k) + 1);
    const y1 = Math.min(h - 1, Math.ceil((y + ch) * k) + 1);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (px[(j * w + i) * 4 + 3] > 8) return true;
    return false;
  };
}
