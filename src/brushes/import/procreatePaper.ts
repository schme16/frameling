// How big a Procreate grain picture is on the page. Read from 20 texture brushes whose own Grain.png could be found again
// in Procreate's picture of the stroke (docs/brush-import.md, "How big the paper is").
import { SMOOTH_GRAIN_SCALE } from '../../dab/texture';

/**
 * Procreate draws every brush's preview stroke on one canvas, 1500 pixels wide, and then shrinks the picture to the width
 * the file carries (1060 for most files, 327 for the Triumvirate and Pixel Perfect sets). Both widths gave the same
 * answer: the paper is `textureScale` grain pixels' worth of canvas, so `textureScale` 0.826 (the 25 Albaharu texture
 * brushes, whatever the brush size, grain picture or shape) made one grain pixel 0.583 of a picture pixel in a 1060 wide
 * picture, and Lace brush (scale 1.0) made it 0.219 in a 327 wide one: 0.583 / 0.826 and 0.219 / 1.0 are 1060 / 1500
 * and 327 / 1500 to within 1%.
 */
export const PREVIEW_CANVAS_WIDTH = 1500;
/** The width most files' pictures have, used when a file has none. */
export const USUAL_PICTURE_WIDTH = 1060;

/** The width of a PNG, read from its header (no decoding), or null when the bytes are not a PNG. */
export function pngWidth(bytes: Uint8Array): number | null {
  if (bytes.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47];
  for (let i = 0; i < 4; i++) if (bytes[i] !== sig[i]) return null;
  const w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  return w >= 1 && w < 65536 ? w : null;
}

/**
 * The `scale` (page pixels per pixel of the kept tile, a fraction allowed with `smooth`) that puts a grain picture at the
 * size Procreate's picture shows. The brush's size here is measured off that same picture, so the paper and the brush keep
 * the proportion they have there.
 * - `textureScale`: Procreate's own number.
 * - `pictureWidth`: the width of the file's picture of the stroke (null: the usual 1060).
 * - `grainPixels`: the longer side of Grain.png, and `tileSide` the side it was kept at (a 1840 pixel picture is kept at
 *   256, so one kept pixel is seven of the picture's).
 */
export function paperScale(textureScale: number, pictureWidth: number | null, grainPixels: number, tileSide: number): number {
  const s = Number.isFinite(textureScale) && textureScale > 0 ? textureScale : 1;
  const k = (pictureWidth ?? USUAL_PICTURE_WIDTH) / PREVIEW_CANVAS_WIDTH;
  const v = s * k * (grainPixels / Math.max(1, tileSide));
  return Math.round(Math.min(SMOOTH_GRAIN_SCALE.max, Math.max(SMOOTH_GRAIN_SCALE.min, v)) * 1000) / 1000;
}
