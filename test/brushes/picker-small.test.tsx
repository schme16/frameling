// @vitest-environment jsdom
// The brush picker with only a few brushes: a plain list, no search box and no groups. Frameling now ships many more than
// that, so the starters are cut to four here.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/brushes';
import { BrushPresetRow } from '../../src/brushes/BrushPresetRow';
import { STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import * as K from '../../src/brushes/picker';
import { setChoice } from '../../src/core/choices';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { getCommand } from '../../src/core/registry';

vi.mock('../../src/brushes/starters', async (original) => {
  const o = await original<typeof import('../../src/brushes/starters')>();
  const four = ['ink', 'marker', 'pencil', 'tapered'].map((id) => o.STARTERS.find((s) => s.id === `starter:${id}`)!);
  return { ...o, STARTERS: four };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
const btn = () => host.querySelector<HTMLButtonElement>('.pk-btn')!;
const pop = () => document.querySelector<HTMLElement>('.pk-pop');
const rows = () => [...document.querySelectorAll<HTMLElement>('.pk-pop .pk-row')];
const names = () => rows().map((r) => r.querySelector('.pk-name-text')!.textContent);
const search = () => document.querySelector<HTMLInputElement>('.pk-search input')!;
const heads = () => [...document.querySelectorAll<HTMLButtonElement>('.pk-group')];
const head = (text: string) => heads().find((h) => h.querySelector('.pk-group-name')!.textContent === text)!;
// A real click puts focus on the button first; jsdom's click() does not.
const open = () =>
  act(() => {
    btn().focus();
    btn().click();
  });
const frame = () => act(async () => void (await new Promise((r) => requestAnimationFrame(r))));
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })));
const typeIn = (el: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => {
  localStorage.clear();
  resetStore(newDoc());
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    P.deleteActive();
  }
  P.startNaming(null);
  K._resetPickerForTests();
  K.setOpenGroups(null);
  setChoice('brushes.rows', undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<BrushPresetRow />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('a small library', () => {
  it('is only rows: no search box, no groups', () => {
    open();
    expect(rows()).toHaveLength(STARTERS.length);
    expect(search()).toBeNull();
    expect(heads()).toHaveLength(0);
  });
  it('moves with the arrows and picks with Enter, then puts focus back on the button', async () => {
    open();
    const list = document.querySelector<HTMLElement>('.pk-list')!;
    expect(document.activeElement).toBe(list);
    key(list, 'ArrowDown');
    key(list, 'Enter');
    await frame();
    expect(pop()).toBeNull();
    expect(store().get().ui.brush.size).toBe(STARTERS[1].brush.size);
    expect(document.activeElement).toBe(btn());
  });
  it('closes with Escape and leaves the brush alone', () => {
    const before = store().get().ui.brush;
    open();
    key(document.querySelector('.pk-list')!, 'Escape');
    expect(pop()).toBeNull();
    expect(store().get().ui.brush).toBe(before);
  });
});

