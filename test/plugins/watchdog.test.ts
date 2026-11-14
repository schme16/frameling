// The watchdog: the heartbeat that notices a stuck worker, and the memory cap. Fake clock and timers; then the real
// prelude answering the real host over a real MessagePort.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { parseManifest } from '../../src/plugins/manifest';
import { PluginRuntime, type HostHooks } from '../../src/plugins/runtime';
import { tripMessage, Watchdog, WATCHDOG, type Trip } from '../../src/plugins/watchdog';
import { closeAll, runPlugin, settle } from './harness';

const saved = { ...WATCHDOG };
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  Object.assign(WATCHDOG, saved);
  closeAll();
});

function make(over: { busy?: () => boolean; memory?: () => Promise<number | null>; answer?: boolean } = {}) {
  const trips: Trip[] = [];
  const pings: number[] = [];
  let wd!: Watchdog;
  wd = new Watchdog({
    ping: (n) => {
      pings.push(n);
      if (over.answer !== false) wd.pong(n);
    },
    trip: (t) => trips.push(t),
    busy: over.busy,
    memory: over.memory,
  });
  return { wd, trips, pings };
}

describe('the heartbeat', () => {
  it('pings every second and stays quiet while the worker answers', () => {
    const { wd, trips, pings } = make();
    wd.start();
    vi.advanceTimersByTime(30_000);
    expect(pings.length).toBeGreaterThanOrEqual(30);
    expect(trips).toEqual([]);
    wd.stop();
  });

  it('trips once when a ping is left unanswered for too long', () => {
    const { wd, trips, pings } = make({ answer: false });
    wd.start();
    vi.advanceTimersByTime(WATCHDOG.stuckMs - 1500);
    expect(trips).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(trips).toHaveLength(1);
    expect(trips[0].kind).toBe('stuck');
    // Only the first ping is waiting; no pile of them.
    expect(pings).toEqual([1]);
    vi.advanceTimersByTime(60_000);
    expect(trips).toHaveLength(1);
  });

  it('waits longer while a command or an export is running', () => {
    let busy = true;
    const { wd, trips } = make({ answer: false, busy: () => busy });
    wd.start();
    vi.advanceTimersByTime(WATCHDOG.stuckMs * 3);
    expect(trips).toEqual([]);
    busy = false;
    vi.advanceTimersByTime(1500);
    expect(trips).toHaveLength(1);
    void wd;
  });

  it('starts the count again at each progress report, so a long job that keeps reporting is never stuck', () => {
    const { wd, trips } = make({ answer: false, busy: () => true });
    wd.start();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(WATCHDOG.busyStuckMs - 5000);
      wd.progress();
    }
    expect(trips).toEqual([]);
    // The reports stop: the usual limit applies from the last one.
    vi.advanceTimersByTime(WATCHDOG.busyStuckMs + 1500);
    expect(trips).toHaveLength(1);
  });

  it('does not blame the plugin when the whole computer was asleep', () => {
    const { wd, trips } = make({ answer: false });
    wd.start();
    // The clock jumps an hour while no timer runs (sleep), then ticks resume.
    vi.setSystemTime(Date.now() + 3_600_000);
    vi.advanceTimersByTime(WATCHDOG.pingEveryMs);
    expect(trips).toEqual([]);
    wd.stop();
  });
});

describe('the heartbeat round trip', () => {
  it('tells how long each answer took', () => {
    const times: number[] = [];
    let now = 1000;
    const wd = new Watchdog({ ping: () => undefined, trip: () => undefined, onPong: (ms) => times.push(ms) }, () => now);
    wd.start();
    now = 1042;
    wd.pong(1);
    expect(times).toEqual([42]);
    // A wrong or repeated number is not an answer.
    wd.pong(1);
    wd.pong(7);
    expect(times).toEqual([42]);
    wd.stop();
  });
});

describe('the memory cap', () => {
  it('trips when the plugin holds more than the cap, and says how much', async () => {
    WATCHDOG.memoryCapBytes = 500 * 2 ** 20;
    const { wd, trips } = make({ memory: async () => 700 * 2 ** 20 });
    wd.start();
    await vi.advanceTimersByTimeAsync(WATCHDOG.memoryEveryMs + 1500);
    expect(trips).toEqual([{ kind: 'memory', bytes: 700 * 2 ** 20 }]);
    expect(tripMessage('Greedy', trips[0])).toBe('"Greedy" was using a lot of memory (about 700 MB), so Frameling turned it off.');
  });

  it('leaves a plugin alone under the cap, or where memory cannot be seen', async () => {
    const under = make({ memory: async () => 100 * 2 ** 20 });
    const blind = make({ memory: async () => null });
    const broken = make({ memory: async () => Promise.reject(new Error('no')) });
    for (const m of [under, blind, broken]) m.wd.start();
    await vi.advanceTimersByTimeAsync(WATCHDOG.memoryEveryMs * 4);
    for (const m of [under, blind, broken]) {
      expect(m.trips).toEqual([]);
      m.wd.stop();
    }
  });

  it('writes the sentence for a stuck plugin and for gigabytes', () => {
    expect(tripMessage('Slow', { kind: 'stuck', seconds: 12 })).toBe('"Slow" stopped responding, so Frameling turned it off.');
    expect(tripMessage('Big', { kind: 'memory', bytes: 1.6 * 2 ** 30 })).toContain('about 1.6 GB');
  });
});

describe('with the real prelude', () => {
  const manifest = parseManifest({ id: 'tst', name: 'T', version: '1', apiVersion: 2, permissions: [] });
  function hooks(over: Partial<HostHooks> = {}): HostHooks & { trips: Trip[] } {
    const trips: Trip[] = [];
    return {
      trips,
      getDoc: () => newDoc({ name: 'Doc' }),
      getState: () => ({ frame: 0, activeLayerId: null, selection: [], drawingId: null }),
      edit: () => undefined,
      notify: () => undefined,
      addCommand: () => undefined,
      addExporter: () => undefined,
      addPanel: () => undefined,
      updatePanel: () => undefined,
      problem: () => undefined,
      watchdog: (t) => trips.push(t),
      ...over,
    };
  }

  it('a plugin that answers is left alone', async () => {
    vi.useRealTimers();
    WATCHDOG.pingEveryMs = 20;
    WATCHDOG.stuckMs = 200;
    const w = runPlugin('frameling.commands.register({ id: "x", label: "X" }, () => {});');
    const h = hooks();
    const rt = new PluginRuntime(manifest, [], w.transport, h);
    await new Promise((r) => setTimeout(r, 500));
    expect(h.trips).toEqual([]);
    rt.stop();
  });

  it('a frozen worker (a loop that never ends) is caught', async () => {
    vi.useRealTimers();
    WATCHDOG.pingEveryMs = 20;
    WATCHDOG.stuckMs = 200;
    const w = runPlugin('frameling.commands.register({ id: "x", label: "X" }, () => {});');
    const h = hooks();
    const rt = new PluginRuntime(manifest, [], w.transport, h);
    await settle();
    w.freeze();
    await new Promise((r) => setTimeout(r, 600));
    expect(h.trips).toHaveLength(1);
    expect(h.trips[0].kind).toBe('stuck');
    rt.stop();
  });

  describe('progress from a long command', () => {
    const LONG = (reports: string) => `frameling.commands.register({ id: "x", label: "X" }, async () => {
      for (let i = 1; i <= 12; i++) {
        await new Promise((r) => setTimeout(r, 50));
        ${reports}
      }
    });`;
    async function run(code: string) {
      vi.useRealTimers();
      WATCHDOG.pingEveryMs = 20;
      WATCHDOG.busyStuckMs = 300;
      const w = runPlugin(code);
      const h = hooks();
      // The worker can't answer the host's pings (like one in a long loop), but it still hears the rest and its own messages arrive.
      const deaf = { ...w.transport, post: (m: unknown, t?: Transferable[]) => (m as { t?: string }).t === 'ping' || w.transport.post(m, t) };
      const rt = new PluginRuntime(manifest, [], deaf, h);
      await settle();
      void rt.runCommand('x');
      await new Promise((r) => setTimeout(r, 900));
      rt.stop();
      return { trips: h.trips };
    }

    it('a job of 600 ms against a 300 ms limit is fine while it keeps reporting', async () => {
      const r = await run(LONG('frameling.progress(i, 12);'));
      expect(r.trips).toEqual([]);
    });

    it('the same job that never reports is turned off', async () => {
      const r = await run(LONG(''));
      expect(r.trips).toHaveLength(1);
    });

    it('a plugin that repeats the same number, or goes backwards, gets no extra time', async () => {
      const r = await run(LONG('frameling.progress(1, 12);'));
      expect(r.trips).toHaveLength(1);
    });

    it('reports with nonsense numbers are ignored', async () => {
      const r = await run(LONG('frameling.progress("a", 12); frameling.progress(NaN, 12); frameling.progress(5, 0);'));
      expect(r.trips).toHaveLength(1);
    });
  });

  it('a plugin that grows past the cap is caught, and only when the host can see its memory', async () => {
    vi.useRealTimers();
    WATCHDOG.pingEveryMs = 20;
    WATCHDOG.memoryEveryMs = 40;
    WATCHDOG.memoryCapBytes = 100;
    const greedy = runPlugin('');
    const g = hooks({ memory: async () => 5000, diagnostics: () => true });
    const rtG = new PluginRuntime(manifest, [], greedy.transport, g);
    const blind = runPlugin('');
    const b = hooks({ memory: async () => null, diagnostics: () => true });
    const rtB = new PluginRuntime(manifest, [], blind.transport, b);
    // With measuring off there is no cap, however big the plugin: its memory is never even asked for.
    const off = runPlugin('');
    let asked = 0;
    const o = hooks({ memory: async () => (asked++, 5000), diagnostics: () => false });
    const rtO = new PluginRuntime(manifest, [], off.transport, o);
    await new Promise((r) => setTimeout(r, 400));
    expect(g.trips).toEqual([{ kind: 'memory', bytes: 5000 }]);
    expect(b.trips).toEqual([]);
    expect(o.trips).toEqual([]);
    expect(asked).toBe(0);
    rtG.stop();
    rtB.stop();
    rtO.stop();
  });

  it('measures how fast the worker answers and what it asks for, only while measuring is on', async () => {
    vi.useRealTimers();
    WATCHDOG.pingEveryMs = 20;
    const code = 'frameling.commands.register({ id: "x", label: "X" }, () => {}); const h = frameling.panels.register({ id: "p", title: "P" }, { type: "text", text: "a" }); setTimeout(() => { for (let i = 0; i < 4; i++) h.update({ type: "text", text: "hi " + i }); }, 50);';
    const on = runPlugin(code);
    const off = runPlugin(code);
    const rtOn = new PluginRuntime(manifest, [], on.transport, hooks({ diagnostics: () => true }));
    const rtOff = new PluginRuntime(manifest, [], off.transport, hooks({ diagnostics: () => false }));
    await new Promise((r) => setTimeout(r, 400));
    const d = rtOn.diag(1234);
    expect(d.latencyMs).not.toBeNull();
    expect(d.latencyMaxMs).toBeGreaterThanOrEqual(0);
    expect(d.opsPerMin).toBeGreaterThanOrEqual(2);
    expect(d.memoryBytes).toBe(1234);
    expect(rtOff.diag()).toMatchObject({ latencyMs: null, opsPerMin: 0, drawItemsPerMin: 0 });
    rtOn.stop();
    rtOff.stop();
  });

  it('nobody watches when the host gives no watchdog hook (older callers keep working)', async () => {
    vi.useRealTimers();
    WATCHDOG.pingEveryMs = 20;
    WATCHDOG.stuckMs = 100;
    const w = runPlugin('');
    const h = hooks({ watchdog: undefined });
    const rt = new PluginRuntime(manifest, [], w.transport, h);
    w.freeze();
    await new Promise((r) => setTimeout(r, 300));
    expect(h.trips).toEqual([]);
    rt.stop();
  });
});
