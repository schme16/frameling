// Takes the colours of a picture without freezing the page. The pixels go to a worker thread in small pieces (a
// piece is a quick copy, and the worker says when it has counted one, so progress is what it has really done). With
// no worker, or one that fails, the same counting runs on the page in small steps that give the page back between them.
// Either way the person can cancel at any moment.
import { Histogram, pickSteps, type ColourTable } from './quantise';
import type { FromWorker, ToWorker } from './quantise.worker';

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

export type Pixels = Uint8Array | Uint8ClampedArray;

export interface Picked {
  /** At most the limit, packed 0xRRGGBB. All of them when the picture has no more than the limit. */
  colours: number[];
  /** Distinct colours in the picture. When `exact` is false this is the number of groups it was counted in (the picture has many more). */
  distinct: number;
  exact: boolean;
  /** Solid pixels counted. */
  solid: number;
}

export interface Scan {
  /** Resolves once every pixel is counted. Rejects with Cancelled. */
  done: Promise<void>;
  /** The colours for a limit (quick: the counting is kept). Rejects with Cancelled. */
  pick(max: number): Promise<Picked>;
  cancel(): void;
}

interface WorkerLike {
  postMessage(msg: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

let makeWorker: (() => WorkerLike) | null | undefined;
function newWorker(): WorkerLike | null {
  if (makeWorker === null) return null;
  try {
    if (makeWorker) return makeWorker();
    if (typeof Worker === 'undefined') return null;
    return new Worker(new URL('./quantise.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}
/** Test hook: use this worker maker (null: no workers at all, undefined: the real thing). */
export function setQuantiseWorker(f: (() => WorkerLike) | null | undefined): void {
  makeWorker = f;
}

/** Bytes per piece handed to the worker, and per step on the page. */
const PIECE = 1 << 20;
const STEP = 1 << 18;
/** How many pieces may be at the worker, counted or not. */
const IN_FLIGHT = 4;
/** The page gives itself back after this long. */
const SLICE_MS = 8;

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Starts counting the colours of these pixel arrays (RGBA). `onProgress` gets 0..1 as the counting goes. The arrays are
 * read, never changed or handed over.
 */
export function startScan(arrays: Pixels[], onProgress: (fraction: number) => void = () => {}): Scan {
  let cancelled = false;
  let worker: WorkerLike | null = null;
  let table: ColourTable | null = null;
  const total = arrays.reduce((n, a) => n + a.length, 0) || 1;
  const rejectors = new Set<(e: Error) => void>();

  const guard = <T,>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (cancelled) {
        p.catch(() => {});
        return reject(new Cancelled());
      }
      rejectors.add(reject);
      p.then(
        (v) => {
          rejectors.delete(reject);
          resolve(v);
        },
        (e) => {
          rejectors.delete(reject);
          reject(e);
        },
      );
    });

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    worker?.terminate();
    worker = null;
    for (const r of rejectors) r(new Cancelled());
    rejectors.clear();
  };

  // On the page: small steps, the page given back between them.
  async function countHere(): Promise<void> {
    const h = new Histogram();
    let doneBytes = 0;
    let since = performance.now();
    for (const a of arrays) {
      for (let at = 0; at < a.length; at += STEP) {
        if (cancelled) throw new Cancelled();
        const part = a.subarray(at, at + STEP);
        h.add(part);
        doneBytes += part.length;
        if (performance.now() - since > SLICE_MS) {
          onProgress(doneBytes / total);
          await tick();
          since = performance.now();
        }
      }
    }
    table = h.table();
    onProgress(1);
  }

  // On a worker: pieces out, an acknowledgement back for each.
  function countThere(w: WorkerLike): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let sent = 0;
      let acked = 0;
      let doneBytes = 0;
      const queue: { size: number }[] = [];
      let pending: ((v: void) => void) | null = null;
      w.onmessage = (e) => {
        if (e.data.t !== 'ack') return;
        acked++;
        doneBytes += queue.shift()?.size ?? 0;
        onProgress(Math.min(1, doneBytes / total));
        pending?.();
      };
      w.onerror = () => reject(new Error('worker failed'));
      void (async () => {
        try {
          for (const a of arrays) {
            for (let at = 0; at < a.length; at += PIECE) {
              while (!cancelled && sent - acked >= IN_FLIGHT) await new Promise<void>((r) => (pending = r));
              if (cancelled) return;
              const copy = a.slice(at, at + PIECE);
              queue.push({ size: copy.length });
              sent++;
              w.postMessage({ t: 'add', pixels: copy }, [copy.buffer]);
            }
          }
          while (!cancelled && acked < sent) await new Promise<void>((r) => (pending = r));
          if (!cancelled) resolve();
        } catch (e) {
          reject(e);
        }
      })();
    });
  }

  const done = guard(
    (async () => {
      const w = newWorker();
      if (w) {
        worker = w;
        try {
          await countThere(w);
          return;
        } catch (e) {
          if (cancelled) throw new Cancelled();
          // The worker failed: count again here.
          w.terminate();
          worker = null;
          onProgress(0);
        }
      }
      await countHere();
    })(),
  );
  done.catch(() => {});

  let nextId = 1;
  const waiting = new Map<number, (p: Picked) => void>();
  async function pickHere(max: number): Promise<Picked> {
    const t = table!;
    const g = pickSteps(t, max);
    let since = performance.now();
    let r = g.next();
    while (!r.done) {
      if (cancelled) throw new Cancelled();
      if (performance.now() - since > SLICE_MS) {
        await tick();
        since = performance.now();
      }
      r = g.next();
    }
    return { colours: r.value, distinct: t.keys.length, exact: t.exact, solid: t.solid };
  }

  return {
    done,
    cancel,
    pick: (max) =>
      guard(
        done.then(() => {
          if (worker) {
            const w = worker;
            const id = nextId++;
            return new Promise<Picked>((resolve) => {
              waiting.set(id, resolve);
              w.onmessage = (e) => {
                if (e.data.t !== 'picked') return;
                waiting.get(e.data.id)?.({ colours: e.data.colours, distinct: e.data.distinct, exact: e.data.exact, solid: e.data.solid });
                waiting.delete(e.data.id);
              };
              w.postMessage({ t: 'pick', id, max });
            });
          }
          return pickHere(max);
        }),
      ),
  };
}
