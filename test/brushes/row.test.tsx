// @vitest-environment jsdom
// The row of saved brushes on screen: chips, the changed marker, and the name box.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { BrushPresetRow, dotSize } from '../../src/brushes/BrushPresetRow';
import { STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.bp-chip')];
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
  it('shows the starters, and lights one when you click it', () => {
    expect(chips().map((c) => c.textContent)).toEqual(STARTERS.map((s) => s.name));
    act(() => chips()[1].click());
    expect(chips()[1].getAttribute('aria-pressed')).toBe('true');
    expect(store().get().ui.brush.size).toBe(STARTERS[1].brush.size);
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
    expect(chips().map((c) => c.textContent)).toContain('Fur');
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
  it('sizes the dot with the brush, within bounds', () => {
    expect(dotSize(1)).toBe(4);
    expect(dotSize(120)).toBe(14);
    expect(dotSize(20)).toBeGreaterThan(dotSize(5));
  });
});
