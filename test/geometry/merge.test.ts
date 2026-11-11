import { describe, expect, it } from 'vitest';
import type { FillShape, Shape } from '../../src/core/format';
import { cutOut, eraseArea, explode, geomArea, lineArea, mergeShapes, placeMoved, polygonGeom, shapeParts, sweepGeom } from '../../src/geometry/merge';
import { pointInPaths } from '../../src/geometry/hit';
import { transformShape, translate } from '../../src/canvas/geometry';
import { rectPath, stroke } from './helpers';

const red = '#ff0000';
const blue = '#0000ff';

const sq = (x: number, y: number, w: number, h: number, fill: string, id?: string) => ({ ...rectPath(x, y, w, h, { fill, stroke: null }), ...(id ? { id } : {}) });
const area = (s: Shape) => shapeParts(s).reduce((a, p) => a + geomArea(p.geom), 0);
const total = (shapes: Shape[], color?: string) => shapes.filter((s) => !color || (s as FillShape).color === color).reduce((a, s) => a + area(s), 0);
const colorAt = (shapes: Shape[], x: number, y: number) => {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i] as FillShape;
    if (s.type === 'fill' && pointInPaths(s.paths, x, y)) return s.color;
  }
  return null;
};

describe('merge drawing geometry', () => {
  it('turns a filled rectangle into one fill of the same area', () => {
    const r = mergeShapes([], [sq(0, 0, 100, 50, red)]);
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0].type).toBe('fill');
    expect(total(r.shapes)).toBeCloseTo(5000, 0);
    expect(r.added).toEqual([r.shapes[0].id]);
  });

  it('joins the same colour into one shape', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, red)]).shapes;
    const r = mergeShapes(a, [sq(50, 50, 100, 100, red)]);
    expect(r.shapes).toHaveLength(1);
    expect(total(r.shapes)).toBeCloseTo(20000 - 2500, 0);
  });

  it('keeps the same colour apart when it does not touch', () => {
    const a = mergeShapes([], [sq(0, 0, 10, 10, red)]).shapes;
    const r = mergeShapes(a, [sq(50, 50, 10, 10, red)]);
    expect(r.shapes).toHaveLength(2);
    expect(r.shapes[0]).toBe(a[0]);
  });

  it('cuts a different colour underneath', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, red)]).shapes;
    const r = mergeShapes(a, [sq(50, 50, 100, 100, blue)]);
    expect(total(r.shapes, red)).toBeCloseTo(7500, 0);
    expect(total(r.shapes, blue)).toBeCloseTo(10000, 0);
    // The red keeps its id, so a selection holds on.
    expect(r.shapes.find((s) => (s as FillShape).color === red)!.id).toBe(a[0].id);
    expect(colorAt(r.shapes, 75, 75)).toBe(blue);
    expect(colorAt(r.shapes, 25, 25)).toBe(red);
  });

  it('punches a hole when the new paint sits inside', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, red)]).shapes;
    const r = mergeShapes(a, [sq(40, 40, 20, 20, blue)]);
    const redShape = r.shapes.find((s) => (s as FillShape).color === red) as FillShape;
    expect(redShape.paths).toHaveLength(2);
    expect(area(redShape)).toBeCloseTo(9600, 0);
    // Even-odd: the middle of the hole is not red.
    expect(pointInPaths(redShape.paths, 50, 50)).toBe(false);
    expect(pointInPaths(redShape.paths, 10, 10)).toBe(true);
  });

  it('splits a fill in two when a line is drawn right across it', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, red)]).shapes;
    const r = mergeShapes(a, [stroke([[50, -20], [50, 120]], 6, '#000000')]);
    const reds = r.shapes.filter((s) => (s as FillShape).color === red);
    expect(reds).toHaveLength(2);
    expect(r.shapes.filter((s) => (s as FillShape).color === '#000000')).toHaveLength(1);
    for (const s of reds) expect(area(s)).toBeGreaterThan(4000);
  });

  it('paints underneath with the bucket: only empty ground, and joins its colour', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, blue)]).shapes;
    const r = mergeShapes(a, [sq(50, 0, 100, 100, red)], { under: true });
    expect(total(r.shapes, blue)).toBeCloseTo(10000, 0);
    expect(total(r.shapes, red)).toBeCloseTo(5000, 0);
    expect(colorAt(r.shapes, 75, 50)).toBe(blue);
  });

  it('leaves grouped shapes alone', () => {
    const grouped = { ...sq(0, 0, 100, 100, red), group: 'g1' };
    const r = mergeShapes([grouped], [sq(50, 50, 100, 100, blue)]);
    expect(r.shapes[0]).toBe(grouped);
    expect(r.shapes).toHaveLength(2);
  });

  it('a path with a different outline colour cuts its own fill', () => {
    const p = rectPath(0, 0, 100, 100, { fill: red, stroke: { color: blue, width: 10, join: 'miter', cap: 'butt' } });
    const fills = explode(p);
    expect(fills).toHaveLength(2);
    expect(fills[0].id).toBe(p.id);
    // The outline is 10 wide, centred on the edge: 5 inside, 5 outside, square corners.
    expect(total(fills, blue)).toBeCloseTo(110 * 110 - 90 * 90, -1);
    expect(total(fills, red)).toBeCloseTo(90 * 90, -1);
  });

  it('line area covers a straight line with round ends', () => {
    const g = lineArea(
      [
        [0, 0],
        [100, 0],
      ],
      false,
      10,
      'round',
      'round',
    );
    expect(geomArea(g)).toBeGreaterThan(1000 + 70);
    expect(geomArea(g)).toBeLessThan(1000 + 80);
  });

  it('erases the area under the eraser and nothing else', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, red), sq(200, 0, 50, 50, blue)]).shapes;
    const e = eraseArea(a, polygonGeom([{ x: -10, y: 40 }, { x: 110, y: 40 }, { x: 110, y: 60 }, { x: -10, y: 60 }]));
    expect(e.changed).toBe(true);
    expect(e.shapes.filter((s) => (s as FillShape).color === red)).toHaveLength(2);
    expect(total(e.shapes, red)).toBeCloseTo(8000, 0);
    expect(total(e.shapes, blue)).toBeCloseTo(2500, 0);
    expect(eraseArea(a, sweepGeom({ x: 500, y: 500 }, { x: 510, y: 500 }, 5)).changed).toBe(false);
  });

  it('cuts out a selected part, and moving it leaves a hole', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, red)]).shapes;
    const box = polygonGeom([{ x: 50, y: -10 }, { x: 150, y: -10 }, { x: 150, y: 110 }, { x: 50, y: 110 }]);
    const cut = cutOut(a, new Set([a[0].id]), box);
    expect(cut.shapes).toHaveLength(2);
    expect(cut.lifted).toHaveLength(1);
    const moved = cut.shapes.filter((s) => cut.lifted.includes(s.id)).map((s) => transformShape(s, translate(200, 0)));
    const placed = placeMoved(cut.shapes, moved);
    expect(total(placed.shapes, red)).toBeCloseTo(10000, 0);
    expect(colorAt(placed.shapes, 75, 50)).toBe(null);
    expect(colorAt(placed.shapes, 275, 50)).toBe(red);
    expect(placed.added).toHaveLength(1);
  });

  it('moving onto another colour cuts it', () => {
    const a = mergeShapes([], [sq(0, 0, 100, 100, red), sq(300, 0, 100, 100, blue)]).shapes;
    const blueShape = a.find((s) => (s as FillShape).color === blue)!;
    const r = placeMoved(a, [transformShape(blueShape, translate(-250, 0))]);
    expect(total(r.shapes, red)).toBeCloseTo(5000, 0);
    expect(colorAt(r.shapes, 75, 50)).toBe(blue);
  });

  it('merges dozens of overlapping strokes quickly', () => {
    let shapes: Shape[] = [];
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const strokes: Shape[] = [];
    for (let i = 0; i < 40; i++) {
      const pts: [number, number][] = [];
      let x = rnd() * 400;
      let y = rnd() * 300;
      for (let k = 0; k < 25; k++) pts.push([(x += (rnd() - 0.5) * 30), (y += (rnd() - 0.5) * 30)]);
      strokes.push(stroke(pts, 4 + rnd() * 12, rnd() < 0.5 ? red : blue));
    }
    // A filled drawing first, then time adding one more stroke to it: what each brush stroke costs.
    for (const st of strokes) shapes = mergeShapes(shapes, [st]).shapes;
    const t0 = performance.now();
    mergeShapes(shapes, [stroke([[0, 150], [400, 150]], 10, red)]);
    const ms = performance.now() - t0;
    // Lenient: well under a frame budget on a normal machine, but CI boxes can be slow.
    expect(ms).toBeLessThan(250);
    expect(shapes.every((x) => x.type === 'fill')).toBe(true);
  });
});
