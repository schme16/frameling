// A small picture of a document's first frame, for lists ("Recover unsaved work..."). Page side only: it needs a canvas.
import type { Doc } from '../core/format';
import { renderFrameToCanvas } from '../core/render';

/** A PNG data: URL, about `size` pixels on the long side, or undefined when drawing it fails. */
export async function thumbnailOf(doc: Doc, size = 120): Promise<string | undefined> {
  try {
    const scale = size / Math.max(doc.width, doc.height);
    const c = renderFrameToCanvas(doc, 0, scale);
    // Pixel art stays blocky when shrunk or grown this little, and a see-through drawing gets its stage colour or white.
    const flat = new OffscreenCanvas(c.width, c.height);
    const g = flat.getContext('2d')!;
    g.fillStyle = doc.background ?? '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(c, 0, 0);
    const blob = await flat.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return 'data:image/png;base64,' + btoa(bin);
  } catch {
    return undefined;
  }
}
