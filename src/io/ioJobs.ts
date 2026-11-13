/**
 * The heavy parts of opening and saving a file, as plain functions on bytes, so they can run on a worker thread (see
 * ioWorker.ts) or right here when there is no worker (Node tests, a page that cannot start one).
 */
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { findZipEntry, inflateNative } from './zipPeek';
import { decodePng, type RawImage } from './png';

/** The most one entry of a file may inflate to (a zip bomb stops here). */
export const MAX_UNZIPPED = 1024 * 1024 * 1024;

export type IoRequest = { id: number; kind: 'zip'; files: Zippable; level: number } | { id: number; kind: 'png'; bytes: Uint8Array } | { id: number; kind: 'inflate'; bytes: Uint8Array };
export type IoReply =
  | { id: number; ok: true; zip: Uint8Array }
  | { id: number; ok: true; image: RawImage }
  | { id: number; ok: true; text: Uint8Array }
  | { id: number; ok: false; error: string };

/** Does one job and says which buffers can be handed over rather than copied. */
export function runJob(req: IoRequest): { reply: IoReply; transfer: ArrayBuffer[] } {
  try {
    if (req.kind === 'inflate') throw new Error('inflate waits on the platform: use runJobAsync');
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

/** `doc.json` of a file inflated with the platform's zlib when it has one (much quicker than fflate), else with fflate. */
async function inflateDoc(bytes: Uint8Array): Promise<Uint8Array> {
  const ent = findZipEntry(bytes, 'doc.json');
  if (ent && ent.size <= MAX_UNZIPPED) {
    const inf = ent.method === 8 ? await inflateNative(ent.data) : ent.data.slice();
    if (inf && inf.length === ent.size) return inf;
  }
  const e = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_UNZIPPED && f.name === 'doc.json' });
  if (!e['doc.json']) throw new Error('no doc');
  return e['doc.json'];
}

/** `runJob`, for the jobs that wait on the platform too. */
export async function runJobAsync(req: IoRequest): Promise<{ reply: IoReply; transfer: ArrayBuffer[] }> {
  if (req.kind !== 'inflate') return runJob(req);
  try {
    const inf = await inflateDoc(req.bytes);
    return { reply: { id: req.id, ok: true, text: inf }, transfer: [inf.buffer as ArrayBuffer] };
  } catch (e) {
    return { reply: { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }, transfer: [] };
  }
}
