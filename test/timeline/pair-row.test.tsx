// @vitest-environment jsdom
// A pair in the Layers panel: one row, a chip for each half, the eye and padlock for both. The timeline keeps both rows.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/core/commands';
import type { Layer } from '../../src/core/format';
import { newDoc, newPixelLayer, newVectorLayer } from '../../src/core/doc';
import { linkPair } from '../../src/core/pairs';
import { resetStore, store } from '../../src/core/store';
import { foldPairs, timelineRows } from '../../src/effects/rows';
import * as edit from '../../src/effects/edit';
import { LayersPanel } from '../../src/timeline/LayersPanel';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { halfChipWords, halfMenu, pairMenu, pairName } from '../../src/timeline/Layers';
import { setTl } from '../../src/timeline/state';
import '../../src/ui/dockCommands';
import { getCommand } from '../../src/core/registry';

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

/** Bottom first: Back (vector), then the pair Ink (vector) and Ink (pixels), then Front (pixel). */
function mount(what: 'panel' | 'timeline' = 'panel') {
  const doc = newDoc({ width: 8, height: 8 });
  const back = Object.assign(newVectorLayer('Back'), { id: 'back' }) as Layer;
  const v = Object.assign(newVectorLayer('Ink'), { id: 'v' }) as Layer;
  const p = Object.assign(newPixelLayer('Ink (pixels)', 4), { id: 'p' }) as Layer;
  const front = Object.assign(newPixelLayer('Front', 4), { id: 'front' }) as Layer;
  doc.layers = [back, v, p, front];
  linkPair(v, p);
  const s = resetStore(doc);
  act(() => root.render(what === 'panel' ? <LayersPanel /> : <TimelinePanel />));
  return s;
}
const rows = () => [...new Set(Array.from(host.querySelectorAll<HTMLElement>('[data-layer]')).map((r) => r.dataset.layer))];
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const chip = (kind: 'pixel' | 'vector') => host.querySelector<HTMLButtonElement>(`.tl-half[data-half="${kind}"]`)!;

describe('folding a pair into one row', () => {
  it('joins two neighbouring halves in one folder, and leaves everything else', () => {
    const doc = newDoc();
    const v = Object.assign(newVectorLayer('Ink'), { id: 'v' }) as Layer;
    const p = Object.assign(newPixelLayer('Ink (pixels)', 4), { id: 'p' }) as Layer;
    const o = Object.assign(newVectorLayer('Other'), { id: 'o' }) as Layer;
    doc.layers = [o, v, p];
    linkPair(v, p);
    const rows = foldPairs(timelineRows(doc, new Set()));
    expect(rows.map((r) => (r.type === 'layer' ? [r.layer.id, r.half?.id] : null))).toEqual([['p', 'v'], ['o', undefined]]);
  });

  it('keeps two rows when the halves are not side by side, or are not a pair', () => {
    const doc = newDoc();
    const v = Object.assign(newVectorLayer('Ink'), { id: 'v' }) as Layer;
    const p = Object.assign(newPixelLayer('Ink (pixels)', 4), { id: 'p' }) as Layer;
    const o = Object.assign(newVectorLayer('Other'), { id: 'o' }) as Layer;
    doc.layers = [v, o, p];
    linkPair(v, p);
    expect(foldPairs(timelineRows(doc, new Set()))).toHaveLength(3);
    doc.layers = [v, p, o];
    v.pair = undefined;
    delete v.pair;
    expect(foldPairs(timelineRows(doc, new Set()))).toHaveLength(3);
  });

  it('keeps two rows when the halves are in different folders', () => {
    const doc = newDoc();
    const v = Object.assign(newVectorLayer('Ink'), { id: 'v' }) as Layer;
    const p = Object.assign(newPixelLayer('Ink (pixels)', 4), { id: 'p' }) as Layer;
    doc.layers = [v, p];
    linkPair(v, p);
    doc.folders = { F: { id: 'F', name: 'F', visible: true, opacity: 1 } };
    p.folder = 'F';
    expect(foldPairs(timelineRows(doc, new Set()))).toHaveLength(3);
  });

  it('a pair goes into a folder whole', () => {
    const doc = newDoc();
    const v = Object.assign(newVectorLayer('Ink'), { id: 'v' }) as Layer;
    const p = Object.assign(newPixelLayer('Ink (pixels)', 4), { id: 'p' }) as Layer;
    doc.layers = [v, p];
    linkPair(v, p);
    edit.makeFolder(doc, ['p'], 'F');
    expect(doc.layers.map((l) => l.folder)).toEqual([doc.layers[0].folder, doc.layers[0].folder]);
    expect(doc.layers[0].folder).toBeTruthy();
  });
});

describe('the pair row in the Layers panel', () => {
  it('is one row for the two halves, so the panel does not fill up', () => {
    mount();
    expect(rows()).toEqual(['front', 'p', 'back']);
    expect(host.querySelector('[data-pair]')).toBeTruthy();
    expect(host.querySelector('[data-layer="p"] .tl-layer-name')!.textContent).toBe('Ink');
  });

  it('has a chip for each half, Pixels on the left, and lights the one you are on', () => {
    const s = mount();
    act(() => s.setUi({ activeLayerId: 'v' }));
    const kinds = [...host.querySelectorAll<HTMLElement>('.tl-half')].map((c) => c.dataset.half);
    expect(kinds).toEqual(['pixel', 'vector']);
    expect(chip('vector').classList.contains('is-on')).toBe(true);
    expect(chip('pixel').classList.contains('is-on')).toBe(false);
    expect(host.querySelector('[data-layer="p"]')!.classList.contains('is-active')).toBe(true);
  });

  it('reaches each half: clicking a chip picks that half', () => {
    const s = mount();
    click(chip('pixel'));
    expect(s.get().ui.activeLayerId).toBe('p');
    click(chip('vector'));
    expect(s.get().ui.activeLayerId).toBe('v');
    expect(chip('vector').getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the row keeps the half you are on, and goes to the top half from elsewhere', () => {
    const s = mount();
    act(() => s.setUi({ activeLayerId: 'v' }));
    click(host.querySelector('[data-layer="p"]')!);
    expect(s.get().ui.activeLayerId).toBe('v');
    act(() => s.setUi({ activeLayerId: 'back' }));
    click(host.querySelector('[data-layer="p"]')!);
    expect(s.get().ui.activeLayerId).toBe('p');
  });

  it('hides and locks both halves with the row buttons, in one undo step each', () => {
    const s = mount();
    const row = host.querySelector('[data-layer="p"]')!;
    const eye = row.querySelector<HTMLButtonElement>('button[aria-label="Hide both layers"]')!;
    click(eye);
    expect(s.get().doc.layers.filter((l) => l.id === 'v' || l.id === 'p').map((l) => l.visible)).toEqual([false, false]);
    s.undo();
    expect(s.get().doc.layers.every((l) => l.visible)).toBe(true);
    const lock = row.querySelector<HTMLButtonElement>('button[aria-label^="Lock both layers"]')!;
    click(lock);
    expect(s.get().doc.layers.filter((l) => l.pair).every((l) => l.locked)).toBe(true);
  });

  it('shows what a half is in its chip: hidden and locked', () => {
    const s = mount();
    act(() => s.update('hide', (d) => void (d.layers.find((l) => l.id === 'v')!.visible = false)));
    act(() => s.update('lock', (d) => void (d.layers.find((l) => l.id === 'p')!.locked = true)));
    expect(chip('vector').classList.contains('is-off')).toBe(true);
    expect(chip('pixel').classList.contains('is-locked')).toBe(true);
    expect(chip('vector').getAttribute('aria-label')).toContain('hidden');
    expect(chip('pixel').getAttribute('aria-label')).toContain('locked');
  });

  it('the timeline keeps both rows, each joined to its half by a bar', () => {
    mount('timeline');
    expect(rows()).toEqual(['front', 'p', 'v', 'back']);
    expect(host.querySelector('[data-layer="v"]')!.classList.contains('is-paired')).toBe(true);
    expect(host.querySelector('[data-layer="back"]')!.classList.contains('is-paired')).toBe(false);
  });

  it('renaming starts with the pair\'s name, without the tag', () => {
    mount();
    act(() => setTl({ editing: { kind: 'layer', id: 'p' } }));
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('Ink');
  });
});

describe('what each half and the pair can do from a menu', () => {
  it('a half can be hidden, locked, split off, swapped to the other side and deleted on its own', () => {
    const s = mount();
    const labels = halfMenu(s.get().doc.layers.find((l) => l.id === 'p')!).flatMap((i) => ('label' in i ? [i.label] : []));
    expect(labels).toEqual(expect.arrayContaining(['Hide this half', 'Rename this half', 'Swap which half is on top', 'Split the pair into two layers', 'Delete this pixel half']));
    expect(labels.some((l) => l.startsWith('Lock this half'))).toBe(true);
  });

  it('the pair menu has the whole-pair actions, then each half\'s own', () => {
    const s = mount();
    const items = pairMenu(s.get().doc.layers.find((l) => l.id === 'p')!, () => void 0);
    const labels = items.flatMap((i) => ('label' in i ? [i.label] : []));
    expect(labels).toEqual(expect.arrayContaining(['Duplicate the pair', 'Delete both halves', 'Swap which half is on top', 'Hide both halves', 'Lock both halves', 'Delete the pixel half', 'Delete the vector half']));
    expect(items.filter((i) => 'heading' in i).map((i) => ('heading' in i ? i.heading : ''))).toEqual(['Ink (a pair: pixels and vectors)', 'Pixels half', 'Vectors half']);
  });

  it('the half words say hidden, locked and picked, and how to reach more', () => {
    const l = { ...newPixelLayer('Ink (pixels)', 4), visible: false, locked: true } as Layer;
    const w = halfChipWords(l, true);
    expect(w.label).toBe('Pixels half, Ink (pixels), hidden, locked, picked');
    expect(w.tip).toContain('You are drawing on it.');
    expect(w.tip).toContain('Right-click');
    expect(pairName(l)).toBe('Ink');
  });

  it('the commands to make, split and delete a pair are in the palette, and only offered when they apply', () => {
    const s = mount();
    s.setUi({ activeLayerId: 'back' });
    const state = () => s.get();
    expect(getCommand('layers.addHalf')!.enabled!(state())).toBe(true);
    expect(getCommand('layers.unpair')!.enabled!(state())).toBe(false);
    s.setUi({ activeLayerId: 'v' });
    expect(getCommand('layers.addHalf')!.enabled!(state())).toBe(false);
    expect(getCommand('layers.unpair')!.enabled!(state())).toBe(true);
    expect(getCommand('layers.deletePair')!.enabled!(state())).toBe(true);
    getCommand('layers.unpair')!.run();
    expect(s.get().doc.layers.some((l) => l.pair)).toBe(false);
  });

  it('adding the other half on purpose makes it beside the layer and goes to it, as one step', () => {
    const s = mount();
    s.setUi({ activeLayerId: 'back' });
    getCommand('layers.addHalf')!.run();
    const layers = s.get().doc.layers;
    expect(layers.map((l) => l.name)).toEqual(['Back', 'Back (pixels)', 'Ink', 'Ink (pixels)', 'Front']);
    expect(s.get().ui.activeLayerId).toBe(layers[1].id);
    s.undo();
    expect(s.get().doc.layers).toHaveLength(4);
  });
});
