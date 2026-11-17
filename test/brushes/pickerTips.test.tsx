// @vitest-environment jsdom
// The pen tip picker: the same picker as the brushes, listing tips with a stroke across each, so the two rows of chips
// are one button. Picking changes the tip of the brush in use and nothing else.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { preloadPicker } from './preloadPicker';
import { TipOptions } from '../../src/brushes/TipOptions';
import * as P from '../../src/brushes/presets';
import * as K from '../../src/brushes/picker';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { setTipKind } from '../../src/brushes/tips';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
const btn = () => host.querySelector<HTMLButtonElement>('[data-testid="brush-tips"] .pk-btn')!;
const rows = () => [...document.querySelectorAll<HTMLElement>('.pk-pop .pk-row')];
const names = () => rows().map((r) => r.querySelector('.pk-name-text')!.textContent);
const row = (name: string) => rows().find((r) => r.querySelector('.pk-name-text')!.textContent === name)!;
const open = () =>
  act(() => {
    btn().focus();
    btn().click();
  });
const tip = () => store().get().ui.brush.tip;

beforeAll(preloadPicker);

beforeEach(() => {
  localStorage.clear();
  resetStore(newDoc());
  K._resetPickerForTests();
  K.setOpenGroups(null);
  store().setUi({ brush: { ...DEFAULT_BRUSH } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<TipOptions />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.querySelectorAll('.pk-pop').forEach((n) => n.remove());
});

describe('the tip picker in the brush options', () => {
  it('is one button where there were two rows of chips', () => {
    expect(host.querySelectorAll('.bp-chip')).toHaveLength(0);
    expect(host.querySelectorAll('[data-testid="brush-tips"] .pk-btn')).toHaveLength(1);
    expect(btn().querySelector('.pk-btn-name')!.textContent).toBe('Plain');
    expect(btn().querySelector('canvas')).not.toBeNull();
  });

  it('says which tip is in use, with the stamp shape in it', () => {
    act(() => setTipKind('chalk'));
    expect(btn().querySelector('.pk-btn-name')!.textContent).toBe('Chalk');
    act(() => {
      setTipKind('stamp');
      store().setUi((u) => ({ brush: { ...u.brush, tip: { ...u.brush.tip!, shape: 'heart' } } }));
    });
    expect(btn().querySelector('.pk-btn-name')!.textContent).toBe('Heart stamp');
    // The row says what the tip is, not how long the list is: the count is in the open list.
    expect(btn().querySelector('.pk-btn-sub')).toBeNull();
    open();
    expect(document.querySelector('.pk-pop .pk-label')!.textContent).toContain('15');
  });

  it('lists every tip with the stamp shapes folded in, in groups, all open, with no stars or size numbers', () => {
    open();
    expect(document.querySelector('.pk-pop')!.getAttribute('aria-label')).toBe('Pick a pen tip');
    expect(names()).toEqual(['Plain', 'Pen nib', 'Bristles', 'Chalk', 'Charcoal', 'Watercolour', 'Leaf', 'Dash', 'Dot', 'Star', 'Diamond', 'Heart', 'Paw print', 'Along the line', 'Edged']);
    expect(document.querySelectorAll('.pk-pop .pk-group')).toHaveLength(4);
    expect(document.querySelectorAll('.pk-pop .pk-star')).toHaveLength(0);
    expect(document.querySelectorAll('.pk-pop .pk-size')).toHaveLength(0);
    expect(document.querySelectorAll('.pk-pop .pk-group-name')[0].textContent).toBe('Pen and paintbrush');
    expect(document.querySelector('.pk-pop .pk-live')).toBeNull();
    expect(document.querySelectorAll('.pk-pop canvas').length).toBeGreaterThanOrEqual(15);
  });

  it('marks the tip in use and gives each row a line about it', () => {
    act(() => setTipKind('charcoal'));
    open();
    expect(rows().filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.querySelector('.pk-name-text')!.textContent)).toEqual(['Charcoal']);
    expect(row('Chalk').getAttribute('title')).toContain('dusty');
  });

  it('picks a kind with one click on its row, and closes', () => {
    open();
    act(() => row('Watercolour').click());
    expect(tip()?.kind).toBe('watercolour');
    expect(document.querySelector('.pk-pop')).toBeNull();
  });

  it('picks a stamp shape the same way, turned the way that shape usually goes', () => {
    open();
    act(() => row('Heart').click());
    expect(tip()).toMatchObject({ kind: 'stamp', shape: 'heart', angle: 'upright' });
    open();
    act(() => row('Leaf').click());
    expect(tip()).toMatchObject({ kind: 'stamp', shape: 'leaf', angle: 'follow' });
  });

  it('keeps what you tuned when you pick the stamp you are already on', () => {
    act(() => {
      setTipKind('stamp');
      store().setUi((u) => ({ brush: { ...u.brush, tip: { ...u.brush.tip!, spacing: 2.5 } } }));
    });
    open();
    act(() => row('Dash').click());
    expect(tip()).toMatchObject({ shape: 'dash', spacing: 2.5 });
  });

  it('goes back to a plain line, and leaves the size and everything else alone', () => {
    store().setUi((u) => ({ brush: { ...u.brush, size: 27, thinning: 0.3 } }));
    act(() => setTipKind('nib'));
    open();
    act(() => row('Plain').click());
    expect(tip()).toBeUndefined();
    expect(store().get().ui.brush).toMatchObject({ size: 27, thinning: 0.3 });
  });

  it('is searchable by name', () => {
    open();
    const input = document.querySelector<HTMLInputElement>('.pk-pop input[type="text"]')!;
    expect(input.placeholder).toBe('Search tips');
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'star');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(names()).toEqual(['Star']);
  });

  it('shows the stamp sliders only while a stamp is in use, with no chips for the shapes', () => {
    expect(host.textContent).not.toContain('Spacing');
    act(() => setTipKind('stamp'));
    expect(host.textContent).toContain('Spacing');
    expect(host.querySelectorAll('.bp-chip')).toHaveLength(0);
  });

  it('does not take over the brush picker: its list, its open request and its recent stay its own', () => {
    P.startNaming(null);
    K.requestPicker();
    act(() => void 0);
    // The request is for the Brush picker (the one above the parts), never the Tip one.
    expect(document.querySelector('.pk-pop')?.getAttribute('aria-label') ?? 'Pick a brush').toBe('Pick a brush');
    expect(btn().getAttribute('aria-expanded')).toBe('false');
    act(() => root.unmount());
    document.querySelectorAll('.pk-pop').forEach((n) => n.remove());
    root = createRoot(host);
    act(() => root.render(<TipOptions />));
    open();
    act(() => row('Chalk').click());
    expect(K.recentIds()).toEqual([]);
  });
});
