import { describe, expect, it } from 'vitest';
import type { PathShape, StrokeShape } from '../../src/core/format';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import {
  angleFromCentre,
  apply,
  cloneShape,
  flipMatrix,
  handlePoints,
  hitHandle,
  hitShape,
  matrixScale,
  multiply,
  pointInRings,
  rectsIntersect,
  rotateAbout,
  rotateMatrixForHandle,
  scaleAbout,
  scaleMatrixForHandle,
  shapeBounds,
  shapesBounds,
  topShapeAt,
  transformShape,
  translate,
} from '../../src/canvas/geometry';
import { ellipseSubPath, rectSubPath } from '../../src/tools/shapes';

const rect = (id: string, x: number, y: number, w: number, h: number, opts: Partial<PathShape> = {}): PathShape => ({
  id,
  type: 'path',
  paths: [rectSubPath({ x, y, w, h })],
  fill: null,
  stroke: { color: '#000', width: 2, join: 'miter', cap: 'butt' },
  opacity: 1,
  ...opts,
});

const stroke = (id: string, pts: [number, number][], size = 8): StrokeShape => ({
  id,
  type: 'stroke',
  points: pts.map(([x, y]) => ({ x, y, p: 0.5 })),
  brush: { ...DEFAULT_BRUSH, size },
  color: '#123456',
  opacity: 1,
});

describe('matrices', () => {
  it('composes right to left and applies', () => {
    const m = multiply(translate(10, 0), scaleAbout(2, 2, 0, 0));
    expect(apply(m, 3, 4)).toEqual({ x: 16, y: 8 });
  });

  it('rotates about a point', () => {
    const p = apply(rotateAbout(Math.PI / 2, 5, 5), 10, 5);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(10);
  });

  it('reports the average scale', () => {
    expect(matrixScale(scaleAbout(2, 3, 0, 0))).toBeCloseTo(Math.sqrt(6));
    expect(matrixScale(rotateAbout(1, 3, 3))).toBeCloseTo(1);
  });
});

describe('bounds', () => {
  it('covers a stroked rectangle including half its line width', () => {
    expect(shapeBounds(rect('a', 10, 20, 30, 40))).toEqual({ x: 9, y: 19, w: 32, h: 42 });
  });

  it('is tight on a filled shape with no stroke', () => {
    const s = rect('a', 10, 20, 30, 40, { stroke: null, fill: '#fff' });
    expect(shapeBounds(s)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it('follows the curves of an ellipse', () => {
    const s: PathShape = { ...rect('e', 0, 0, 1, 1), paths: [ellipseSubPath({ x: 0, y: 0, w: 100, h: 60 })], stroke: null, fill: '#000' };
    const b = shapeBounds(s);
    expect(b.x).toBeCloseTo(0, 0);
    expect(b.y).toBeCloseTo(0, 0);
    expect(b.w).toBeCloseTo(100, 0);
    expect(b.h).toBeCloseTo(60, 0);
  });

  it('wraps a brush stroke around its points', () => {
    const b = shapeBounds(stroke('s', [[10, 10], [50, 10]], 10));
    expect(b.x).toBeLessThan(10);
    expect(b.x).toBeGreaterThan(3);
    expect(b.x + b.w).toBeGreaterThan(50);
    expect(b.h).toBeGreaterThan(3);
    expect(b.h).toBeLessThan(14);
  });

  it('unions several shapes', () => {
    const u = shapesBounds([rect('a', 0, 0, 10, 10, { stroke: null, fill: '#000' }), rect('b', 20, 30, 10, 10, { stroke: null, fill: '#000' })])!;
    expect(u).toEqual({ x: 0, y: 0, w: 30, h: 40 });
    expect(shapesBounds([])).toBeNull();
  });

  it('knows when boxes touch', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

describe('hit testing', () => {
  it('hits the line of an unfilled rectangle but not its middle', () => {
    const s = rect('a', 0, 0, 100, 100);
    expect(hitShape(s, 0, 50, 0)).toBe(true);
    expect(hitShape(s, 50, 50, 5)).toBe(false);
  });

  it('hits the inside of a filled shape', () => {
    const s = rect('a', 0, 0, 100, 100, { fill: '#f00' });
    expect(hitShape(s, 50, 50, 0)).toBe(true);
    expect(hitShape(s, 150, 50, 0)).toBe(false);
  });

  it('forgives a near miss by the tolerance', () => {
    const s = rect('a', 0, 0, 100, 100);
    // The line is 2 wide, so its edge is 1 from the centre line.
    expect(hitShape(s, -4, 50, 2)).toBe(false);
    expect(hitShape(s, -4, 50, 3.5)).toBe(true);
  });

  it('hits a brush stroke on and just beside it', () => {
    const s = stroke('s', Array.from({ length: 21 }, (_, i) => [i * 5, 0] as [number, number]), 10);
    expect(hitShape(s, 50, 0, 0)).toBe(true);
    expect(hitShape(s, 50, 30, 3)).toBe(false);
    expect(hitShape(s, 50, 7, 4)).toBe(true);
    expect(hitShape(s, 50, 14, 4)).toBe(false);
  });

  it('respects holes in a fill', () => {
    const outer = rectSubPath({ x: 0, y: 0, w: 100, h: 100 });
    const hole = rectSubPath({ x: 30, y: 30, w: 40, h: 40 });
    expect(pointInRings([outer.points, hole.points], 10, 10)).toBe(true);
    expect(pointInRings([outer.points, hole.points], 50, 50)).toBe(false);
    const s = { id: 'f', type: 'fill' as const, paths: [outer, hole], color: '#000', opacity: 1 };
    expect(hitShape(s, 50, 50, 0)).toBe(false);
    expect(hitShape(s, 10, 50, 0)).toBe(true);
  });

  it('picks the topmost shape', () => {
    const a = rect('a', 0, 0, 100, 100, { fill: '#f00' });
    const b = rect('b', 20, 20, 100, 100, { fill: '#0f0' });
    expect(topShapeAt([a, b], 50, 50, 0)?.id).toBe('b');
    expect(topShapeAt([a, b], 5, 5, 0)?.id).toBe('a');
    expect(topShapeAt([a, b], 500, 500, 0)).toBeUndefined();
  });
});

describe('transforming shapes', () => {
  it('moves a path and leaves the original alone', () => {
    const s = rect('a', 0, 0, 10, 10);
    const t = transformShape(s, translate(5, 7));
    expect(t.id).toBe('a');
    expect(shapeBounds(t).x).toBeCloseTo(shapeBounds(s).x + 5);
    expect(shapeBounds(t).y).toBeCloseTo(shapeBounds(s).y + 7);
    expect(s.paths[0].points[0]).toEqual({ x: 0, y: 0 });
  });

  it('scales line width and brush size with the shape', () => {
    const t = transformShape(rect('a', 0, 0, 10, 10), scaleAbout(3, 3, 0, 0));
    expect(t.stroke!.width).toBeCloseTo(6);
    const st = transformShape(stroke('s', [[0, 0], [10, 0]], 8), scaleAbout(2, 2, 0, 0));
    expect(st.brush.size).toBeCloseTo(16);
    expect(st.points[1].x).toBeCloseTo(20);
    expect(st.points[0].p).toBe(0.5);
  });

  it('moves bezier handles with the points', () => {
    const e: PathShape = { ...rect('e', 0, 0, 1, 1), paths: [ellipseSubPath({ x: 0, y: 0, w: 10, h: 10 })] };
    const t = transformShape(e, translate(100, 0));
    expect(t.paths[0].points[1].c1!.x).toBeCloseTo(e.paths[0].points[1].c1!.x + 100);
  });

  it('flips about the middle of the selection', () => {
    const a = rect('a', 0, 0, 10, 10, { stroke: null, fill: '#000' });
    const b = rect('b', 30, 0, 10, 10, { stroke: null, fill: '#000' });
    const box = shapesBounds([a, b])!;
    const fa = transformShape(a, flipMatrix(box, 'h'));
    expect(shapeBounds(fa).x).toBeCloseTo(30);
    expect(shapesBounds([fa, transformShape(b, flipMatrix(box, 'h'))])).toEqual({ x: 0, y: 0, w: 40, h: 10 });
  });

  it('clones with a new id and no shared points', () => {
    const s = rect('a', 0, 0, 10, 10);
    const c = cloneShape(s, 'z');
    expect(c.id).toBe('z');
    expect(c.paths[0].points[0]).not.toBe(s.paths[0].points[0]);
    expect(c.paths[0].points[0]).toEqual(s.paths[0].points[0]);
  });
});

describe('selection handles', () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };

  it('finds corners with the same grab size at any zoom', () => {
    expect(hitHandle(box, 102, 103, 1)).toBe('nw');
    expect(hitHandle(box, 300, 200, 1)).toBe('se');
    expect(hitHandle(box, 150, 150, 1)).toBeNull();
    // Zoomed in 4x a miss of 1 document pixel is 4 screen pixels, still a hit; 3 document pixels is not.
    expect(hitHandle(box, 101, 100, 4)).toBe('nw');
    expect(hitHandle(box, 103, 100, 4)).toBeNull();
  });

  it('floats the rotate handle above the box', () => {
    const hp = handlePoints(box, 2);
    expect(hp.rotate.x).toBe(200);
    expect(hp.rotate.y).toBeLessThan(100);
    expect(hitHandle(box, hp.rotate.x, hp.rotate.y, 2)).toBe('rotate');
  });

  it('scales from the opposite corner, with and without proportions', () => {
    const m = scaleMatrixForHandle(box, 'se', 500, 200, false, false);
    expect(apply(m, 300, 200)).toEqual({ x: 500, y: 200 });
    expect(apply(m, 100, 100)).toEqual({ x: 100, y: 100 });
    const k = scaleMatrixForHandle(box, 'se', 500, 210, true, false);
    // Proportions kept: both axes use the bigger stretch (2x).
    expect(apply(k, 300, 200).x).toBeCloseTo(500);
    expect(apply(k, 300, 200).y).toBeCloseTo(300);
  });

  it('scales from the centre with Alt', () => {
    const m = scaleMatrixForHandle(box, 'se', 400, 250, false, true);
    expect(apply(m, 200, 150)).toEqual({ x: 200, y: 150 });
    expect(apply(m, 300, 200).x).toBeCloseTo(400);
  });

  it('turns about the centre, snapping if asked', () => {
    const start = angleFromCentre(box, 200, 0);
    const m = rotateMatrixForHandle(box, start, 300, 150, false);
    const p = apply(m, 200, 100);
    expect(p.x).toBeCloseTo(250);
    expect(p.y).toBeCloseTo(150);
    const snapped = rotateMatrixForHandle(box, start, 262, 38, true);
    // 15 degree steps: the matrix's angle is a multiple of 15 degrees.
    const ang = Math.atan2(snapped[1], snapped[0]);
    const steps = ang / (Math.PI / 12);
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
  });
});
