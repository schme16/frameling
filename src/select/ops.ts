/**
 * Running a whole-drawing pixel operation (flip, turn, outline, reduce to palette) on just the selected pixels. Pure.
 *
 * - `clip`: the operation runs on the drawing, and only the selected pixels take the result (reduce to palette).
 * - `transform`: the selected pixels are lifted out, flipped or turned around the middle of the selection, and put
 *   back; the selection turns with them.
 * - `outline`: an outline round the selected art. It may go just outside the selection, but only onto empty pixels.
 */
import type { Img, PixelBox } from '../pixel/transform';
import { clearPixels, clipToMask, extractPixels, maskBounds, maskFromAlpha, maskToImage, overlayPixels, type Mask } from './mask';

export type SelectionKind = 'clip' | 'transform' | 'outline';

/** A pixel operation. `box` is the selection's box, to flip or turn around (missing: the drawing's own content). */
export type PixelOp = (img: Img, box?: PixelBox) => Uint8ClampedArray | null;

export function applyInSelection(img: Img, m: Mask, kind: SelectionKind, op: PixelOp): { pixels: Uint8ClampedArray; mask: Mask } | null {
  const { width, height, pixels } = img;
  if (kind === 'clip') {
    const out = op(img);
    return out ? { pixels: clipToMask(pixels, out, m), mask: m } : null;
  }
  const box = maskBounds(m);
  if (!box) return null;
  const lifted = extractPixels(pixels, m);
  if (kind === 'outline') {
    const out = op({ width, height, pixels: lifted });
    if (!out) return null;
    const res = new Uint8ClampedArray(pixels);
    for (let i = 0; i < m.bits.length; i++) {
      const j = i * 4;
      if (!m.bits[i] && pixels[j + 3] !== 0) continue;
      if (out[j] === lifted[j] && out[j + 1] === lifted[j + 1] && out[j + 2] === lifted[j + 2] && out[j + 3] === lifted[j + 3]) continue;
      res[j] = out[j];
      res[j + 1] = out[j + 1];
      res[j + 2] = out[j + 2];
      res[j + 3] = out[j + 3];
    }
    return { pixels: res, mask: m };
  }
  const turned = op({ width, height, pixels: lifted }, box);
  if (!turned) return null;
  const turnedMask = op({ width, height, pixels: maskToImage(m) }, box);
  const mask = turnedMask ? maskFromAlpha(turnedMask, width, height) : m;
  return { pixels: overlayPixels(clearPixels(pixels, m), turned, width, height, 0, 0), mask };
}
