/**
 * The heavy parts of opening and saving a file, as plain functions on bytes, so they can run on a worker thread (see
 * ioWorker.ts) or right here when there is no worker (Node tests, a page that cannot start one).
 */
import { zipSync, type Zippable } from 'fflate';
import { decodePng, type RawImage } from './png';

export type IoRequest = { id: number; kind: 'zip'; files: Zippable; level: number } | { id: number; kind: 'png'; bytes: Uint8Array };
export type IoReply = { id: number; ok: true; zip: Uint8Array } | { id: number; ok: true; image: RawImage } | { id: number; ok: false; error: string };

/** Does one job and says which buffers can be handed over rather than copied. */
export function runJob(req: IoRequest): { reply: IoReply; transfer: ArrayBuffer[] } {
  try {
    if (req.kind === 'zip') {
      const zip = zipSync(req.files, { level: req.level as 6 });
      return { reply: { id: req.id, ok: true, zip }, transfer: [zip.buffer as ArrayBuffer] };
    }
    const image = decodePng(req.bytes);
    return { reply: { id: req.id, ok: true, image }, transfer: [image.pixels.buffer as ArrayBuffer] };
  } catch (e) {
    return { reply: { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }, transfer: [] };
  }
}
