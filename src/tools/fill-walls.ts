/**
 * What the pixel bucket treats as a wall when "Use lines from all layers" is on: whatever is drawn on the other
 * visible layers, seen at the pixel layer's own grid. Each layer is drawn on its own, so a backdrop layer that
 * covers the whole picture can be told apart from line art (see `wallsFromLayers`).
 */
import type { Doc, Layer, PixelLayer } from '../core/format';
import { pixelGrid } from '../core/doc';
import { renderFrame } from '../core/render';
import { wallsFromLayers } from '../geometry/pixel-fill';

/** Walls (one byte per pixel of `layer`'s grid, 1 = wall) from every other visible layer at `frame`, or null if none. */
export function wallsFor(doc: Doc, layer: PixelLayer, frame: number): Uint8Array | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const { width, height } = pixelGrid(doc, layer);
  if (width <= 0 || height <= 0) return null;
  const others: Layer[] = doc.layers.filter((l) => l.id !== layer.id && l.visible && l.kind !== 'camera');
  const drawn: Uint8ClampedArray[] = [];
  for (const other of others) {
    const c = new OffscreenCanvas(width, height);
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) continue;
    g.scale(1 / layer.pixelSize, 1 / layer.pixelSize);
    renderFrame(g, doc, frame, { background: false, camera: false, layerFilter: (l) => l.id === other.id });
    drawn.push(g.getImageData(0, 0, width, height).data);
  }
  return wallsFromLayers(drawn, width, height);
}
