// @vitest-environment jsdom
// Pressing beside a dialog: a near miss does nothing, and a real press closes it unless something has been typed in it. It never asks.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { Modal } from '../../src/ui/Modal';
import { backdropCloses, nearMiss, NEAR_MISS } from '../../src/ui/backdropClick';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const BOX = { left: 400, top: 300, right: 800, bottom: 600, width: 400, height: 300, x: 400, y: 300 };

beforeEach(() => {
  setChoice('ui.backdropClick', undefined);
  setChoiceAsker(null);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // jsdom gives everything a zero-sized box, so the dialog gets a real one.
  Element.prototype.getBoundingClientRect = function () {
    return this.classList.contains('ui-modal') ? ({ ...BOX, toJSON: () => BOX } as DOMRect) : ({ ...BOX, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect);
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const press = (x: number, y: number) => {
  const back = host.querySelector('.ui-backdrop')!;
  act(() => void back.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y })));
};

describe('the ring of dead space round a dialog', () => {
  it('counts a press just outside the edge as a miss, and one well clear as a real press', () => {
    const el = { getBoundingClientRect: () => BOX as DOMRect } as Element;
    expect(nearMiss(810, 450, el)).toBe(true);
    expect(nearMiss(800 + NEAR_MISS + 1, 450, el)).toBe(false);
    expect(nearMiss(100, 100, el)).toBe(false);
    // Nothing measurable (a dialog that has not laid out yet) is never a miss.
    expect(nearMiss(10, 10, null)).toBe(false);
  });

  it('a press that just misses the dialog leaves it open', () => {
    setChoice('ui.backdropClick', 'close');
    const close = vi.fn();
    act(() => root.render(<Modal title="Test" onClose={close}><p>Hello</p></Modal>));
    press(810, 450);
    expect(close).not.toHaveBeenCalled();
    press(100, 100);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('what a press beside a dialog does', () => {
  it('leaves the dialog alone when that is what was chosen', () => {
    setChoice('ui.backdropClick', 'stay');
    const close = vi.fn();
    act(() => root.render(<Modal title="Test" onClose={close}><p>Hello</p></Modal>));
    press(100, 100);
    expect(close).not.toHaveBeenCalled();
  });

  it('never asks, and closes an untouched dialog by default', () => {
    const asker = vi.fn(async () => ({ value: 'stay', remember: true }));
    setChoiceAsker(asker);
    const close = vi.fn();
    act(() => root.render(<Modal title="Test" onClose={close}><p>Hello</p></Modal>));
    press(100, 100);
    expect(asker).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps a dialog open once something has been typed in it, and closes it with nothing typed', () => {
    const close = vi.fn();
    act(() => root.render(<Modal title="Test" onClose={close}><input aria-label="Name" /></Modal>));
    const input = host.querySelector('input')!;
    act(() => void input.dispatchEvent(new Event('input', { bubbles: true })));
    press(100, 100);
    expect(close).not.toHaveBeenCalled();
  });

  it('a value set by code is not typing', () => {
    const close = vi.fn();
    act(() => root.render(<Modal title="Test" onClose={close}><input aria-label="Name" defaultValue="Untitled" /></Modal>));
    host.querySelector('input')!.value = 'Filled in for you';
    press(100, 100);
    expect(close).toHaveBeenCalledOnce();
  });

  it('the setting can say always or never, whatever is typed', () => {
    expect(backdropCloses('smart', false)).toBe(true);
    expect(backdropCloses('smart', true)).toBe(false);
    expect(backdropCloses('close', true)).toBe(true);
    expect(backdropCloses('stay', false)).toBe(false);
  });
});
