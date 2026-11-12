// @vitest-environment jsdom
// The layer list with folders inside folders: tree semantics with levels, indent, keyboard moves and drag and drop.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Layer } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import * as edit from '../../src/effects/edit';
import { toggleFolderCollapsed } from '../../src/effects/rows';
import '../../src/timeline';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { setTl } from '../../src/timeline/state';

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

/** a, b, c, d (bottom first); P holds b and c; Q (in P) holds c. */
function mount() {
  const doc = newDoc({ width: 8, height: 8 });
  doc.layers = ['a', 'b', 'c', 'd'].map((n) => Object.assign(newVectorLayer(n), { id: n }) as Layer);
  const p = edit.makeFolder(doc, ['b', 'c'], 'P')!;
  const q = edit.makeFolder(doc, ['c'], 'Q')!;
  const s = resetStore(doc);
  act(() => root.render(<TimelinePanel />));
  return { s, p, q };
}
const rows = () => Array.from(host.querySelectorAll<HTMLElement>('[role=treeitem][data-row]'));
const label = (el: HTMLElement) => (el.dataset.folder ? `F:${el.getAttribute('aria-label')!.split(',')[0].slice(7)}` : el.dataset.layer!);
const key = (el: HTMLElement, k: string, extra: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })));
const layerEl = (id: string) => host.querySelector<HTMLElement>(`[data-layer="${id}"]`)!;
const folderEl = (id: string) => host.querySelector<HTMLElement>(`[data-folder="${id}"]`)!;

describe('layer list with folders inside folders', () => {
  it('is a tree: levels on every row, folders say whether they are open', () => {
    const { p, q } = mount();
    const tree = host.querySelector('[role=tree]')!;
    expect(tree).toBeTruthy();
    expect(rows().map((r) => `${label(r)}@${r.getAttribute('aria-level')}`)).toEqual(['d@1', 'F:P@1', 'F:Q@2', 'c@3', 'b@2', 'a@1']);
    expect(folderEl(p).getAttribute('aria-expanded')).toBe('true');
    act(() => toggleFolderCollapsed(q, true));
    expect(folderEl(q).getAttribute('aria-expanded')).toBe('false');
    expect(rows().map(label)).toEqual(['d', 'F:P', 'F:Q', 'b', 'a']);
    act(() => toggleFolderCollapsed(p, true));
    expect(rows().map(label)).toEqual(['d', 'F:P', 'a']);
    act(() => {
      toggleFolderCollapsed(p, false);
      toggleFolderCollapsed(q, false);
    });
  });

  it('indents each row by how many folders it sits in', () => {
    mount();
    expect(layerEl('c').style.getPropertyValue('--depth')).toBe('2');
    expect(layerEl('b').style.getPropertyValue('--depth')).toBe('1');
    expect(layerEl('a').style.getPropertyValue('--depth')).toBe('0');
    expect(layerEl('c').className).toContain('in-folder');
    expect(layerEl('a').className).not.toContain('in-folder');
  });

  it('Alt+Right puts a layer in the folder next to it, Alt+Left takes it out', () => {
    const { s, p } = mount();
    key(layerEl('a'), 'ArrowRight', { altKey: true });
    expect(s.get().doc.layers.find((l) => l.id === 'a')!.folder).toBe(p);
    key(layerEl('a'), 'ArrowLeft', { altKey: true });
    expect(s.get().doc.layers.find((l) => l.id === 'a')!.folder).toBeUndefined();
  });

  it('Alt+Up and Alt+Down step a layer through the folders', () => {
    const { s, p, q } = mount();
    const folderOfD = () => s.get().doc.layers.find((l) => l.id === 'd')!.folder;
    key(layerEl('d'), 'ArrowDown', { altKey: true });
    expect(folderOfD()).toBe(p);
    key(layerEl('d'), 'ArrowDown', { altKey: true });
    expect(folderOfD()).toBe(q);
    // At the top edge of Q it steps out to P, then out to the stage.
    key(layerEl('d'), 'ArrowUp', { altKey: true });
    expect(folderOfD()).toBe(p);
    key(layerEl('d'), 'ArrowUp', { altKey: true });
    expect(folderOfD()).toBeUndefined();
  });

  it('Alt+Right on a folder puts the folder in the folder next to it', () => {
    const doc = newDoc({ width: 8, height: 8 });
    doc.layers = ['a', 'b', 'c'].map((n) => Object.assign(newVectorLayer(n), { id: n }) as Layer);
    const f = edit.makeFolder(doc, ['a', 'b'], 'F')!;
    const g = edit.makeFolder(doc, ['c'], 'G')!;
    const s = resetStore(doc);
    act(() => root.render(<TimelinePanel />));
    key(folderEl(g), 'ArrowRight', { altKey: true });
    expect(s.get().doc.folders![g].parent).toBe(f);
    key(folderEl(g), 'ArrowLeft', { altKey: true });
    expect(s.get().doc.folders![g].parent).toBeUndefined();
  });

  it('arrows walk the rows and fold and unfold folders', () => {
    const { q } = mount();
    const el = folderEl(q);
    act(() => el.focus());
    key(el, 'ArrowDown');
    expect(document.activeElement).toBe(layerEl('c'));
    key(layerEl('c'), 'ArrowLeft');
    expect(document.activeElement).toBe(folderEl(q));
    key(el, 'ArrowLeft');
    expect(folderEl(q).getAttribute('aria-expanded')).toBe('false');
    key(folderEl(q), 'ArrowRight');
    expect(folderEl(q).getAttribute('aria-expanded')).toBe('true');
  });

  it('dragging a folder onto another folder puts it inside', () => {
    const doc = newDoc({ width: 8, height: 8 });
    doc.layers = ['a', 'b', 'c'].map((n) => Object.assign(newVectorLayer(n), { id: n }) as Layer);
    const f = edit.makeFolder(doc, ['a', 'b'], 'F')!;
    const g = edit.makeFolder(doc, ['c'], 'G')!;
    const s = resetStore(doc);
    act(() => root.render(<TimelinePanel />));
    const data = { setData() {}, effectAllowed: '' };
    const ev = (type: string) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer: data, clientY: 0 });
    act(() => void folderEl(g).dispatchEvent(ev('dragstart')));
    act(() => void folderEl(f).dispatchEvent(ev('dragover')));
    expect(folderEl(f).className).toContain('drop-into');
    act(() => void folderEl(f).dispatchEvent(ev('drop')));
    expect(s.get().doc.folders![g].parent).toBe(f);
    expect(store().get().doc.layers.map((l) => l.id).join('')).toBe('abc');
  });
});
