// Picking a picture for the pixel brush's grain or dual tip: ask for the file, read it with the size checks, boil it down to a
// texture picture. Says in plain words what went wrong.
import { ImageProblem, readImageBytes, readImageFile, type ImagePixels } from '../brushes/imageIn';
import { pickFiles } from '../import/pick';
import { PICTURE_ACCEPT } from '../pixel/import/picture';
import { toast } from '../ui/toast';
import { pictureFromPixels, type TexturePicture } from './texturePicture';

/** A texture picture from decoded pixels, or a plain-words reason it will not do. */
export function textureFromImage(img: ImagePixels): { ok: true; picture: TexturePicture } | { ok: false; why: string } {
  const r = pictureFromPixels(img.width, img.height, img.rgba);
  if (r.ok) return r;
  return { ok: false, why: r.why === 'flat' ? 'That picture is one flat shade, so it would make no texture. Pick one with some light and dark in it.' : 'There is nothing in that picture.' };
}

/** The texture picture from a file's bytes (for tests and the help pictures), or null with a toast. */
export async function textureFromBytes(bytes: Uint8Array): Promise<TexturePicture | null> {
  try {
    const t = textureFromImage(await readImageBytes(bytes));
    if (t.ok) return t.picture;
    toast(t.why, { kind: 'warn', duration: 8000 });
  } catch (e) {
    toast(e instanceof ImageProblem ? e.message : 'That picture could not be used.', { kind: 'warn', duration: 8000 });
  }
  return null;
}

/** Asks for a picture file and makes a texture of it. Null when cancelled or when it would not do. */
export async function pickTexturePicture(): Promise<TexturePicture | null> {
  const [f] = await pickFiles(PICTURE_ACCEPT);
  if (!f) return null;
  try {
    const t = textureFromImage(await readImageFile(f.file));
    if (t.ok) return t.picture;
    toast(t.why, { kind: 'warn', duration: 8000 });
  } catch (e) {
    toast(e instanceof ImageProblem ? e.message : 'That picture could not be used.', { kind: 'warn', duration: 8000 });
  }
  return null;
}
