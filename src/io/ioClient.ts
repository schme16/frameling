/**
 * Moves the heavy parts of opening and saving a file onto worker threads, so the page keeps drawing and answering
 * the pen meanwhile. Every function says "no worker" (null / empty) when it cannot, and the caller then does the job
 * itself with the same code (see ioJobs.ts), so nothing depends on a worker being there.
 */
import type { Zippable } from 'fflate';
import type { RawImage } from './png';
import type { IoReply } from './ioJobs';
import { WorkerPool, type WorkerLike } from './workerPool';

let pool: WorkerPool | null | undefined;

function getPool(): WorkerPool | null {
  if (pool !== undefined) return pool;
  if (typeof Worker === 'undefined') return (pool = null);
  const n = Math.max(1, Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
  pool = new WorkerPool(() => new Worker(new URL('./ioWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike, n);
  return pool;
}

/** Test hook: use this pool (or none) instead of starting real workers. */
export function setIoPool(p: WorkerPool | null | undefined): void {
  pool = p;
}

/**
 * The zipped bytes of `files`, made on a worker; null when there is none (or it failed). The files are copied across,
 * except those in `give`, whose buffers are handed over (they are empty here afterwards, so a caller that gets null
 * must make its files again).
 */
export async function zipInWorker(files: Zippable, level: number, give: Uint8Array[] = []): Promise<Uint8Array | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.run<IoReply>({ kind: 'zip', files, level }, give.map((g) => g.buffer as ArrayBuffer));
    return r.ok && 'zip' in r ? r.zip : null;
  } catch {
    return null;
  }
}

/** Pictures this small are decoded right where they are, a trip to a worker costs more than they take. */
const WORKER_MIN_PIXELS = 1 << 20;

/** The pixel count a PNG says it has (from its header), or 0 when it does not look like one. */
export function pngPixels(bytes: Uint8Array): number {
  if (bytes.length < 24) return 0;
  const u = (at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  return u(16) * u(20);
}

/**
 * Decodes the biggest of these PNGs on workers, in parallel, and gives back what it decoded by name. Pictures that are
 * small, or that a worker could not decode, are left out: decode those with `decodePng` as usual (a broken one then
 * throws where it always did). Does nothing when the pictures together are small or there are no workers.
 */
export async function decodePngsInWorkers(entries: Record<string, Uint8Array>, prefix = 'pixels/'): Promise<Map<string, RawImage>> {
  const out = new Map<string, RawImage>();
  const p = getPool();
  if (!p) return out;
  const jobs = Object.keys(entries)
    .filter((k) => k.startsWith(prefix))
    .map((k) => ({ k, px: pngPixels(entries[k]) }))
    .filter((j) => j.px > 0);
  if (jobs.reduce((s, j) => s + j.px, 0) < WORKER_MIN_PIXELS) return out;
  // Biggest first, so the last job to start is a small one.
  jobs.sort((a, b) => b.px - a.px);
  await Promise.all(
    jobs.map(async ({ k }) => {
      try {
        // A copy goes across (the zip's own buffer holds every picture and stays where it is).
        const bytes = entries[k].slice();
        const r = await p.run<IoReply>({ kind: 'png', bytes }, [bytes.buffer]);
        if (r.ok && 'image' in r) out.set(k, r.image);
      } catch {
        // Left for the caller to decode itself.
      }
    }),
  );
  return out;
}
