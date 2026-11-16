import { describe, expect, it } from 'vitest';
import { menusThatFit } from '../../src/ui/menuFold';

const widths = [40, 40, 50, 60, 70, 80, 60];

describe('how many menus show', () => {
  it('all, when they fit', () => {
    const total = widths.reduce((a, b) => a + b, 0) + 2 * (widths.length - 1);
    expect(menusThatFit(widths, total, 44, 2)).toBe(widths.length);
    expect(menusThatFit(widths, 2000, 44, 2)).toBe(widths.length);
  });

  it('one short of the room folds the last into More, and keeps as many as fit beside it', () => {
    const total = widths.reduce((a, b) => a + b, 0) + 2 * (widths.length - 1);
    expect(menusThatFit(widths, total - 1, 44, 2)).toBeLessThan(widths.length);
  });

  it('what is shown, with the More button, never needs more than the room', () => {
    for (let room = 30; room < 500; room += 7) {
      const n = menusThatFit(widths, room, 44, 2);
      if (n === widths.length) continue;
      const used = widths.slice(0, n).reduce((a, b) => a + b, 0) + 2 * n + 44;
      expect(used).toBeLessThanOrEqual(Math.max(room, 44 + 2));
    }
  });

  it('shows none but More when there is hardly any room', () => {
    expect(menusThatFit(widths, 20, 44, 2)).toBe(0);
  });

  it('fewer room never shows more menus', () => {
    let last = Infinity;
    for (let room = 600; room >= 0; room -= 10) {
      const n = menusThatFit(widths, room, 44, 2);
      expect(n).toBeLessThanOrEqual(last);
      last = n;
    }
  });

  it('handles an empty bar', () => {
    expect(menusThatFit([], 100, 44, 2)).toBe(0);
  });
});
