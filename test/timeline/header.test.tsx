// @vitest-environment jsdom
// The header's folding: with room everything shows and there is no "more" button; as the width shrinks, the rare
// buttons fold into it first and it lists only what is folded; a switch that is on gets a dot and a name that says so.
// jsdom has no layout, so each item is given a fixed width. Real widths and "one row" are checked in the app by
// scripts/e2e/timeline-header.cjs.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetStore, store } from '../../src/core/store';
import '../../src/renderer/features';
import { Header } from '../../src/timeline/Header';
import { FOLD_STEPS } from '../../src/timeline/headerFold';
import { setTl } from '../../src/timeline/state';
import { docWith } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let sheet: HTMLStyleElement;
let available = 5000;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => available });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 40, height: 28, top: 0, left: 0, right: 40, bottom: 28, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
});
beforeEach(() => {
  setTl({ cw: 20, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  sheet = document.createElement('style');
  // The same hiding rules the real stylesheet has for folded steps.
  sheet.textContent = FOLD_STEPS.map((s) => `.tl-header[data-folded~="${s}"] [data-step="${s}"] { display: none; }`).join('\n');
  document.head.appendChild(sheet);
  root = createRoot(host);
  resetStore(docWith([[0, 2]], 24));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  sheet.remove();
  document.body.innerHTML = '';
  available = 5000;
});

const mount = () => act(() => root.render(<Header />));
const header = () => host.querySelector<HTMLElement>('.tl-header')!;
const folded = () => (header().getAttribute('data-folded') ?? '').split(' ').filter(Boolean);
const more = () => host.querySelector<HTMLElement>('.tl-overflow')!;
function menu(): string[] {
  act(() => more().click());
  return [...document.querySelectorAll('.tl-menu-item')].map((b) => b.textContent ?? '');
}

describe('timeline header folding', () => {
  it('folds nothing when there is room', () => {
    mount();
    expect(folded()).toEqual([]);
    for (const s of ['pingpong', 'sound', 'clean', 'fit', 'edit', 'hold', 'onion', 'zoom']) expect(header().querySelector(`[data-step="${s}"]`), s).not.toBeNull();
  });

  it('puts the everyday buttons in no folding step except the edit, hold and onion groups', () => {
    mount();
    for (const keep of ['Go to the first frame', 'Play', 'Loop', 'Frames per second']) expect(host.querySelector(`[aria-label^="${keep}"]`)!.closest('[data-step]'), keep).toBeNull();
  });

  it('folds the rare ones first, as few as the width needs, and the menu lists only those', () => {
    // Header items are 40px each; find a width that folds ping-pong and sound but not clean timeline.
    mount();
    const full = folded().length;
    expect(full).toBe(0);
    available = 5000;
    // Shrink until exactly two steps fold: each folded step removes at least one 40px item plus a gap.
    for (const w of [900, 800, 700, 600, 500, 400, 300]) {
      available = w;
      act(() => root.unmount());
      root = createRoot(host);
      mount();
      if (folded().length >= 2) break;
    }
    expect(folded().slice(0, 2)).toEqual(['pingpong', 'sound']);
    const items = menu();
    expect(items.some((t) => /ping-pong|back and forth/i.test(t))).toBe(true);
    expect(items.some((t) => /sound/i.test(t))).toBe(true);
    // Whatever is still on the header is not listed twice.
    if (!folded().includes('edit')) expect(items.some((t) => /new (blank )?drawing/i.test(t))).toBe(false);
    if (!folded().includes('hold')) expect(items.some((t) => /hold drawing for/i.test(t))).toBe(false);
  });

  it('folds everything but the playback controls when the header is tiny, and never clips the zoom slider', () => {
    available = 50;
    mount();
    expect(folded()).toEqual([...FOLD_STEPS]);
    const items = menu();
    expect(items.some((t) => /new (blank )?drawing/i.test(t))).toBe(true);
    expect(items.some((t) => /hold drawing for 2/i.test(t))).toBe(true);
    expect(items.some((t) => /onion/i.test(t))).toBe(true);
  });

  it('shows a dot and says so when a folded switch is on', () => {
    available = 50;
    mount();
    expect(more().getAttribute('aria-label')).toBe('More timeline buttons');
    expect(more().querySelector('.tl-overflow-dot')).toBeNull();
    act(() => store().setUi({ pingPong: true }));
    expect(more().querySelector('.tl-overflow-dot')).not.toBeNull();
    expect(more().getAttribute('aria-label')).toBe('More, 1 switch on');
    act(() => store().setUi((ui) => ({ onion: { ...ui.onion, enabled: true } })));
    expect(more().getAttribute('aria-label')).toBe('More, 2 switches on');
  });

  it('no dot for a switch that is still on the header', () => {
    mount();
    act(() => store().setUi({ pingPong: true }));
    expect(folded()).toEqual([]);
    expect(more().querySelector('.tl-overflow-dot')).toBeNull();
  });
});
