import { describe, expect, it } from 'vitest';
import type { PathShape, Shape } from '../../src/core/format';
import { combineShapes, coverOf, geomToSubPaths, looksDiffer, ringToSubPath } from '../../src/geometry/boolean';
import { geomArea } from '../../src/geometry/merge';
import { pointInPaths } from '../../src/geometry/hit';
import { sampleSubPath } from '../../src/geometry/bezier';
import { ellipseSubPath, lineSubPath, rectSubPath } from '../../src/tools/shapes';
import { stroke } from './helpers';

const box = (id: string, x: number, y: number, w: number, h: number, fill: string | null, extra: Partial<PathShape> = {}): PathShape => ({
  id,
  type: 'path',
  paths: [rectSubPath({ x, y, w, h })],
  fill,
  stroke: null,
  opacity: 1,
  ...extra,
});
const disc = (id: string, cx: number, cy: number, r: number, fill: string, extra: Partial<PathShape> = {}): PathShape => ({
  id,
  type: 'path',
  paths: [ellipseSubPath({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 })],
  fill,
  stroke: null,
  opacity: 1,
  ...extra,
});
const ids = (...s: Shape[]) => new Set(s.map((x) => x.id));
const done = (r: ReturnType<typeof combineShapes>) => {
  if (typeof r === 'string') throw new Error(`problem: ${r}`);
  return r;
};
const areaOf = (s: Shape) => geomArea(coverOf(s));
const inside = (s: Shape, x: number, y: number) => (s as PathShape).paths && pointInPaths((s as PathShape).paths, x, y);

describe('combining shapes', () => {
  const a = box('a', 0, 0, 100, 100, '#ff0000');
  const b = box('b', 50, 50, 100, 100, '#0000ff');

  it('Join makes one shape the size of both together, in the bottom shape\'s colour', () => {
    const r = done(combineShapes([a, b], ids(a, b), 'join'));
    expect(r.shapes).toHaveLength(1);
    const s = r.shapes[0] as PathShape;
    expect(s.type).toBe('path');
    expect(s.id).toBe('a');
    expect(s.fill).toBe('#ff0000');
    expect(areaOf(s)).toBeCloseTo(20000 - 2500, -1);
    expect(r.ids).toEqual(['a']);
  });

  it('Join can wear the top shape\'s colour instead', () => {
    const r = done(combineShapes([a, b], ids(a, b), 'join', 'top'));
    expect((r.shapes[0] as PathShape).fill).toBe('#0000ff');
    expect(r.shapes[0].id).toBe('b');
  });

  it('Cut out: the top shape punches the one below and goes; the one below keeps its colour', () => {
    const r = done(combineShapes([a, b], ids(a, b), 'cut'));
    expect(r.shapes).toHaveLength(1);
    const s = r.shapes[0] as PathShape;
    expect(s.id).toBe('a');
    expect(s.fill).toBe('#ff0000');
    expect(areaOf(s)).toBeCloseTo(10000 - 2500, -1);
    expect(inside(s, 75, 75)).toBe(false);
    expect(inside(s, 10, 10)).toBe(true);
  });

  it('Cut out with three shapes cuts each one under it and keeps every colour', () => {
    const c = box('c', 0, 0, 100, 20, '#00ff00');
    const cutter = box('k', 30, 0, 20, 200, '#000000');
    const r = done(combineShapes([a, c, cutter], ids(a, c, cutter), 'cut'));
    expect(r.shapes.map((s) => s.id).sort()).toEqual(['a', 'c']);
    expect((r.shapes.find((s) => s.id === 'c') as PathShape).fill).toBe('#00ff00');
    expect(areaOf(r.shapes.find((s) => s.id === 'a')!)).toBeCloseTo(8000, -1);
  });

  it('Cut out leaves a shape the cutter misses exactly as it was', () => {
    const far = box('far', 300, 300, 20, 20, '#00ff00');
    const r = done(combineShapes([far, a, b], ids(far, a, b), 'cut'));
    expect(r.shapes.find((s) => s.id === 'far')).toBe(far);
  });

  it('Keep the overlap leaves just where they cross', () => {
    const r = done(combineShapes([a, b], ids(a, b), 'overlap'));
    const s = r.shapes[0] as PathShape;
    expect(areaOf(s)).toBeCloseTo(2500, -1);
    expect(inside(s, 75, 75)).toBe(true);
    expect(inside(s, 10, 10)).toBe(false);
  });

  it('Punch a hole keeps everything but where they cross', () => {
    const r = done(combineShapes([a, b], ids(a, b), 'punch'));
    const s = r.shapes[0] as PathShape;
    expect(areaOf(s)).toBeCloseTo(20000 - 2 * 2500, -1);
    expect(inside(s, 75, 75)).toBe(false);
    expect(inside(s, 10, 10)).toBe(true);
    expect(inside(s, 140, 140)).toBe(true);
  });

  it('says so when shapes that must overlap do not', () => {
    const far = box('far', 300, 300, 20, 20, '#00ff00');
    expect(combineShapes([a, far], ids(a, far), 'overlap')).toBe('apart');
    expect(combineShapes([a, far], ids(a, far), 'cut')).toBe('apart');
  });

  it('needs two shapes that can be combined', () => {
    expect(combineShapes([a], ids(a), 'join')).toBe('few');
    const text = { id: 't', type: 'text' } as unknown as Shape;
    expect(combineShapes([a, text], ids(a, text), 'join')).toBe('few');
  });

  it('leaves unselected shapes and symbols where they were, and counts what it skipped', () => {
    const other = box('o', 500, 500, 10, 10, '#123456');
    const inst = { id: 'i', type: 'instance' } as unknown as Shape;
    const r = done(combineShapes([other, a, inst, b], ids(a, b, inst), 'join'));
    expect(r.shapes.map((s) => s.id)).toEqual(['o', 'a', 'i']);
    expect(r.skipped).toBe(1);
    expect(r.used).toBe(2);
  });

  it('keeps the bottom shape\'s outline, gradient and see-through', () => {
    const grad = { kind: 'linear' as const, stops: [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }], from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const styled = box('s', 0, 0, 100, 100, '#ff0000', { stroke: { color: '#222222', width: 6, join: 'miter', cap: 'butt' }, opacity: 0.5, fillGradient: grad });
    const r = done(combineShapes([styled, b], ids(styled, b), 'join'));
    const s = r.shapes[0] as PathShape;
    expect(s.stroke).toEqual({ color: '#222222', width: 6, join: 'miter', cap: 'butt' });
    expect(s.opacity).toBe(0.5);
    expect(s.fillGradient).toEqual(grad);
  });

  it('turns a brush line into a plain filled shape in its colour', () => {
    const line = stroke([[0, 0], [100, 0]], 20, '#00aa00');
    const r = done(combineShapes([line, b], ids(line, b), 'join'));
    const s = r.shapes[0] as PathShape;
    expect(s.type).toBe('path');
    expect(s.fill).toBe('#00aa00');
    expect(s.stroke).toBeNull();
  });

  it('an open line with an outline becomes the strip it drew, filled in the line\'s colour', () => {
    const line: PathShape = { id: 'l', type: 'path', paths: [lineSubPath({ x: 0, y: 25 }, { x: 100, y: 25 })], fill: null, stroke: { color: '#ff00ff', width: 10, join: 'round', cap: 'butt' }, opacity: 1 };
    expect(areaOf(line)).toBeCloseTo(1000, -1);
    const r = done(combineShapes([line, b], ids(line, b), 'join'));
    const s = r.shapes[0] as PathShape;
    expect(s.fill).toBe('#ff00ff');
    expect(s.stroke).toBeNull();
  });

  it('a group counts as one shape, and the result leaves the group', () => {
    const g1 = { ...box('g1', 0, 0, 50, 50, '#ff0000'), group: 'G' };
    const g2 = { ...box('g2', 50, 0, 50, 50, '#00ff00'), group: 'G' };
    const c = box('c', 25, 25, 100, 100, '#0000ff');
    const r = done(combineShapes([g1, g2, c], ids(g1, g2, c), 'join'));
    expect(r.shapes).toHaveLength(1);
    expect((r.shapes[0] as PathShape).group).toBeUndefined();
    expect((r.shapes[0] as PathShape).fill).toBe('#ff0000');
  });

  it('Cut out through a group cuts each member and keeps the colours', () => {
    const g1 = { ...box('g1', 0, 0, 50, 50, '#ff0000'), group: 'G' };
    const g2 = { ...box('g2', 50, 0, 50, 50, '#00ff00'), group: 'G' };
    const c = box('c', 25, 0, 50, 50, '#0000ff');
    const r = done(combineShapes([g1, g2, c], ids(g1, g2, c), 'cut'));
    expect(r.shapes.map((s) => (s as PathShape).fill)).toEqual(['#ff0000', '#00ff00']);
    expect(r.shapes.every((s) => !s.group)).toBe(true);
  });

  it('reports whether the looks differ, so the choice is only asked when it matters', () => {
    expect(looksDiffer([a, b], ids(a, b))).toBe(true);
    const a2 = box('a2', 5, 5, 10, 10, '#ff0000');
    expect(looksDiffer([a, a2], ids(a, a2))).toBe(false);
  });

  it('result is one shape holding every piece, with holes as extra subpaths', () => {
    const ring = box('big', 0, 0, 100, 100, '#ff0000');
    const hole = box('hole', 25, 25, 50, 50, '#0000ff');
    const r = done(combineShapes([ring, hole], ids(ring, hole), 'punch'));
    const s = r.shapes[0] as PathShape;
    expect(s.paths).toHaveLength(2);
    expect(inside(s, 50, 50)).toBe(false);
    expect(inside(s, 10, 10)).toBe(true);
  });

  it('keeps a crescent smooth: two circles cut out need few points and stay within a hair of true', () => {
    const big = disc('big', 100, 100, 60, '#ffcc00');
    const bite = disc('bite', 130, 100, 50, '#ffffff');
    const r = done(combineShapes([big, bite], ids(big, bite), 'cut'));
    const s = r.shapes[0] as PathShape;
    const pts = s.paths[0].points.length;
    expect(pts).toBeLessThan(40);
    expect(pts).toBeGreaterThanOrEqual(2);
    // Every sampled point on the new outline lies on one of the two circles.
    for (const p of sampleSubPath(s.paths[0], 24)) {
      const d1 = Math.abs(Math.hypot(p.x - 100, p.y - 100) - 60);
      const d2 = Math.abs(Math.hypot(p.x - 130, p.y - 100) - 50);
      expect(Math.min(d1, d2)).toBeLessThan(0.6);
    }
    // The area matches the maths: the lens between the circles is gone.
    const exact = Math.PI * 60 * 60 - lens(60, 50, 30);
    expect(areaOf(s)).toBeGreaterThan(exact * 0.99);
    expect(areaOf(s)).toBeLessThan(exact * 1.01);
  });
});

describe('ringToSubPath', () => {
  it('keeps a rectangle as four straight sides with no curves', () => {
    const sp = ringToSubPath([[0, 0], [80, 0], [80, 40], [0, 40], [0, 0]])!;
    expect(sp.points).toHaveLength(4);
    expect(sp.points.every((p) => !p.c1 && !p.c2)).toBe(true);
    expect(sp.closed).toBe(true);
  });

  it('fits a finely flattened circle with a handful of curves', () => {
    const ring: [number, number][] = [];
    for (let i = 0; i < 200; i++) ring.push([100 + 50 * Math.cos((i / 200) * Math.PI * 2), 100 + 50 * Math.sin((i / 200) * Math.PI * 2)]);
    const sp = ringToSubPath(ring)!;
    expect(sp.points.length).toBeLessThan(12);
    expect(sp.points.some((p) => p.c1)).toBe(true);
    for (const p of sampleSubPath(sp, 20)) expect(Math.abs(Math.hypot(p.x - 100, p.y - 100) - 50)).toBeLessThan(0.3);
  });

  it('returns nothing for a ring too small to be a shape', () => {
    expect(ringToSubPath([[0, 0], [1, 1]])).toBeNull();
    expect(geomToSubPaths([[[[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2], [0, 0]]]])).toEqual([]);
  });
});

/** Area of the overlap of two circles (radii r1, r2) whose centres are d apart. */
function lens(r1: number, r2: number, d: number): number {
  const a = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return r1 * r1 * a + r2 * r2 * b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
}
