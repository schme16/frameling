// Shapes into pixels: draws one frame of a vector layer onto a grid at the pixel size and hands back the painted block.
import { drawingAt, celAt } from '../core/doc';
import type { Doc, Id, Layer, VectorDrawing } from '../core/format';
import { trimPixels, type Placed } from '../core/pixelBounds';
import { renderFrame } from '../core/render';
import { gridOf } from './size';

export type PixelEdges = 'hard' | 'smooth';

/** Hard edges: every pixel is wholly painted or wholly empty (a pixel that is half or more covered is painted). Changes the array in place. */
export function hardenEdges(px: Uint8ClampedArray, solidAt = 128): void {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] >= solidAt) px[i + 3] = 255;
    else px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
  }
}

/**
 * Hard edges for chunky pixels: `src` is the picture drawn `sub` times finer than the grid (sw x sh), and each art pixel
 * takes the colour most of its sub-pixels have, painted when half or more of them are. Averaging would smear a thin
 * outline into the colour beside it; this keeps the outline dark where it fills most of a pixel, as a person would.
 */
export function modePixels(src: Uint8ClampedArray, sw: number, sh: number, sub: number): Uint8ClampedArray {
  const gw = Math.floor(sw / sub);
  const gh = Math.floor(sh / sub);
  const out = new Uint8ClampedArray(gw * gh * 4);
  const keys = new Int32Array(sub * sub);
  const counts = new Int32Array(sub * sub);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let used = 0;
      let solid = 0;
      for (let dy = 0; dy < sub; dy++) {
        for (let dx = 0; dx < sub; dx++) {
          const i = ((y * sub + dy) * sw + x * sub + dx) * 4;
          if (src[i + 3] < 128) continue;
          solid++;
          const k = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
          let j = 0;
          while (j < used && keys[j] !== k) j++;
          if (j === used) {
            keys[used] = k;
            counts[used++] = 0;
          }
          counts[j]++;
        }
      }
      if (solid * 2 < sub * sub) continue;
      let best = 0;
      for (let j = 1; j < used; j++) if (counts[j] > counts[best]) best = j;
      const o = (y * gw + x) * 4;
      out[o] = keys[best] >> 16;
      out[o + 1] = (keys[best] >> 8) & 255;
      out[o + 2] = keys[best] & 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** The same layer with nothing that changes how it is drawn but its shapes: opacity, blend, effects and clipping go on the new layer instead. */
const plain = (l: Layer): Layer => ({ ...l, opacity: 1, blend: undefined, effects: undefined, clipToBelow: undefined, mask: undefined, folder: undefined } as Layer);

/**
 * One frame of a vector layer as pixels on the grid a pixel size makes. With `shapeIds` only those shapes are drawn (the
 * selection). The block is trimmed to the painted part, ready to be a pixel drawing's fields.
 */
export function rasterizeFrame(doc: Doc, layer: Layer, frame: number, o: { pixelSize: number; edges: PixelEdges; shapeIds?: readonly Id[] | null }): Placed {
  const g0 = gridOf(doc.width, doc.height, o.pixelSize);
  const only = plain(layer);
  const drawings = { ...doc.drawings };
  if (o.shapeIds?.length) {
    const cel = celAt(layer, frame);
    const d = cel ? doc.drawings[cel.drawingId] : undefined;
    if (cel && d?.kind === 'vector') {
      const keep = new Set(o.shapeIds);
      drawings[cel.drawingId] = { ...(d as VectorDrawing), shapes: d.shapes.filter((s) => keep.has(s.id)) };
    }
  }
  const temp: Doc = { ...doc, layers: [only], drawings, background: null, folders: undefined };
  // Hard chunky pixels are drawn finer and each pixel takes the colour most of it has (see modePixels).
  const sub = o.edges === 'hard' && o.pixelSize >= 2 ? Math.max(1, Math.min(4, o.pixelSize, Math.floor(Math.sqrt(16_000_000 / (g0.width * g0.height))))) : 1;
  const c = new OffscreenCanvas(g0.width * sub, g0.height * sub);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.scale(sub / o.pixelSize, sub / o.pixelSize);
  renderFrame(g, temp, frame, { background: false, includeHidden: true, camera: false });
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let out: Uint8ClampedArray;
  if (sub > 1) out = modePixels(px, c.width, c.height, sub);
  else {
    out = new Uint8ClampedArray(px.length);
    out.set(px);
    if (o.edges === 'hard') hardenEdges(out);
  }
  return trimPixels(out, g0.width, g0.height);
}

/** Does the layer have anything to turn at this frame? */
export function hasVectorArt(doc: Doc, layer: Layer, frame: number): boolean {
  const d = drawingAt(doc, layer, frame);
  return d?.kind === 'vector' && d.shapes.length > 0;
}
