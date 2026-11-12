import { describe, expect, it } from 'vitest';
import { placeBar, spotBox } from '../../src/quests/place';

const view = { w: 1400, h: 900 };
const bar = { w: 420, h: 220 };

describe('where the guide bar sits', () => {
  it('stays put when the target is clear of it', () => {
    expect(placeBar('bl', bar, view, { left: 700, top: 650, right: 760, bottom: 680 })).toBe('bl');
  });
  it('stays put when there is no target', () => {
    expect(placeBar('tr', bar, view, null)).toBe('tr');
  });
  it('moves off a target it covers (the timeline buttons at the bottom left)', () => {
    const copy = { left: 300, top: 660, right: 340, bottom: 700 };
    const bl = spotBox('bl', bar, view);
    expect(bl.right).toBeGreaterThan(copy.left);
    expect(placeBar('bl', bar, view, copy)).toBe('br');
  });
  it('goes to the top when a wide timeline row is covered at both bottom corners', () => {
    const row = { left: 20, top: 640, right: 1380, bottom: 690 };
    expect(placeBar('bl', bar, view, row)).toBe('tl');
  });
  it('keeps a little room around the target', () => {
    const t = { left: 435, top: 700, right: 470, bottom: 730 };
    expect(placeBar('bl', bar, view, t)).toBe('br');
  });
  it('re-places for a smaller window', () => {
    const small = { w: 900, h: 600 };
    const t = { left: 300, top: 400, right: 360, bottom: 440 };
    expect(placeBar('bl', bar, { w: 1400, h: 900 }, t)).toBe('bl');
    expect(placeBar('bl', bar, small, t)).not.toBe('bl');
  });
  it('stays when every corner is covered', () => {
    expect(placeBar('bl', bar, view, { left: 0, top: 0, right: 1400, bottom: 900 })).toBe('bl');
  });
});
