// Sends a tool's pointer events to its plugin one at a time. While the plugin is busy with one, moves that pile up are
// folded into the newest, so a slow plugin never builds a backlog; presses, releases and cancels are never dropped.

export type PipeKind = 'down' | 'move' | 'up' | 'hover' | 'cancel' | 'leave';

const isMove = (k: PipeKind): boolean => k === 'move' || k === 'hover';

export class EventPipe<E extends { type: PipeKind }, C = void> {
  private queue: { ev: E; ctx: C }[] = [];
  private busy = false;
  /** Most events waiting. Past it the oldest moves go. */
  static readonly MAX_WAITING = 32;

  constructor(private deliver: (ev: E, ctx: C) => Promise<void>) {}

  push(ev: E, ctx: C): void {
    const last = this.queue[this.queue.length - 1];
    if (isMove(ev.type) && last && isMove(last.ev.type)) this.queue[this.queue.length - 1] = { ev, ctx };
    else this.queue.push({ ev, ctx });
    while (this.queue.length > EventPipe.MAX_WAITING) {
      const i = this.queue.findIndex((q) => isMove(q.ev.type));
      this.queue.splice(i < 0 ? 0 : i, 1);
    }
    void this.run();
  }

  /** Waiting events, for tests. */
  get waiting(): number {
    return this.queue.length;
  }

  private async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) {
        try {
          await this.deliver(next.ev, next.ctx);
        } catch {
          // The deliverer reports its own problems.
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
