// Reading a picture file into frames: PNG and GIF with our own readers (so they work the same everywhere and in tests),
// anything else the browser can show (WebP, JPEG, BMP, PNG kinds we don't read) through the page's own decoder.
import { decodePng, PNG_SIGNATURE } from '../../io/png';
import { decodeGif, GifProblem, isGif } from './gif';

export interface PictureFrame {
  pixels: Uint8ClampedArray;
  /** Milliseconds it shows (missing in a still picture). */
  delay?: number;
}

export interface Picture {
  width: number;
  height: number;
  /** One for a still picture, one per frame for a GIF. */
  frames: PictureFrame[];
  kind: 'png' | 'gif' | 'other';
  /** Anything odd the reader noticed. */
  notes: string[];
}

export class PictureProblem extends Error {}

export const PICTURE_EXT = /\.(png|gif|webp|jpe?g|bmp)$/i;
export const PICTURE_ACCEPT = '.png,.gif,.webp,.jpg,.jpeg,.bmp';

const isPng = (b: Uint8Array): boolean => b.length > 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);

/** A picture from the bytes of a file. Throws PictureProblem in plain words when it can't. */
export async function decodePicture(bytes: Uint8Array): Promise<Picture> {
  if (isGif(bytes)) {
    try {
      const g = decodeGif(bytes);
      return { width: g.width, height: g.height, frames: g.frames, kind: 'gif', notes: g.notes };
    } catch (e) {
      throw new PictureProblem(e instanceof GifProblem ? e.message : 'Frameling could not read that GIF.');
    }
  }
  if (isPng(bytes)) {
    try {
      const img = decodePng(bytes);
      return { width: img.width, height: img.height, frames: [{ pixels: img.pixels }], kind: 'png', notes: [] };
    } catch {
      // Interlaced and other rarer PNG kinds: the page can read those.
    }
  }
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') throw new PictureProblem('Frameling could not read that picture.');
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    const data = g.getImageData(0, 0, bmp.width, bmp.height);
    return { width: bmp.width, height: bmp.height, frames: [{ pixels: new Uint8ClampedArray(data.data.buffer) }], kind: 'other', notes: [] };
  } catch {
    throw new PictureProblem('Frameling could not read that picture. It may be damaged, or not a picture.');
  }
}
