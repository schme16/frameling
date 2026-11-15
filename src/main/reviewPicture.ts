// What the desktop side accepts when a reviewer's window asks to save the picture it holds. The page is not trusted any more
// than the link is: it must be a real PNG of a sane size, and the name is made plain again here before it reaches a dialog.
import { pictureFileName } from '../review/pictureName';

/** The most a saved picture may be (a big page at full size is a few megabytes). */
export const MAX_PICTURE_BYTES = 96 * 1024 * 1024;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PictureAsk {
  png: Uint8Array;
  fileName: string;
}

/** A save-picture message made safe, or null when it is not one. */
export function readPictureAsk(m: unknown): PictureAsk | null {
  const x = m as { t?: unknown; png?: unknown; name?: unknown } | null;
  if (!x || x.t !== 'savePicture') return null;
  const png = x.png instanceof Uint8Array ? x.png : null;
  if (!png || png.length < 33 || png.length > MAX_PICTURE_BYTES) return null;
  if (!SIGNATURE.every((b, i) => png[i] === b)) return null;
  return { png, fileName: pictureFileName(x.name) };
}
