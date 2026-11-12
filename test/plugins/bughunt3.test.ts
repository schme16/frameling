// @vitest-environment jsdom
// Second review of the plugin host: things a plugin (or a quick pair of clicks) could do that the first pass missed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { installFrom, plugins, resetPluginsForTests, setApprover, setEnabled, setPower, setSandboxStarterForTests } from '../../src/plugins/manager';
import { decide } from '../../src/plugins/powers';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import type { Transport } from '../../src/plugins/runtime';
import { closeAll, runPlugin, settle } from './harness';

beforeEach(() => {
  localStorage.clear();
  setLibraryForTests(memoryLibrary);
  setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
  window.confirm = () => true;
  setApprover(async (m) => {
    const d = decide(m, ['tools'], false);
    return { permissions: d.permissions, network: d.network };
  });
  const doc: Doc = newDoc({ width: 200, height: 100 });
  doc.drawings = { dv: { ...newVectorDrawing(), id: 'dv' } };
  doc.layers[0].cels = [{ id: 'c1', drawingId: 'dv', start: 0, length: 24 }];
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id });
});

afterEach(async () => {
  resetPluginsForTests();
  setApprover(null);
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

const pkg = (manifest: Record<string, unknown>, code: string) => ({
  'manifest.json': strToU8(JSON.stringify({ id: 'bh-plug', name: 'BH plug', version: '1.0.0', apiVersion: 2, ...manifest })),
  'main.js': strToU8(code),
});

describe('starting while something else changes', () => {
  it('a start that was overtaken by a revoke does not keep running with the old powers', async () => {
    await installFrom(pkg({ permissions: ['tools'] }, `frameling.tools.register({ id: 'pen', label: 'Pen' }, async () => undefined);`));
    await settle();
    expect(getTool('plugin.bh-plug.tool.pen')).toBeDefined();
    // From here on every sandbox start waits until the test lets it through, like a slow iframe.
    const gates: (() => void)[] = [];
    const opened: Transport[] = [];
    let closed = 0;
    setSandboxStarterForTests((p) =>
      new Promise<Transport>((resolve) => {
        gates.push(() => {
          const t = runPlugin(p.code, { id: p.manifest.id }).transport;
          opened.push(t);
          resolve({ ...t, close: () => (closed++, t.close()) });
        });
      }),
    );
    await setEnabled('bh-plug', false);
    const on = setEnabled('bh-plug', true); // start #1, still waiting for its sandbox
    await settle(2);
    const revoke = setPower('bh-plug', 'tools', false); // stops, then start #2 with the tool power off
    await settle(2);
    expect(gates).toHaveLength(2);
    gates[0]();
    await settle();
    gates[1]();
    await Promise.all([on, revoke]);
    await settle();
    // Only the second sandbox lives; the first was shut the moment it came up.
    expect(closed).toBe(1);
    expect(getTool('plugin.bh-plug.tool.pen')).toBeUndefined();
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on', granted: [] });
  });

  it('two quick turn-ons start one sandbox', async () => {
    await installFrom(pkg({ permissions: [] }, `frameling.commands.register({ id: 'hi', label: 'Hi' }, () => undefined);`));
    await settle();
    await setEnabled('bh-plug', false);
    let started = 0;
    setSandboxStarterForTests(async (p) => (started++, runPlugin(p.code, { id: p.manifest.id }).transport));
    await Promise.all([setEnabled('bh-plug', true), setEnabled('bh-plug', true)]);
    await settle();
    expect(started).toBe(1);
  });
});
