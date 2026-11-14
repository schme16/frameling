import { describe, expect, it } from 'vitest';
import type { StrokePoint, SubPath } from '../../src/core/format';
import { cleanTrim, lerpTrim, makeTrim, outlineLength, pointsLength, sameTrim, trimActive, trimStrokePoints, trimSubPaths, trimWindows, trimWords } from '../../src/geometry/trim';

const line = (len = 100): SubPath => ({ closed: false, points: [{ x: 0, y: 0 }, { x: len, y: 0 }] });
const square = (s = 100): SubPath => ({
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: s, y: 0 },
    { x: s, y: s },
    { x: 0, y: s },
  ],
});
const curve = (): SubPath => ({ closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0, c1: { x: 0, y: 55 }, c2: { x: 100, y: 55 } }] });

describe('trim numbers', () => {
  it('is only active when it hides or moves something', () => {
    expect(trimActive(undefined)).toBe(false);
    expect(trimActive({ start: 0, end: 100, offset: 0 })).toBe(false);
    expect(trimActive({ start: 0, end: 60, offset: 0 })).toBe(true);
    expect(trimActive({ start: 0, end: 100, offset: 10 })).toBe(true);
  });

  it('cleans damaged values and drops the whole line', () => {
    expect(cleanTrim({ start: 0, end: 100, offset: 0 })).toBeUndefined();
    expect(cleanTrim('nope')).toBeUndefined();
    expect(cleanTrim({ start: -50, end: 400, offset: 'x' })).toBeUndefined();
    expect(cleanTrim({ start: NaN, end: 50 })).toEqual({ start: 0, end: 50, offset: 0 });
    expect(cleanTrim({ start: 10, end: 50, offset: 99999 })).toEqual({ start: 10, end: 50, offset: 1000 });
    expect(cleanTrim({ start: 0, end: 50, order: 'inOrder' })).toEqual({ start: 0, end: 50, offset: 0, order: 'inOrder' });
    expect(cleanTrim({ start: 0, end: 50, order: 'sideways' })).toEqual({ start: 0, end: 50, offset: 0 });
  });

  it('blends, treating a missing trim as the whole line', () => {
    expect(lerpTrim(makeTrim(0, 0), makeTrim(0, 100), 0.25)).toEqual({ start: 0, end: 25, offset: 0 });
    expect(lerpTrim(undefined, makeTrim(0, 50), 0.5)).toEqual({ start: 0, end: 75, offset: 0 });
    expect(lerpTrim(undefined, undefined, 0.5)).toBeUndefined();
    expect(lerpTrim(makeTrim(0, 50), undefined, 1)).toBeUndefined();
  });

  it('compares with the defaults filled in', () => {
    expect(sameTrim(undefined, { start: 0, end: 100, offset: 0 })).toBe(true);
    expect(sameTrim(makeTrim(0, 50), makeTrim(0, 50.0000001))).toBe(true);
    expect(sameTrim(makeTrim(0, 50), makeTrim(0, 51))).toBe(false);
  });

  it('says what it shows in words', () => {
    expect(trimWords(undefined)).toBe('the whole line');
    expect(trimWords(makeTrim(0, 60))).toBe('0% to 60%');
    expect(trimWords(makeTrim(40, 20))).toBe('20% to 40%');
    expect(trimWords(makeTrim(30, 30))).toBe('nothing yet');
  });
});

describe('the window along a line', () => {
  it('is the stretch between start and end, whichever is first', () => {
    expect(trimWindows({ start: 20, end: 60, offset: 0 }, false)).toEqual([[0.2, 0.6]]);
    expect(trimWindows({ start: 60, end: 20, offset: 0 }, false)).toEqual([[0.2, 0.6]]);
    expect(trimWindows({ start: 30, end: 30, offset: 0 }, false)).toEqual([]);
  });

  it('slides and stops at the ends on an open line', () => {
    expect(trimWindows({ start: 0, end: 50, offset: 20 }, false)).toEqual([[0.2, 0.7]]);
    const w = trimWindows({ start: 0, end: 50, offset: 80 }, false);
    expect(w).toHaveLength(1);
    expect(w[0][0]).toBeCloseTo(0.8);
    expect(w[0][1]).toBeCloseTo(1);
    expect(trimWindows({ start: 0, end: 50, offset: 100 }, false)).toEqual([]);
  });

  it('wraps round on a loop', () => {
    const w = trimWindows({ start: 0, end: 50, offset: 80 }, true);
    expect(w).toHaveLength(2);
    expect(w[0][0]).toBeCloseTo(0.8);
    expect(w[0][1]).toBe(1);
    expect(w[1][0]).toBe(0);
    expect(w[1][1]).toBeCloseTo(0.3);
    // A whole turn is no move at all.
    const turn = trimWindows({ start: 0, end: 50, offset: 100 }, true);
    expect(turn).toHaveLength(1);
    expect(turn[0][0]).toBeCloseTo(0);
    expect(turn[0][1]).toBeCloseTo(0.5);
  });
});

describe('trimming outlines', () => {
  it('hands back the same paths when nothing is hidden', () => {
    const p = [line()];
    expect(trimSubPaths(p, undefined)).toBe(p);
    expect(trimSubPaths(p, { start: 0, end: 100, offset: 0 })).toBe(p);
  });

  it('cuts a straight line to the window', () => {
    const [a] = trimSubPaths([line()], makeTrim(25, 75));
    expect(a.closed).toBe(false);
    expect(a.points).toEqual([{ x: 25, y: 0 }, { x: 75, y: 0 }]);
  });

  it('shows nothing at End 0%', () => {
    expect(trimSubPaths([line()], makeTrim(0, 0))).toEqual([]);
  });

  it('cuts a curve exactly, as a shorter curve that ends in the right place and measures right', () => {
    const c = curve();
    const full = outlineLength([c]);
    const [half] = trimSubPaths([c], makeTrim(0, 50));
    expect(half.points).toHaveLength(2);
    expect(half.points[1].c1).toBeDefined();
    expect(outlineLength([half])).toBeCloseTo(full / 2, 0);
    // The cut end sits on the original curve: halfway along a symmetric curve is its middle, x = 50.
    expect(half.points[1].x).toBeCloseTo(50, 0);
  });

  it('opens a closed outline when it is trimmed, and keeps it closed when it is not', () => {
    const [q] = trimSubPaths([square()], makeTrim(0, 50));
    expect(q.closed).toBe(false);
    expect(outlineLength([q])).toBeCloseTo(200, 3);
    expect(q.points.at(-1)).toMatchObject({ x: 100, y: 100 });
    const same = trimSubPaths([square()], makeTrim(0, 100, 30));
    expect(same).toEqual([square()]);
  });

  it('wraps a window past the end of a loop into one piece', () => {
    const out = trimSubPaths([square()], makeTrim(0, 50, 80));
    expect(out).toHaveLength(1);
    expect(outlineLength(out)).toBeCloseTo(200, 3);
    // It starts 80% round (320 along: the left side, 20 up from the bottom corner) and carries on over the start.
    expect(out[0].points[0].x).toBeCloseTo(0, 3);
    expect(out[0].points[0].y).toBeCloseTo(80, 3);
  });

  it('trims several outlines together by default, each by the same amount', () => {
    const out = trimSubPaths([line(100), line(200)], makeTrim(0, 50));
    expect(out.map((p) => outlineLength([p]))).toEqual([50, 100]);
  });

  it('treats several outlines as one long line when asked, in order', () => {
    const out = trimSubPaths([line(100), line(200)], makeTrim(0, 50, 0, 'inOrder'));
    // 150 of 300 shows: the whole first line and half of the second.
    expect(out.map((p) => Math.round(outlineLength([p])))).toEqual([100, 50]);
    const late = trimSubPaths([line(100), line(200)], makeTrim(0, 25, 0, 'inOrder'));
    expect(late.map((p) => Math.round(outlineLength([p])))).toEqual([75]);
  });

  it('ignores a single outline asked to go in order', () => {
    const [a] = trimSubPaths([line()], makeTrim(0, 40, 0, 'inOrder'));
    expect(outlineLength([a])).toBeCloseTo(40);
  });
});

describe('trimming a brush line', () => {
  const pts: StrokePoint[] = [
    { x: 0, y: 0, p: 0 },
    { x: 100, y: 0, p: 1 },
    { x: 100, y: 100, p: 1 },
  ];

  it('is the very same points when nothing is hidden', () => {
    expect(trimStrokePoints(pts, undefined)!.points).toBe(pts);
  });

  it('cuts at a length, working out the pressure between points', () => {
    const t = trimStrokePoints(pts, makeTrim(0, 25))!;
    expect(t.cutEnd).toBe(true);
    expect(t.cutStart).toBe(false);
    expect(t.points.at(-1)).toMatchObject({ x: 50, y: 0 });
    expect(t.points.at(-1)!.p).toBeCloseTo(0.5);
    expect(pointsLength(t.points)).toBeCloseTo(50);
  });

  it('keeps the points inside the window and cuts both ends', () => {
    const t = trimStrokePoints(pts, makeTrim(25, 75))!;
    expect(t.cutStart && t.cutEnd).toBe(true);
    expect(t.points[0]).toMatchObject({ x: 50, y: 0 });
    expect(t.points).toHaveLength(3);
    expect(t.points[1]).toMatchObject({ x: 100, y: 0 });
    expect(t.points[2]).toMatchObject({ x: 100, y: 50 });
  });

  it('is nothing when the window is empty, and never wraps', () => {
    expect(trimStrokePoints(pts, makeTrim(0, 0))).toBeNull();
    expect(trimStrokePoints(pts, makeTrim(0, 100, 100))).toBeNull();
    const slid = trimStrokePoints(pts, makeTrim(0, 50, 25))!;
    expect(slid.points[0]).toMatchObject({ x: 50, y: 0 });
    expect(slid.points.at(-1)).toMatchObject({ x: 100, y: 50 });
  });

  it('keeps a dot whole', () => {
    const dot: StrokePoint[] = [{ x: 5, y: 5, p: 0.5 }];
    expect(trimStrokePoints(dot, makeTrim(0, 60))!.points).toBe(dot);
  });
});
