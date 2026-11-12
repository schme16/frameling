/**
 * A few worker threads that take jobs one at a time, started when the first job comes and let go after a while with
 * nothing to do. The worker is anything shaped like a Web Worker, so tests can hand in a fake one.
 */
export interface WorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: any }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

interface Job {
  req: { id: number };
  transfer: Transferable[];
  resolve: (v: any) => void;
  reject: (e: unknown) => void;
}

export class WorkerPool {
  private idle: WorkerLike[] = [];
  private busy = new Map<WorkerLike, Job>();
  private queue: Job[] = [];
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private make: () => WorkerLike,
    private max: number,
    private idleMs = 20_000,
  ) {}

  /** Runs a job on a free worker (or waits for one). Rejects when the worker fails, so the caller can do the job itself. */
  run<R>(req: object, transfer: Transferable[] = []): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.queue.push({ req: { ...req, id: this.nextId++ }, transfer, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.queue.length) {
      let w = this.idle.pop();
      if (!w) {
        if (this.busy.size >= this.max) break;
        try {
          w = this.make();
        } catch (e) {
          // No worker can be started: every waiting job fails and the callers carry on without.
          for (const j of this.queue.splice(0)) j.reject(e);
          return;
        }
        this.attach(w);
      }
      const job = this.queue.shift()!;
      this.busy.set(w, job);
      try {
        w.postMessage(job.req, job.transfer);
      } catch (e) {
        this.busy.delete(w);
        w.terminate();
        job.reject(e);
      }
    }
    if (!this.queue.length && !this.busy.size) this.timer = setTimeout(() => this.release(), this.idleMs);
  }

  private attach(w: WorkerLike): void {
    w.onmessage = (e) => {
      const job = this.busy.get(w);
      this.busy.delete(w);
      this.idle.push(w);
      job?.resolve(e.data);
      this.pump();
    };
    w.onerror = (e) => {
      const job = this.busy.get(w);
      this.busy.delete(w);
      w.terminate();
      job?.reject(e);
      this.pump();
    };
  }

  /** Lets every idle worker go. */
  release(): void {
    this.timer = null;
    for (const w of this.idle.splice(0)) w.terminate();
  }
}
