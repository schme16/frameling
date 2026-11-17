// @vitest-environment jsdom
// The stick picker in the chalk and charcoal options: the same picker as Brush and Tip, one button with a stroke, a
// name and a count, a list that drops from it, and a heading. Picking changes the stick and nothing else.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { preloadPicker } from './preloadPicker';
import { TipOptions } from '../../src/brushes/TipOptions';
import * as K from '../../src/brushes/picker';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { setTipKind } from '../../src/brushes/tips';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
const btn = () => host.querySelector<HTMLButtonElement>('[data-testid="brush-stick"] .pk-btn')!;
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

describe('the stick picker', () => {
  it('is only there for chalk and charcoal', () => {
    expect(host.querySelector('[data-testid="brush-stick"]')).toBeNull();
    act(() => setTipKind('watercolour'));
    expect(host.querySelector('[data-testid="brush-stick"]')).toBeNull();
    act(() => setTipKind('chalk'));
    expect(btn()).not.toBeNull();
    act(() => setTipKind('charcoal'));
    expect(btn()).not.toBeNull();
  });

  it('is a picker like the Tip one: a heading, a stroke of the stick on its own, and the stick in use', () => {
    act(() => setTipKind('chalk'));
    expect(host.querySelector('[data-control="stick-picker"] .tp-label')!.textContent).toBe('Stick');
    expect(btn().querySelector('canvas')).not.toBeNull();
    expect(btn().querySelector('.pk-btn-name')!.textContent).toBe('Chalk');
    expect(btn().querySelector('.pk-btn-sub')).toBeNull();
    expect(host.querySelectorAll('.bp-chip')).toHaveLength(0);
  });

  it('sits straight under the Tip picker, with the paper controls under it', () => {
    act(() => setTipKind('chalk'));
    const ids = [...host.querySelectorAll('[data-testid]')].map((c) => c.getAttribute('data-testid')).filter((t) => ['brush-tips', 'brush-stick', 'brush-paper'].includes(t!));
    expect(ids).toEqual(['brush-tips', 'brush-stick', 'brush-paper']);
    expect(host.querySelector('[data-testid="brush-paper"]')!.textContent).toContain('Catch on paper');
  });

  it('lists the nine in three groups, all open, with no stars or size numbers', () => {
    act(() => setTipKind('chalk'));
    open();
    expect(document.querySelector('.pk-pop')!.getAttribute('aria-label')).toBe('Pick a stick');
    expect(names()).toEqual(['Vine charcoal', 'Compressed charcoal', 'Chalk', 'Soft pastel', 'Oil pastel', 'Crayon', 'Sketch pencil', 'Soft pencil (6B)', 'Colour pencil']);
    expect([...document.querySelectorAll('.pk-pop .pk-group-name')].map((n) => n.textContent)).toEqual(['Charcoal', 'Chalk and pastel', 'Drawing pencils']);
    expect(document.querySelectorAll('.pk-pop .pk-star')).toHaveLength(0);
    expect(document.querySelectorAll('.pk-pop .pk-size')).toHaveLength(0);
    expect(document.querySelectorAll('.pk-pop canvas').length).toBeGreaterThanOrEqual(9);
  });

  it('marks the stick in use and gives each row its plain line', () => {
    act(() => setTipKind('charcoal'));
    open();
    expect(rows().filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.querySelector('.pk-name-text')!.textContent)).toEqual(['Compressed charcoal']);
    expect(row('Crayon').getAttribute('title')).toContain('Wax');
  });

  it('picks a stick with one click, closes, and leaves the tip, size and grain as they were', () => {
    act(() => setTipKind('chalk'));
    store().setUi((u) => ({ brush: { ...u.brush, size: 27, tip: { ...u.brush.tip!, grain: 1.7 } } }));
    open();
    act(() => row('Colour pencil').click());
    expect(tip()).toMatchObject({ kind: 'chalk', dry: 'colour-pencil', grain: 1.7 });
    expect(store().get().ui.brush.size).toBe(27);
    expect(document.querySelector('.pk-pop')).toBeNull();
    expect(btn().querySelector('.pk-btn-name')!.textContent).toBe('Colour pencil');
  });

  it('is searchable, and says so in plain words when nothing matches', () => {
    act(() => setTipKind('chalk'));
    open();
    const input = document.querySelector<HTMLInputElement>('.pk-pop input[type="text"]')!;
    expect(input.placeholder).toBe('Search sticks');
    const type = (v: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    type('pencil');
    expect(names()).toEqual(['Sketch pencil', 'Soft pencil (6B)', 'Colour pencil']);
    type('zzz');
    expect(document.querySelector('.pk-pop .pk-empty')!.textContent).toContain('No stick called that');
  });

  it('keeps its folds to itself: folding the tip groups does not close the stick groups', () => {
    K.setOpenGroups([]);
    act(() => setTipKind('chalk'));
    open();
    expect(rows()).toHaveLength(9);
  });

  it('is greyed out with its reason while Catch on paper is off, keeping the layout, and wakes up when it is on', () => {
    act(() => setTipKind('chalk'));
    act(() => store().setUi((u) => ({ brush: { ...u.brush, tip: { ...u.brush.tip!, dry: undefined } } })));
    expect(btn().disabled).toBe(true);
    expect(btn().title).toContain('Catch on paper');
    expect(btn().querySelector('canvas')).not.toBeNull();
    open();
    expect(document.querySelector('.pk-pop')).toBeNull();
    act(() => store().setUi((u) => ({ brush: { ...u.brush, tip: { ...u.brush.tip!, dry: 'chalk' } } })));
    expect(btn().disabled).toBe(false);
  });

  it('does not touch the brush picker memory', () => {
    act(() => setTipKind('chalk'));
    open();
    act(() => row('Crayon').click());
    expect(K.recentIds()).toEqual([]);
  });
});
