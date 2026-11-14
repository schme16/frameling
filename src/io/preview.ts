// The little picture saved inside a .frameling file (`preview.png`), for lists of drawings: Open recent, the welcome
// sheet. The first frame, a few KB, with the page's own colour behind it (see-through stays see-through, so the list can
// put its checkerboard there). Page side: it needs a canvas. The choosing is pure so it can be tested.
import type { Doc } from '../core/format';
import { renderFrameToCanvas } from '../core/render';

/** The longest side, in pixels, to try first; a drawing that comes out heavier is tried smaller. Enough for a 200% interface size. */
export const PREVIEW_SIZES = [160, 128, 96];
/** The most a picture may weigh. A few KB is usual; this is the ceiling. */
export const PREVIEW_MAX_BYTES = 40_000;

/** Which frames to try, best first: the first, then where you are, the middle and the last. A drawing whose first frame is empty shows the first that is not. */
export function previewFrameOrder(length: number, current: number): number[] {
  const last = Math.max(0, length - 1);
  const out: number[] = [];
  for (const f of [0, Math.min(Math.max(0, Math.floor(current)), last), Math.floor(last / 2), last]) if (!out.includes(f)) out.push(f);
  return out;
}

/** True when nothing is drawn: every pixel is fully see-through. */
export function isBlankPicture(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) return false;
  return true;
}

/** The size to draw at: the longest side is `size`, never below one pixel. */
export function previewDimensions(width: number, height: number, size: number): { scale: number; w: number; h: number } {
  const scale = size / Math.max(1, width, height);
  return { scale, w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

async function draw(doc: Doc, frame: number, size: number): Promise<{ png: Uint8Array; blank: boolean } | null> {
  const { scale, w, h } = previewDimensions(doc.width, doc.height, size);
  const c = renderFrameToCanvas(doc, frame, scale);
  const ctx = c.getContext('2d');
  const blank = ctx ? isBlankPicture(ctx.getImageData(0, 0, c.width, c.height).data) : false;
  const out = new OffscreenCanvas(w, h);
  const g = out.getContext('2d')!;
  // The page's own colour behind the drawing; none means see-through, and the list shows its checkerboard there.
  if (doc.background) {
    g.fillStyle = doc.background;
    g.fillRect(0, 0, w, h);
  }
  g.drawImage(c, 0, 0, w, h);
  const blob = await out.convertToBlob({ type: 'image/png' });
  return { png: new Uint8Array(await blob.arrayBuffer()), blank };
}

/** The picture to save in the file, or undefined when one can't be made (saving never waits on it or fails for it). */
export async function previewBytes(doc: Doc, current = 0): Promise<Uint8Array | undefined> {
  try {
    const frames = previewFrameOrder(doc.length, current);
    let frame = frames[0];
    for (const f of frames) {
      const first = await draw(doc, f, PREVIEW_SIZES[PREVIEW_SIZES.length - 1]);
      if (first && !first.blank) {
        frame = f;
        break;
      }
    }
    for (const size of PREVIEW_SIZES) {
      const got = await draw(doc, frame, size);
      if (got && got.png.length <= PREVIEW_MAX_BYTES) return got.png;
      if (got && size === PREVIEW_SIZES[PREVIEW_SIZES.length - 1]) return undefined;
    }
  } catch {
    // A picture is a bonus.
  }
  return undefined;
}
