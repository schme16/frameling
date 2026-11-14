// Draws a frame at any size, and as a square picture (icons, favicons, stickers). Each size is drawn straight from the
// drawing, not shrunk from a big picture, so vector art stays sharp at 16 pixels and pixel art stays crisp.
import type { Doc } from '../../core/format';
import { encodePng } from '../../io/png';
import { drawFrame, readPixels, type BackgroundMode } from '../draw';
import { fitBox, type IconFit } from '../icons';

export interface SquareSource {
  doc: Doc;
  /** The document frame to draw. */
  frame: number;
  bg: BackgroundMode;
  /** A drawing made only of pixels: keep hard edges when it grows. */
  crisp: boolean;
  fit: IconFit;
}

/** The frame as a square picture of `size` pixels. */
export function squareCanvas(src: SquareSource, size: number): OffscreenCanvas {
  const { doc } = src;
  const box = fitBox(doc.width, doc.height, size, src.fit);
  const inner = new OffscreenCanvas(box.width, box.height);
  drawFrame(inner, doc, src.frame, { width: box.width, height: box.height, scale: box.scale, background: src.bg, crisp: src.crisp && box.scale >= 1 });
  if (box.width === size && box.height === size) return inner;
  const out = new OffscreenCanvas(size, size);
  const g = out.getContext('2d', { willReadFrequently: true })!;
  // The margins of a drawing that is not square take the page colour too, so a coloured icon is coloured all over.
  if (src.bg === 'white') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
  } else if (src.bg === 'doc' && doc.background) {
    g.fillStyle = doc.background;
    g.fillRect(0, 0, size, size);
  }
  g.imageSmoothingEnabled = !(src.crisp && box.scale >= 1);
  g.drawImage(inner, box.x, box.y);
  return out;
}

export const squarePng = (src: SquareSource, size: number): Uint8Array => encodePng(readPixels(squareCanvas(src, size)));
