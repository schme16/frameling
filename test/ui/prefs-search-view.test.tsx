// @vitest-environment jsdom
// The search box in Preferences, used the way a person would: type, move, press Enter, land on the row with it lit.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/renderer/features';
import { closePrefs, openPrefs, overlays } from '../../src/ui/overlays';
import { findOnPage } from '../../src/ui/prefsLight';
import { PrefsModal } from '../../src/ui/PrefsModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => closePrefs());
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const open = (page: Parameters<typeof openPrefs>[0] = 'general') => {
  act(() => root.render(<PrefsModal />));
  act(() => openPrefs(page));
};
const box = () => host.querySelector<HTMLInputElement>('[data-testid="prefs-search"]')!;
const type = (text: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(box(), text);
    box().dispatchEvent(new Event('input', { bubbles: true }));
  });
const key = (k: string) => act(() => void box().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));
const rowsShown = () => [...host.querySelectorAll('.ui-prefsearch-row strong')].map((e) => e.textContent);

describe('the search box in Preferences', () => {
  it('takes the focus when Preferences opens', () => {
    open();
    expect(document.activeElement).toBe(box());
  });

  it('shows matches under their page name, and hides the page while you search', () => {
    open();
    type('smoothing');
    expect(host.querySelector('.ui-prefsearch-head')?.textContent).toContain('Pen and tablet');
    expect(rowsShown()[0]).toBe('Stabilizer');
    expect(host.querySelector('.ui-prefs-body')?.classList.contains('is-searching')).toBe(true);
    expect(box().getAttribute('role')).toBe('combobox');
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/settings found|One setting found/);
  });

  it('moves with the arrows and goes to the row on Enter, lighting it', () => {
    vi.useFakeTimers();
    open();
    type('dark mode');
    const first = rowsShown()[0];
    expect(host.querySelector('[aria-selected="true"]')?.textContent).toContain(first!);
    key('ArrowDown');
    expect(box().getAttribute('aria-activedescendant')).toBe('ui-prefsearch-1');
    key('ArrowUp');
    expect(box().getAttribute('aria-activedescendant')).toBe('ui-prefsearch-0');
    key('Enter');
    expect(box().value).toBe('');
    expect(host.querySelector('.ui-prefsearch-row')).toBeNull();
    expect(host.querySelector('.ui-prefs-body.is-searching')).toBeNull();
    expect(host.querySelector('.ui-pref-row.is-lit strong')?.textContent).toBe('Mode');
    // The light goes out by itself.
    act(() => void vi.advanceTimersByTime(3000));
    expect(host.querySelector('.is-lit')).toBeNull();
    vi.useRealTimers();
  });

  it('takes you to another page, with the row lit', () => {
    vi.useFakeTimers();
    open();
    type('palm rejection');
    key('Enter');
    expect(host.querySelector('.ui-prefs-tab.is-chosen')?.textContent).toBe('Pen and tablet');
    expect(host.querySelector('.is-lit')?.textContent).toContain('Fingers and palms');
    vi.useRealTimers();
  });

  it('Escape clears the box first, then closes Preferences', () => {
    open();
    type('grid');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => void box().dispatchEvent(esc));
    expect(esc.defaultPrevented).toBe(true);
    expect(box().value).toBe('');
    expect(overlays.get().prefs).not.toBeNull();
    // With nothing typed, Escape is left for the dialog to close itself.
    const again = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => void box().dispatchEvent(again));
    expect(again.defaultPrevented).toBe(false);
  });

  it('says so plainly when nothing matches, and offers the help search', () => {
    open();
    type('zzzqx');
    expect(host.querySelector('[data-testid="prefs-none"]')?.textContent).toContain('Nothing in Preferences is called zzzqx');
    key('Enter');
    expect(overlays.get().help).toMatchObject({ query: 'zzzqx' });
  });

  it('is reached from the command palette with a row to light', () => {
    vi.useFakeTimers();
    act(() => root.render(<PrefsModal />));
    act(() => openPrefs('snapping', undefined, 'Snap distance'));
    expect(host.querySelector('.is-lit')?.textContent).toContain('Snap distance');
    vi.useRealTimers();
  });
});

describe('finding words on a page', () => {
  const page = (html: string) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d;
  };
  it('prefers an exact match, then one that starts with the words', () => {
    const d = page('<div class="ui-pref-row"><div class="ui-pref-text"><strong>Theme color</strong></div></div><div class="ui-pref-row" id="b"><div class="ui-pref-text"><strong>Theme</strong></div></div>');
    expect(findOnPage(d, 'Theme')?.id).toBe('b');
    expect(findOnPage(d, 'Theme col')?.className).toBe('ui-pref-row');
  });
  it('lights a heading itself, and reads the label of a box', () => {
    const d = page('<h4>Pen buttons</h4><input aria-label="Search shortcuts">');
    expect(findOnPage(d, 'pen buttons')?.tagName).toBe('H4');
    expect(findOnPage(d, 'Search shortcuts')?.tagName).toBe('INPUT');
    expect(findOnPage(d, 'nothing like it')).toBeNull();
  });
});
