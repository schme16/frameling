import { describe, expect, it } from 'vitest';
import { placePopup, type Box } from '../src/ui/placePopup';

const win = { w: 1000, h: 700 };
const btn = (left: number, top: number, w = 260, h = 44): Box => ({ left, top, right: left + w, bottom: top + h });
const ask = (anchor: Box, over: Partial<Parameters<typeof placePopup>[0]> = {}) => placePopup({ anchor, win, width: 380, height: 580, ...over });

// A drop down fits when its box (left, width, and top or bottom with the height it may have) is inside the window.
function inside(p: ReturnType<typeof placePopup>, w = win) {
  expect(p.left).toBeGreaterThanOrEqual(8);
  expect(p.left + p.width).toBeLessThanOrEqual(w.w - 8);
  const top = p.top ?? w.h - (p.bottom ?? 0) - p.maxHeight;
  expect(top).toBeGreaterThanOrEqual(8);
  expect(top + p.maxHeight).toBeLessThanOrEqual(w.h - 8);
}

describe('placePopup', () => {
  it('opens below the button when it fits there, hanging off its right end', () => {
    const p = ask(btn(600, 60), { height: 400 });
    expect(p.opens).toBe('below');
    expect(p.top).toBe(60 + 44 + 6);
    expect(p.left).toBe(600 + 260 - 380);
    inside(p);
  });

  it('opens below, with its height capped to the room, when below has more room than above', () => {
    const p = ask(btn(600, 100));
    expect(p.opens).toBe('below');
    expect(p.maxHeight).toBe(700 - 144 - 6 - 8);
    inside(p);
  });

  it('opens upward when there is more room above than below, growing up from the button', () => {
    const p = ask(btn(600, 600));
    expect(p.opens).toBe('above');
    expect(p.bottom).toBe(700 - 600 + 6);
    expect(p.maxHeight).toBe(600 - 6 - 8);
    expect(p.top).toBeUndefined();
    inside(p);
  });

  it('stays below when it fits there even if there is more room above', () => {
    const p = ask(btn(600, 300), { height: 300 });
    expect(p.opens).toBe('below');
  });

  it('is capped to the room above when the list is taller than it', () => {
    const p = ask(btn(600, 500), { height: 800 });
    expect(p.opens).toBe('above');
    expect(p.maxHeight).toBe(500 - 6 - 8);
  });

  it('is kept inside the left edge', () => {
    const p = ask(btn(10, 60, 120));
    expect(p.left).toBe(8);
    inside(p);
  });

  it('is kept inside the right edge when the button hangs past it', () => {
    const p = ask(btn(900, 60, 260));
    expect(p.left + p.width).toBe(1000 - 8);
    inside(p);
  });

  it('is narrowed to the window when the window is narrower than it', () => {
    const p = placePopup({ anchor: btn(20, 60, 100), win: { w: 300, h: 700 }, width: 380, height: 400 });
    expect(p.width).toBe(284);
    expect(p.left).toBe(8);
  });

  it('covers the button and fills the window height when neither side has room', () => {
    const tiny = { w: 400, h: 260 };
    const p = placePopup({ anchor: btn(100, 110, 200), win: tiny, width: 380, height: 580 });
    expect(p.opens).toBe('over');
    expect(p.top).toBe(8);
    expect(p.maxHeight).toBe(260 - 16);
    inside(p, tiny);
  });

  it('shrinks a short list to its own height rather than the window', () => {
    const p = ask(btn(600, 300), { height: 150 });
    expect(p.opens).toBe('below');
    expect(p.maxHeight).toBeGreaterThanOrEqual(150);
  });

  it('every placement fits the window, across a sweep of button positions and window sizes', () => {
    for (const w of [{ w: 420, h: 300 }, { w: 800, h: 480 }, { w: 1400, h: 900 }]) {
      for (let x = -50; x <= w.w + 50; x += 37) {
        for (let y = -20; y <= w.h + 20; y += 23) {
          const p = placePopup({ anchor: btn(x, y, 220), win: w, width: 380, height: 580 });
          expect(p.maxHeight).toBeLessThanOrEqual(w.h - 16);
          expect(p.left).toBeGreaterThanOrEqual(8);
          expect(p.left + p.width).toBeLessThanOrEqual(w.w - 8);
          if (p.opens === 'above') expect(w.h - (p.bottom ?? 0) - p.maxHeight).toBeGreaterThanOrEqual(8);
          else expect((p.top ?? 0) + p.maxHeight).toBeLessThanOrEqual(w.h - 8);
        }
      }
    }
  });
});
