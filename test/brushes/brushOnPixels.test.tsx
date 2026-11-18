// @vitest-environment jsdom
// The plain Brush (B) on a pixel layer shows the shared panel (piece 5): the Pixel brush's preview, picker, tip and Size,
// with Pixel perfect, and the pixel brush list on its side. Pressing a brush in the list keeps B.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/brushes';
import '../../src/dab';
import { preloadPicker } from './preloadPicker';
import * as P from '../../src/brushes/presets';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { BrushOptions } from '../../src/tools/options/BrushOptions';
import { getDab, resetDab, setDab } from '../../src/dab/settings';
import { resetDry } from '../../src/dry/settings';
import { resetSoft } from '../../src/soft/settings';
import { currentSpec } from '../../src/dab/live';

vi.mock('../../src/brushes/thumbs', async (orig) => ({ ...(await orig<typeof import('../../src/brushes/thumbs')>()), drawPreviewStroke: () => undefined }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let stop: () => void;
beforeAll(async () => {
  const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : noop) });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  await preloadPicker();
});
beforeEach(() => {
  localStorage.clear();
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    void P.deleteActive();
  }
  resetDab();
  resetDry();
  resetSoft();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  stop = P.startBrushPresets();
});
afterEach(() => {
  stop();
  act(() => root.unmount());
  host.remove();
});

const ids = () => [...host.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')!);
const show = (tool: string, node: ReactNode, pixel = true) => {
  resetStore(pixel ? newDoc({ pixel: { pixelSize: 8 } }) : newDoc());
  store().setUi({ tool });
  act(() => root.render(node));
};

describe('the plain Brush on a pixel layer', () => {
  it('has the Pixel brush\'s panel: preview, picker, tip, size, Pixel perfect, and not the old shape row', () => {
    show('brush', <BrushOptions />);
    const all = ids();
    for (const id of ['preview', 'brush-picker', 'tip-picker', 'size', 'save-as', 'pixel-perfect', 'stabilizer']) expect(all, id).toContain(id);
    expect(all).not.toContain('plain-shape');
    expect(host.querySelector('[data-brush-panel="pixel"]')).toBeTruthy();
  });
  it('says its side is the pixel one, so the picker lists the pixel brushes', () => {
    show('brush', <BrushOptions />);
    expect(P.currentSide()).toBe('pixel');
    expect(currentSpec()).toMatchObject({ kind: 'dab' });
  });
  it('is still the vector panel on a vector layer', () => {
    show('brush', <BrushOptions />, false);
    expect(host.querySelector('[data-brush-panel="vector"]')).toBeTruthy();
    expect(P.currentSide()).toBe('vector');
    expect(ids()).not.toContain('pixel-perfect');
  });
  it('keeps Pixel perfect on the panel for a dab brush too (it says why it does nothing there)', () => {
    show('brush', <BrushOptions />);
    act(() => setDab({ hardness: 0.5 }));
    expect(ids()).toContain('pixel-perfect');
  });
  it('picking a pixel brush from its list keeps the tool on Brush', () => {
    show('brush', <BrushOptions />);
    P.applyPreset('starter:px-round6');
    expect(getDab().size).toBe(6);
    expect(store().get().ui.tool).toBe('brush');
  });
});

describe('one Mirror drawing', () => {
  it('shows it once in the panel', () => {
    show('brush', <BrushOptions />);
    expect(ids().filter((i) => i === 'mirror' || i === 'mirror-mode').length).toBeLessThanOrEqual(1);
    expect((host.textContent!.match(/Mirror drawing/g) ?? []).length).toBe(1);
  });
});
