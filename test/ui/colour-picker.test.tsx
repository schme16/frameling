// @vitest-environment jsdom
// The colour picker: the opacity slider is there where see-through makes sense, replaced by a plain reason where it does not,
// and a six digit colour comes back out as six digits.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ColourField, ColourPicker } from '../../src/ui/colour/ColourPicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const key = (el: Element, k: string, shiftKey = false) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })));
const slider = (name: string) => host.querySelector(`[role=slider][aria-label="${name}"]`) as HTMLElement | null;

describe('the opacity slider', () => {
  it('shows where see-through makes sense, at the colour\'s own amount', () => {
    act(() => root.render(<ColourPicker value="#33669980" onChange={() => undefined} />));
    const s = slider('Opacity')!;
    expect(s).toBeTruthy();
    expect(s.getAttribute('aria-valuenow')).toBe('50');
    expect(host.querySelector('.cp-alpha-val')?.textContent).toBe('50%');
  });

  it('a six digit colour reads as fully solid', () => {
    act(() => root.render(<ColourPicker value="#336699" onChange={() => undefined} />));
    expect(slider('Opacity')!.getAttribute('aria-valuenow')).toBe('100');
  });

  it('is left out, with the reason in its place, where see-through makes no sense', () => {
    act(() => root.render(<ColourPicker value="#336699" alpha={false} why="The background is always solid." onChange={() => undefined} />));
    expect(slider('Opacity')).toBeNull();
    expect(host.textContent).toContain('The background is always solid.');
  });

  it('the keys move it, and 100% goes back to six digits', () => {
    const out: string[] = [];
    act(() => root.render(<ColourPicker value="#336699" onChange={(c) => out.push(c)} />));
    key(slider('Opacity')!, 'ArrowLeft', true);
    expect(out.at(-1)).toBe('#336699e6');
    key(slider('Opacity')!, 'Home');
    expect(out.at(-1)).toBe('#33669900');
    key(slider('Opacity')!, 'End');
    expect(out.at(-1)).toBe('#336699');
  });

  it('turning the hue keeps the opacity exactly', () => {
    const out: string[] = [];
    act(() => root.render(<ColourPicker value="#33669981" onChange={(c) => out.push(c)} />));
    key(slider('Hue')!, 'ArrowRight');
    expect(out.at(-1)).toMatch(/81$/);
    expect(out.at(-1)).toHaveLength(9);
  });

  it('turning the hue on a solid colour keeps it six digits', () => {
    const out: string[] = [];
    act(() => root.render(<ColourPicker value="#336699" onChange={(c) => out.push(c)} />));
    key(slider('Hue')!, 'ArrowRight');
    expect(out.at(-1)).toHaveLength(7);
  });

  it('shows a note about what see-through means here, when there is one', () => {
    act(() => root.render(<ColourPicker value="#336699" note="Palette notes." onChange={() => undefined} />));
    expect(host.textContent).toContain('Palette notes.');
  });
});

describe('the hex box', () => {
  const hex = () => host.querySelector('input.cv-hex-input') as HTMLInputElement;
  const type = (el: HTMLInputElement, v: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('takes an eight digit colour where there is opacity', () => {
    const out: string[] = [];
    act(() => root.render(<ColourPicker value="#336699" onChange={(c) => out.push(c)} />));
    type(hex(), '#ff9e6d80');
    expect(out.at(-1)).toBe('#ff9e6d80');
  });

  it('drops the see-through part where there is no opacity', () => {
    const out: string[] = [];
    act(() => root.render(<ColourPicker value="#336699" alpha={false} onChange={(c) => out.push(c)} />));
    type(hex(), '#ff9e6d80');
    expect(out.at(-1)).toBe('#ff9e6d');
  });
});

describe('the swatch that opens it', () => {
  it('opens the picker as a dialog, and shows a solid colour for a place that is always solid', () => {
    act(() => root.render(<ColourField label="Background colour" value="#33669980" alpha={false} why="Always solid." onChange={() => undefined} />));
    const b = host.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe('Background colour: #336699');
    act(() => b.click());
    expect(document.querySelector('[role=dialog][aria-label="Background colour"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Always solid.');
  });

  it('commits once when it closes, for a change that should not run on every drag', () => {
    const live: string[] = [];
    const done: string[] = [];
    act(() => root.render(<ColourField label="Palette colour" value="#336699" onCommit={(c) => done.push(c)} onChange={(c) => live.push(c)} />));
    act(() => host.querySelector('button')!.click());
    const s = document.querySelector('[role=slider][aria-label="Opacity"]') as HTMLElement;
    key(s, 'Home');
    expect(done).toEqual([]);
    act(() => host.querySelector('button')!.click());
    expect(done).toEqual(['#33669900']);
  });
});
