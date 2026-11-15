// @vitest-environment jsdom
// The More menu and the menus beside it, as pairs of states: More and an open menu are two pieces of state that must
// agree, so each case sets one up and then does something to the other. More is also the panel that shows a FOLDED
// menu, so a folded menu open inside More is the one time both are true, and it has to survive.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import '../../src/renderer/features';

// jsdom has no layout, so say how many menus fit: the first two, and the rest fold into More.
vi.mock('../../src/ui/menuFold', () => ({ menusThatFit: () => 2 }));
import { MenuBar } from '../../src/ui/MenuBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  resetStore(newDoc({ width: 8, height: 8 }));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<nav><MenuBar /></nav>));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const tops = () => [...host.querySelectorAll<HTMLElement>('[data-top]:not([data-folded])')];
const top = (label: string) => tops().find((t) => t.textContent === label || t.getAttribute('aria-label') === `${label} menus`)!;
const press = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const hover = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
const key = (el: Element | Window, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));
const away = () => act(() => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
/** The menus showing right now, by their label. */
const showing = () => [...host.querySelectorAll<HTMLElement>('[role=menu]')].map((m) => m.getAttribute('aria-label'));
const more = () => host.querySelector<HTMLElement>('.ui-menu-more [data-top]')!;
const openMore = () => press(more());
const folded = () => host.querySelector<HTMLElement>('[data-more-menu]')!;

describe('More and the menus beside it', () => {
  it('the bar really folds some menus away (the setup these cases stand on)', () => {
    expect(host.querySelector('.ui-menu-more')).not.toBeNull();
    expect(host.querySelector('[data-more-menu]')).toBeNull();
    openMore();
    expect(showing()).toEqual(['More menus']);
  });

  it('open More, then click File: only File is open', () => {
    openMore();
    press(top('File'));
    expect(showing()).toEqual(['File']);
    expect(more().getAttribute('aria-expanded')).toBe('false');
  });

  it('open File, then click More: only More is open', () => {
    press(top('File'));
    openMore();
    expect(showing()).toEqual(['More menus']);
    expect(top('File').getAttribute('aria-expanded')).toBe('false');
  });

  it('open More, then hover along to File: File takes over, and More stays gone after File closes', () => {
    openMore();
    hover(top('File'));
    expect(showing()).toEqual(['File']);
    press(top('File'));
    expect(showing()).toEqual([]);
  });

  it('open File, then hover along to More: More opens in its place', () => {
    press(top('File'));
    hover(more());
    expect(showing()).toEqual(['More menus']);
  });

  it('open More, then press the canvas: it closes', () => {
    openMore();
    away();
    expect(showing()).toEqual([]);
  });

  it('open File, then press the canvas: it closes', () => {
    press(top('File'));
    away();
    expect(showing()).toEqual([]);
  });

  it('a press inside the bar does not count as away', () => {
    openMore();
    act(() => void more().dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(showing()).toEqual(['More menus']);
  });

  it('a folded menu opened from More stays up, showing that menu', () => {
    openMore();
    const name = folded().dataset.moreMenu!;
    press(folded());
    expect(showing()).toHaveLength(1);
    expect(showing()[0]).toContain(name.split(' ')[0]);
    expect(host.querySelector('.ui-menu-more')!.contains(host.querySelector('[role=menu]'))).toBe(true);
    // And it is the same menu, not More's own list.
    expect(showing()[0]).not.toBe('More menus');
  });

  it('a press away closes a folded menu and More with it', () => {
    openMore();
    press(folded());
    away();
    expect(showing()).toEqual([]);
    expect(more().getAttribute('aria-expanded')).toBe('false');
  });

  it('from a folded menu, click File: only File is open', () => {
    openMore();
    press(folded());
    press(top('File'));
    expect(showing()).toEqual(['File']);
  });

  it('from a folded menu, the way back goes to More, and More then closes on its own button', () => {
    openMore();
    press(folded());
    press(host.querySelector<HTMLElement>('.ui-menu-more [role=menu] [role=menuitem]')!);
    expect(showing()).toEqual(['More menus']);
    press(more());
    expect(showing()).toEqual([]);
  });

  it('Escape closes More', () => {
    openMore();
    key(window, 'Escape');
    expect(showing()).toEqual([]);
  });

  it('Escape walks out of a folded menu to More, then out of More', () => {
    openMore();
    press(folded());
    key(window, 'Escape');
    expect(showing()).toEqual(['More menus']);
    key(window, 'Escape');
    expect(showing()).toEqual([]);
  });

  it('arrowing from More to File leaves More behind', () => {
    openMore();
    key(more(), 'ArrowLeft');
    expect(showing()).toEqual([]);
    key(top('File'), 'ArrowDown');
    expect(showing()).toEqual(['File']);
  });

  it('arrowing File open while More is open: only File is open', () => {
    openMore();
    key(top('File'), 'ArrowDown');
    expect(showing()).toEqual(['File']);
  });

  it('Tab out of More closes it', () => {
    openMore();
    key(folded(), 'Tab');
    expect(showing()).toEqual([]);
  });
});
