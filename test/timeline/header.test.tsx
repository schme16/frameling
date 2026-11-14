// @vitest-environment jsdom
// The header's folding: with room everything shows and there is no "more" button; as the width shrinks, the rare
// buttons fold into it first and it lists only what is folded; a switch that is on gets a dot and a name that says so.
// jsdom has no layout, so each item is given a fixed width. Real widths and "one row" are checked in the app by
// scripts/e2e/timeline-header.cjs.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import '../../src/renderer/features';
import { Header } from '../../src/timeline/Header';
import { FOLD_STEPS, WORD_STEPS } from '../../src/timeline/headerFold';
import { setTl } from '../../src/timeline/state';
import { SEL } from '../../src/quests/library';
import { forgetMoreAsk, resolveTarget } from '../../src/quests/target';
import { moreRequest } from '../../src/timeline/headerMenu';
import { docWith } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let sheet: HTMLStyleElement;
let available = 5000;

const ancestors = (el: Element, upTo: Element) => {
  const out: Element[] = [];
  for (let e = el.parentElement; e && e !== upTo; e = e.parentElement) out.push(e);
  return out;
};

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => available });
  // Every item is 40px wide, and each word still showing inside a group adds 30px (so dropping a word frees room).
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const words = [...this.querySelectorAll('[data-word]')].filter((w) => ![w, ...ancestors(w, this)].some((e) => getComputedStyle(e).display === 'none')).length;
    return { width: 40 + 30 * words, height: 28, top: 0, left: 0, right: 40, bottom: 28, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
});
beforeEach(() => {
  setTl({ cw: 20, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  sheet = document.createElement('style');
  // The same hiding rules the real stylesheet has for folded steps.
  sheet.textContent = '.tl-overflow { display: none; }\n.tl-header[data-folded]:not([data-folded=""]) .tl-overflow { display: inline-flex; }\n' + FOLD_STEPS.map((s) => `.tl-header[data-folded~="${s}"] [data-step="${s}"] { display: none; }`).join('\n') + '\n' + WORD_STEPS.map((w) => `.tl-header[data-bare~="${w}"] [data-word="${w}"] { display: none; }`).join('\n');
  document.head.appendChild(sheet);
  root = createRoot(host);
  resetStore(docWith([[0, 2]], 24));
  moreRequest.set(false);
  forgetMoreAsk();
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
const bare = () => (header().getAttribute('data-bare') ?? '').split(' ').filter(Boolean);
const more = () => host.querySelector<HTMLElement>('.tl-overflow')!;
function menu(): string[] {
  act(() => more().click());
  return [...document.querySelectorAll('.tl-menu-item')].map((b) => b.textContent ?? '');
}

describe('words beside the icons', () => {
  const wordsShowing = () => [...host.querySelectorAll<HTMLElement>('[data-word]')].filter((w) => showing(w)).map((w) => w.textContent);
  it('shows New drawing, Copy, Add a frame and Onion skin when there is room, and nothing is folded', () => {
    mount();
    expect(bare()).toEqual([]);
    expect(wordsShowing()).toEqual(['New drawing', 'Copy', 'Add a frame', 'Onion skin']);
    expect(folded()).toEqual([]);
  });

  it('drops the words one at a time, Onion skin first and New drawing last, before folding any button', () => {
    // Every group is 40px plus 30 for each word, so each word dropped frees 30px. Find the width where one word has gone.
    const seen: string[][] = [];
    for (let w = 2000; w >= 100; w -= 10) {
      available = w;
      act(() => root.unmount());
      root = createRoot(host);
      mount();
      if (!folded().length) seen.push(bare());
      else break;
    }
    expect(seen[0]).toEqual([]);
    expect(seen.map((b) => b.length)).toContain(1);
    expect(seen.find((b) => b.length === 1)).toEqual(['onion']);
    expect(seen.find((b) => b.length === 2)).toEqual(['onion', 'frame']);
    expect(seen.find((b) => b.length === 3)).toEqual(['onion', 'frame', 'copy']);
  });

  it('keeps every button reachable with no words: the icons stay, with names for speech and tips', () => {
    available = 50;
    mount();
    expect(bare()).toEqual([...WORD_STEPS]);
    for (const id of ['timeline.newKey', 'timeline.duplicateKey', 'timeline.insertFrame', 'timeline.toggleOnion']) {
      const b = host.querySelector(`[data-testid="${id}"]`)!;
      expect(b.getAttribute('aria-label'), id).toBeTruthy();
      expect(b.getAttribute('title'), id).toBeTruthy();
    }
  });

  it('puts the visible words in the name speech users hear', () => {
    mount();
    expect(host.querySelector('[data-testid="timeline.insertFrame"]')!.getAttribute('aria-label')).toMatch(/add a frame/i);
    expect(host.querySelector('[data-testid="timeline.toggleOnion"]')!.getAttribute('aria-label')).toMatch(/onion skin/i);
  });

  it('is named the same in the palette as on the button', () => {
    const label = (id: string) => getCommand(id)!.label;
    expect(label('timeline.newKey')).toMatch(/^New drawing/);
    expect(label('timeline.duplicateKey')).toMatch(/^Copy/);
    expect(label('timeline.insertFrame')).toMatch(/^Add a frame/);
    expect(label('timeline.toggleOnion')).toMatch(/onion skin/i);
  });
});

describe('the hold box when nothing is drawn', () => {
  const holdButton = () => host.querySelector<HTMLElement>('.tl-hold-menu')!;
  it('says the hold of the drawing under the playhead', () => {
    mount();
    expect(holdButton().textContent).toMatch(/Hold for\s*\d/);
    expect(holdButton().textContent).not.toContain('-');
  });
  it('says none, not a bare dash, when the frame has no drawing', () => {
    resetStore(docWith([[0, 2]], 24));
    act(() => store().setUi({ frame: 10 }));
    mount();
    expect(holdButton().textContent).toContain('Hold for none');
    expect(holdButton().getAttribute('title')).toMatch(/no drawing/i);
  });
});

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

// jsdom doesn't hide the children of a hidden box, so "showing" walks up the way a browser's layout would.
const showing = (el: Element) => {
  for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false;
  return true;
};
/** What a quest does: look for the target, then React catches up with whatever it asked for. */
const find = (sel: string) => {
  let el: Element | null = null;
  act(() => void (el = resolveTarget(sel, showing)));
  return el as Element | null;
};
const menuOpen = () => !!document.querySelector('.tl-more-menu');

describe('quests pointing at a button folded into the more menu', () => {
  it('find the button on the header while it is not folded, and leave the menu alone', () => {
    mount();
    expect(find(SEL.copy)).toBe(host.querySelector('[aria-label^="Copy this drawing"]'));
    expect(menuOpen()).toBe(false);
  });

  it('open the menu once and find the matching item in it', () => {
    available = 50;
    mount();
    // Not open yet: the ring goes round the "more" button, and the menu is asked to open.
    expect(find(SEL.copy)).toBe(more());
    expect(menuOpen()).toBe(true);
    const item = find(SEL.copy)!;
    expect(item.closest('.tl-more-menu')).not.toBeNull();
    expect(item.getAttribute('role')).toBe('menuitem');
    expect(item.getAttribute('aria-label')).toMatch(/^Copy this drawing/);
    expect(find(SEL.onion)!.closest('.tl-more-menu')).not.toBeNull();
  });

  it('do not open the menu again after the person closes it', () => {
    available = 50;
    mount();
    find(SEL.copy);
    expect(menuOpen()).toBe(true);
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => void document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    expect(menuOpen()).toBe(false);
    expect(find(SEL.copy)).toBe(more());
    expect(menuOpen()).toBe(false);
    // Another target in between lets a later ask open it again.
    find(SEL.play);
    find(SEL.copy);
    expect(menuOpen()).toBe(true);
  });

  it('find the hold group as a named group in the menu', () => {
    available = 50;
    mount();
    find(SEL.hold);
    const g = find(SEL.hold)!;
    expect(g.closest('.tl-more-menu')).not.toBeNull();
    expect(g.textContent).toBe('Hold for');
  });

  it('never touch the menu for a button that is not folded', () => {
    available = 50;
    mount();
    expect(find(SEL.play)).toBe(header().querySelector('.tl-play'));
    expect(menuOpen()).toBe(false);
  });
});

describe('onion settings from the more menu', () => {
  it('list an entry that opens the box under the more button, with the same controls', () => {
    available = 50;
    mount();
    expect(host.querySelector('[aria-label="Onion skin settings"]')!.closest('[data-step="onion"]')).not.toBeNull();
    act(() => more().click());
    const entry = [...document.querySelectorAll<HTMLElement>('.tl-menu-item')].find((b) => b.getAttribute('aria-label') === 'Onion skin settings')!;
    expect(entry).toBeTruthy();
    act(() => entry.click());
    expect(menuOpen()).toBe(false);
    const pop = document.querySelector<HTMLElement>('.tl-pop')!;
    expect(pop.textContent).toContain('Onion skin');
    expect(pop.style.top).toBe('32px');
    const before = store().get().ui.onion.before;
    act(() => (pop.querySelector('[aria-label="More frames before"]') as HTMLElement).click());
    expect(store().get().ui.onion.before).toBe(before + 1);
  });

  it('do not list it while the onion buttons are still on the header', () => {
    mount();
    expect(menu().some((t) => /onion skin settings/i.test(t))).toBe(false);
  });
});
