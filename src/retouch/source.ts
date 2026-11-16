// What a clone stamp copies from when it is set to "everything you can see": the whole frame as it looks, drawn once when the
// stroke begins and read from there, so the copy is of the picture as it was before the stroke and never of its own paint.
import type { Doc, PixelLayer } from '../core/format';
import { pixelGrid } from '../core/doc';
import { renderFrame } from '../core/render';
import type { Reader } from './maths';

export interface Snapshot {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/** A reader over a picture held as plain pixels. Anything off the picture is see-through. */
export function readerOf(img: Snapshot): Reader {
  const { width, height, pixels } = img;
  return (x, y, out) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      out[0] = out[1] = out[2] = out[3] = 0;
      return;
    }
    const i = (y * width + x) * 4;
    out[0] = pixels[i];
    out[1] = pixels[i + 1];
    out[2] = pixels[i + 2];
    out[3] = pixels[i + 3];
  };
}

/** The frame as it looks (every layer, no page colour, no camera), at the layer's own pixel size. Null where there is no canvas to draw on. */
export function visibleSnapshot(doc: Doc, layer: PixelLayer, frame: number): Snapshot | null {
  const { width, height } = pixelGrid(doc, layer);
  let g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  try {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  } catch {
    return null;
  }
  if (!g) return null;
  const s = 1 / layer.pixelSize;
  g.setTransform(s, 0, 0, s, 0, 0);
  g.imageSmoothingEnabled = false;
  renderFrame(g as CanvasRenderingContext2D, doc, frame, { background: false, camera: false });
  const img = g.getImageData(0, 0, width, height);
  return { width, height, pixels: img.data };
}
