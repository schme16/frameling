// @vitest-environment jsdom
// The tip sits above the thing with an arrow that points at it, and the arrow follows when the thing moves.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipLayer } from '../../src/ui/Tooltips';
import { WAIT_CEILING_MS } from '../helpers/waits';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rect = (left: number, top: number, w: number, h: number): DOMRect =>
  ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe('tip arrow', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let thing: DOMRect = rect(600, 400, 40, 30);
  const realRect = Element.prototype.getBoundingClientRect;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    Element.prototype.getBoundingClientRect = realRect;
    root = null;
  });
  const setup = () => {
    thing = rect(600, 400, 40, 30);
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains('ui-tip')) return rect(0, 0, 200, 60);
      if (this.id === 'thing') return thing;
      return rect(0, 0, 0, 0);
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <>
          <button id="thing" data-tip="Hello" data-tip-desc="Says hello.">
            go
          </button>
          <TooltipLayer />
        </>,
      ),
    );
    return document.getElementById('thing')!;
  };

  it('is above the thing, with its arrow underneath pointing at the middle of it', () => {
    const el = setup();
    // Pressing a help icon shows its tip at once, which is the quickest way to get one up here.
    el.setAttribute('data-explain', '');
    act(() => el.click());
    const tip = document.querySelector<HTMLElement>('.ui-tip')!;
    expect(tip.getAttribute('data-side')).toBe('above');
    expect(parseFloat(tip.style.top)).toBeLessThan(400);
    const arrow = tip.querySelector<HTMLElement>('.ui-tip-arrow')!;
    expect(arrow).not.toBeNull();
    expect(parseFloat(arrow.style.left)).toBe(100);
  });

  it('follows the thing when it moves, and the arrow with it', async () => {
    const el = setup();
    el.setAttribute('data-explain', '');
    act(() => el.click());
    const before = parseFloat(document.querySelector<HTMLElement>('.ui-tip')!.style.left);
    // The thing slides to the right edge: the tip is held on screen and the arrow slides along it.
    thing = rect(window.innerWidth - 30, 400, 24, 30);
    // The tip follows on the next animation frames; wait for it to arrive rather than for a guessed 80 ms.
    const arrived = () => parseFloat(document.querySelector<HTMLElement>('.ui-tip')!.style.left) === window.innerWidth - 200 - 8;
    const end = Date.now() + WAIT_CEILING_MS;
    while (!arrived() && Date.now() < end) await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
    const tip = document.querySelector<HTMLElement>('.ui-tip')!;
    expect(parseFloat(tip.style.left)).toBe(window.innerWidth - 200 - 8);
    expect(parseFloat(tip.style.left)).toBeGreaterThan(before);
    expect(parseFloat(tip.querySelector<HTMLElement>('.ui-tip-arrow')!.style.left)).toBe(200 - 14);
  });

  it('has no arrow when the tip cannot be put near the thing', () => {
    const el = setup();
    thing = rect(300, 0, 400, window.innerHeight);
    el.setAttribute('data-explain', '');
    act(() => el.click());
    expect(document.querySelector('.ui-tip')).not.toBeNull();
    expect(document.querySelector('.ui-tip-arrow')).toBeNull();
  });
});
