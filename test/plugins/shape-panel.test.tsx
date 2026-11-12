// @vitest-environment jsdom
// The Properties section for a plugin's shape: the settings form (from the options the plugin described), what changing a
// setting does (draws it again, keeps the person's move and scale, one undo step), and "Turn it on" when the plugin is off.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strToU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, PathShape } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { shapesBounds, transformShapes } from '../../src/canvas/geometry';
import { installFrom, plugins, resetPluginsForTests, setApprover, setEnabled, setSandboxStarterForTests } from '../../src/plugins/manager';
import { PluginShapePanel } from '../../src/plugins/PluginShapePanel';
import { pickedPluginShape } from '../../src/plugins/shapeProps';
import { infoOf } from '../../src/plugins/shapes';
import { syncShapeSection } from '../../src/plugins/shapeSection';
import { PANEL_INFO, sectionsNow } from '../../src/ui/panelInfo';
import { getCommand, getPanel } from '../../src/core/registry';
import { decide } from '../../src/plugins/powers';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { closeAll, runPlugin, settle } from './harness';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = `frameling.shapes.register({ kind: 'dot', label: 'Dot', options: [
    { id: 'r', type: 'number', label: 'Radius', min: 2, max: 100, step: 1, default: 10 },
    { id: 'color', type: 'choice', label: 'Colour', choices: [{ value: '#ff0000', label: 'Red' }, { value: '#0000ff', label: 'Blue' }], default: '#ff0000' },
    { id: 'ring', type: 'switch', label: 'Ring', default: false },
  ] }, (p) => [{ type: 'ellipse', cx: 0, cy: 0, rx: p.r, ry: p.r, fill: p.color, stroke: p.ring ? '#000000' : undefined, width: 2 }]);
  frameling.commands.register({ id: 'add', label: 'Add' }, async () => { await frameling.shapes.place('dot', { r: 10, color: '#ff0000' }, { x: 60, y: 40 }); });`;

let root: Root;
let host: HTMLElement;
const shapes = () => (store().get().doc.drawings.dv as { shapes: PathShape[] }).shapes;

beforeEach(async () => {
  localStorage.clear();
  setLibraryForTests(memoryLibrary);
  setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
  setApprover(async (m) => {
    const d = decide(m, ['shapes'], false);
    return { permissions: d.permissions, network: d.network };
  });
  const doc: Doc = newDoc({ width: 200, height: 100 });
  doc.drawings = { dv: { ...newVectorDrawing(), id: 'dv' } };
  doc.layers[0].cels = [{ id: 'c1', drawingId: 'dv', start: 0, length: 24 }];
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  resetPluginsForTests();
  setApprover(null);
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

async function installAndAdd() {
  await installFrom({ 'manifest.json': strToU8(JSON.stringify({ id: 'dots', name: 'Dots', version: '1.0.0', apiVersion: 2, permissions: ['shapes'] })), 'main.js': strToU8(CODE) });
  await settle();
  await getCommand('plugin.dots.add')!.run();
  await settle();
  act(() => root.render(<PluginShapePanel />));
}

const field = (label: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector('input,select') as HTMLInputElement | HTMLSelectElement;
const change = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
const flush = async () => {
  await act(async () => {
    await settle(10);
  });
};

describe('the plugin shape section', () => {
  it('exists while a plugin that makes shapes is installed, only then', async () => {
    expect(getPanel('plugin-shape')).toBeUndefined();
    await installFrom({ 'manifest.json': strToU8(JSON.stringify({ id: 'dots', name: 'Dots', version: '1.0.0', apiVersion: 2, permissions: ['shapes'] })), 'main.js': strToU8(CODE) });
    expect(getPanel('plugin-shape')?.title).toBe('Plugin shape');
    expect(PANEL_INFO['plugin-shape']?.section).toBe(true);
    // It leads Properties when one is picked, and waits in "Also here" otherwise.
    expect(sectionsNow(['plugin-shape'], store().get(), null).idle).toEqual(['plugin-shape']);
    resetPluginsForTests();
    syncShapeSection();
    expect(getPanel('plugin-shape')).toBeUndefined();
    expect(PANEL_INFO['plugin-shape']).toBeUndefined();
  });

  it('says what to pick when nothing is', async () => {
    act(() => root.render(<PluginShapePanel />));
    expect(host.textContent).toContain('Select a shape that a plugin made.');
  });

  it('shows the form from the plugin, and changing a setting draws the shape again in one undo step', async () => {
    await installAndAdd();
    expect(pickedPluginShape(store().get())).toMatchObject({ pluginId: 'dots', kind: 'dot', props: { r: 10, color: '#ff0000' } });
    expect(host.textContent).toContain('Dot made by Dots');
    expect(host.textContent).toContain('Change settings');
    expect((field('Radius') as HTMLInputElement).value).toBe('10');
    expect((field('Colour') as HTMLSelectElement).value).toBe('#ff0000');
    change(field('Colour'), '#0000ff');
    await flush();
    expect(shapes()[0].fill).toBe('#0000ff');
    expect(infoOf(shapes()[0], 'dots')?.props).toMatchObject({ r: 10, color: '#0000ff' });
    expect(store().undoLabel()).toBe('Dots: Redraw dot');
    store().undo();
    expect(shapes()[0].fill).toBe('#ff0000');
  });

  it('numbers wait for the box to be left, and are kept inside their range', async () => {
    await installAndAdd();
    const r = field('Radius') as HTMLInputElement;
    change(r, '2');
    change(r, '25');
    expect(shapes().length).toBe(1);
    expect(shapesBounds(shapes())!.w).toBeCloseTo(20, 0);
    await act(async () => {
      r.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await flush();
    expect(shapesBounds(shapes())!.w).toBeGreaterThan(48);
    expect(infoOf(shapes()[0], 'dots')?.props?.r).toBe(25);
    change(field('Radius'), '5000');
    await act(async () => {
      field('Radius').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await flush();
    expect(infoOf(shapes()[0], 'dots')?.props?.r).toBe(100);
  });

  it('keeps the size and spot the person gave it with the ordinary tools', async () => {
    await installAndAdd();
    const before = shapesBounds(shapes())!;
    // Scaled up 2x and moved, like a person would with the Select tool.
    act(() => store().update('Scale', (d) => void ((d.drawings.dv as { shapes: PathShape[] }).shapes = transformShapes(shapes(), [2, 0, 0, 2, 30, 10]) as PathShape[])));
    const scaled = shapesBounds(shapes())!;
    change(field('Colour'), '#0000ff');
    await flush();
    const after = shapesBounds(shapes())!;
    expect(after.w).toBeCloseTo(scaled.w, 3);
    expect(after.x).toBeCloseTo(scaled.x, 3);
    expect(after.y).toBeCloseTo(scaled.y, 3);
    expect(scaled.w).toBeCloseTo(before.w * 2, 3);
  });

  it('shows Turn it on when the plugin is off, and the settings come back once it is on', async () => {
    await installAndAdd();
    await setEnabled('dots', false);
    await flush();
    expect(host.textContent).toContain('Dots is off');
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Turn it on')!;
    expect(btn).toBeTruthy();
    expect(host.querySelector('select')).toBeNull();
    await act(async () => {
      btn.click();
      await settle(15);
    });
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on' });
    expect(host.textContent).toContain('Change settings');
  });

  it('explains itself when the plugin is gone', async () => {
    await installAndAdd();
    // Forgotten, as if it had never been installed here.
    resetPluginsForTests();
    await flush();
    act(() => root.render(<PluginShapePanel />));
    expect(host.textContent).toContain("isn't installed");
  });
});
