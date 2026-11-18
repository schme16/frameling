// @vitest-environment jsdom
// The Colours panel's top: the overlapped fill and stroke boxes with a swap arrow and a default pair in their corners, then one
// row of six named picture tiles (None, Solid, Linear, Radial, Angular, Diamond) that never turns into a tall list. Also the
// eyedropper beside Hex, the opacity box, and the name on the swatches.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { ColorsPanel } from '../../src/canvas/panels/ColorsPanel';
import { PaintKinds } from '../../src/canvas/panels/PaintKinds';
import { getGradientWells, setPaintKind } from '../../src/tools/gradient-wells';
import { setPaintWells } from '../../src/tools/pixelWells';
import '../../src/tools/wells';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  resetStore(newDoc({ width: 400, height: 300 }));
  setPaintKind('fill', 'solid');
  setPaintKind('stroke', 'solid');
  store().setUi({ fillColor: '#ff5c8a', color: '#1d1b26', strokeOn: true, activeWell: 'fill', selection: [], tool: 'brush' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  setPaintWells(false);
  act(() => root.unmount());
  host.remove();
});

const mount = () => act(() => root.render(<ColorsPanel />));
const tiles = () => [...host.querySelectorAll<HTMLButtonElement>('.cv-kinds [role=radio]')];
const tile = (name: string) => tiles().find((t) => t.textContent === name)!;
const click = (el: Element) => act(() => (el as HTMLElement).click());

describe('the row of tiles', () => {
  it('is six named tiles in one radio group, directly under the boxes and above the colour square', () => {
    mount();
    expect(tiles().map((t) => t.textContent)).toEqual(['None', 'Solid', 'Linear', 'Radial', 'Angular', 'Diamond']);
    const group = host.querySelector('.cv-kinds')!;
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Fill: what it is made of');
    const order = [...host.querySelectorAll('.cv-wells, .cv-kinds, .cv-sv')];
    expect(order.map((e) => e.className.split(' ')[0])).toEqual(['cv-wells', 'cv-kinds', 'cv-sv']);
  });

  it('is never a Choice, so it can never drop to one button to a line', () => {
    mount();
    expect(host.querySelector('.cv-kinds .cv-choice')).toBeNull();
    expect(host.querySelector('[data-stacked]')).toBeNull();
    expect(host.querySelector('.cv-choice')).toBeNull();
  });

  it('lights Solid for a plain colour and takes it to a gradient and back', () => {
    mount();
    expect(tile('Solid').getAttribute('aria-checked')).toBe('true');
    expect(tiles().filter((t) => t.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    click(tile('Radial'));
    expect(getGradientWells().fill?.kind).toBe('radial');
    expect(tile('Radial').getAttribute('aria-checked')).toBe('true');
    click(tile('Solid'));
    expect(getGradientWells().fill).toBeNull();
    expect(tile('Solid').getAttribute('aria-checked')).toBe('true');
  });

  it('None takes the colour off the box in front, and Solid gives it one back', () => {
    mount();
    click(tile('None'));
    expect(store().get().ui.fillColor).toBeNull();
    expect(tile('None').getAttribute('aria-checked')).toBe('true');
    click(tile('Solid'));
    expect(store().get().ui.fillColor).not.toBeNull();
    expect(tile('Solid').getAttribute('aria-checked')).toBe('true');
  });

  it('follows the box in front: None on the stroke does not touch the fill', () => {
    store().setUi({ activeWell: 'stroke' });
    mount();
    expect(host.querySelector('.cv-kinds')!.getAttribute('aria-label')).toBe('Stroke: what it is made of');
    click(tile('None'));
    expect(store().get().ui.strokeOn).toBe(false);
    expect(store().get().ui.fillColor).toBe('#ff5c8a');
  });

  it('is painted in the colour you have', () => {
    mount();
    expect((tile('Solid').querySelector('i') as HTMLElement).style.background).toContain('rgb(255, 92, 138)');
  });

  it('keeps the palette commands of None, Angular and Diamond, with an id each for the tests', () => {
    mount();
    expect(tile('None').getAttribute('data-command')).toBe('colors.none');
    expect(tile('Angular').getAttribute('data-command')).toBe('colors.angular');
    expect(tile('Diamond').getAttribute('data-command')).toBe('colors.diamond');
    expect(new Set(tiles().map((t) => t.getAttribute('data-control'))).size).toBe(6);
  });

  it('has a tip on every tile', () => {
    mount();
    for (const t of tiles()) expect(t.getAttribute('title')).toBeTruthy();
  });

  it('shows five tiles, with no None, for Paint in the Pixel workspace, and nothing in a tool\'s options there', () => {
    setPaintWells(true);
    mount();
    expect(tiles().map((t) => t.textContent)).toEqual(['Solid', 'Linear', 'Radial', 'Angular', 'Diamond']);
    act(() => root.render(<PaintKinds inOptions />));
    expect(host.querySelector('.cv-kinds')).toBeNull();
  });

  it('shows in a tool\'s options where there are Fill and Stroke boxes', () => {
    act(() => root.render(<PaintKinds inOptions />));
    expect(tiles()).toHaveLength(6);
  });
});

describe('the boxes and their corner buttons', () => {
  it('has a swap arrow and a default pair, each named, with its key, and no stacked column of buttons', () => {
    mount();
    const swap = host.querySelector<HTMLButtonElement>('.cv-corner-swap')!;
    const reset = host.querySelector<HTMLButtonElement>('.cv-corner-default')!;
    expect(swap.getAttribute('aria-label')).toBe('Swap fill and stroke colours');
    expect(swap.getAttribute('aria-keyshortcuts')).toBe('Shift+X');
    expect(swap.getAttribute('data-command')).toBe('colors.swap');
    expect(reset.getAttribute('aria-label')).toBe('Default colours');
    expect(reset.getAttribute('aria-keyshortcuts')).toBe('Shift+D');
    expect(reset.getAttribute('data-command')).toBe('colors.reset');
    expect(host.querySelector('.cv-wells-actions')).toBeNull();
    expect(host.querySelector('.cv-wells-stack')!.contains(swap)).toBe(true);
  });

  it('swap trades the two colours and default puts them back', () => {
    mount();
    click(host.querySelector('.cv-corner-swap')!);
    expect(store().get().ui.color).toBe('#ff5c8a');
    expect(store().get().ui.fillColor).toBe('#1d1b26');
    click(host.querySelector('.cv-corner-default')!);
    expect(store().get().ui.color).toBe('#1d1b26');
  });

  it('says which box is live in words as well as looks: pressed, the one you are changing', () => {
    mount();
    const fill = host.querySelector<HTMLButtonElement>('.cv-well-fill')!;
    const stroke = host.querySelector<HTMLButtonElement>('.cv-well-stroke')!;
    expect(fill.getAttribute('aria-pressed')).toBe('true');
    expect(fill.getAttribute('aria-label')).toContain('the one you are changing');
    expect(fill.classList.contains('is-front')).toBe(true);
    expect(stroke.getAttribute('aria-pressed')).toBe('false');
    click(stroke);
    expect(store().get().ui.activeWell).toBe('stroke');
    expect(host.querySelector('.cv-wells-text strong')!.textContent).toBe('Stroke');
  });

  it('has a data-control id on each new control', () => {
    mount();
    for (const id of ['fill-stroke-boxes', 'swap-colours', 'default-colours', 'paint-kind', 'paint-none', 'eyedropper', 'opacity-box', 'swatches-where']) expect(host.querySelector(`[data-control="${id}"]`), id).toBeTruthy();
  });

  it('in the Pixel workspace the same swap arrow swaps Paint and Back', () => {
    setPaintWells(true);
    mount();
    const swap = host.querySelector<HTMLButtonElement>('.px-wells-swap')!;
    expect(swap.getAttribute('data-control')).toBe('swap-colours');
    expect(swap.querySelector('svg')).toBeTruthy();
    click(swap);
    expect(store().get().ui.color).toBe('#ff5c8a');
  });
});

describe('the quiet additions', () => {
  it('has the eyedropper beside Hex, and it picks the Eyedropper tool', () => {
    mount();
    const btn = host.querySelector<HTMLButtonElement>('.cp-hex-row .cp-eyedropper')!;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('title')).toContain('Eyedropper tool');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    click(btn);
    expect(store().get().ui.tool).toBe('eyedropper');
    expect(host.querySelector('.cp-eyedropper')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('has the opacity as a box, between the bar and the end of the row', () => {
    mount();
    const box = host.querySelector<HTMLInputElement>('.cp-alpha-row .cp-alpha-input')!;
    expect(box.value).toBe('100');
  });

  it('names the swatches, in plain words', () => {
    mount();
    const head = host.querySelector('[data-control="swatches-where"]')!;
    expect(head.textContent).toContain('This drawing');
    expect(host.querySelector('select[aria-label*="palette" i]')).toBeNull();
  });
});
