// @vitest-environment jsdom
// The timeline draws the rows on screen in full and the rest as empty shells. These check that a big document draws
// far fewer elements, and that nothing that works from the layout (picking, dragging, copying) or from the row list
// (keyboard, screen readers) notices which rows are in full.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Doc, Layer } from '../../src/core/format';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import * as edit from '../../src/effects/edit';
import '../../src/timeline';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { keysIn } from '../../src/timeline/Grid';
import { clearFrameClip, hasFrameClip } from '../../src/timeline/frameClipCommands';
import { buildLayout, rowWindow } from '../../src/timeline/layout';
import { currentLayout } from '../../src/timeline/view';
import { clearKeys, pickKeys, setTl, tl } from '../../src/timeline/state';
import { celRef } from '../../src/timeline/tracks';
import { resolveTarget } from '../../src/quests/target';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
// What the scroller says about itself: jsdom has no layout, so the tests set these.
let scrollTop = 0;
let clientHeight = 300;
const CW = 24;
const ROW = 28;

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
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-scrolls') ? scrollTop : 0;
    },
    set() {},
  });
});
beforeEach(() => {
  scrollTop = 0;
  clientHeight = 300;
  setTl({ cw: CW, clipId: null, editing: null, keys: new Set() });
  clearFrameClip();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

/** `layers` vector layers, each with a one frame drawing every `every` frames across `frames` frames. */
function bigDoc(layers: number, frames: number, every = 1): Doc {
  const doc = newDoc({ length: frames });
  const base = doc.layers[0];
  doc.layers = [];
  for (let i = 0; i < layers; i++) {
    const L: Layer = { ...base, id: `L${i}`, name: `Layer ${i}`, cels: [] };
    for (let f = 0; f < frames; f += every) {
      const d = newVectorDrawing();
      doc.drawings[d.id] = d;
      L.cels.push({ id: `c${i}_${f}`, start: f, length: 1, drawingId: d.id });
    }
    doc.layers.push(L);
  }
  return doc;
}

function mount(doc: Doc) {
  const s = resetStore(doc);
  act(() => root.render(<TimelinePanel />));
  return s;
}

/** Scrolls the timeline up or down and lets the next animation frame notice. */
async function scrollTo(top: number) {
  scrollTop = top;
  const el = host.querySelector('.tl-body')!;
  await act(async () => {
    el.dispatchEvent(new Event('scroll'));
    // The panel notices the scroll in an animation frame it asked for during the event above. A frame asked for now
    // runs after it, so waiting for one is waiting for the panel, whatever the machine is doing (a fixed 60 ms was a guess).
    await new Promise((r) => requestAnimationFrame(r));
  });
}

const count = (q: string) => host.querySelectorAll(q).length;
const rows = () => Array.from(host.querySelectorAll<HTMLElement>('.tl-layers [role=treeitem][data-row]'));
const key = (el: HTMLElement, k: string, extra: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })));
const pointer = (el: Element, type: string, x: number, y: number, extra: PointerEventInit = {}) =>
  act(() => void el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, ...extra })));
/** A row's content: a full row has a name and buttons in it, a shell has nothing. */
const isShell = (el: Element) => !el.querySelector('.tl-layer-name, .tl-folder-name');

describe('rowWindow', () => {
  const layout = buildLayout(
    Array.from({ length: 10 }, (_, i) => ({ type: 'layer', layer: { id: `L${i}`, cels: [] } as unknown as Layer, inFolder: false, depth: 0 })) as never,
    'detailed',
    new Set(),
    () => [],
  );
  it('picks the rows a stretch of height touches', () => {
    expect(rowWindow(layout, 0, 60)).toEqual({ lo: 0, hi: 2 });
    expect(rowWindow(layout, 100, 130)).toEqual({ lo: 3, hi: 4 });
  });
  it('clamps to the first and last row, and is never empty for a list that has rows', () => {
    expect(rowWindow(layout, -500, 10)).toEqual({ lo: 0, hi: 0 });
    expect(rowWindow(layout, 5000, 6000)).toEqual({ lo: 9, hi: 9 });
    expect(rowWindow(buildLayout([], 'detailed', new Set(), () => []), 0, 100)).toEqual({ lo: 0, hi: -1 });
  });
});

describe('a big document draws only what is on screen', () => {
  it('40 layers by 240 keys: far fewer elements than drawing every row (numbers written down)', () => {
    // Before windowing the rows (every row in full), measured with a 300px tall timeline.
    clientHeight = 0;
    mount(bigDoc(40, 240));
    const everyRow = { all: count('.tl-body *'), keys: count('[data-key]'), side: count('.tl-side *'), main: count('.tl-main *') };
    expect(everyRow).toEqual({ all: 7786, keys: 1560, side: 1472, main: 6311 });
    act(() => root.unmount());
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    // After: the same document in a 300px tall timeline, at the top.
    clientHeight = 300;
    mount(bigDoc(40, 240));
    const windowed = { all: count('.tl-body *'), keys: count('[data-key]'), side: count('.tl-side *'), main: count('.tl-main *') };
    expect(windowed).toEqual({ all: 2629, keys: 507, side: 527, main: 2099 });
    expect(windowed.all).toBeLessThan(everyRow.all / 2.5);
    // Every row is still there, so the page is as tall as before.
    expect(count('.tl-rows > .tl-row')).toBe(40);
    expect((host.querySelector('.tl-rows') as HTMLElement).style.height).toBe(`${40 * ROW}px`);
  });

  it('fills in rows as you scroll down, and lets go of the ones left behind', async () => {
    mount(bigDoc(40, 24));
    const list = rows();
    expect(isShell(list[0])).toBe(false);
    expect(isShell(list[39])).toBe(true);
    expect(host.querySelector('.tl-rows [data-layer="L0"] .tl-cel')).toBeNull();
    await scrollTo(40 * ROW);
    expect(isShell(rows()[39])).toBe(false);
    expect(isShell(rows()[0])).toBe(true);
    expect(host.querySelector('.tl-rows [data-layer="L0"] .tl-cel')).toBeTruthy();
    expect(host.querySelector('.tl-rows [data-layer="L39"] .tl-cel')).toBeNull();
    // The same row elements are kept, so nothing that points at one is left holding a stale node.
    expect(rows()).toEqual(list);
  });

  it('draws everything when the timeline has not been measured (no height)', () => {
    clientHeight = 0;
    mount(bigDoc(12, 24));
    expect(rows().every((r) => !isShell(r))).toBe(true);
  });
});

describe('keyboard and screen readers still see every row', () => {
  it('every row is a tree item with its level, name and picked state, drawn in full or not', () => {
    const doc = bigDoc(40, 24);
    mount(doc);
    act(() => store().setUi({ activeLayerId: 'L0' }));
    const list = rows();
    expect(list).toHaveLength(40);
    for (const r of list) {
      expect(r.getAttribute('role')).toBe('treeitem');
      expect(r.getAttribute('aria-level')).toBe('1');
      expect(r.getAttribute('aria-label')).toMatch(/^Layer \d+, Vector layer/);
      expect(r.hasAttribute('aria-selected')).toBe(true);
    }
    // The picked layer is a shell here and still says it is picked.
    const picked = list.filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(picked.map((r) => r.dataset.layer)).toEqual(['L0']);
    expect(isShell(picked[0])).toBe(true);
  });

  it('arrow keys, Home and End walk into rows that are only shells, and focus stays when they fill in', async () => {
    mount(bigDoc(40, 24));
    const list = rows();
    list[0].focus();
    key(list[0], 'ArrowDown');
    expect(document.activeElement).toBe(list[1]);
    key(list[1], 'End');
    expect(document.activeElement).toBe(list[39]);
    expect(isShell(list[39])).toBe(true);
    key(list[39], 'ArrowUp');
    expect(document.activeElement).toBe(list[38]);
    key(list[38], 'End');
    // The browser scrolls a focused row into view; the row fills in under the keyboard, still the one with focus.
    await scrollTo(40 * ROW);
    expect(document.activeElement).toBe(list[39]);
    expect(isShell(list[39])).toBe(false);
    key(list[39], 'Home');
    expect(document.activeElement).toBe(list[0]);
  });

  it('Left on a layer goes to its folder even when the folder is scrolled out of the drawn rows', async () => {
    const doc = bigDoc(30, 24);
    const f = edit.makeFolder(doc, doc.layers.map((l) => l.id), 'Everything')!;
    mount(doc);
    const list = rows();
    // The folder first, then its layers one level in.
    expect(list[0].dataset.folder).toBe(f);
    expect(list[1].getAttribute('aria-level')).toBe('2');
    await scrollTo(31 * ROW);
    expect(isShell(list[0])).toBe(true);
    const last = list[list.length - 1];
    expect(isShell(last)).toBe(false);
    key(last, 'ArrowLeft');
    expect(document.activeElement).toBe(list[0]);
  });
});

describe('picking, dragging and copying work from the layout, not the page', () => {
  it('a box over rows and frames picks keys in rows that are not drawn', () => {
    mount(bigDoc(40, 240));
    const layout = currentLayout();
    // The bottom ten layers sit at the end of the list, as shells, and none of their keys are on the page.
    expect(count('[data-layer="L0"] [data-key]')).toBe(0);
    const everything = keysIn(layout, 0, layout.height, 0, 239);
    expect(everything).toHaveLength(40 * 240);
    // Rows 30 to 39, frames 100 to 109: ten rows of ten keys, all out of view.
    const box = keysIn(layout, 30 * ROW + 1, 40 * ROW - 1, 100, 109);
    expect(box).toHaveLength(100);
    expect(count('[data-key]')).toBeLessThan(everything.length);
  });

  it('dragging across rows with Shift picks keys in rows that are not drawn', () => {
    mount(bigDoc(40, 24));
    const main = host.querySelector('.tl-main')!;
    // From a drawn row to one far below the drawn rows (jsdom has no layout, so the page starts at 0).
    const rowsTop = 0;
    pointer(main.querySelector('.tl-rows')!, 'pointerdown', 2 * CW + 5, rowsTop + 5, { shiftKey: true });
    pointer(main, 'pointermove', 6 * CW + 5, rowsTop + 38 * ROW);
    pointer(main, 'pointerup', 6 * CW + 5, rowsTop + 38 * ROW);
    // 39 rows (0 to 38) by frames 2 to 6, a key at every frame.
    expect(tl().keys.size).toBe(39 * 5);
    expect(tl().keys.has(celRef('L38', 'c38_4'))).toBe(true);
  });

  it('copy, cut and paste work on picked keys while the frames have focus, drawn or not', () => {
    const s = mount(bigDoc(40, 24, 4));
    const main = host.querySelector<HTMLElement>('.tl-main')!;
    main.focus();
    const ref = celRef('L0', 'c0_8');
    expect(count('[data-layer="L0"] [data-key]')).toBe(0);
    pickKeys([ref]);
    key(main, 'c', { ctrlKey: true });
    expect(hasFrameClip()).toBe(true);
    s.setUi({ frame: 10, activeLayerId: 'L0' });
    key(main, 'v', { ctrlKey: true });
    expect(s.get().doc.layers.find((l) => l.id === 'L0')!.cels.some((c) => c.start === 10)).toBe(true);
    pickKeys([celRef('L0', 'c0_12')]);
    key(main, 'x', { ctrlKey: true });
    expect(s.get().doc.layers.find((l) => l.id === 'L0')!.cels.some((c) => c.start === 12)).toBe(false);
    clearKeys();
  });

  it('dragging a key carries on when the rows scroll under it, and lands where you let go', async () => {
    const s = mount(bigDoc(40, 24, 4));
    const main = host.querySelector<HTMLElement>('.tl-main')!;
    const keyEl = host.querySelector<HTMLElement>('[data-layer="L39"] [data-key]')!;
    const x = 0 * CW + 5;
    act(() => void keyEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: 5, button: 0, pointerId: 1 })));
    pointer(main, 'pointermove', x + 3 * CW, 5);
    // The row the key is on goes out of the drawn rows while it is held.
    await scrollTo(40 * ROW);
    expect(host.querySelector('[data-layer="L39"] [data-key]')).toBeNull();
    pointer(main, 'pointermove', x + 3 * CW, 5);
    pointer(main, 'pointerup', x + 3 * CW, 5);
    expect(s.get().doc.layers[39].cels.map((c) => c.start).slice(0, 3)).toEqual([3, 4, 8]);
    expect(count('.tl-ghost-key')).toBe(0);
  });

  it('dragging a layer to reorder works across the scroll: the row you hold keeps its element, and shells take the drop', async () => {
    const s = mount(bigDoc(40, 24));
    const data = { setData() {}, effectAllowed: '' };
    const ev = (type: string) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer: data, clientY: 0 });
    const first = rows()[0];
    const firstId = first.dataset.layer!;
    act(() => void first.dispatchEvent(ev('dragstart')));
    await scrollTo(40 * ROW);
    // The held row is a shell now and is still the same element, so its dragend will still fire.
    expect(rows()[0]).toBe(first);
    expect(isShell(first)).toBe(true);
    const target = rows()[39];
    expect(isShell(target)).toBe(false);
    const lastId = target.dataset.layer!;
    act(() => void target.dispatchEvent(ev('dragover')));
    act(() => void target.dispatchEvent(ev('drop')));
    const order = s.get().doc.layers.map((l) => l.id);
    expect(order).not.toEqual(Array.from({ length: 40 }, (_, i) => `L${i}`));
    expect(order.indexOf(firstId)).toBeGreaterThanOrEqual(0);
    expect(Math.abs(order.indexOf(firstId) - order.indexOf(lastId))).toBe(1);
  });
});

describe('a quest pointer at a key that is not drawn', () => {
  it('waits (finds nothing) rather than pointing at nothing, and finds it once it is scrolled in', async () => {
    mount(bigDoc(40, 24));
    const sel = '[data-layer="L0"] .tl-cel';
    expect(resolveTarget(sel, () => true)).toBeNull();
    await scrollTo(40 * ROW);
    expect(resolveTarget(sel, () => true)).toBeTruthy();
  });
});
