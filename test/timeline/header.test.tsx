// @vitest-environment jsdom
// The header's fold tiers: which buttons carry which class (CSS folds them as the timeline narrows) and what the
// "more" menu lists for what is folded. Real widths and "one row" are checked in the app by scripts/e2e/timeline-header.cjs.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '../../src/core/store';
import '../../src/renderer/features';
import { Header } from '../../src/timeline/Header';
import { setTl } from '../../src/timeline/state';
import { docWith } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let sheet: HTMLStyleElement;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  setTl({ cw: 20, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  sheet = document.createElement('style');
  document.head.appendChild(sheet);
  root = createRoot(host);
  resetStore(docWith([[0, 2]], 24));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  sheet.remove();
  document.body.innerHTML = '';
});

const mount = () => act(() => root.render(<Header />));
const label = (l: string) => host.querySelector(`[aria-label^="${l}"]`)!;
/** Fold tiers away the way the narrow-timeline CSS does, then open the menu and read it. */
function menuWith(hide: string[]): string[] {
  sheet.textContent = hide.map((c) => `.${c} { display: none; }`).join('\n');
  mount();
  act(() => host.querySelector<HTMLElement>('.tl-overflow')!.click());
  return [...document.querySelectorAll('.tl-menu-item')].map((b) => b.textContent ?? '');
}

describe('timeline header folding', () => {
  it('puts the rarely used buttons in their own tier and the everyday ones in no tier that folds early', () => {
    mount();
    const rare = [...host.querySelectorAll('.tl-rare')].flatMap((e) => [e, ...e.querySelectorAll('button')]).map((e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`);
    expect(rare.join(' | ')).toMatch(/ping-pong/i);
    expect(rare.join(' | ')).toMatch(/sound/i);
    expect(rare.join(' | ')).toMatch(/clean timeline/i);
    for (const keep of ['Go to the first frame', 'Play', 'Loop', 'Frames per second', 'See the frames around this one']) {
      expect(label(keep).closest('.tl-rare')).toBeNull();
      expect(label(keep).closest('.tl-fold-1')).toBeNull();
    }
    // New drawing, copy and the frame buttons are one group that folds later than the rare tier.
    expect(label('Start a new blank drawing').closest('.tl-fold-1')).not.toBeNull();
    expect(label('Start a new blank drawing').closest('.tl-rare')).toBeNull();
  });

  it('the menu lists only the folded tier, rare ones first to go', () => {
    const rare = menuWith(['tl-rare']);
    expect(rare.some((t) => /ping-pong|back and forth/i.test(t))).toBe(true);
    expect(rare.some((t) => /sound/i.test(t))).toBe(true);
    expect(rare.some((t) => /clean timeline/i.test(t))).toBe(true);
    expect(rare.some((t) => /new (blank )?drawing/i.test(t))).toBe(false);
    expect(rare.some((t) => /hold for/i.test(t))).toBe(false);
  });

  it('adds the drawing and frame buttons, then hold and onion skin, as more folds', () => {
    act(() => root.unmount());
    root = createRoot(host);
    const edit = menuWith(['tl-rare', 'tl-fold-1']);
    expect(edit.some((t) => /new (blank )?drawing/i.test(t))).toBe(true);
    expect(edit.some((t) => /ping-pong|back and forth/i.test(t))).toBe(true);
    expect(edit.some((t) => /hold for 2/i.test(t))).toBe(false);
  });
});
