// @vitest-environment jsdom
// Quill's save question in the page: it asks for the five paths, Save has the keyboard, Escape and a press beside it are
// Cancel, a newer question cancels an older one, and with nowhere to show it the system box is used.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { resetStore, store } from '../../src/core/store';
import { askAboutUnsavedChanges } from '../../src/io/document';
import { askSaveInPage, saveAskAvailable, saveAsking } from '../../src/io/saveAsk';
import { SaveQuestionDialog } from '../../src/io/SaveQuestionDialog';
import { anyOverlayOpen } from '../../src/ui/overlays';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const systemAsked: string[] = [];

beforeEach(() => {
  systemAsked.length = 0;
  setChoice('ui.backdropClick', undefined);
  setChoiceAsker(null);
  resetStore(newDoc({ name: 'Ball', length: 8 }));
  store().setUi({ dirty: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: { save: async (o: { path: string | null }) => ({ path: o.path ?? '/art/new.frameling' }) },
    recent: { add: async () => undefined },
    autosave: { clear: async () => undefined, write: async () => undefined, keep: async () => undefined },
    app: { askSaveChanges: async (n: string) => (systemAsked.push(n), 'cancel') },
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  delete (window as unknown as { frameling?: unknown }).frameling;
  vi.restoreAllMocks();
});

const mount = () => act(() => root.render(<SaveQuestionDialog />));
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (answer: string) => document.querySelector<HTMLButtonElement>(`[data-testid="save.${answer}"]`)!;

describe('with the dialog on the page', () => {
  it('has nowhere to show until it is mounted, and then it can', async () => {
    expect(saveAskAvailable()).toBe(false);
    await expect(askSaveInPage('Ball', false)).rejects.toThrow();
    mount();
    expect(saveAskAvailable()).toBe(true);
  });

  it('is a proper dialog: named, described, with the question and the drawing\'s name, and Save has the focus', async () => {
    mount();
    let shown = 0;
    const p = askSaveInPage('Ball', false, { onShown: () => void shown++ });
    await act(async () => {});
    const d = dialog()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('Save changes?');
    const desc = document.getElementById(d.getAttribute('aria-describedby')!)!;
    expect(desc.textContent).toMatch(/latest changes will be lost/);
    expect(d.querySelector('h2')!.textContent).toBe('Save changes to "Ball"?');
    expect([...d.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Save', `Don't save`, 'Cancel']);
    expect(document.activeElement).toBe(button('save'));
    expect(shown).toBe(1);
    expect(anyOverlayOpen()).toBe(true);
    act(() => button('cancel').click());
    await expect(p).resolves.toBe('cancel');
    expect(saveAsking.get()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('a drawing that was never saved says so', async () => {
    mount();
    const p = askSaveInPage('Untitled', true);
    await act(async () => {});
    expect(dialog()!.textContent).toMatch(/hasn't been saved yet/);
    act(() => button('save').click());
    await expect(p).resolves.toBe('save');
  });

  it('each button gives its own answer', async () => {
    mount();
    for (const a of ['save', 'discard', 'cancel'] as const) {
      const p = askSaveInPage('Ball', false);
      await act(async () => {});
      act(() => button(a).click());
      await expect(p).resolves.toBe(a);
    }
  });

  it('Escape is Cancel', async () => {
    mount();
    const p = askSaveInPage('Ball', false);
    await act(async () => {});
    act(() => void dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await expect(p).resolves.toBe('cancel');
  });

  it('Tab stays inside: from the last button it goes back to the first', async () => {
    // jsdom has no layout, so say every element is on screen (the dialog skips what is hidden).
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get: () => document.body });
    mount();
    void askSaveInPage('Ball', false);
    await act(async () => {});
    button('cancel').focus();
    act(() => void dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(button('save'));
    act(() => void dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(button('cancel'));
  });

  it('a press just beside it does nothing, and one well clear is Cancel, never Don\'t save', async () => {
    mount();
    Element.prototype.getBoundingClientRect = function () {
      const r = this.classList.contains('ui-modal') ? { left: 400, top: 300, right: 800, bottom: 600, width: 400, height: 300 } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      return { ...r, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect;
    };
    const p = askSaveInPage('Ball', false);
    await act(async () => {});
    const back = document.querySelector('.ui-backdrop')!;
    act(() => void back.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 810, clientY: 450 })));
    expect(dialog()).not.toBeNull();
    act(() => void back.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 })));
    await expect(p).resolves.toBe('cancel');
  });

  it('a newer question answers an older one with Cancel, so nothing happens by a question nobody saw', async () => {
    mount();
    const first = askSaveInPage('Ball', false);
    await act(async () => {});
    const second = askSaveInPage('Ball', false);
    await expect(first).resolves.toBe('cancel');
    await act(async () => {});
    act(() => button('discard').click());
    await expect(second).resolves.toBe('discard');
  });

  it('the desktop side giving up on the page takes the dialog down', async () => {
    mount();
    const ctl = new AbortController();
    const p = askSaveInPage('Ball', false, { signal: ctl.signal });
    await act(async () => {});
    act(() => ctl.abort());
    await expect(p).resolves.toBe('cancel');
    expect(dialog()).toBeNull();
  });
});

describe('New, Open and Close drawing ask through it', () => {
  it('Cancel stops them and nothing is saved', async () => {
    mount();
    const p = askAboutUnsavedChanges();
    await act(async () => {});
    expect(dialog()).not.toBeNull();
    act(() => button('cancel').click());
    await expect(p).resolves.toBe(false);
    expect(store().get().ui.dirty).toBe(true);
    expect(systemAsked).toEqual([]);
  });

  it("Don't save carries on", async () => {
    mount();
    const p = askAboutUnsavedChanges();
    await act(async () => {});
    act(() => button('discard').click());
    await expect(p).resolves.toBe(true);
  });

  it('with the dialog not on the page it falls back to the system box rather than skipping the question', async () => {
    const p = askAboutUnsavedChanges();
    await expect(p).resolves.toBe(false);
    expect(systemAsked).toEqual(['Ball']);
  });
});
