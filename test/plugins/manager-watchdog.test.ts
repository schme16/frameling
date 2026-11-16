// @vitest-environment jsdom
// A stuck or greedy plugin is turned off by the manager, stays off, says so plainly and can be turned on again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { installFrom, loadPlugins, pluginDiag, plugins, refreshDiag, resetPluginsForTests, setApprover, setSandboxStarterForTests } from '../../src/plugins/manager';
import { WATCHDOG } from '../../src/plugins/watchdog';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import * as desk from '../../src/io/desktop';
import { DEFAULT_PREFS, setPrefs } from '../../src/ui/prefs';
import { closeAll, exampleFiles, runPlugin } from './harness';
import { waitUntil, WAIT_CEILING_MS } from '../helpers/waits';

const toasts: { message: string; kind: string; action?: { label: string; run(): void } }[] = [];
vi.mock('../../src/io/notify', () => ({ notify: (message: string, kind: string, action?: { label: string; run(): void }) => void toasts.push({ message, kind, action }) }));

const saved = { ...WATCHDOG };
let frozen: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  setLibraryForTests(memoryLibrary);
  setApprover(async () => ({ permissions: [], network: [] }));
  setSandboxStarterForTests(async (pkg) => {
    const w = runPlugin(pkg.code, { id: pkg.manifest.id });
    frozen = w.freeze;
    return w.transport;
  });
  resetStore(newDoc({ width: 100, height: 100 }));
  WATCHDOG.pingEveryMs = 20;
  // Long enough that a busy machine pausing this thread for a moment is not read as a stuck plugin. The frozen one is
  // still caught, just after this long, so tests wait for the plugin to change state rather than for a guessed time.
  WATCHDOG.stuckMs = 1500;
  WATCHDOG.memoryEveryMs = 40;
});

afterEach(async () => {
  resetPluginsForTests();
  setApprover(null);
  Object.assign(WATCHDOG, saved);
  setPrefs({ pluginDiagnostics: DEFAULT_PREFS.pluginDiagnostics });
  vi.restoreAllMocks();
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

const pack = (id = 'slowpoke') => ({
  'manifest.json': strToU8(JSON.stringify({ id, name: 'Slowpoke', version: '1.0.0', apiVersion: 2, permissions: [] })),
  'main.js': strToU8('frameling.commands.register({ id: "x", label: "X" }, () => {});'),
});
const savedState = () => JSON.parse(localStorage.getItem('frameling.plugins.v1') ?? '{}');

describe('turning off a plugin that is in trouble', () => {
  it('a stuck one is turned off, stays off after a restart and can be turned on from the toast', async () => {
    await installFrom(pack());
    await waitUntil(() => plugins.get()[0]?.status === 'on', 'the plugin to start');
    expect(plugins.get()[0].status).toBe('on');
    frozen!();
    await waitUntil(() => plugins.get()[0].enabled === false, 'the stuck plugin to be turned off');
    const p = plugins.get()[0];
    expect(p).toMatchObject({ enabled: false, status: 'off' });
    expect(p.problem).toBe('"Slowpoke" stopped responding, so Frameling turned it off.');
    expect(savedState().slowpoke.enabled).toBe(false);
    expect(toasts.at(-1)).toMatchObject({ kind: 'warn', message: p.problem });
    expect(toasts.at(-1)!.action?.label).toBe('Turn it on');
    // After a restart it is still off.
    resetPluginsForTests();
    await loadPlugins();
    expect(plugins.get()[0].enabled).toBe(false);
    // The toast's button brings it back.
    toasts.at(-1)!.action!.run();
    await waitUntil(() => plugins.get()[0].enabled === true && plugins.get()[0].status === 'on', 'the plugin to come back');
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on' });
  });

  it('a greedy one is left alone while measuring is off, however big it is', async () => {
    WATCHDOG.memoryCapBytes = 1000;
    const memory = vi.fn(async () => ({ slowpoke: 5000 }));
    vi.spyOn(desk, 'desktop').mockReturnValue({ plugins: { memory } } as never);
    await installFrom(pack());
    // Nothing should happen, so there is no condition to wait for: this has to be a duration. 400 ms is ten memory
    // checks (every 40 ms) for a trip to show up in. A slow machine only makes it check fewer times, never fail.
    await new Promise((r) => setTimeout(r, 400));
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on' });
    expect(memory).not.toHaveBeenCalled();
  });

  it('a greedy one is turned off when measuring is on and the desktop reports its sandbox is over the cap', async () => {
    setPrefs({ pluginDiagnostics: true });
    WATCHDOG.memoryCapBytes = 1000;
    vi.spyOn(desk, 'desktop').mockReturnValue({ plugins: { memory: async () => ({ slowpoke: 5000, other: 1 }) } } as never);
    await installFrom(pack());
    await waitUntil(() => plugins.get()[0]?.enabled === false, 'the greedy plugin to be turned off');
    const p = plugins.get()[0];
    expect(p).toMatchObject({ enabled: false, status: 'off' });
    expect(p.problem).toMatch(/was using a lot of memory/);
    expect(toasts.at(-1)!.message).toMatch(/Slowpoke/);
  });

  it('with measuring on, each running plugin gets its numbers, and none are kept when it is off', async () => {
    setPrefs({ pluginDiagnostics: true });
    vi.spyOn(desk, 'desktop').mockReturnValue({ plugins: { memory: async () => ({ slowpoke: 5 * 2 ** 20 }) } } as never);
    await installFrom(pack());
    // Each refresh asks for the numbers; the latency is only there once a ping has come back.
    await waitUntil(() => plugins.get()[0]?.status === 'on', 'the plugin to start');
    await refreshDiag();
    for (let end = Date.now() + WAIT_CEILING_MS; pluginDiag.get().slowpoke?.latencyMs == null && Date.now() < end; ) {
      await new Promise((r) => setTimeout(r, 20));
      await refreshDiag();
    }
    const d = pluginDiag.get().slowpoke;
    expect(d.memoryBytes).toBe(5 * 2 ** 20);
    expect(d.latencyMs).not.toBeNull();
    setPrefs({ pluginDiagnostics: false });
    await refreshDiag();
    expect(pluginDiag.get()).toEqual({});
  });

  it('the runaway example installs (it is only a test for the watchdog)', async () => {
    expect(await installFrom(exampleFiles('runaway-test'))).toBe(true);
    expect(plugins.get()[0].manifest.id).toBe('runaway-test');
  });
});
