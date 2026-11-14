// @vitest-environment jsdom
// The saved brushes on screen: the picker button, the changed marker, and the name box.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { BrushPresetRow } from '../../src/brushes/BrushPresetRow';
import { STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
const picker = () => host.querySelector<HTMLButtonElement>('.pk-btn')!;
const rowsOpen = () => [...document.querySelectorAll<HTMLElement>('.pk-pop .pk-row')];
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text);

beforeEach(() => {
  localStorage.clear();
  resetStore(newDoc());
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    P.deleteActive();
  }
  P.startNaming(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<BrushPresetRow />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('BrushPresetRow', () => {
  it('shows the brush in use on its button, and lists the starters when opened', () => {
    expect(picker().textContent).toContain('Custom brush');
    act(() => picker().click());
    expect(rowsOpen().map((r) => r.querySelector('.pk-name-text')!.textContent)).toEqual(STARTERS.map((s) => s.name));
  });
  it('picks a brush when you click its row, and closes', () => {
    act(() => picker().click());
    act(() => rowsOpen()[1].click());
    expect(store().get().ui.brush.size).toBe(STARTERS[1].brush.size);
    expect(document.querySelector('.pk-pop')).toBeNull();
    expect(picker().textContent).toContain(STARTERS[1].name);
  });
  it('offers Save as... only, until a brush of yours is lit', () => {
    expect(button('Save as...')).toBeTruthy();
    expect(button('Delete')).toBeUndefined();
    expect(button('Update')).toBeUndefined();
  });
  it('saves under a typed name with Enter, then shows it with Rename and Delete', () => {
    act(() => store().setUi((u) => ({ brush: { ...u.brush, size: 33 } })));
    act(() => button('Save as...')!.click());
    const input = host.querySelector<HTMLInputElement>('.bp-name input')!;
    expect(input.value).toBe('My brush');
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'Fur');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(picker().textContent).toContain('Fur');
    expect(button('Rename')).toBeTruthy();
    expect(button('Delete')).toBeTruthy();
  });
  it('marks the brush changed after a slider moves, and offers Update and Revert', () => {
    act(() => store().setUi((u) => ({ brush: { ...u.brush, size: 33 } })));
    act(() => void P.saveCurrentAs('Fur'));
    expect(host.querySelector('.bp-changed')).toBeNull();
    act(() => store().setUi((u) => ({ brush: { ...u.brush, size: 34 } })));
    expect(host.querySelector('.bp-changed')).toBeTruthy();
    expect(button('Update')).toBeTruthy();
    act(() => button('Update')!.click());
    expect(host.querySelector('.bp-changed')).toBeNull();
  });
  it('Escape closes the name box without saving', () => {
    act(() => button('Save as...')!.click());
    act(() => void host.querySelector('.bp-name input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('.bp-name')).toBeNull();
    expect(P.myBrushes()).toHaveLength(0);
  });
});
