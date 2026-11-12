/**
 * The heavy parts of opening and saving a file, as plain functions on bytes, so they can run on a worker thread (see
 * ioWorker.ts) or right here when there is no worker (Node tests, a page that cannot start one).
 */
import { strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { decodePng, type RawImage } from './png';

/** The most one entry of a file may inflate to (a zip bomb stops here). */
export const MAX_UNZIPPED = 1024 * 1024 * 1024;

export type IoRequest = { id: number; kind: 'zip'; files: Zippable; level: number } | { id: number; kind: 'png'; bytes: Uint8Array } | { id: number; kind: 'doc'; bytes: Uint8Array };
export type IoReply =
  | { id: number; ok: true; zip: Uint8Array }
  | { id: number; ok: true; image: RawImage }
  | { id: number; ok: true; manifest: unknown; raw: unknown }
  | { id: number; ok: false; error: string };

/** `manifest.json` and `doc.json` of a file, read and parsed (throws when either is missing or is not JSON). */
export function readDocJson(bytes: Uint8Array): { manifest: unknown; raw: unknown } {
  const e = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_UNZIPPED && (f.name === 'manifest.json' || f.name === 'doc.json') });
  if (!e['manifest.json'] || !e['doc.json']) throw new Error('not a Frameling file');
  return { manifest: JSON.parse(strFromU8(e['manifest.json'])), raw: JSON.parse(strFromU8(e['doc.json'])) };
}

/** Does one job and says which buffers can be handed over rather than copied. */
export function runJob(req: IoRequest): { reply: IoReply; transfer: ArrayBuffer[] } {
  try {
    if (req.kind === 'zip') {
      const zip = zipSync(req.files, { level: req.level as 6 });
      return { reply: { id: req.id, ok: true, zip }, transfer: [zip.buffer as ArrayBuffer] };
    }
    if (req.kind === 'doc') return { reply: { id: req.id, ok: true, ...readDocJson(req.bytes) }, transfer: [] };
    const image = decodePng(req.bytes);
    return { reply: { id: req.id, ok: true, image }, transfer: [image.pixels.buffer as ArrayBuffer] };
  } catch (e) {
    return { reply: { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }, transfer: [] };
  }
}
