// @vitest-environment jsdom
// Escape closes an open menu wherever the keyboard is, and a submenu goes one level at a time.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import '../../src/renderer/features';
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
  act(() => root.render(<MenuBar />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const tops = () => [...host.querySelectorAll<HTMLElement>('[data-top]')];
const openMenu = (label: string) => {
  const b = tops().find((t) => t.textContent === label)!;
  act(() => void b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};
const menuShowing = () => !!host.querySelector('[role=menu]');
const escape = (from: EventTarget = document.body) => act(() => void from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

describe('Escape and the menu bar', () => {
  it('closes the open menu even when the keyboard is somewhere else', () => {
    openMenu('File');
    expect(menuShowing()).toBe(true);
    // Focus is on the page, not in the menu: the old handler never heard this one.
    escape();
    expect(menuShowing()).toBe(false);
  });

  it('does not let Escape through to the canvas behind it', () => {
    let reached = false;
    const spy = () => (reached = true);
    window.addEventListener('keydown', spy);
    openMenu('Edit');
    escape();
    window.removeEventListener('keydown', spy);
    expect(reached).toBe(false);
    expect(menuShowing()).toBe(false);
  });

  it('with no menu open, Escape is left alone', () => {
    let reached = false;
    const spy = () => (reached = true);
    window.addEventListener('keydown', spy);
    escape();
    window.removeEventListener('keydown', spy);
    expect(reached).toBe(true);
  });
});
