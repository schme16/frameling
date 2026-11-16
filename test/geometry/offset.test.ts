import { describe, expect, it } from 'vitest';
import type { PathShape, SubPath } from '../../src/core/format';
import { areaOfPaths, geomArea, geomBox } from '../../src/geometry/merge';
import { offsetGeom, offsetPaths, offsetShapes } from '../../src/geometry/offset';

const box = (x: number, y: number, w: number, h: number): SubPath => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const ring = (cx: number, cy: number, r: number): SubPath => ({
  closed: true,
  points: Array.from({ length: 64 }, (_, i) => ({ x: cx + r * Math.cos((i / 64) * Math.PI * 2), y: cy + r * Math.sin((i / 64) * Math.PI * 2) })),
});
const shape = (id: string, paths: SubPath[], extra: Partial<PathShape> = {}): PathShape => ({ id, type: 'path', paths, fill: '#e0685e', stroke: null, opacity: 1, ...extra });
const area = (paths: SubPath[]) => geomArea(areaOfPaths(paths));

describe('offsetGeom', () => {
  const square = areaOfPaths([box(0, 0, 100, 100)]);

  it('grows a square by the distance on every side', () => {
    const g = offsetGeom(square, 10, 'sharp')!;
    const b = geomBox(g)!;
    expect(b.x0).toBeCloseTo(-10, 1);
    expect(b.y1).toBeCloseTo(110, 1);
    expect(geomArea(g)).toBeCloseTo(120 * 120, -1);
  });

  it('rounds the corners when growing, so a little area is missing from the sharp answer', () => {
    const round = geomArea(offsetGeom(square, 10, 'round')!);
    // 100x100 plus four strips plus a quarter disc per corner.
    expect(round).toBeCloseTo(100 * 100 + 4 * 100 * 10 + Math.PI * 100, -2);
    expect(round).toBeLessThan(120 * 120);
  });

  it('shrinks a square by the distance on every side', () => {
    const g = offsetGeom(square, -10, 'round')!;
    expect(geomArea(g)).toBeCloseTo(80 * 80, -1);
    const b = geomBox(g)!;
    expect(b.x0).toBeCloseTo(10, 1);
    expect(b.x1).toBeCloseTo(90, 1);
  });

  it('shrinks a circle to a smaller circle', () => {
    const c = areaOfPaths([ring(0, 0, 50)]);
    expect(geomArea(offsetGeom(c, -10)!)).toBeCloseTo(Math.PI * 40 * 40, -2);
    expect(geomArea(offsetGeom(c, 10)!)).toBeCloseTo(Math.PI * 60 * 60, -2);
  });

  it('leaves nothing when a shape shrinks past its middle', () => {
    expect(geomArea(offsetGeom(square, -60)!)).toBe(0);
  });

  it('grows the edge of a hole inwards (the hole gets smaller) and shrinks it the other way', () => {
    const donut = areaOfPaths([box(0, 0, 100, 100), box(30, 30, 40, 40)]);
    expect(geomArea(offsetGeom(donut, 5, 'sharp')!)).toBeCloseTo(110 * 110 - 30 * 30, -1);
    expect(geomArea(offsetGeom(donut, -5, 'sharp')!)).toBeCloseTo(90 * 90 - 50 * 50, -1);
  });

  it('changes nothing for a distance of nothing', () => {
    expect(offsetGeom(square, 0)).toBe(square);
  });
});

describe('offsetPaths', () => {
  it('works on a filled shape and gives curves it can draw', () => {
    const p = offsetPaths(shape('a', [ring(50, 50, 40)]), 8)!;
    expect(p.length).toBe(1);
    expect(area(p)).toBeCloseTo(Math.PI * 48 * 48, -2);
  });

  it('works on an outline with no fill, by its inside', () => {
    const s = shape('a', [box(0, 0, 100, 100)], { fill: null, stroke: { color: '#000', width: 2, join: 'miter', cap: 'butt' } });
    expect(area(offsetPaths(s, 10, 'sharp')!)).toBeCloseTo(120 * 120, -1);
  });

  it('works on an open line by the strip it draws', () => {
    const s = shape('a', [{ closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }], { fill: null, stroke: { color: '#000', width: 10, join: 'round', cap: 'butt' } });
    // A strip 100 by 10, grown by 5 each way: 110 by 20 with round ends.
    expect(area(offsetPaths(s, 5, 'sharp')!)).toBeGreaterThan(100 * 19);
  });

  it('is null when the shape shrinks away', () => {
    expect(offsetPaths(shape('a', [box(0, 0, 20, 20)]), -15)).toBeNull();
  });

  it('is null for a shape with nothing to offset', () => {
    expect(offsetPaths({ id: 't', type: 'text' } as never, 5)).toBeNull();
  });
});

describe('offsetShapes', () => {
  const a = shape('a', [ring(50, 50, 30)]);
  const b = shape('b', [box(200, 0, 40, 40)], { fill: '#4a7cf0' });

  it('keeps the original and puts a copy behind it when growing', () => {
    const r = offsetShapes([a, b], new Set(['a']), 6);
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.shapes.length).toBe(3);
    expect(r.shapes[1]).toBe(a);
    expect(r.shapes[0].id).not.toBe('a');
    expect(r.ids).toEqual([r.shapes[0].id]);
    expect((r.shapes[0] as PathShape).fill).toBe('#e0685e');
    expect(r.shapes[2]).toBe(b);
  });

  it('puts the copy in front of the original when shrinking', () => {
    const r = offsetShapes([a], new Set(['a']), -6);
    if (typeof r === 'string') throw new Error(r);
    expect(r.shapes[0]).toBe(a);
    expect(r.shapes[1].id).not.toBe('a');
  });

  it('replaces the shape and keeps its id when asked to', () => {
    const r = offsetShapes([a, b], new Set(['a']), 6, 'round', 'replace');
    if (typeof r === 'string') throw new Error(r);
    expect(r.shapes.length).toBe(2);
    expect(r.shapes[0].id).toBe('a');
    expect(r.shapes[0]).not.toBe(a);
  });

  it('does every picked shape, and counts the ones that shrank away', () => {
    const tiny = shape('t', [box(0, 0, 8, 8)]);
    const r = offsetShapes([a, tiny], new Set(['a', 't']), -5);
    if (typeof r === 'string') throw new Error(r);
    expect(r.made).toBe(1);
    expect(r.gone).toBe(1);
    expect(r.shapes.length).toBe(3);
  });

  it('says so when nothing was made', () => {
    expect(offsetShapes([shape('t', [box(0, 0, 8, 8)])], new Set(['t']), -5)).toBe('gone');
    expect(offsetShapes([a], new Set(), 5)).toBe('none');
    expect(offsetShapes([{ id: 'x', type: 'text' } as never], new Set(['x']), 5)).toBe('none');
  });
});
