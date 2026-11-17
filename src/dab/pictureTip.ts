// Picture tips, grain and dual dots from a picture: what the buttons and the palette commands do. The editor itself is
// src/brushes/TipEditor.tsx; reading a file safely is src/brushes/imageIn.ts.
import { openTipEditor, type EditedTip } from '../brushes/TipEditor';
import { pickPictureTip } from '../brushes/tipEdit';
import { DEFAULT_DUAL, DEFAULT_GRAIN } from './texture';
import { pickTexturePicture } from './texturePick';
import { getDab, setDab } from './settings';

/** Makes the edited tip the brush's tip. A first picture also sets the size that puts it down pixel for pixel, with the dabs side by side. */
export function applyEditedTip(t: EditedTip): void {
  const had = getDab().picture;
  setDab({ tip: 'picture', picture: t.stamp, ...(had ? {} : { size: t.size, spacing: 1 }) });
}

/** Opens the editor on the brush's picture tip, or on a blank grid when it has none. */
export function editPictureTip(): void {
  openTipEditor(applyEditedTip, getDab().picture);
}

/** Asks for a picture file and opens the editor on it, so it can be tidied before it becomes the tip. */
export function pictureTipFromFile(): Promise<boolean> {
  return pickPictureTip((grid, colour) => openTipEditor(applyEditedTip, null, { grid, colour }));
}

/** Asks for a picture and makes it the paper the brush catches on. */
export async function grainFromPicture(): Promise<boolean> {
  const picture = await pickTexturePicture();
  if (!picture) return false;
  setDab({ grain: { ...(getDab().grain ?? DEFAULT_GRAIN), picture } });
  return true;
}

/** Asks for a picture and makes it the dots of the dual tip. */
export async function dualFromPicture(): Promise<boolean> {
  const picture = await pickTexturePicture();
  if (!picture) return false;
  setDab({ dual: { ...(getDab().dual ?? DEFAULT_DUAL), picture, scale: 1 } });
  return true;
}
