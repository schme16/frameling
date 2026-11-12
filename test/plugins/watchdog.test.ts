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

  it('a plugin that grows past the cap is caught, and only when the host can see its memory', async () => {
    vi.useRealTimers();
    WATCHDOG.pingEveryMs = 20;
    WATCHDOG.memoryEveryMs = 40;
    WATCHDOG.memoryCapBytes = 100;
    const greedy = runPlugin('');
    const g = hooks({ memory: async () => 5000 });
    const rtG = new PluginRuntime(manifest, [], greedy.transport, g);
    const blind = runPlugin('');
    const b = hooks({ memory: async () => null });
    const rtB = new PluginRuntime(manifest, [], blind.transport, b);
    await new Promise((r) => setTimeout(r, 400));
    expect(g.trips).toEqual([{ kind: 'memory', bytes: 5000 }]);
    expect(b.trips).toEqual([]);
    rtG.stop();
    rtB.stop();
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
