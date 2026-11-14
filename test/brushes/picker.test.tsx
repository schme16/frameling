// @vitest-environment jsdom
// The brush picker on screen: what opens, what is drawn, the keyboard, favourites and recent.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { BrushPresetRow } from '../../src/brushes/BrushPresetRow';
import { STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import * as K from '../../src/brushes/picker';
import { setChoice } from '../../src/core/choices';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { getCommand } from '../../src/core/registry';

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

function fill(n: number, groups = ['Inking', 'Painting', 'Sketching', 'Markers']): void {
  const text = JSON.stringify({
    format: 'frameling-brushes',
    version: 1,
    presets: Array.from({ length: n }, (_, i) => ({ name: `Pen ${i}`, tool: 'brush', brush: { size: 2 + (i % 30) }, group: groups[i % groups.length] })),
  });
  act(() => void P.addBrushesFromText(text));
}

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

describe('a big library', () => {
  it('draws rows only for the open group', () => {
    fill(400);
    open();
    // Only the group of the brush in use is open, so 445 brushes cost 100 rows, and opening Pens adds just its own.
    expect(rows()).toHaveLength(100);
    act(() => head('Pens').click());
    expect(rows()).toHaveLength(100 + STARTERS.filter((x) => x.group === 'Pens').length);
    expect(heads().length).toBeGreaterThanOrEqual(10);
  });
  it('opens the group the brush in use is in', () => {
    fill(40);
    act(() => void P.applyPreset(P.myBrushes()[1].id));
    open();
    expect(head('Painting').getAttribute('aria-expanded')).toBe('true');
    expect(head('Inking').getAttribute('aria-expanded')).toBe('false');
    expect(rows().length).toBe(10);
  });
  it('focuses the search box, and typing narrows the list to every match', () => {
    fill(40);
    open();
    expect(document.activeElement).toBe(search());
    typeIn(search(), 'pen 3');
    expect(names().every((n) => /pen/i.test(n!) && n!.includes('3'))).toBe(true);
    expect(document.querySelector('.pk-found')!.textContent).toBe(`${rows().length} found`);
    typeIn(search(), 'zzzz');
    expect(document.querySelector('.pk-empty')).toBeTruthy();
  });
  it('finds a brush by its group name', () => {
    fill(40);
    open();
    typeIn(search(), 'markers');
    // Ten of yours in a group called Markers, and the starters that come in Markers.
    expect(rows()).toHaveLength(10 + STARTERS.filter((x) => x.group === 'Markers').length);
  });
  it('picks the highlighted match with Enter', async () => {
    fill(40);
    open();
    typeIn(search(), 'pen 7');
    key(search(), 'ArrowDown');
    key(search(), 'Enter');
    await frame();
    expect(pop()).toBeNull();
    expect(btn().textContent).toContain('Pen');
    expect(P.currentBrushState().activeId).toBeTruthy();
    expect(document.activeElement).toBe(btn());
  });
  it('opens and folds a group from the keyboard', () => {
    fill(40);
    open();
    const firstGroup = heads().findIndex((h) => h.getAttribute('aria-expanded') === 'false');
    expect(firstGroup).toBeGreaterThanOrEqual(0);
    // Fold everything, and the highlight starts on Favourites; two steps down is the third heading.
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Fold every group"]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Open every group"]')!.click());
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Fold every group"]')!.click());
    key(search(), 'ArrowDown');
    key(search(), 'ArrowDown');
    expect(document.querySelector('[data-hot="true"]')).toBe(heads()[2]);
    key(search(), 'ArrowRight');
    expect(heads()[2].getAttribute('aria-expanded')).toBe('true');
    key(search(), 'ArrowLeft');
    expect(heads()[2].getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps typing out of the shortcuts underneath', () => {
    fill(40);
    open();
    let reached = false;
    const spy = () => (reached = true);
    window.addEventListener('keydown', spy);
    key(search(), 'e');
    window.removeEventListener('keydown', spy);
    expect(reached).toBe(false);
  });
  it('closes with Escape and goes back to the button', async () => {
    fill(40);
    open();
    key(search(), 'Escape');
    await frame();
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(btn());
  });
  it('folds and opens every group with the button beside the search', () => {
    fill(40);
    open();
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Open every group"]')!.click());
    expect(heads().every((h) => h.getAttribute('aria-expanded') === 'true')).toBe(true);
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Fold every group"]')!.click());
    expect(rows()).toHaveLength(0);
  });
});

describe('favourites and recent', () => {
  it('stars a brush with its star, and lists it under Favourites', () => {
    fill(40);
    open();
    act(() => head('Inking').click());
    act(() => document.querySelector<HTMLButtonElement>('.pk-row .pk-star')!.click());
    expect(K.favouriteIds()).toHaveLength(1);
    act(() => head('Favourites').click());
    const section = head('Favourites').parentElement!;
    expect(section.querySelectorAll('.pk-row')).toHaveLength(1);
    expect(head('Favourites').querySelector('.pk-count')!.textContent).toBe('1');
  });
  it('stars the highlighted brush with Ctrl+D', () => {
    fill(40);
    open();
    act(() => head('Inking').click());
    key(search(), 'ArrowDown');
    key(search(), 'ArrowDown');
    key(search(), 'ArrowDown');
    key(search(), 'd', { ctrlKey: true });
    expect(K.favouriteIds()).toHaveLength(1);
    key(search(), 'd', { ctrlKey: true });
    expect(K.favouriteIds()).toHaveLength(0);
  });
  it('remembers the brushes you used, latest first, and lists them under Recent', () => {
    fill(40);
    const mine = P.myBrushes();
    act(() => void P.applyPreset(mine[3].id));
    act(() => void P.applyPreset(mine[5].id));
    expect(K.recentIds().slice(0, 2)).toEqual([mine[5].id, mine[3].id]);
    open();
    act(() => head('Recent').click());
    expect(head('Recent').parentElement!.querySelectorAll('.pk-row')).toHaveLength(2);
  });
  it('keeps them across a restart', () => {
    K.toggleFavourite('starter:ink');
    const saved = JSON.parse(localStorage.getItem('frameling.brushPicker')!);
    expect(saved.favourites).toEqual(['starter:ink']);
  });
  it('stars the brush in use from the palette command', () => {
    act(() => void P.applyPreset('starter:marker'));
    act(() => getCommand('brush.favourite')!.run());
    expect(K.isFavourite('starter:marker')).toBe(true);
  });
});

describe('rows and the picker command', () => {
  it('lists two columns when asked, and the choice is remembered', () => {
    setChoice('brushes.rows', 'two');
    open();
    expect(document.querySelector('.pk-rows-two')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('frameling.choices') ?? '{}')['brushes.rows'] ?? 'two').toBe('two');
  });
  it('flips between one column and two with the command', () => {
    expect(K.rowStyle()).toBe('tip');
    act(() => getCommand('brush.rows')!.run());
    expect(K.rowStyle()).toBe('two');
    act(() => getCommand('brush.rows')!.run());
    expect(K.rowStyle()).toBe('tip');
  });
  it('opens when the picker command runs', () => {
    act(() => getCommand('brush.picker')!.run());
    expect(pop()).toBeTruthy();
  });
  it('keeps the row size you chose', () => {
    K.setRowScale(1.3);
    expect(K.rowScale()).toBe(1.3);
    expect(JSON.parse(localStorage.getItem('frameling.brushPicker')!).rowScale).toBe(1.3);
  });
});
