// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getCommand, getPanel, allHelp } from '../../src/core/registry';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { ROW_H } from '../../src/timeline/Layers';
import { SIDE_W } from '../../src/timeline/Grid';
import { setTl } from '../../src/timeline/state';
import { addCel, docWith, shape } from './helpers';

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
  setTl({ cw: CW, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

function mount(cels: [number, number][] = [[0, 2], [3, 1]], layers = 1) {
  const doc = docWith(cels, 24);
  for (let i = 1; i < layers; i++) {
    doc.layers.push({ ...doc.layers[0], id: `extra${i}`, name: `Extra ${i}`, cels: [] });
  }
  const s = resetStore(doc);
  act(() => root.render(<TimelinePanel />));
  return s;
}


const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;
const names = () => [...host.querySelectorAll('.tl-cel-name')].map((e) => e.textContent);

describe('drawing names on the timeline', () => {
  it('shows a name after its drawing, and none for a drawing with no name', () => {
    const s = mount([[0, 3], [6, 1]]);
    expect(names()).toEqual([]);
    act(() => s.update('Name', (d) => void (d.layers[0].cels[0].name = 'eyes sad')));
    expect(names()).toEqual(['eyes sad']);
    expect(q('[data-cel]').getAttribute('title')).toContain('"eyes sad"');
  });

  it('leaves out a name with no room (the next drawing is right behind it), and the tooltip still has it', () => {
    const s = mount([[0, 1], [1, 1]]);
    act(() => s.update('Name', (d) => void (d.layers[0].cels[0].name = 'eyes sad')));
    expect(names()).toEqual([]);
    expect(q('[data-cel]').getAttribute('title')).toContain('eyes sad');
  });

  it('opens a name box when a drawing is double-clicked, and names it on Enter', () => {
    const s = mount([[0, 3]]);
    act(() => setTl({ editing: { kind: 'cel', id: s.get().doc.layers[0].cels[0].id } }));
    const input = q<HTMLInputElement>('.tl-cel-name input');
    act(() => {
      input.value = 'arm up';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(s.get().doc.layers[0].cels[0].name).toBe('arm up');
    expect(names()).toEqual(['arm up']);
  });

  it('F2 opens the name box on the drawing under the playhead, and is off on an empty frame', () => {
    const s = mount([[0, 3]]);
    const cmd = getCommand('timeline.nameKey')!;
    expect(cmd.keys).toContain('F2');
    expect(cmd.enabled?.(s.get())).toBe(true);
    s.setUi({ frame: 10 });
    expect(cmd.enabled?.(s.get())).toBe(false);
  });
});
