// The browser's own picture encoders (JPEG and WebP), asked for through a canvas. Kept apart from the pure parts so those
// stay easy to test.
import { ExportProblem } from './problem';

export type EncodedType = 'image/jpeg' | 'image/webp' | 'image/png';

/** The canvas saved as the given picture type. `quality` is 0 to 1; for WebP, 1 means no loss at all. */
export async function canvasBytes(canvas: OffscreenCanvas, type: EncodedType, quality?: number): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type, ...(quality === undefined ? {} : { quality }) });
  // A browser that cannot make the type quietly hands back a PNG instead; say so rather than save the wrong thing.
  if (blob.type !== type) throw new ExportProblem(`This computer cannot make ${type === 'image/webp' ? 'WebP' : 'JPEG'} pictures.`);
  return new Uint8Array(await blob.arrayBuffer());
}

/** A copy of the canvas painted over white, for a format that has no see-through (JPEG would turn it black). */
export function onWhite(canvas: OffscreenCanvas): OffscreenCanvas {
  const flat = new OffscreenCanvas(canvas.width, canvas.height);
  const g = flat.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, flat.width, flat.height);
  g.drawImage(canvas, 0, 0);
  return flat;
}
