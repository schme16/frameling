// The Polygon way of picking: the mode itself, and the words that go with it.
import { describe, expect, it } from 'vitest';
import { modeOfTool, WAYS, type SelectMode } from '../src/select/ways';
import { polygonMask, maskHas } from '../src/select/mask';

describe('the polygon select mode', () => {
  it('is a tool of its own, on both kinds of layer', () => {
    const modes: SelectMode[] = WAYS.map((w) => w.mode);
    expect(modes).toContain('polygon');
    expect(modeOfTool('select-polygon')).toBe('polygon');
    expect(modeOfTool('pixel-select-polygon')).toBe('polygon');
    // Anything else is the box, which is what Select has always meant.
    expect(modeOfTool('pencil')).toBe('box');
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
