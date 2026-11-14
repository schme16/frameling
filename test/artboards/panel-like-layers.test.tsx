// @vitest-environment jsdom
// The Artboards panel is built from the same parts as the Layers panel (src/timeline/PieceRow.tsx), so the two read as
// views of one idea: the same header shape, the same row, the same picking, renaming, reordering and menu.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Layer } from '../../src/core/format';
import { resetStore } from '../../src/core/store';
import '../../src/renderer/features';
import { ArtboardsPanel } from '../../src/artboards/ArtboardsPanel';
import { LayersPanel } from '../../src/timeline/LayersPanel';
import { activeId, addArtboard, artboardsOf } from '../../src/artboards/model';
import { dropIndex } from '../../src/timeline/PieceRow';
import { CLEAN_ROW_H } from '../../src/timeline/layout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  const g = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? null : () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => g) as never;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

/** Three artboards, A B C. */
function three() {
  const doc = newDoc({ name: 'Sprites', width: 64, height: 64 });
  doc.layers = ['a', 'b'].map((n) => Object.assign(newVectorLayer(n), { id: n }) as Layer);
  addArtboard(doc, { name: 'B', width: 64, height: 64 });
  addArtboard(doc, { name: 'C', width: 32, height: 32 });
  return resetStore(doc);
}
const boards = () => Array.from(host.querySelectorAll<HTMLElement>('[data-artboard]'));
const names = () => boards().map((r) => r.querySelector('.tl-layer-name')?.textContent);
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const key = (el: Element, k: string, alt = false) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true, cancelable: true })));

describe('dropIndex', () => {
  it('says where a dragged row lands once it has left its old place', () => {
    expect(dropIndex(0, 2, 'above')).toBe(1);
    expect(dropIndex(0, 2, 'below')).toBe(2);
    expect(dropIndex(3, 1, 'above')).toBe(1);
    expect(dropIndex(3, 1, 'below')).toBe(2);
    expect(dropIndex(1, 1, 'above')).toBe(1);
    expect(dropIndex(1, 1, 'below')).toBe(1);
  });
});

describe('the Artboards panel next to the Layers panel', () => {
  it('has the same header: the add buttons first, then duplicate and delete, in a toolbar', () => {
    three();
    act(() => root.render(<><div id="l"><LayersPanel /></div><div id="a"><ArtboardsPanel /></div></>));
    const shape = (id: string) => {
      const bar = host.querySelector(`#${id} .tl-layer-tools.in-panel`)!;
      expect(bar.getAttribute('role')).toBe('toolbar');
      return Array.from(bar.children).map((c) => `${c.className.split(' ')[0]}:${c.getAttribute('aria-label')?.replace(/layer|artboard/g, 'X')}`).slice(0, 2);
    };
    expect(shape('l')).toEqual(['tl-layer-new:New X', 'tl-layer-actions:This X']);
    expect(shape('a')).toEqual(['tl-layer-new:New X', 'tl-layer-actions:This X']);
    // The layers' own Mask button sits between the shared duplicate and delete.
    expect(Array.from(host.querySelectorAll('#l .tl-layer-actions button')).map((b) => b.getAttribute('aria-label'))).toEqual(['Duplicate layer', 'Add a mask to this layer', 'Delete layer']);
    const buttons = Array.from(host.querySelectorAll('#a .tl-layer-actions button')).map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Duplicate artboard', 'Delete artboard']);
  });

  it('draws a row the way a layer row is drawn: same class, height, grip, name and more button', () => {
    three();
    act(() => root.render(<><div id="l"><LayersPanel /></div><div id="a"><ArtboardsPanel /></div></>));
    const layerRow = host.querySelector<HTMLElement>('#l [data-layer]')!;
    const row = host.querySelector<HTMLElement>('#a [data-artboard]')!;
    for (const el of [layerRow, row]) {
      expect(el.classList.contains('tl-layer')).toBe(true);
      expect(el.getAttribute('role')).toBe('treeitem');
      expect(el.style.height).toBe(`${CLEAN_ROW_H}px`);
      expect(el.querySelector('.tl-grip')).toBeTruthy();
      expect(el.querySelector('.tl-layer-name')).toBeTruthy();
      expect(el.querySelector('.tl-more[aria-haspopup=menu]')).toBeTruthy();
      expect(el.getAttribute('draggable')).toBe('true');
    }
    expect(host.querySelector('#a [role=tree]')).toBeTruthy();
  });

  it('picks a board with a click, and the chosen row wears the chosen look', () => {
    const s = three();
    act(() => root.render(<ArtboardsPanel />));
    const first = artboardsOf(s.get().doc)[0].id;
    expect(boards().filter((r) => r.classList.contains('is-active')).length).toBe(1);
    click(boards()[0]);
    expect(activeId(s.get().doc)).toBe(first);
    expect(boards()[0].classList.contains('is-active')).toBe(true);
    expect(boards()[0].getAttribute('aria-current')).toBe('true');
  });

  it('renames in place with a double-click on the name, like a layer', () => {
    const s = three();
    act(() => root.render(<ArtboardsPanel />));
    act(() => void boards()[1].querySelector('.tl-layer-name')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Artboard name"]')!;
    expect(input).toBeTruthy();
    expect(boards()[1].getAttribute('draggable')).toBe('false');
    act(() => {
      input.value = 'Renamed';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(artboardsOf(s.get().doc)[1].name).toBe('Renamed');
    expect(host.querySelector('input[aria-label="Artboard name"]')).toBeNull();
  });

  it('moves a board with Alt + the arrow keys, and the arrows alone walk the rows', () => {
    const s = three();
    act(() => root.render(<ArtboardsPanel />));
    const before = names();
    expect(before.length).toBe(3);
    key(boards()[0], 'ArrowDown', true);
    expect(names()).toEqual([before[1], before[0], before[2]]);
    expect(artboardsOf(s.get().doc).map((a) => a.name)).toEqual(names());
    boards()[0].focus();
    key(boards()[0], 'ArrowDown');
    expect(document.activeElement).toBe(boards()[1]);
  });

  it('shows what is only true of a board in the row: its size, and a tag on a variation', () => {
    const s = three();
    act(() => root.render(<ArtboardsPanel />));
    expect(Array.from(host.querySelectorAll('.ab-size')).map((e) => e.textContent)).toEqual(expect.arrayContaining(['64 x 64', '32 x 32']));
    expect(s.get().doc.artboards?.length).toBe(3);
    expect(host.querySelector('[data-artboard] .tl-ref-tag')).toBeNull();
  });
});
