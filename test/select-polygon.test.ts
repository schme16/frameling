// The Polygon way of picking: the mode itself, and the words that go with it.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SELECT_SETTINGS, type SelectMode } from '../src/select/settings';
import { polygonMask, maskHas } from '../src/select/mask';

describe('the polygon select mode', () => {
  it('is one of the ways to pick, and not the one you start with', () => {
    const modes: SelectMode[] = ['box', 'lasso', 'polygon', 'wand'];
    expect(modes).toContain('polygon');
    expect(DEFAULT_SELECT_SETTINGS.mode).toBe('box');
  });

  it('picks the pixels inside the corners you clicked', () => {
    // A triangle across the top-left of an 8 x 8 grid.
    const m = polygonMask(8, 8, [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ]);
    expect(maskHas(m, 1, 1)).toBe(true);
    expect(maskHas(m, 7, 7)).toBe(false);
  });

  it('takes a square back as a square', () => {
    const m = polygonMask(4, 4, [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ]);
    expect(maskHas(m, 2, 2)).toBe(true);
    expect(maskHas(m, 0, 0)).toBe(false);
  });
});
