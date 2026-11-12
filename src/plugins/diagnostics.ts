// What the heartbeat can tell about one plugin without splitting it into its own process: how fast the worker answers a
// ping, and how much it asks of the app (operations and drawing items per minute). Only gathered while the
// "Measure plugins' memory and speed" preference is on. See docs/plugins.md.

/** How far back "per minute" looks, and how finely it counts. */
const WINDOW_SECONDS = 60;

export interface PluginDiag {
  /** The last ping's round trip in milliseconds, or null before the first answer. */
  latencyMs: number | null;
  /** The average and the worst round trip over the last minute. */
  latencyAvgMs: number | null;
  latencyMaxMs: number | null;
  /** Things the plugin asked the app to do in the last minute (commands answered, panels and drawings sent). */
  opsPerMin: number;
  /** Items in the drawings it sent to the canvas in the last minute. */
  drawItemsPerMin: number;
  /** Bytes its sandbox holds, or null where that cannot be told (see src/main/pluginMemory.ts). */
  memoryBytes: number | null;
}

/** Counts by second over a sliding minute. Pure: the clock is passed in. */
export class Diagnostics {
  private ops = new Map<number, number>();
  private draw = new Map<number, number>();
  private pings: { sec: number; ms: number }[] = [];
  private last: number | null = null;

  /** One thing the plugin asked for, with `items` drawing items in it (a draw list). */
  op(now: number, items = 0): void {
    const s = Math.floor(now / 1000);
    this.ops.set(s, (this.ops.get(s) ?? 0) + 1);
    if (items > 0) this.draw.set(s, (this.draw.get(s) ?? 0) + items);
  }

  /** A ping came back after `ms`. */
  latency(now: number, ms: number): void {
    this.last = ms;
    this.pings.push({ sec: Math.floor(now / 1000), ms });
    // A day of one-second pings is far more than a minute needs; keep the list short.
    if (this.pings.length > WINDOW_SECONDS * 2) this.pings.splice(0, this.pings.length - WINDOW_SECONDS * 2);
  }

  snapshot(now: number, memoryBytes: number | null = null): PluginDiag {
    const from = Math.floor(now / 1000) - WINDOW_SECONDS;
    const total = (m: Map<number, number>) => {
      let n = 0;
      for (const [s, c] of m) {
        if (s <= from) m.delete(s);
        else n += c;
      }
      return n;
    };
    const recent = this.pings.filter((p) => p.sec > from);
    this.pings = recent;
    const avg = recent.length ? recent.reduce((a, p) => a + p.ms, 0) / recent.length : null;
    return {
      latencyMs: this.last,
      latencyAvgMs: avg == null ? null : Math.round(avg),
      latencyMaxMs: recent.length ? Math.max(...recent.map((p) => p.ms)) : null,
      opsPerMin: total(this.ops),
      drawItemsPerMin: total(this.draw),
      memoryBytes,
    };
  }
}

/** The plain line for the Plugins page, e.g. "Memory 94 MB. Answers in 2 ms (worst 9 ms). 40 requests a minute." */
export function diagLine(d: PluginDiag): string {
  const parts: string[] = [];
  parts.push(d.memoryBytes == null ? 'Memory: not measured' : `Memory ${Math.round(d.memoryBytes / 2 ** 20)} MB`);
  parts.push(d.latencyMs == null ? 'Speed: waiting for the first check' : `Answers in ${d.latencyAvgMs ?? d.latencyMs} ms (worst ${d.latencyMaxMs ?? d.latencyMs} ms)`);
  parts.push(`${d.opsPerMin} requests a minute`);
  if (d.drawItemsPerMin) parts.push(`${d.drawItemsPerMin} drawing items a minute`);
  return parts.join('. ') + '.';
}
