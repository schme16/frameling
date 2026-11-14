// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { clearKeys, setTl, tl } from '../../src/timeline/state';
import { celRef } from '../../src/timeline/tracks';
import { setPrefs } from '../../src/ui/prefs';
import { docWith, shape } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const CW = 20;

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
  setPrefs({ cleanTimeline: false });
  setTl({ cw: CW, clipId: null, editing: null, open: new Set() });
  clearKeys();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

function mount(cels: [number, number][], layers = 1) {
  const doc = docWith(cels, 24);
  for (let i = 1; i < layers; i++) doc.layers.push({ ...doc.layers[0], id: `extra${i}`, name: `Extra ${i}`, cels: [] });
  const s = resetStore(doc);
  act(() => root.render(<TimelinePanel />));
  return s;
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;
const key = (k: string, extra: KeyboardEventInit = {}) =>
  act(() => {
    q('.tl-main').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  });
function pointer(el: Element, type: string, x: number, y = 0, extra: PointerEventInit = {}) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, ...extra }));
  });
}

describe('detailed timeline panel', () => {
  it('draws keys as diamond cells with hold ends, and switches to the clean look', () => {
    mount([[0, 3], [3, 1]]);
    expect(host.querySelectorAll('.tl-dkey')).toHaveLength(2);
    expect(host.querySelectorAll('.tl-dend')).toHaveLength(1);
    act(() => setPrefs({ cleanTimeline: true }));
    expect(host.querySelectorAll('.tl-dkey')).toHaveLength(0);
    expect(host.querySelectorAll('.tl-cel-dot')).toHaveLength(2);
  });

  it('arrow keys move round the cells, Shift picks keys, Delete takes them away', () => {
    const s = mount([[0, 2], [2, 2], [6, 2]], 2);
    s.setUi({ activeLayerId: s.get().doc.layers[0].id, frame: 0 });
    key('ArrowRight');
    expect(s.get().ui.frame).toBe(1);
    key('ArrowRight', { shiftKey: true });
    key('ArrowRight', { shiftKey: true });
    const l = s.get().doc.layers[0];
    expect([...tl().keys]).toEqual([celRef(l.id, l.cels[1].id)]);
    key('Delete');
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 4], [6, 2]]);
    expect(tl().keys.size).toBe(0);
    key('ArrowUp');
    expect(s.get().ui.activeLayerId).toBe('extra1');
    key('ArrowDown');
    key('ArrowRight', { ctrlKey: true });
    expect(s.get().ui.frame).toBe(6);
  });

  it('Alt and arrows nudge picked keys', () => {
    const s = mount([[0, 4], [4, 4]]);
    const l = s.get().doc.layers[0];
    act(() => setTl({ keys: new Set([celRef(l.id, l.cels[1].id)]) }));
    key('ArrowRight', { altKey: true });
    expect(shape(s.get().doc.layers[0])).toEqual([[0, 5], [5, 4]]);
  });

  it('clicking a key picks it, Shift+click adds another', () => {
    const s = mount([[0, 2], [2, 2]]);
    const cells = host.querySelectorAll('.tl-dkey-cell');
    pointer(cells[1], 'pointerdown', CW * 2 + 5, 5);
    pointer(cells[1], 'pointerup', CW * 2 + 5, 5);
    expect(tl().keys.size).toBe(1);
    pointer(cells[0], 'pointerdown', 5, 5, { shiftKey: true });
    pointer(cells[0], 'pointerup', 5, 5, { shiftKey: true });
    expect(tl().keys.size).toBe(2);
    expect(s.get().ui.frame).toBe(0);
  });
});
