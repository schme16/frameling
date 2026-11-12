// @vitest-environment jsdom
// A stuck or greedy plugin is turned off by the manager, stays off, says so plainly and can be turned on again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { installFrom, loadPlugins, plugins, resetPluginsForTests, setApprover, setSandboxStarterForTests } from '../../src/plugins/manager';
import { WATCHDOG } from '../../src/plugins/watchdog';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import * as desk from '../../src/io/desktop';
import { closeAll, exampleFiles, runPlugin } from './harness';

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
  WATCHDOG.stuckMs = 150;
  WATCHDOG.memoryEveryMs = 40;
});

afterEach(async () => {
  resetPluginsForTests();
  setApprover(null);
  Object.assign(WATCHDOG, saved);
  vi.restoreAllMocks();
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

const pack = (id = 'slowpoke') => ({
  'manifest.json': strToU8(JSON.stringify({ id, name: 'Slowpoke', version: '1.0.0', apiVersion: 2, permissions: [] })),
  'main.js': strToU8('frameling.commands.register({ id: "x", label: "X" }, () => {});'),
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const savedState = () => JSON.parse(localStorage.getItem('frameling.plugins.v1') ?? '{}');

describe('turning off a plugin that is in trouble', () => {
  it('a stuck one is turned off, stays off after a restart and can be turned on from the toast', async () => {
    await installFrom(pack());
    await wait(60);
    expect(plugins.get()[0].status).toBe('on');
    frozen!();
    await wait(500);
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
    await wait(100);
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on' });
  });

  it('a greedy one is turned off when the desktop reports its sandbox is over the cap', async () => {
    WATCHDOG.memoryCapBytes = 1000;
    vi.spyOn(desk, 'desktop').mockReturnValue({ plugins: { memory: async () => ({ slowpoke: 5000, other: 1 }) } } as never);
    await installFrom(pack());
    await wait(500);
    const p = plugins.get()[0];
    expect(p).toMatchObject({ enabled: false, status: 'off' });
    expect(p.problem).toMatch(/was using a lot of memory/);
    expect(toasts.at(-1)!.message).toMatch(/Slowpoke/);
  });

  it('the runaway example installs (it is only a test for the watchdog)', async () => {
    expect(await installFrom(exampleFiles('runaway-test'))).toBe(true);
    expect(plugins.get()[0].manifest.id).toBe('runaway-test');
  });
});
