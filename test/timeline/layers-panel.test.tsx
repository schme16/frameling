// @vitest-environment jsdom
// The Layers panel in the right rail: the same layers the timeline shows, in a list of its own, and the two stay
// in step. Also where it sits: above Artboards, and leading the right side in the Animate workspace.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Layer } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import * as edit from '../../src/effects/edit';
import { allPanels, getPanel } from '../../src/core/registry';
import '../../src/renderer/features';
import { LayersPanel } from '../../src/timeline/LayersPanel';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { setTl } from '../../src/timeline/state';
import { CLEAN_ROW_H, DETAIL_ROW_H } from '../../src/timeline/layout';
import { setCleanTimeline } from '../../src/timeline/view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});
beforeEach(() => {
  setTl({ cw: 20, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

/** Layers a, b, c (bottom first), with b and c in a folder. */
function mount(what: 'panel' | 'timeline' = 'panel') {
  const doc = newDoc({ width: 8, height: 8 });
  doc.layers = ['a', 'b', 'c'].map((n) => Object.assign(newVectorLayer(n), { id: n }) as Layer);
  const folder = edit.makeFolder(doc, ['b', 'c'], 'P')!;
  const s = resetStore(doc);
  act(() => root.render(what === 'panel' ? <LayersPanel /> : <TimelinePanel />));
  return { s, folder };
}
const rows = () => Array.from(host.querySelectorAll<HTMLElement>('[data-layer]')).map((r) => r.dataset.layer);
const layerEl = (id: string) => host.querySelector<HTMLElement>(`[data-layer="${id}"]`)!;
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('the Layers panel', () => {
  it('lists every layer, top first, with its folders', () => {
    mount();
    expect(rows()).toEqual(['c', 'b', 'a']);
    expect(host.querySelector('[role=tree]')).toBeTruthy();
    expect(host.querySelector('[data-folder]')).toBeTruthy();
  });

  it('picking, hiding and locking in the panel changes the document, so the timeline shows it too', () => {
    const { s } = mount();
    click(layerEl('a'));
    expect(s.get().ui.activeLayerId).toBe('a');
    const eye = layerEl('a').querySelector('[aria-label="Hide layer"]')!;
    click(eye);
    expect(s.get().doc.layers.find((l) => l.id === 'a')!.visible).toBe(false);
    const lock = layerEl('a').querySelector('[aria-label="Lock layer"]')!;
    click(lock);
    expect(s.get().doc.layers.find((l) => l.id === 'a')!.locked).toBe(true);
    // The timeline, mounted after, shows the same thing: one document, two views of it.
    act(() => root.render(<TimelinePanel />));
    expect(layerEl('a').className).toContain('is-hidden');
    expect(layerEl('a').className).toContain('is-locked');
  });

  it('keeps even rows whichever look the timeline is in, and no property rows', () => {
    setCleanTimeline(false);
    mount();
    for (const id of ['a', 'b', 'c']) expect(layerEl(id).style.height).toBe(`${CLEAN_ROW_H}px`);
    expect(host.querySelector('.tl-prop')).toBeNull();
    // The timeline itself still slims its rows down in the detailed look.
    act(() => root.render(<TimelinePanel />));
    expect(layerEl('a').style.height).toBe(`${DETAIL_ROW_H}px`);
    setCleanTimeline(true);
  });

  it('has the add, duplicate and delete buttons, without repeating the panel name', () => {
    mount();
    const tools = host.querySelector('[role=toolbar][aria-label=Layers]')!;
    expect(tools.querySelector('[aria-label="Add vector layer"]')).toBeTruthy();
    expect(tools.querySelector('[aria-label="Add pixel layer"]')).toBeTruthy();
    expect(tools.querySelector('[aria-label="Duplicate layer"]')).toBeTruthy();
    expect(tools.textContent).not.toContain('Layers');
  });
});

describe('where the Layers panel sits', () => {
  it('is in the right rail, above Artboards', () => {
    const layers = getPanel('layers')!;
    const artboards = getPanel('artboards')!;
    expect(layers.zone).toBe('right');
    expect(layers.order!).toBeLessThan(artboards.order!);
    const right = allPanels().filter((p) => p.zone === 'right').map((p) => p.id);
    expect(right.indexOf('layers')).toBeLessThan(right.indexOf('artboards'));
  });

  it('turns up in a layout saved before it existed, without disturbing it', async () => {
    const { reconcile } = await import('../../src/ui/dock');
    const { emptyLayout } = await import('../../src/ui/dockModel');
    // A layout from an older version: it knows the panels of its day, and Layers is not one of them.
    const old = emptyLayout();
    old.zones.right.tabs = ['tool-options', 'colors', 'artboards'];
    old.zones.right.active = 'colors';
    old.zones.bottom.tabs = ['timeline'];
    old.known = ['tool-options', 'colors', 'artboards', 'timeline'];
    const next = reconcile(old);
    expect(next.zones.right.tabs).toContain('layers');
    // Nothing it already had moved, and the tab you were on is still the one showing.
    expect(next.zones.right.tabs.slice(0, 3)).toEqual(['tool-options', 'colors', 'artboards']);
    expect(next.zones.right.active).toBe('colors');
    expect(next.zones.bottom.tabs).toContain('timeline');
  });

  it('adds a layers list the dock can lead the Animate workspace with', async () => {
    const { builtinWorkspaces } = await import('../../src/ui/dock');
    const animate = builtinWorkspaces().find((w) => w.id === 'animate')!;
    expect(animate.layout.zones.right.tabs[0]).toBe('layers');
  });
});
