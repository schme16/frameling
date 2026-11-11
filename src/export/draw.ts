// Drawing document frames onto canvases for export. Everything goes through render.ts's renderFrame, so an export
// always looks exactly like the canvas does.
import type { Doc } from '../core/format';
import { renderFrame } from '../core/render';
import type { RawImage } from '../io/png';

export type BackgroundMode = 'doc' | 'none' | 'white';

export interface DrawTarget {
  width: number;
  height: number;
  scale: number;
  background: BackgroundMode;
  /** Keep hard edges when scaling up (a document made only of pixel layers). */
  crisp?: boolean;
}

/** How the background should be painted: see-through when asked and allowed, else the document's own, else white. */
export function backgroundFor(doc: Doc, wantTransparent: boolean, formatAllowsAlpha: boolean): BackgroundMode {
  if (wantTransparent && formatAllowsAlpha) return 'none';
  return doc.background ? 'doc' : 'white';
}

export function makeCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height);
}

/** Draws one frame onto `canvas` (cleared first). */
export function drawFrame(canvas: OffscreenCanvas, doc: Doc, frame: number, t: DrawTarget): OffscreenCanvas {
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  // Videos need even sizes, so the canvas can be a pixel bigger than the drawing. That extra edge gets the background too.
  if (t.background === 'white') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
  } else if (t.background === 'doc' && doc.background) {
    g.fillStyle = doc.background;
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  g.save();
  g.scale(t.scale, t.scale);
  // Layers that fade (opacity under 100%) are drawn small and scaled up, so smoothing would blur pixel art.
  if (t.crisp) g.imageSmoothingEnabled = false;
  renderFrame(g, doc, frame, { background: false });
  g.restore();
  return canvas;
}

/** The canvas as plain RGBA bytes. */
export function readPixels(canvas: OffscreenCanvas): RawImage {
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const d = g.getImageData(0, 0, canvas.width, canvas.height);
  return { width: d.width, height: d.height, pixels: d.data };
}
