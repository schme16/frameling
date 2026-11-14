import { describe, expect, it } from 'vitest';
import { CANVAS_LEAST, foldsFor, type FitZone } from '../../src/ui/dockFit';

const left: FitZone = { present: true, min: 180, folded: 40 };
const right: FitZone = { present: true, min: 268, folded: 68 };
const OTHER = 90; // rails, splitters, gaps and padding

describe('which zones fold', () => {
  it('none, when the window holds everything at its least', () => {
    expect(foldsFor(1280, OTHER, CANVAS_LEAST.x, left, right)).toEqual({ start: false, end: false });
  });

  it('none at the exact least, one unit short folds the right side first', () => {
    const exact = OTHER + CANVAS_LEAST.x + left.min + 16 + right.min + 16;
    expect(foldsFor(exact, OTHER, CANVAS_LEAST.x, left, right)).toEqual({ start: false, end: false });
    expect(foldsFor(exact - 1, OTHER, CANVAS_LEAST.x, left, right)).toEqual({ start: false, end: true });
  });

  it('1280 at 200% (640 units) leaves the canvas its room by folding', () => {
    const f = foldsFor(640, OTHER, CANVAS_LEAST.x, left, right);
    const take = (z: FitZone, folded: boolean) => (z.present ? (folded ? z.folded : z.min + 16) : 0);
    const canvas = 640 - OTHER - take(left, f.start) - take(right, f.end);
    expect(canvas).toBeGreaterThanOrEqual(CANVAS_LEAST.x);
  });

  it('folds the left too when the right alone is not enough', () => {
    expect(foldsFor(430, OTHER, CANVAS_LEAST.x, left, right)).toEqual({ start: true, end: true });
  });

  it('keeps folding what is there when nothing is enough: the canvas gets what is left', () => {
    expect(foldsFor(200, OTHER, CANVAS_LEAST.x, left, right)).toEqual({ start: true, end: true });
  });

  it('ignores a zone that is not on show', () => {
    const none = { ...left, present: false };
    expect(foldsFor(640, OTHER, CANVAS_LEAST.x, none, right)).toEqual({ start: false, end: true });
    expect(foldsFor(1280, OTHER, CANVAS_LEAST.x, none, { ...right, present: false })).toEqual({ start: false, end: false });
  });

  it('needs a little to spare before a folded zone unfolds, so the edge does not flicker', () => {
    const exact = OTHER + CANVAS_LEAST.x + left.min + 16 + right.min + 16;
    expect(foldsFor(exact, OTHER, CANVAS_LEAST.x, left, right, { start: false, end: true })).toEqual({ start: false, end: true });
    expect(foldsFor(exact + 28, OTHER, CANVAS_LEAST.x, left, right, { start: false, end: true })).toEqual({ start: false, end: false });
  });

  it('works down the window the same way: the timeline folds before the canvas goes flat', () => {
    const top: FitZone = { present: false, min: 80, folded: 0 };
    const bottom: FitZone = { present: true, min: 110, folded: 34 };
    expect(foldsFor(400, 120, CANVAS_LEAST.y, top, bottom)).toEqual({ start: false, end: true });
    expect(foldsFor(700, 120, CANVAS_LEAST.y, top, bottom)).toEqual({ start: false, end: false });
  });
});
