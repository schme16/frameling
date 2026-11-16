// @vitest-environment jsdom
// The timeline marks a drawing shown in more than one place, and squeezes very short drawings into one band when the frames are tiny.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { clearKeys, setTl } from '../../src/timeline/state';
import { setPrefs } from '../../src/ui/prefs';
import { docWith } from './helpers';

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
  setTl({ cw: 20, clipId: null, editing: null, open: new Set() });
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

/** Two cels on one layer that show the same drawing, and one that shows its own. */
function mount() {
  const doc = docWith([[0, 4], [4, 4], [8, 4]], 12);
  const cels = doc.layers[0].cels;
  cels[1].drawingId = cels[0].drawingId;
  const s = resetStore(doc);
  act(() => root.render(<TimelinePanel />));
  return { s, cels };
}

describe.each([
  ['the detailed timeline', false],
  ['the clean timeline', true],
])('%s', (_name, clean) => {
  beforeEach(() => setPrefs({ cleanTimeline: clean }));

  it('marks the blocks that show one drawing, and only those', () => {
    const { cels } = mount();
    const marked = [...host.querySelectorAll('.tl-cel.is-shared')].map((e) => e.getAttribute('data-cel'));
    expect(marked).toEqual([cels[0].id, cels[1].id]);
    // Wide enough for the link and the number
    expect(host.querySelectorAll('.tl-shared')).toHaveLength(2);
    expect(host.querySelector('.tl-shared')!.textContent).toBe('2');
    // The tooltip says how many, in plain words.
    expect(host.querySelector(`[data-cel="${cels[0].id}"]`)!.getAttribute('title')).toMatch(/Shown in 2 places: 2 here\./);
    expect(host.querySelector(`[data-cel="${cels[2].id}"]`)!.getAttribute('title') ?? '').not.toMatch(/Shown in/);
  });

  it('shows only the edge when the block is too narrow for the number', () => {
    mount();
    act(() => setTl({ cw: 6 }));
    expect(host.querySelectorAll('.tl-cel.is-shared')).toHaveLength(2);
    expect(host.querySelectorAll('.tl-shared')).toHaveLength(0);
  });

  it('the mark goes when this one is made its own', async () => {
    const { s } = mount();
    const { makeOwnDrawing } = await import('../../src/timeline/ops');
    s.setUi({ frame: 4, activeLayerId: s.get().doc.layers[0].id });
    act(() => void makeOwnDrawing());
    expect(host.querySelectorAll('.tl-cel.is-shared')).toHaveLength(0);
  });
});

describe('frames narrower than 5 px', () => {
  beforeEach(() => setPrefs({ cleanTimeline: true }));

  it('draws no block with a negative or zero width, and puts runs of one-frame drawings in one band', () => {
    const doc = docWith(Array.from({ length: 200 }, (_, i) => [i, 1] as [number, number]), 200);
    resetStore(doc);
    act(() => root.render(<TimelinePanel />));
    act(() => setTl({ cw: 1.5 }));
    const cels = [...host.querySelectorAll<HTMLElement>('.tl-cel')];
    expect(cels.length).toBeGreaterThan(0);
    expect(cels.length).toBeLessThan(10);
    for (const c of cels) expect(parseFloat(c.style.width)).toBeGreaterThanOrEqual(1);
    expect(host.querySelectorAll('.tl-cel.is-dense').length).toBeGreaterThan(0);
    expect(host.querySelector('.tl-cel.is-dense')!.getAttribute('title')).toMatch(/short drawings/);
    expect(host.querySelector('.tl-main')!.className).toMatch(/is-tiny/);
  });
});
