// @vitest-environment jsdom
// The Brush tool's options read top to bottom: the preview, the Brush and Tip pickers, then the tip's own controls,
// Size, and last the saving and sharing. And Catch on paper is on for every built-in chalk and charcoal.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/brushes';
import { preloadPicker } from './preloadPicker';
import { STARTERS } from '../../src/brushes/model';
import { setTipKind } from '../../src/brushes/tips';
import { tipRows } from '../../src/brushes/tipList';
import { defaultTip } from '../../src/geometry/tip';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { BrushOptions } from '../../src/tools/options/BrushOptions';

// The preview draws on a canvas jsdom does not have; these tests look at the order, not the pixels.
vi.mock('../../src/brushes/thumbs', async (orig) => ({ ...(await orig<typeof import('../../src/brushes/thumbs')>()), drawPreviewStroke: () => undefined }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
beforeAll(async () => {
  const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext'];
  await preloadPicker();
});
beforeEach(() => {
  localStorage.clear();
  resetStore(newDoc());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** The index of the first thing in the options that matches, in document order. */
const at = (sel: string): number => {
  const all = [...host.querySelectorAll('*')];
  const el = host.querySelector(sel);
  return el ? all.indexOf(el) : -1;
};

describe('Brush tool options order', () => {
  it('puts the preview first, then Brush, Tip and Stick together, the paper controls, then Size, then saving and sharing', () => {
    store().setUi((u) => ({ brush: { ...u.brush, tip: defaultTip('chalk') } }));
    act(() => root.render(<BrushOptions />));
    const order = ['canvas.cv-preview', '[data-testid="brush-presets"]', '[data-testid="brush-tips"]', '[data-testid="brush-stick"]', '[data-testid="brush-paper"]', '.cv-slider', '[data-testid="brush-keep"]'].map(at);
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Nothing but the options container comes before the preview.
    expect(host.querySelector('.cv-options')!.firstElementChild!.matches('canvas.cv-preview')).toBe(true);
  });
  it('gives the Brush picker the same title as Tip, and keeps Save as and Share below them', () => {
    act(() => root.render(<BrushOptions />));
    const titles = [...host.querySelectorAll('.tp-label')].map((t) => t.textContent);
    expect(titles).toEqual(['Brush', 'Tip']);
    act(() => store().setUi((u) => ({ brush: { ...u.brush, tip: defaultTip('chalk') } })));
    expect([...host.querySelectorAll('.tp-label')].map((t) => t.textContent)).toEqual(['Brush', 'Tip', 'Stick']);
    expect(host.querySelector('[data-testid="brush-keep"]')!.textContent).toContain('Save as...');
    expect(host.querySelector('[data-testid="brush-keep"]')!.textContent).toContain('Share your brushes');
    expect(host.querySelector('[data-testid="brush-presets"]')!.textContent).not.toContain('Save as...');
  });
  it('keeps Catch on paper under the three pickers, above its grain controls', () => {
    store().setUi((u) => ({ brush: { ...u.brush, tip: defaultTip('chalk') } }));
    act(() => root.render(<BrushOptions />));
    const tips = host.querySelector('[data-testid="brush-paper"]')!;
    const labels = [...tips.querySelectorAll('.cv-toggle, .cv-field-head')].map((n) => n.textContent ?? '');
    expect(labels[0]).toContain('Catch on paper');
    expect(labels.findIndex((l) => l.includes('Grain size'))).toBeGreaterThan(0);
  });
});

describe('Catch on paper is on by default', () => {
  const catches = (t: { kind: string; dry?: string } | undefined) => !t || (t.kind !== 'chalk' && t.kind !== 'charcoal') || !!t.dry;
  it('for a new chalk or charcoal tip, picked from the Tip picker or made fresh', () => {
    expect(defaultTip('chalk').dry).toBeTruthy();
    expect(defaultTip('charcoal').dry).toBeTruthy();
    for (const kind of ['chalk', 'charcoal'] as const) {
      store().setUi((u) => ({ brush: { ...DEFAULT_BRUSH, size: u.brush.size } }));
      setTipKind(kind);
      expect(store().get().ui.brush.tip?.dry).toBeTruthy();
    }
  });
  it('for every built-in brush and every row of the Tip picker that has chalk or charcoal in it', () => {
    for (const s of STARTERS) expect(catches(s.brush.tip), s.id).toBe(true);
    for (const r of tipRows(DEFAULT_BRUSH)) expect(catches(r.brush.tip), r.id).toBe(true);
  });
  it('and never puts paper on a tip that does not use it', () => {
    for (const k of ['watercolour', 'stamp', 'nib', 'bristle'] as const) expect(defaultTip(k).dry).toBeUndefined();
  });
});
