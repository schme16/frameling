// @vitest-environment jsdom
// What a plugin's tool can ask for beyond the pointer: handles to drag, snapping, named keys, and what Frameling does
// with them. Through the real store, view settings, command registry and tool registry.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc } from '../../src/core/doc';
import type { ToolPointer } from '../../src/core/registry';
import { getCommand, getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { installFrom, resetPluginsForTests, setApprover, setSandboxStarterForTests } from '../../src/plugins/manager';
import { decide } from '../../src/plugins/powers';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { closeAll, runPlugin, settle } from './harness';

type Ev = Record<string, unknown>;
const events = () => (globalThis as { __events?: Ev[] }).__events!;

// The tool logs every event it hears, and shows one handle (plus a plain line).
const CODE = `
globalThis.__events = [];
frameling.tools.register({ id: 'pen', label: 'Pen', snap: true, keys: [{ id: 'finish', label: 'Finish the line' }, { id: 'undo', label: 'Undo the last point' }, { id: 'finish', label: 'again' }] }, async (e) => {
  globalThis.__events.push(e);
  return { overlay: [{ type: 'handle', id: 'tip', x: 100, y: 100 }, { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }] };
});
frameling.tools.register({ id: 'loose', label: 'Loose' }, async (e) => { globalThis.__events.push({ ...e, tool: 'loose' }); });`;

const ptr = (x: number, y: number, over: Partial<ToolPointer> = {}): ToolPointer => ({ x, y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0, ...over });
const ctx = { zoom: 1, requestOverlay: () => undefined, hint: () => undefined };

beforeEach(async () => {
  localStorage.clear();
  setLibraryForTests(memoryLibrary);
  setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
  setApprover(async (m) => {
    const d = decide(m, ['tools'], false);
    return { permissions: d.permissions, network: d.network };
  });
  const doc = newDoc({ width: 200, height: 100 });
  doc.guides = [{ id: 'g1', axis: 'x', at: 50 }] as never;
  resetStore(doc);
  setViewSettings({ snap: true });
  await installFrom({ 'manifest.json': strToU8(JSON.stringify({ id: 'power-plug', name: 'Power plug', version: '1.0.0', apiVersion: 2, permissions: ['tools'] })), 'main.js': strToU8(CODE) });
  await settle();
});

afterEach(async () => {
  resetPluginsForTests();
  setApprover(null);
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

const tool = () => getTool('plugin.power-plug.tool.pen')!;

describe('handles', () => {
  it('a press on a handle of the last picture is a drag that keeps the handle id until the release', async () => {
    tool().hover!(ptr(5, 5), ctx);
    await settle();
    // The first answer drew the handle. Over it, the pointer is told which one.
    tool().hover!(ptr(102, 101), ctx);
    await settle();
    expect(events().at(-1)).toMatchObject({ type: 'hover', handle: 'tip' });
    tool().down!(ptr(102, 101), ctx);
    tool().move!(ptr(150, 130), ctx);
    tool().move!(ptr(160, 140), ctx);
    tool().up!(ptr(160, 140), ctx);
    await settle(12);
    const drag = events().filter((e) => e.type === 'down' || e.type === 'move' || e.type === 'up');
    expect(drag.length).toBeGreaterThanOrEqual(3);
    expect(drag.every((e) => e.handle === 'tip')).toBe(true);
    // After the release the next press is an ordinary one, away from the handle.
    tool().down!(ptr(30, 30), ctx);
    await settle();
    expect(events().at(-1)).toMatchObject({ type: 'down' });
    expect(events().at(-1)).not.toHaveProperty('handle');
  });

  it('only the tool whose picture it is can have its handles hit, and zoom changes how near is near enough', async () => {
    tool().hover!(ptr(5, 5), ctx);
    await settle();
    tool().hover!(ptr(110, 100), { ...ctx, zoom: 1 });
    await settle();
    expect(events().at(-1)).not.toHaveProperty('handle');
    tool().hover!(ptr(110, 100), { ...ctx, zoom: 0.5 });
    await settle();
    expect(events().at(-1)).toMatchObject({ handle: 'tip' });
  });
});

describe('snapping', () => {
  it('a tool that asked for it gets points pulled onto the guide, and the real place beside it', async () => {
    tool().move!(ptr(52, 40), ctx);
    await settle();
    expect(events().at(-1)).toMatchObject({ x: 50, y: 40, rawX: 52, rawY: 40 });
  });

  it('Ctrl (Cmd) leaves the point alone, and so does switching snapping off', async () => {
    tool().move!(ptr(52, 40, { mod: true }), ctx);
    await settle();
    expect(events().at(-1)).toMatchObject({ x: 52, rawX: 52 });
    setViewSettings({ snap: false });
    tool().move!(ptr(52, 40), ctx);
    await settle();
    expect(events().at(-1)).toMatchObject({ x: 52 });
  });

  it('a tool that did not ask for snapping never gets snapped points', async () => {
    getTool('plugin.power-plug.tool.loose')!.move!(ptr(52, 40), ctx);
    await settle();
    expect(events().at(-1)).toMatchObject({ tool: 'loose', x: 52, rawX: 52 });
  });
});

describe('keys', () => {
  it('each named key is a command with no key to start with, named for its tool', () => {
    const c = getCommand('plugin.power-plug.tool.pen.key.finish')!;
    expect(c.label).toBe('Pen: Finish the line');
    expect(c.keys ?? []).toEqual([]);
    expect(getCommand('plugin.power-plug.tool.pen.key.undo')?.label).toBe('Pen: Undo the last point');
    // A repeated id was ignored; the tool without keys has none.
    expect(getCommand('plugin.power-plug.tool.loose.key.finish')).toBeUndefined();
  });

  it('works only while the tool is picked, and sends the plugin a key event with the last pointer spot', async () => {
    const c = getCommand('plugin.power-plug.tool.pen.key.finish')!;
    expect(c.enabled?.(store().get())).toBe(false);
    store().setUi({ tool: 'plugin.power-plug.tool.pen' });
    expect(c.enabled?.(store().get())).toBe(true);
    tool().hover!(ptr(52, 40), ctx);
    await settle();
    await c.run();
    await settle();
    expect(events().at(-1)).toMatchObject({ type: 'key', key: 'finish', x: 50, y: 40, rawX: 52 });
  });

  it('they go when the plugin is turned off', async () => {
    resetPluginsForTests();
    expect(getCommand('plugin.power-plug.tool.pen.key.finish')).toBeUndefined();
  });
});
