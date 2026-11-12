// Keeps an eye on one running plugin: a heartbeat to notice a worker stuck in a loop, and (on the desktop) a look at how
// much memory its sandbox process holds. It is a safety net for careless plugins, not a security boundary: a plugin set on
// mischief has other ways to be a nuisance, and the person can always turn it off. See docs/plugins.md.

/** Limits, in one place so tests and the e2e check can shorten them. */
export const WATCHDOG = {
  /** How often the host asks "still there?". */
  pingEveryMs: 1000,
  /** A ping unanswered for this long means the worker is stuck. Each progress report (frameling.progress) starts the count again. */
  stuckMs: 10_000,
  /** The same, while a command or an export is running (they may legitimately think for a while). */
  busyStuckMs: 60_000,
  /** How often memory is looked at. */
  memoryEveryMs: 4000,
  /** A plugin's process may hold this much before it is turned off. */
  memoryCapBytes: 1024 * 1024 * 1024,
};

export type Trip = { kind: 'stuck'; seconds: number } | { kind: 'memory'; bytes: number };

export interface WatchdogHooks {
  /** Sends one ping to the worker. */
  ping(n: number): void;
  /** Something is wrong. Called once; the watchdog is then finished. */
  trip(t: Trip): void;
  /** Whether a long, honest job is running (the stuck limit is longer then). */
  busy?(): boolean;
  /** The plugin's memory in bytes, or null where it can't be seen. */
  memory?(): Promise<number | null>;
}

export class Watchdog {
  private timer: ReturnType<typeof setInterval> | null = null;
  private n = 0;
  private out: { n: number; at: number } | null = null;
  private lastTick = 0;
  private lastMemory = 0;
  private done = false;

  constructor(
    private hooks: WatchdogHooks,
    private now: () => number = () => Date.now(),
  ) {}

  start(): void {
    if (this.timer || this.done) return;
    this.lastTick = this.lastMemory = this.now();
    this.timer = setInterval(() => this.tick(), WATCHDOG.pingEveryMs);
    this.tick();
  }

  /** The worker reported honest progress: the silence it is allowed starts again from now. */
  progress(): void {
    if (this.out) this.out.at = this.now();
  }

  /** The worker answered ping `n`. */
  pong(n: unknown): void {
    if (this.out && n === this.out.n) this.out = null;
  }

  stop(): void {
    this.done = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.done) return;
    const t = this.now();
    // A tick that came very late means the computer was asleep (or the window frozen), not that the plugin is stuck.
    const gap = t - this.lastTick;
    this.lastTick = t;
    if (gap > WATCHDOG.pingEveryMs * 5) {
      this.out = null;
      this.lastMemory = t;
    }
    if (this.out) {
      const limit = this.hooks.busy?.() ? WATCHDOG.busyStuckMs : WATCHDOG.stuckMs;
      if (t - this.out.at >= limit) return this.finish({ kind: 'stuck', seconds: Math.round((t - this.out.at) / 1000) });
    } else {
      this.out = { n: ++this.n, at: t };
      this.hooks.ping(this.n);
    }
    if (this.hooks.memory && t - this.lastMemory >= WATCHDOG.memoryEveryMs) {
      this.lastMemory = t;
      void this.hooks.memory().then(
        (bytes) => {
          if (!this.done && bytes != null && bytes > WATCHDOG.memoryCapBytes) this.finish({ kind: 'memory', bytes });
        },
        () => undefined,
      );
    }
  }

  private finish(t: Trip): void {
    this.stop();
    this.hooks.trip(t);
  }
}

/** The plain sentence for the toast. */
export function tripMessage(name: string, t: Trip): string {
  if (t.kind === 'memory') {
    const gb = t.bytes / 2 ** 30;
    const size = gb >= 1 ? `${Math.round(gb * 10) / 10} GB` : `${Math.round(t.bytes / 2 ** 20)} MB`;
    return `"${name}" was using a lot of memory (about ${size}), so Frameling turned it off.`;
  }
  return `"${name}" stopped responding, so Frameling turned it off.`;
}
