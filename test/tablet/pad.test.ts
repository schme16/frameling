// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fitPad, padPoint, padSize } from '../../src/tablet/pad';

describe('the drawing pads', () => {
  it('a stretched canvas still puts the line under the pen, in both directions', () => {
    // The pen check's 720 x 260 canvas shown 870 x 180 (what it was): the pen 130 px down the pad.
    const rect = { left: 17, top: 265, width: 870, height: 180 };
    const p = padPoint(17 + 435, 265 + 130, rect, 720, 260);
    expect(p.x / 720).toBeCloseTo(435 / 870, 5);
    expect(p.y / 260).toBeCloseTo(130 / 180, 5);
    // The old reading used the width's scale for both, which put the line well above the pen.
    expect(130 * (720 / 870)).toBeLessThan(p.y * 0.7);
  });
  it('a canvas the size it is shown at maps one to one, times the screen scale', () => {
    const p = padPoint(110, 60, { left: 10, top: 10, width: 400, height: 150 }, 800, 300);
    expect(p).toEqual({ x: 200, y: 100, k: 2 });
  });
  it('sizes the canvas to its layout size and the screen scale, and leaves a right-sized one alone', () => {
    expect(padSize(870, 180, 1.25)).toEqual({ width: 1088, height: 225 });
    expect(padSize(0, 0, 0)).toEqual({ width: 1, height: 1 });
    const c = document.createElement('canvas');
    Object.defineProperty(c, 'clientWidth', { value: 870 });
    Object.defineProperty(c, 'clientHeight', { value: 180 });
    c.width = 720;
    c.height = 260;
    expect(fitPad(c)).toBe(true);
    expect([c.width / 870, c.height / 180]).toEqual([window.devicePixelRatio || 1, window.devicePixelRatio || 1]);
    expect(fitPad(c)).toBe(false);
  });
  it('a pad that is not laid out yet is left as it is', () => {
    const c = document.createElement('canvas');
    c.width = 720;
    expect(fitPad(c)).toBe(false);
    expect(c.width).toBe(720);
  });
});
