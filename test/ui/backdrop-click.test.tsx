// @vitest-environment jsdom
// Pressing beside a dialog: a near miss does nothing, and a real press does whatever you answered the first time it came up. The answer is remembered, so the rule never changes under you.
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

  it('asks the first time, then never again', async () => {
    const asker = vi.fn(async () => ({ value: 'close', remember: true }));
    setChoiceAsker(asker);
    const close = vi.fn();
    act(() => root.render(<Modal title="Test" onClose={close}><p>Hello</p></Modal>));
    press(100, 100);
    expect(asker).toHaveBeenCalledOnce();
    await act(async () => void (await Promise.resolve()));
    expect(close).toHaveBeenCalledOnce();
    // The answer is remembered, so a second press does the same thing without asking again.
    press(100, 100);
    expect(asker).toHaveBeenCalledOnce();
  });

  it('leaves the dialog open while the question is still up, so nothing is lost by not answering', () => {
    setChoiceAsker(vi.fn(() => new Promise<null>(() => {})));
    const close = vi.fn();
    act(() => root.render(<Modal title="Test" onClose={close}><input aria-label="Name" /></Modal>));
    press(100, 100);
    expect(close).not.toHaveBeenCalled();
  });

  it('does the same thing every time, whatever is typed in the dialog', () => {
    expect(backdropCloses('close')).toBe(true);
    expect(backdropCloses('stay')).toBe(false);
  });
});
