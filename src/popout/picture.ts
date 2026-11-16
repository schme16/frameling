// Saving the picture a reviewer was sent, as a PNG. It is made the way an export makes a frame (src/export/draw.ts): the
// layers that are showing, the reference pictures left out, through the camera, on the page's own background. So what the
// sharer hid (a layer switched off, a tracing picture) is not in it, even though the reviewer's copy holds every layer. It is
// one flat picture of the frame on screen, never the layered drawing, and the reviewer's own notes and marks are not on it.
import type { Doc } from '../core/format';
import { drawFrame, backgroundFor, makeCanvas } from '../export/draw';
import { canvasBytes } from '../export/encode';
import { pictureFileName } from '../review/pictureName';
import { pageOf, shownFrame, withoutPictures } from './show';

/** What the Save picture button says it does, so nobody expects the sharer's layered drawing. */
export const SAVE_PICTURE_NOTE = 'Saves the picture you can see as one flat PNG, the way an export would. It is not their layered drawing, and your own notes are not on it.';

/** The frame being looked at: the one the reviewer has moved to, or the sharer's. */
export function pictureFrame(doc: Doc, sharerFrame: number, freeFrame: number | null): number {
  return shownFrame(doc, freeFrame ?? sharerFrame);
}

/** One frame of what a reviewer was sent, drawn at the drawing's own size. */
export function pictureCanvas(doc: Doc, frame: number): OffscreenCanvas {
  const page = withoutPictures(pageOf(doc));
  const out = makeCanvas(Math.max(1, Math.round(page.width)), Math.max(1, Math.round(page.height)));
  // A page with no colour of its own stays see-through, as it does in an export.
  return drawFrame(out, page, Math.max(0, Math.min(page.length - 1, frame)), { width: out.width, height: out.height, scale: 1, background: backgroundFor(page, false, true) });
}

export async function picturePng(doc: Doc, frame: number): Promise<Uint8Array> {
  return canvasBytes(pictureCanvas(doc, frame), 'image/png');
}

export { pictureFileName };
