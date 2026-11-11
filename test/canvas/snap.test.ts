import { describe, expect, it } from 'vitest';
import { guideDrop, nearest, snapBox, snapPoint, snapTargets, snapValue, withGuide } from '../../src/canvas/snap';
import { niceStep, rulerTicks, subdivisions } from '../../src/canvas/rulers';
import { formatLength, pxTo, roundIn, toPx, UNITS } from '../../src/core/units';

const page = { width: 200, height: 100, guides: [{ id: 'g', axis: 'x' as const, at: 37 }] };

describe('snapping', () => {
  it('targets the page edges and middle, and guides when shown', () => {
    expect(snapTargets(page)).toEqual({ x: [0, 100, 200, 37], y: [0, 50, 100] });
    expect(snapTargets(page, false).x).toEqual([0, 100, 200]);
  });

  it('pulls a value onto the nearest line within reach', () => {
    expect(snapValue(35, [0, 37, 100], 3)).toEqual({ v: 37, hit: 37 });
    expect(snapValue(30, [0, 37, 100], 3)).toEqual({ v: 30, hit: null });
    expect(nearest(98, [97, 100], 5)).toBe(97);
  });

  it('snaps a point each way on its own', () => {
    const t = snapTargets(page);
    expect(snapPoint({ x: 99, y: 70 }, t, 2)).toEqual({ x: 100, y: 70, lines: [{ axis: 'x', at: 100 }] });
  });

  it('snaps a moving box by its nearest edge or middle', () => {
    const t = snapTargets(page);
    // A 20 wide box at x 10, moved 25: its left edge (35) is 2 from the guide at 37.
    const r = snapBox({ x: 10, y: 10, w: 20, h: 20 }, 25, 0, t, 3);
    expect(r.dx).toBe(27);
    expect(r.lines).toEqual([{ axis: 'x', at: 37 }]);
    // Its middle onto the page's middle.
    const m = snapBox({ x: 0, y: 0, w: 20, h: 20 }, 89, 39, t, 2);
    expect(m.dx).toBe(90);
    expect(m.dy).toBe(40);
    // Too far: nothing.
    expect(snapBox({ x: 0, y: 0, w: 20, h: 20 }, 60, 20, t, 2)).toEqual({ dx: 60, dy: 20, lines: [] });
  });

  it('adds, moves and removes guides', () => {
    const g = { id: 'a', axis: 'y' as const, at: 5 };
    expect(withGuide(undefined, g, 10)).toEqual([{ ...g, at: 10 }]);
    expect(withGuide([g], g, 20)).toEqual([{ ...g, at: 20 }]);
    expect(withGuide([g], g, null)).toEqual([]);
    expect(guideDrop(12.3456, false)).toBe(12.35);
    expect(guideDrop(12, true)).toBeNull();
  });
});

describe('rulers', () => {
  it('picks friendly steps', () => {
    expect(niceStep(37)).toBe(50);
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(100)).toBe(100);
    expect(niceStep(0)).toBe(1);
    expect(subdivisions(100, 1)).toBe(10);
    expect(subdivisions(20, 1)).toBe(4);
    expect(subdivisions(50, 0.5)).toBe(5);
  });

  it('numbers pixels at 100%', () => {
    const t = rulerTicks(0, 400, 1, 'px', 96);
    expect(t.major.map((m) => m.label)).toEqual(['0', '100', '200', '300', '400']);
    expect(t.minor.length).toBeGreaterThan(0);
  });

  it('adapts to the zoom', () => {
    const near = rulerTicks(0, 100, 8, 'px', 96);
    const far = rulerTicks(0, 100, 0.25, 'px', 96);
    expect(near.major[1].at - near.major[0].at).toBeLessThan(far.major.length > 1 ? far.major[1].at - far.major[0].at : Infinity);
    expect(near.major[1].at - near.major[0].at).toBe(10);
  });

  it('counts in the chosen unit', () => {
    // 1 cm at 96 DPI is about 37.8 px, so at 100% centimetres are numbered.
    const t = rulerTicks(0, 400, 1, 'cm', 96);
    expect(t.major[1].label).toBe('2');
    expect(t.major[1].at).toBeCloseTo(toPx(2, 'cm', 96));
    const inch = rulerTicks(0, 300, 1, 'in', 300);
    expect(inch.major.at(-1)!.at).toBeCloseTo(300);
  });

  it('labels below one with decimals and never says -0', () => {
    const t = rulerTicks(-50, 50, 64, 'mm', 96);
    expect(t.major.some((m) => m.label.includes('.'))).toBe(true);
    expect(t.major.some((m) => m.label === '-0' || m.label === '-0.0')).toBe(false);
  });
});

describe('units', () => {
  it('round trip every unit at many DPIs', () => {
    for (const u of UNITS) for (const dpi of [1, 72, 96, 150, 300, 600, 10000]) for (const px of [0, 1, 13, 1280, 9999.5]) expect(toPx(pxTo(px, u.id, dpi), u.id, dpi)).toBeCloseTo(px, 6);
  });

  it('round trips what the UI shows to within one shown step', () => {
    for (const u of UNITS) {
      const shown = roundIn(pxTo(1181, u.id, 300), u.id);
      const back = toPx(shown, u.id, 300);
      expect(Math.abs(back - 1181)).toBeLessThanOrEqual(toPx(10 ** -u.places, u.id, 300));
    }
  });

  it('formats lengths', () => {
    expect(formatLength(96, 'in')).toBe('1 in');
    expect(formatLength(96, 'pt')).toBe('72 pt');
    expect(formatLength(300, 'mm', 300)).toBe('25.4 mm');
  });
});
