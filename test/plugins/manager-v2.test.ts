// @vitest-environment jsdom
// Version 2 end to end inside the app: the permission flow (ask, remember per version, refuse, revoke), and the powers
// themselves through the real store and registries: a tool and a shape kind round trip, guides, events.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape } from '../../src/core/format';
import { getCommand, getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { installFrom, loadPlugins, plugins, resetPluginsForTests, setApprover, setEnabled, setOverlayRequester, setPower, setSandboxStarterForTests } from '../../src/plugins/manager';
import { decide } from '../../src/plugins/powers';
import { packPlugin, readPluginFiles, type Permission, type PluginManifest } from '../../src/plugins/manifest';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { infoOf } from '../../src/plugins/shapes';
import { closeAll, runPlugin, settle } from './harness';

const asked: { name: string; verb: string }[] = [];
let answer: (m: PluginManifest) => Permission[] | null = () => [];

beforeEach(() => {
  localStorage.clear();
  asked.length = 0;
  setLibraryForTests(memoryLibrary);
  setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
  window.confirm = () => true;
  // The dialog stands in: it says yes to the powers `answer` lists, and no to the other ones that need a yes.
  setApprover(async (m, verb) => {
    asked.push({ name: m.name, verb });
    const chosen = answer(m);
    if (!chosen) return null;
    const d = decide(m, chosen, chosen.includes('network'));
    return { permissions: d.permissions, network: d.network };
  });
  answer = () => [];
  const doc: Doc = newDoc({ width: 200, height: 100 });
  const layer = doc.layers[0];
  const d = { ...newVectorDrawing(), id: 'dv' };
  doc.drawings = { dv: d };
  layer.cels = [{ id: 'c1', drawingId: 'dv', start: 0, length: 24 }];
  resetStore(doc);
  store().setUi({ activeLayerId: layer.id });
});

afterEach(async () => {
  resetPluginsForTests();
  setApprover(null);
  setOverlayRequester(() => undefined);
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

const files = (manifest: Record<string, unknown>, code: string) => ({
  'manifest.json': strToU8(JSON.stringify({ id: 'power-plug', name: 'Power plug', version: '1.0.0', apiVersion: 2, ...manifest })),
  'main.js': strToU8(code),
});

const POWERS = `
frameling.commands.register({ id: 'hi', label: 'Hi' }, () => frameling.ui.notify('hi'));
frameling.tools.register({ id: 'pen', label: 'Pen', icon: 'pen' }, async (e) => (e.type === 'down' ? { overlay: [{ type: 'line', x1: e.x, y1: e.y, x2: 50, y2: 50, stroke: '#ff0000' }] } : undefined));
frameling.canvas.overlay([{ type: 'rect', x: 0, y: 0, w: 5, h: 5 }]);`;

describe('asking for powers', () => {
  it('asks once, runs with the powers that were allowed and leaves the others off', async () => {
    answer = () => ['tools'];
    expect(await installFrom(files({ permissions: ['tools', 'canvas', 'document.write'] }, POWERS))).toBe(true);
    await settle();
    expect(asked).toEqual([{ name: 'Power plug', verb: 'Install' }]);
    const p = plugins.get()[0];
    expect(p).toMatchObject({ enabled: true, status: 'on', granted: ['tools'], grantedFor: '1.0.0' });
    expect(p.manifest.permissions).toEqual(['tools', 'canvas', 'document.edit']);
    // The tool is there; the guide and the edits that were refused are not, and the plugin did not complain.
    expect(getTool('plugin.power-plug.tool.pen')?.label).toBe('Pen');
    expect(getCommand('plugin.power-plug.hi')).toBeDefined();
    expect(p.problem).toBeUndefined();
  });

  it('is off until the person turns each power on: allowing nothing still installs it', async () => {
    answer = () => [];
    await installFrom(files({ permissions: ['tools', 'shapes'] }, POWERS));
    await settle();
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on', granted: [] });
    expect(getTool('plugin.power-plug.tool.pen')).toBeUndefined();
    expect(getCommand('plugin.power-plug.hi')).toBeDefined();
  });

  it('does not install when they cancel', async () => {
    answer = () => null;
    expect(await installFrom(files({ permissions: ['tools'] }, POWERS))).toBe(false);
    expect(plugins.get()).toEqual([]);
  });

  it('remembers the answer across restarts and does not ask again, even for a power they refused', async () => {
    answer = () => ['tools'];
    await installFrom(files({ permissions: ['tools', 'canvas'] }, POWERS));
    await settle();
    resetPluginsForTests();
    await loadPlugins();
    await settle();
    expect(asked).toHaveLength(1);
    expect(plugins.get()[0]).toMatchObject({ enabled: true, granted: ['tools'], status: 'on' });
    await setEnabled('power-plug', false);
    await setEnabled('power-plug', true);
    await settle();
    expect(asked).toHaveLength(1);
    expect(getTool('plugin.power-plug.tool.pen')).toBeDefined();
  });

  it('keeps the answer for a newer version that asks for the same, and asks again for one that asks for more', async () => {
    answer = () => ['tools'];
    await installFrom(files({ permissions: ['tools', 'canvas'] }, POWERS));
    await settle();
    const stored = readPluginFiles(files({ permissions: ['tools', 'canvas'] }, POWERS));
    // Same asks, new version: nothing to ask.
    await memoryLibrary.write('plugins', 'power-plug', packPlugin({ ...stored, manifest: { ...stored.manifest, version: '1.1.0' } }));
    resetPluginsForTests();
    await loadPlugins();
    await settle();
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on', granted: ['tools'] });
    expect(asked).toHaveLength(1);
    // A version that wants one more: it waits, says why, and asks when turned on.
    await memoryLibrary.write('plugins', 'power-plug', packPlugin({ ...stored, manifest: { ...stored.manifest, version: '2.0.0', permissions: ['tools', 'canvas', 'shapes'] } }));
    resetPluginsForTests();
    await loadPlugins();
    expect(plugins.get()[0]).toMatchObject({ enabled: false });
    expect(plugins.get()[0].problem).toMatch(/more than before/);
    answer = () => null;
    await setEnabled('power-plug', true);
    expect(asked).toHaveLength(2);
    expect(plugins.get()[0].enabled).toBe(false);
    answer = () => ['tools', 'shapes'];
    await setEnabled('power-plug', true);
    await settle();
    expect(plugins.get()[0]).toMatchObject({ enabled: true, granted: ['tools', 'shapes'], grantedFor: '2.0.0' });
  });

  it('takes a power away from Preferences at once, and asks before giving it back', async () => {
    answer = () => ['tools', 'canvas'];
    await installFrom(files({ permissions: ['tools', 'canvas'] }, POWERS));
    await settle();
    expect(getTool('plugin.power-plug.tool.pen')).toBeDefined();
    await setPower('power-plug', 'tools', false);
    await settle();
    expect(getTool('plugin.power-plug.tool.pen')).toBeUndefined();
    expect(plugins.get()[0]).toMatchObject({ granted: ['canvas'], status: 'on' });
    expect(getCommand('plugin.power-plug.hi')).toBeDefined();
    // Giving it back asks (the stand-in for the dialog says yes).
    const confirm = vi.fn(() => true);
    window.confirm = confirm;
    await setPower('power-plug', 'tools', true);
    await settle();
    expect(confirm).toHaveBeenCalledOnce();
    expect(String(confirm.mock.calls[0])).toMatch(/every click and drag/);
    expect(getTool('plugin.power-plug.tool.pen')).toBeDefined();
    // The choice is kept for next time.
    resetPluginsForTests();
    await loadPlugins();
    await settle();
    expect(plugins.get()[0].granted).toEqual(['canvas', 'tools']);
  });

  it('takes a plugin tool away with the plugin, and goes back to Select if it was the tool in hand', async () => {
    answer = () => ['tools'];
    await installFrom(files({ permissions: ['tools'] }, POWERS));
    await settle();
    store().setUi({ tool: 'plugin.power-plug.tool.pen' });
    await setEnabled('power-plug', false);
    expect(getTool('plugin.power-plug.tool.pen')).toBeUndefined();
    expect(store().get().ui.tool).toBe('select');
  });

  it('uses a plain question when there is no dialog, and says "yes" to everything it asks (version 1 plugins are told what they ask, as before)', async () => {
    setApprover(null);
    window.confirm = () => true;
    await installFrom(files({ permissions: ['tools', 'document.write'] }, POWERS));
    await settle();
    expect(plugins.get()[0].granted).toEqual(['tools', 'document.edit']);
    window.confirm = () => false;
    await setEnabled('power-plug', false);
    await installFrom(files({ id: 'old-one', apiVersion: 1, permissions: ['document.read', 'document.edit'] }, `frameling.commands.register({ id: 'x', label: 'X' }, () => {});`));
    expect(plugins.get().find((x) => x.manifest.id === 'old-one')).toBeUndefined();
  });

  it('treats a version 1 plugin as before: everything it lists is allowed at install, with no extra switches', async () => {
    answer = () => []; // nothing elevated is chosen; none is on offer to a version 1 plugin
    await installFrom(files({ id: 'old-one', apiVersion: 1, permissions: ['document.read', 'document.edit', 'panels'] }, `frameling.commands.register({ id: 'x', label: 'X' }, () => {});`));
    await settle();
    expect(plugins.get()[0].granted).toEqual(['document.read', 'document.edit', 'panels']);
  });
});

describe('powers through the app', () => {
  it('a tool hears the pointer, shows its guide and changes the drawing in one undo step; guides redraw the canvas', async () => {
    const redraws = vi.fn();
    setOverlayRequester(redraws);
    answer = () => ['tools', 'document.edit'];
    const layerId = store().get().doc.layers[0].id;
    await installFrom(
      files(
        { permissions: ['tools', 'document.write'] },
        `frameling.tools.register({ id: 'fade', label: 'Fade' }, async (e) => {
          if (e.type === 'down') return { overlay: [{ type: 'line', x1: e.x, y1: e.y, x2: 1, y2: 1, stroke: '#00ff00' }, { type: 'bad' }] };
          if (e.type === 'up') return { label: 'Fade', ops: [{ op: 'setLayer', layerId: ${JSON.stringify(layerId)}, opacity: e.x / 100 }] };
        });`,
      ),
    );
    await settle();
    const tool = getTool('plugin.power-plug.tool.fade')!;
    const ctx = { zoom: 2, requestOverlay: () => undefined, hint: vi.fn() };
    const pointer = (x: number) => ({ x, y: 10, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 });
    tool.down!(pointer(30), ctx);
    await settle();
    expect(redraws).toHaveBeenCalled();
    const calls: string[] = [];
    const g = new Proxy({} as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => void calls.push(k)), set: (t, k: string, v) => ((t[k] = v), true) }) as unknown as CanvasRenderingContext2D;
    tool.overlay!(g, ctx);
    expect(calls.filter((c) => c === 'stroke')).toHaveLength(1);
    tool.up!(pointer(40), ctx);
    await settle();
    expect(store().get().doc.layers[0].opacity).toBe(0.4);
    expect(store().undoLabel()).toBe('Power plug: Fade');
    store().undo();
    expect(store().get().doc.layers[0].opacity).toBe(1);
  });

  it('a tool without the power to change the drawing cannot, and says so', async () => {
    answer = () => ['tools'];
    const layerId = store().get().doc.layers[0].id;
    await installFrom(files({ permissions: ['tools', 'document.write'] }, `frameling.tools.register({ id: 'f', label: 'F' }, async (e) => (e.type === 'up' ? { ops: [{ op: 'setLayer', layerId: ${JSON.stringify(layerId)}, opacity: 0 }] } : undefined));`));
    await settle();
    const hint = vi.fn();
    getTool('plugin.power-plug.tool.f')!.up!({ x: 1, y: 1, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 }, { zoom: 1, requestOverlay: () => undefined, hint });
    await settle();
    expect(store().get().doc.layers[0].opacity).toBe(1);
    expect(hint).toHaveBeenCalledWith(expect.stringContaining("wasn't allowed"));
  });

  it('a shape kind round trip: add, redraw from new settings, undo, and it is still there when the plugin is off', async () => {
    answer = () => ['shapes'];
    const code = `frameling.shapes.register({ kind: 'dot', label: 'Dot' }, (p) => [{ type: 'ellipse', cx: 0, cy: 0, rx: p.r, ry: p.r, fill: p.color }]);
      frameling.commands.register({ id: 'add', label: 'Add' }, async () => { globalThis.__inst = await frameling.shapes.place('dot', { r: 10, color: '#ff0000' }, { x: 60, y: 40 }); });
      frameling.commands.register({ id: 'grow', label: 'Grow' }, async () => { await frameling.shapes.update(globalThis.__inst, 'dot', { r: 20, color: '#0000ff' }); });`;
    await installFrom(files({ permissions: ['shapes'] }, code));
    await settle();
    await getCommand('plugin.power-plug.add')!.run();
    await settle();
    const shapes = () => (store().get().doc.drawings.dv as { shapes: PathShape[] }).shapes;
    expect(shapes()).toHaveLength(1);
    expect(shapes()[0]).toMatchObject({ type: 'path', fill: '#ff0000' });
    expect(infoOf(shapes()[0], 'power-plug')).toMatchObject({ kind: 'dot', props: { r: 10, color: '#ff0000' } });
    expect(store().get().ui.selection).toEqual([shapes()[0].id]);
    await getCommand('plugin.power-plug.grow')!.run();
    await settle();
    expect(shapes()).toHaveLength(1);
    expect(shapes()[0].fill).toBe('#0000ff');
    expect(store().undoLabel()).toBe('Power plug: Redraw dot');
    store().undo();
    expect(shapes()[0].fill).toBe('#ff0000');
    // Turned off: the shape stays, as an ordinary shape.
    await setEnabled('power-plug', false);
    expect(shapes()).toHaveLength(1);
    expect(shapes()[0].fill).toBe('#ff0000');
  });

  it('refuses to add a shape to a locked layer', async () => {
    answer = () => ['shapes'];
    const code = `frameling.shapes.register({ kind: 'dot' }, () => [{ type: 'rect', x: 0, y: 0, w: 5, h: 5 }]);
      frameling.commands.register({ id: 'add', label: 'Add' }, async () => { try { await frameling.shapes.place('dot', {}); } catch (e) { await frameling.ui.notify(e.message); } });`;
    await installFrom(files({ permissions: ['shapes'] }, code));
    await settle();
    store().update('Lock', (d) => void (d.layers[0].locked = true));
    await getCommand('plugin.power-plug.add')!.run();
    await settle();
    expect((store().get().doc.drawings.dv as { shapes: unknown[] }).shapes).toHaveLength(0);
  });

  it('events: told about changes in the document, the selection and the frame, as summaries, once something listens', async () => {
    answer = () => [];
    const seen: string[] = [];
    await installFrom(
      files(
        { permissions: [], events: ['document.changed', 'frame.changed', 'selection.changed'] },
        `for (const n of ['document.changed', 'frame.changed', 'selection.changed']) frameling.events.on(n, (e) => frameling.ui.notify(n + ' ' + JSON.stringify(e)));`,
      ),
    );
    await settle();
    const notified = vi.spyOn(await import('../../src/io/notify'), 'notify').mockImplementation((m) => void seen.push(m));
    try {
      store().setUi({ frame: 3 });
      store().update('Add marker', (d) => void d.markers.push({ id: 'm', name: 'M', frame: 1 }));
      store().setUi({ selection: ['a', 'b'] });
      await settle(12);
    } finally {
      notified.mockRestore();
    }
    const text = seen.join('\n');
    expect(text).toContain('frame.changed {"frame":3}');
    expect(text).toMatch(/document.changed \{"label":"Add marker","frame":3,"length":24,"layers":1,"drawings":1,"shapes":0\}/);
    expect(text).toContain('selection.changed {"count":2}');
    expect(text).not.toContain('"a"');
  });

  it('stops listening to the app when no plugin wants events any more', async () => {
    await installFrom(files({ permissions: [], events: ['frame.changed'] }, `frameling.events.on('frame.changed', () => {});`));
    await settle();
    const subscribed = vi.spyOn(store(), 'subscribe');
    await setEnabled('power-plug', false);
    expect(subscribed).not.toHaveBeenCalled();
    store().setUi({ frame: 5 });
  });
});
