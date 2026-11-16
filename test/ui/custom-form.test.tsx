// @vitest-environment jsdom
// The Custom form on the New drawing sheet, driven the way a person does it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { _resetFavouritesForTests, favourites } from '../../src/ui/favourites';
import { closeSheet, openSheet } from '../../src/ui/overlays';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { WelcomeSheet } from '../../src/ui/Welcome';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  resetPrefs();
  setPrefs({ firstDrawn: true });
  _resetFavouritesForTests();
  resetStore(newDoc());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  closeSheet();
});

const show = async () => {
  await act(async () => {
    root.render(<WelcomeSheet />);
    openSheet('new', { custom: true });
  });
  await act(async () => {});
};
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const text = (label: string) => [...document.querySelectorAll<HTMLInputElement>('.ui-custom label')].find((l) => l.textContent?.startsWith(label))?.querySelector('input') ?? null;
const setValue = async (input: HTMLInputElement, v: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = async (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('the Custom form', () => {
  it('opens already showing when the command asks for it, with no frame rate until animation is ticked', async () => {
    await show();
    expect(q('.ui-custom')).toBeTruthy();
    expect(text('Frames a second')).toBeNull();
    await click(q('[data-testid="welcome.custom.animate"]'));
    expect(text('Frames a second')?.value).toBe('12');
    await click(q('[data-testid="welcome.custom.animate"]'));
    expect(text('Frames a second')).toBeNull();
  });

  it('keeps your size through a tick and an untick of Pixel art', async () => {
    await show();
    await setValue(text('Width')!, '1920');
    await setValue(text('Height')!, '1080');
    const pixel = text('Pixel art')!;
    await click(pixel);
    expect([text('Grid width')?.value, text('Grid height')?.value]).toEqual(['64', '64']);
    await click(pixel);
    expect([text('Width')?.value, text('Height')?.value]).toEqual(['1920', '1080']);
  });

  it('starts a picture with one frame, remembers the settings but not the name, and the next visit starts from them', async () => {
    await show();
    await setValue(text('Name')!, 'Hero');
    await setValue(text('Width')!, '1920');
    await act(async () => {
      q('[data-testid="welcome.custom.start"]').click();
    });
    await act(async () => {});
    expect(store().get().doc.length).toBe(1);
    expect(store().get().doc.name).toBe('Hero');
    await act(async () => root.unmount());
    root = createRoot(host);
    await show();
    expect(text('Name')?.value).toBe('Untitled');
    expect(text('Width')?.value).toBe('1920');
  });

  it('saves a favourite with Enter in the name box (which does not start the drawing), and a card appears that makes it', async () => {
    await show();
    await setValue(text('Width')!, '1920');
    await setValue(text('Height')!, '1080');
    await click(q('[data-testid="welcome.custom.animate"]'));
    await setValue(text('Frames a second')!, '24');
    await click(q('[data-testid="welcome.custom.favourite"]'));
    const name = q<HTMLInputElement>('[data-testid="welcome.favourite.name"]');
    expect(name.value).toBe('1920 x 1080, 24 fps');
    await setValue(name, 'Film');
    await act(async () => {
      name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(favourites().map((f) => f.name)).toEqual(['Film']);
    expect(store().get().doc.width).not.toBe(1920);
    const card = q('[data-testid="welcome.favourite"]');
    expect(card.textContent).toContain('Film');
    expect(card.textContent).toContain('1920 x 1080');
    expect(card.textContent).toContain('24 frames a second');
    await act(async () => card.click());
    await act(async () => {});
    expect([store().get().doc.name, store().get().doc.width, store().get().doc.fps]).toEqual(['Untitled', 1920, 24]);
  });

  it('renames, moves and removes favourites, with Undo for a removal', async () => {
    await show();
    for (const n of ['A', 'B']) {
      await click(q('[data-testid="welcome.custom.favourite"]'));
      await setValue(q<HTMLInputElement>('[data-testid="welcome.favourite.name"]'), n);
      await click(q('[data-testid="welcome.favourite.keep"]'));
    }
    expect(favourites().map((f) => f.name)).toEqual(['A', 'B']);
    await click(document.querySelector('[aria-label="Move B earlier"]')!);
    expect(favourites().map((f) => f.name)).toEqual(['B', 'A']);
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Move B earlier"]')!.disabled).toBe(true);
    await click(document.querySelector('[aria-label="Remove B"]')!);
    expect(favourites().map((f) => f.name)).toEqual(['A']);
  });
});
