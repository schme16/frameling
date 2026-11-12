// @vitest-environment jsdom
// Second review of the plugin host: things a plugin (or a quick pair of clicks) could do that the first pass missed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { getCommand, getTool } from '../../src/core/registry';
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
    const d = decide(m, m.permissions, false);
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

describe('shapes and locked layers', () => {
  const shapeCount = (id: string) => (store().get().doc.drawings[id] as { shapes: unknown[] }).shapes.length;
  const setup = async () => {
    await installFrom(
      pkg(
        { permissions: ['shapes'] },
        `frameling.shapes.register({ kind: 'dot' }, (p) => [{ type: 'ellipse', cx: 0, cy: 0, rx: p.r, ry: p.r, fill: '#ff0000' }]);
         frameling.commands.register({ id: 'add', label: 'Add' }, async () => { globalThis.__inst = await frameling.shapes.place('dot', { r: 5 }); });
         frameling.commands.register({ id: 'grow', label: 'Grow' }, async () => { try { await frameling.shapes.update(globalThis.__inst, 'dot', { r: 30 }); } catch (e) { await frameling.ui.notify(e.message); } });`,
      ),
    );
    await settle();
  };

  it('redrawing a shape that sits on a locked layer is refused even when another layer is the active one', async () => {
    await setup();
    await getCommand('plugin.bh-plug.add')!.run();
    await settle();
    expect(shapeCount('dv')).toBe(1);
    const before = JSON.stringify(store().get().doc.drawings.dv);
    // The shape's layer gets locked; a different, unlocked layer is now the one being drawn on.
    store().update('Second layer', (d) => {
      d.drawings.d2 = { ...newVectorDrawing(), id: 'd2' };
      const l = newVectorLayer('Two');
      l.cels = [{ id: 'c2', drawingId: 'd2', start: 0, length: 24 }];
      d.layers.push(l);
      d.layers[0].locked = true;
    });
    store().setUi({ activeLayerId: store().get().doc.layers[1].id });
    await getCommand('plugin.bh-plug.grow')!.run();
    await settle();
    expect(JSON.stringify(store().get().doc.drawings.dv)).toBe(before);
  });

  it('a locked active layer does not stop a redraw of a shape on an unlocked layer', async () => {
    await setup();
    await getCommand('plugin.bh-plug.add')!.run();
    await settle();
    store().update('Second layer', (d) => {
      d.drawings.d2 = { ...newVectorDrawing(), id: 'd2' };
      const l = newVectorLayer('Two');
      l.cels = [{ id: 'c2', drawingId: 'd2', start: 0, length: 24 }];
      l.locked = true;
      d.layers.push(l);
    });
    store().setUi({ activeLayerId: store().get().doc.layers[1].id });
    const before = JSON.stringify(store().get().doc.drawings.dv);
    await getCommand('plugin.bh-plug.grow')!.run();
    await settle();
    expect(JSON.stringify(store().get().doc.drawings.dv)).not.toBe(before);
    expect(shapeCount('d2')).toBe(0);
  });
});
