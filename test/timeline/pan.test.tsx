// @vitest-environment jsdom
// Dragging the timeline about: the middle button, or Space held with the left button, like the canvas.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { setTl } from '../../src/timeline/state';
import { docWith } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});
beforeEach(() => {
  setTl({ cw: 20, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  resetStore(docWith([[0, 2], [3, 1]], 24));
  act(() => root.render(<TimelinePanel />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const body = () => host.querySelector<HTMLElement>('.tl-body')!;
const main = () => host.querySelector<HTMLElement>('.tl-main')!;
const ptr = (type: string, x: number, y: number, button = 0) =>
  act(() => void main().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button, buttons: button === 1 ? 4 : 1, clientX: x, clientY: y })));
const key = (type: string, target: EventTarget = main()) => act(() => void target.dispatchEvent(new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true })));

describe('dragging the timeline about', () => {
  it('follows the middle button and puts the scroll back where the pointer takes it', () => {
    const el = body();
    el.scrollLeft = 200;
    el.scrollTop = 40;
    ptr('pointerdown', 500, 300, 1);
    expect(el.className).toContain('is-panning');
    ptr('pointermove', 420, 290, 1);
    expect(el.scrollLeft).toBe(280);
    expect(el.scrollTop).toBe(50);
    ptr('pointerup', 420, 290, 1);
    expect(el.className).not.toContain('is-panning');
  });

  it('Space and the left button do the same, and a plain left drag still picks frames', () => {
    const el = body();
    el.scrollLeft = 100;
    key('keydown');
    ptr('pointerdown', 500, 300);
    ptr('pointermove', 450, 300);
    expect(el.scrollLeft).toBe(150);
    ptr('pointerup', 450, 300);
    key('keyup');
    // Space let go: the left button goes back to picking, not panning.
    el.scrollLeft = 100;
    ptr('pointerdown', 500, 300);
    ptr('pointermove', 450, 300);
    expect(el.scrollLeft).toBe(100);
    ptr('pointerup', 450, 300);
  });

  it('Space keeps the timeline from scrolling itself a page while you hold it', () => {
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => void main().dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    // Typing a space in a text field is left alone.
    const input = document.createElement('input');
    document.body.appendChild(input);
    const t = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => void input.dispatchEvent(t));
    expect(t.defaultPrevented).toBe(false);
    input.remove();
  });
});
