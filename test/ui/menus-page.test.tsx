// @vitest-environment jsdom
// The Menus page in Preferences: open a menu, move an entry, take one out and put it back, make a menu of your own,
// and put everything back, with the real menu bar reading the same changes.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { getCommand } from '../../src/core/registry';
import { MenusPage } from '../../src/ui/MenusPage';
import { MENUS, resolveMenus } from '../../src/ui/menus';
import { NO_EDITS, setList } from '../../src/ui/menuEdits';
import { getMenuEdits, MENUS_KEY, resetMenuEdits, setMenuEdits } from '../../src/ui/menuState';
import '../../src/ui/menuCommands';
import { toasts } from '../../src/ui/toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MenusPage />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  toasts.set([]);
  resetMenuEdits();
  localStorage.clear();
});

const click = (el: Element | null | undefined) => {
  if (!el) throw new Error('nothing to click');
  act(() => {
    (el as HTMLElement).click();
  });
};
const button = (text: string): HTMLButtonElement | undefined => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
const rows = (): string[] => [...host.querySelectorAll<HTMLElement>('.ui-me-row')].map((r) => r.dataset.entry!);
const open = (menu: string) => click([...host.querySelectorAll<HTMLElement>('.ui-me-name')].find((b) => b.textContent === menu));
const bar = () => resolveMenus().map((m) => m.menu.label);
const type = (input: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('the Menus page', () => {
  it('lists the menu bar in order, the way it is', () => {
    expect(rows()).toEqual(['File', 'Edit', 'View', 'Draw', 'Pixel', 'Animate', 'Help']);
    expect(button('Put all the menus back')?.disabled).toBe(true);
  });
  it('moves an entry up with the arrow, shows it in the real menu, and puts the menu back', () => {
    open('Edit');
    expect(rows().slice(0, 3)).toEqual(['edit.undo', 'edit.redo', '-']);
    const down = host.querySelector<HTMLButtonElement>('[data-entry="edit.undo"] button[aria-label="Move down"]');
    click(down);
    expect(rows().slice(0, 2)).toEqual(['edit.redo', 'edit.undo']);
    const edit = resolveMenus().find((m) => m.menu.label === 'Edit')!;
    expect(edit.items[0].kind === 'command' && edit.items[0].command.id).toBe('edit.redo');
    expect(localStorage.getItem(MENUS_KEY)).not.toBeNull();
    click(host.querySelector('[data-testid="menus.put-this-back"]'));
    expect(rows().slice(0, 2)).toEqual(['edit.undo', 'edit.redo']);
    expect(localStorage.getItem(MENUS_KEY)).toBeNull();
    expect(toasts.get().some((t) => t.message.includes('back the way it came'))).toBe(true);
  });
  it('takes an entry out, lists it under Taken out, and Put back returns it where it was', () => {
    open('Edit');
    click(host.querySelector('[data-entry="edit.copySvg"] button[aria-label^="Take"]'));
    expect(rows()).not.toContain('edit.copySvg');
    expect(host.textContent).toContain('Taken out');
    click(button('Put back'));
    expect(rows().indexOf('edit.copySvg')).toBe(rows().indexOf('edit.copy') + 1);
    expect(getMenuEdits().lists?.Edit).toBeUndefined();
  });
  it('hides a menu from the bar, and Show it again brings it back', () => {
    click(host.querySelector('[data-entry="Pixel"] button[aria-label^="Hide"]'));
    expect(bar()).not.toContain('Pixel');
    click(host.querySelector('[data-testid="menus.show.Pixel"]'));
    expect(bar()).toEqual(['File', 'Edit', 'View', 'Draw', 'Pixel', 'Animate', 'Help']);
  });
  it('makes a menu of your own, adds a command to it and a divider, and deletes it with an Undo', () => {
    const name = host.querySelector<HTMLInputElement>('input[placeholder="My favourites"]')!;
    type(name, 'Quick');
    click(button('Add the menu'));
    expect(bar()[bar().length - 1]).toBe('my-1');
    // The page opened the new menu: add a command by searching for it.
    type(host.querySelector<HTMLInputElement>('[data-testid="menus.find"]')!, 'undo');
    click(button('Add'));
    expect(rows()).toHaveLength(1);
    expect(getCommand(rows()[0])?.label).toBeTruthy();
    click(button('Add a divider'));
    expect(rows()).toHaveLength(2);
    click(button('Menu bar'));
    click(host.querySelector('[data-entry="my-1"] button[aria-label^="Delete"]'));
    expect(bar()).not.toContain('my-1');
    // The toast's Undo puts it back, with what was in it.
    const undo = toasts.get().filter((t) => t.action?.id === 'menus-undo').pop();
    act(() => undo!.action!.run());
    expect(bar()).toContain('my-1');
  });
  it('puts all the menus back in one press', () => {
    open('Help');
    click(host.querySelector('[data-entry="help.about"] button[aria-label="Move up"]'));
    expect(button('Put all the menus back')?.disabled).toBe(false);
    click(button('Put all the menus back'));
    expect(getMenuEdits()).toEqual({ v: 1 });
    expect(rows()).toEqual(['File', 'Edit', 'View', 'Draw', 'Pixel', 'Animate', 'Help']);
  });
  it('says so when a command in a menu is not here right now, and keeps it', () => {
    setMenuEdits(setList(NO_EDITS, 'Help', [...MENUS.find((m) => m.label === 'Help')!.items, 'gone.forever'], MENUS.find((m) => m.label === 'Help')!.items));
    open('Help');
    expect(host.querySelector('[data-entry="gone.forever"] .ui-tag')?.textContent).toBe('Not here right now');
    expect(host.querySelector('[data-entry="gone.forever"] .is-missing')).not.toBeNull();
  });
});
