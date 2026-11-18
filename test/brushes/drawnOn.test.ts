// The preview's line is drawn on after a part of the brush changes: how much of it is down at each moment.
import { describe, expect, it } from 'vitest';
import { DRAW_ON_MS, drawnOn } from '../../src/brushes/flash';

describe('the preview line drawn on', () => {
  it('starts with a stub of a line, never nothing', () => {
    expect(drawnOn(0, 61)).toBe(2);
    expect(drawnOn(-50, 61)).toBe(2);
  });
  it('is all there when the time is up, and after', () => {
    expect(drawnOn(DRAW_ON_MS, 61)).toBe(61);
    expect(drawnOn(DRAW_ON_MS * 3, 61)).toBe(61);
  });
  it('only ever grows, and slows towards the end', () => {
    let last = 0;
    for (let ms = 0; ms <= DRAW_ON_MS; ms += 10) {
      const k = drawnOn(ms, 61);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
    const firstHalf = drawnOn(DRAW_ON_MS / 2, 61) - drawnOn(0, 61);
    const secondHalf = drawnOn(DRAW_ON_MS, 61) - drawnOn(DRAW_ON_MS / 2, 61);
    expect(firstHalf).toBeGreaterThan(secondHalf);
  });
});
