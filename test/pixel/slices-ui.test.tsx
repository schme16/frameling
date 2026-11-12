// @vitest-environment jsdom
// The Slice tool (drag to make, move, resize, delete), the store edits behind the Slices panel, and the panel itself.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/pixel';
import { newDoc } from '../../src/core/doc';
import type { PixelLayer } from '../../src/core/format';
import { getCommand, getTool, type ToolContext, type ToolPointer } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { SlicesPanel } from '../../src/pixel/slices/SlicesPanel';
import { createSlice, deleteSlice, pickSlice, pickedSlice, setNineBorders, setPivot, toggleNine, togglePivot } from '../../src/pixel/slices/state';
import { getPixelSettings } from '../../src/pixel/settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ctx: ToolContext = { zoom: 8, requestOverlay: () => {}, hint: () => {} };
const at = (x: number, y: number): ToolPointer => ({ x, y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 });
const layer = () => store().get().doc.layers.find((l) => l.kind === 'pixel') as PixelLayer;
const tool = () => getTool('slice')!;
const drag = (x0: number, y0: number, x1: number, y1: number) => {
  tool().down!(at(x0, y0), ctx);
  tool().move!(at(x1, y1), ctx);
  tool().up!(at(x1, y1), ctx);
};

let host: HTMLElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  resetStore(newDoc({ name: 'p', width: 64, height: 48, pixel: { pixelSize: 2 } }));
  pickSlice(null);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = root = null;
});

describe('the Slice tool', () => {
  it('is registered for pixel layers with a key, and drags make slices on whole art pixels', () => {
    expect(tool()).toMatchObject({ layers: ['pixel'], key: 'Shift+S' });
    // Pixel size 2: document 20, 10 to 60, 40 is art pixels 10, 5 to 30, 20.
    drag(20.4, 10.2, 60, 40);
    expect(layer().slices).toHaveLength(1);
    expect(layer().slices![0]).toMatchObject({ name: 'Slice 1', x: 10, y: 5, w: 20, h: 15 });
    expect(pickedSlice()).toBe(layer().slices![0].id);
  });
  it('a click with no drag makes nothing; a drag on a slice moves or resizes it as one undo step', () => {
    drag(10, 10, 10, 10);
    expect(layer().slices).toBeUndefined();
    drag(20, 10, 60, 40);
    const before = structuredClone(layer().slices![0]);
    // Grab the middle and move 4 document pixels right (2 art pixels).
    drag(40, 25, 44, 25);
    expect(layer().slices![0].x).toBe(before.x + 2);
    // Grab the right edge (art x 32 = document 64... the slice now ends at art 32) and pull it 2 art pixels.
    const s = layer().slices![0];
    drag((s.x + s.w) * 2, 25, (s.x + s.w) * 2 + 4, 25);
    expect(layer().slices![0].w).toBe(before.w + 2);
    store().undo();
    expect(layer().slices![0].w).toBe(before.w);
    store().undo();
    expect(layer().slices![0].x).toBe(before.x);
  });
  it('Delete removes the picked slice; Escape drops a drag in progress', () => {
    drag(20, 10, 60, 40);
    expect(tool().onKey!(new KeyboardEvent('keydown', { key: 'Delete' }), ctx)).toBe(true);
    expect(layer().slices).toBeUndefined();
    tool().down!(at(10, 10), ctx);
    tool().move!(at(40, 30), ctx);
    tool().cancel!(ctx);
    tool().up!(at(40, 30), ctx);
    expect(layer().slices).toBeUndefined();
  });
  it('says no on a layer that is not a pixel layer', () => {
    resetStore(newDoc({ name: 'v', width: 64, height: 48 }));
    drag(0, 0, 20, 20);
    expect(store().get().doc.layers[0]).not.toHaveProperty('slices');
  });
});

describe('slice edits', () => {
  it('9-patch borders and pivot, and typing numbers', () => {
    const s = createSlice({ x: 0, y: 0, w: 30, h: 12 })!;
    toggleNine(s.id, true);
    expect(layer().slices![0].center).toEqual({ x: 10, y: 4, w: 10, h: 4 });
    setNineBorders(s.id, { left: 2 });
    expect(layer().slices![0].center).toMatchObject({ x: 2, w: 18 });
    togglePivot(s.id, true);
    expect(layer().slices![0].pivot).toEqual({ x: 15, y: 12 });
    setPivot(s.id, { x: 3 });
    expect(layer().slices![0].pivot).toEqual({ x: 3, y: 12 });
    toggleNine(s.id, false);
    expect(layer().slices![0].center).toBeUndefined();
    deleteSlice(s.id);
    expect(layer().slices).toBeUndefined();
  });
  it('typing a bad size keeps the slice whole and at least 1 x 1', () => {
    const s = createSlice({ x: 2, y: 2, w: 8, h: 8 })!;
    store().update('x', (d) => void ((d.layers[0] as PixelLayer).slices![0].w = 0));
    expect(layer().slices![0].w).toBe(0);
    // The panel's edit path goes through tidy.
    return import('../../src/pixel/slices/state').then((m) => {
      m.setSliceRect(s.id, { w: -3, h: 2.6 });
      expect(layer().slices![0]).toMatchObject({ w: 1, h: 3 });
    });
  });
});

describe('the Slices panel and its commands', () => {
  const mount = () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<SlicesPanel />));
  };
  it('says how to start when there are none, then lists them and opens one to edit', async () => {
    mount();
    expect(host!.textContent).toMatch(/No slices on/);
    await act(async () => void createSlice({ x: 1, y: 1, w: 10, h: 6 }, 'door'));
    expect(host!.querySelector('.sl-pick b')?.textContent).toBe('door');
    expect(host!.querySelector('.sl-pick')?.textContent).toMatch(/10 x 6/);
    // Created slices are picked, so the editor is open: rename it.
    const name = host!.querySelector<HTMLInputElement>('input[aria-label="Slice name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'gate');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(layer().slices![0].name).toBe('gate');
    // The 9-patch switch.
    const nine = [...host!.querySelectorAll<HTMLInputElement>('.sl-check input')].find((i) => i.parentElement?.textContent?.includes('9-patch'))!;
    await act(async () => nine.click());
    expect(layer().slices![0].center).toBeDefined();
    expect(host!.textContent).toContain('9-patch');
  });
  it('the show command toggles the canvas overlay; delete-picked removes the picked one', () => {
    expect(getPixelSettings().showSlices).toBe(true);
    getCommand('pixel.showSlices')!.run();
    expect(getPixelSettings().showSlices).toBe(false);
    getCommand('pixel.showSlices')!.run();
    createSlice({ x: 0, y: 0, w: 2, h: 2 });
    expect(getCommand('pixel.deleteSlice')!.enabled!(store().get() as never)).toBe(true);
    getCommand('pixel.deleteSlice')!.run();
    expect(layer().slices).toBeUndefined();
  });
});
