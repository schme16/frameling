import { beforeEach, describe, expect, it } from 'vitest';
import type { Doc, PathShape, Repeat, Shape, StrokeShape } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { poseAt, poseLive } from '../../src/core/symbols';
import { withRepeats } from '../../src/core/repeats';
import { loadFile, saveFile } from '../../src/io/file';
import { shapeBounds, shapeExtent, shapesExtent } from '../../src/canvas/geometry';
import { addVectorLayer, hold, stroke, vectorDrawing } from '../../src/templates/build';
import { box } from '../tools/helpers';
import '../../src/core/render';

const grid: Repeat = { kind: 'grid', cols: 3, rows: 2, dx: 100, dy: 80 };

function docWith(...shapes: Shape[]): Doc {
  const doc = newDoc({ width: 800, height: 600, length: 4, fps: 12 });
  const layer = addVectorLayer(doc, 'Art');
  doc.layers = [layer];
  const d = vectorDrawing(doc, shapes as PathShape[]);
  hold(layer, d.id, 0, 4);
  return doc;
}

const posed = (doc: Doc): Shape[] => {
  const d = poseAt(doc, doc.layers[0], 0);
  if (d?.kind !== 'vector') throw new Error('vector');
  return d.shapes;
};

const x0 = (s: Shape) => shapeBounds(s).x;

describe('a repeat as it is drawn', () => {
  let r: PathShape;
  beforeEach(() => {
    r = { ...box('a', 10, 10, 40, 30), repeat: grid } as PathShape;
  });

  it('puts every copy right after the shape, so it sits at the same depth', () => {
    const under = box('under', 0, 0, 5, 5);
    const over = box('over', 0, 0, 5, 5);
    const shapes = posed(docWith(under, r, over));
    expect(shapes.map((s) => s.id)).toEqual(['under', 'a', 'a~r1', 'a~r2', 'a~r3', 'a~r4', 'a~r5', 'over']);
  });

  it('places the copies by the step: across first, then down', () => {
    const shapes = posed(docWith(r));
    expect(shapes.map(x0)).toEqual([10, 110, 210, 10, 110, 210]);
    expect(shapes.map((s) => shapeBounds(s).y)).toEqual([10, 10, 10, 90, 90, 90]);
  });

  it('makes copies that are plain shapes: no repeat, group or origin of their own', () => {
    const s = { ...r, group: 'g', origin: 'o' } as PathShape;
    const copies = posed(docWith(s)).slice(1);
    for (const c of copies) expect('repeat' in c || 'group' in c || 'origin' in c).toBe(false);
  });

  it('follows the original: change it and every copy changes', () => {
    const before = posed(docWith(r));
    const wider = { ...box('a', 10, 10, 90, 30), repeat: grid } as PathShape;
    const after = posed(docWith(wider));
    expect(shapeBounds(before[1]).w).toBe(40);
    expect(shapeBounds(after[1]).w).toBe(90);
  });

  it('leaves a drawing with no repeat as the very same object', () => {
    const doc = docWith(box('a', 0, 0, 10, 10));
    const d = doc.drawings[doc.layers[0].cels[0].drawingId];
    expect(withRepeats(d)).toBe(d);
  });

  it('works the copies out once for the same drawing, and again for the same shape in a new drawing', () => {
    const doc = docWith(r);
    expect(posed(doc)).toBe(posed(doc));
    const d = doc.drawings[doc.layers[0].cels[0].drawingId];
    if (d.kind !== 'vector') throw new Error('vector');
    const other = { ...d, shapes: [...d.shapes, box('b', 0, 0, 5, 5)] };
    const first = withRepeats(d);
    const second = withRepeats(other);
    expect(second).not.toBe(first);
    // The shape is the same object, so its copies are not made again.
    if (first.kind !== 'vector' || second.kind !== 'vector') throw new Error('vector');
    expect(second.shapes[1]).toBe(first.shapes[1]);
  });

  it('shows in the live drawing too, so a repeat does not vanish while you draw', () => {
    const doc = docWith(r);
    const d = doc.drawings[doc.layers[0].cels[0].drawingId];
    const live = poseLive(doc, doc.layers[0], 0, d);
    if (live.kind !== 'vector') throw new Error('vector');
    expect(live.shapes).toHaveLength(6);
  });

  it('is held to 400 shapes in all', () => {
    const big = { ...r, repeat: { kind: 'grid', cols: 100, rows: 100, dx: 1, dy: 1 } } as PathShape;
    expect(posed(docWith(big)).length).toBeLessThanOrEqual(400);
  });

  it('copies a brush line, and its width follows a mirror', () => {
    const s = { ...stroke([[0, 0], [50, 10]], '#000', 6), repeat: { kind: 'mirror', x: 100, y: 0 } } as StrokeShape;
    const shapes = posed(docWith(s));
    expect(shapes).toHaveLength(2);
    const [a, b] = shapes as StrokeShape[];
    expect(b.points[0].x).toBeCloseTo(200, 6);
    expect(b.points[b.points.length - 1].x).toBeCloseTo(150, 6);
    expect(b.brush.size).toBeCloseTo(a.brush.size, 6);
  });

  it('keeps an upright ring upright, and turns a following ring', () => {
    const follow = { ...box('a', 90, 0, 20, 20), repeat: { kind: 'ring', count: 4, cx: 100, cy: 100 } } as PathShape;
    const upright = { ...follow, repeat: { kind: 'ring', count: 4, cx: 100, cy: 100, turn: false } } as PathShape;
    const f = posed(docWith(follow))[1] as PathShape;
    const u = posed(docWith(upright))[1] as PathShape;
    // A quarter turn about (100,100): the box at the top moves to the right-hand side.
    expect(shapeBounds(f).x).toBeGreaterThan(150);
    expect(shapeBounds(u).x).toBeGreaterThan(150);
    // The turned box is now tall and thin the other way round only if it was not square; use the points to tell.
    const first = f.paths[0].points[0];
    const second = f.paths[0].points[1];
    expect(Math.abs(second.y - first.y)).toBeGreaterThan(10);
    const uFirst = u.paths[0].points[0];
    const uSecond = u.paths[0].points[1];
    expect(uSecond.y - uFirst.y).toBe(0);
  });

  it('turns grouped shapes round the ring as one, so they keep their places among each other', () => {
    const a = { ...box('a', 90, 0, 20, 20), group: 'g', repeat: { kind: 'ring', count: 2, cx: 100, cy: 100, turn: false } } as PathShape;
    const b = { ...box('b', 90, 30, 20, 20), group: 'g', repeat: { kind: 'ring', count: 2, cx: 100, cy: 100, turn: false } } as PathShape;
    const s = posed(docWith(a, b));
    const ids = s.map((x) => x.id);
    const ca = s[ids.indexOf('a~r1')];
    const cb = s[ids.indexOf('b~r1')];
    // The copies of a and b sit exactly as far apart as a and b do.
    expect(shapeBounds(cb).y - shapeBounds(ca).y).toBeCloseTo(30, 6);
    expect(shapeBounds(cb).x - shapeBounds(ca).x).toBeCloseTo(0, 6);
  });
});

describe('where a repeat reaches', () => {
  it('counts every copy in a shape’s extent, and only the shape in its own box', () => {
    const r = { ...box('a', 10, 10, 40, 30), repeat: grid } as PathShape;
    expect(shapeBounds(r)).toEqual({ x: 10, y: 10, w: 40, h: 30 });
    expect(shapeExtent(r)).toEqual({ x: 10, y: 10, w: 240, h: 110 });
    expect(shapesExtent([r, box('b', 500, 500, 10, 10)])).toEqual({ x: 10, y: 10, w: 500, h: 500 });
    const plain = box('p', 1, 2, 3, 4);
    expect(shapeExtent(plain)).toEqual(shapeBounds(plain));
  });
});

describe('in the file', () => {
  const roundTrip = (d: Doc) => loadFile(saveFile(d, 'test')).doc;
  const firstShapes = (d: Doc): Shape[] => {
    const dr = Object.values(d.drawings)[0];
    if (dr.kind !== 'vector') throw new Error('vector');
    return dr.shapes;
  };

  it('keeps the repeat through save and open, and the copies still come out', () => {
    const rep: Repeat = { kind: 'ring', count: 6, cx: 300, cy: 200, sweep: 180, turn: false };
    const doc = docWith({ ...box('a', 10, 10, 40, 30), repeat: rep } as PathShape, { ...box('m', 0, 0, 5, 5), repeat: { kind: 'mirror', x: 20, y: 0, angle: 30 } } as PathShape);
    const back = roundTrip(doc);
    const shapes = firstShapes(back) as (PathShape & { repeat?: Repeat })[];
    expect(shapes[0].repeat).toEqual(rep);
    expect(shapes[1].repeat).toEqual({ kind: 'mirror', x: 20, y: 0, angle: 30 });
    expect(posed(back)).toHaveLength(6 + 2);
  });

  it('opens an older file, with no repeat anywhere, exactly as it was', () => {
    const doc = docWith(box('a', 10, 10, 40, 30));
    const shapes = firstShapes(roundTrip(doc));
    expect(shapes).toHaveLength(1);
    expect('repeat' in shapes[0]).toBe(false);
  });

  it('drops a repeat it cannot read and keeps the shape', () => {
    const doc = docWith({ ...box('a', 10, 10, 40, 30), repeat: { kind: 'spiral', count: 'lots' } } as unknown as PathShape);
    const shapes = firstShapes(roundTrip(doc));
    expect(shapes).toHaveLength(1);
    expect('repeat' in shapes[0]).toBe(false);
  });

  it('puts sane numbers in a repeat with wild ones', () => {
    const doc = docWith({ ...box('a', 10, 10, 40, 30), repeat: { kind: 'grid', cols: 1e9, rows: 1e9, dx: 'x', dy: 5 } } as unknown as PathShape);
    const shapes = firstShapes(roundTrip(doc)) as (PathShape & { repeat?: Repeat })[];
    expect(shapes[0].repeat).toMatchObject({ kind: 'grid', dx: 0, dy: 5 });
    expect(posed(roundTrip(doc)).length).toBeLessThanOrEqual(400);
  });
});

describe('through an in-between', () => {
  it('keeps the repeat on a shape that melts into another, so its copies do not vanish', async () => {
    const { morphShapes } = await import('../../src/core/shape-tween');
    const a = { ...box('a', 10, 10, 40, 30), repeat: grid } as PathShape;
    const b = box('a', 20, 20, 40, 30);
    const from = { id: 'v1', kind: 'vector' as const, shapes: [a] };
    const to = { id: 'v2', kind: 'vector' as const, shapes: [b] };
    const mid = morphShapes(from, to, 0.5, [], (x) => x as never) as (PathShape & { repeat?: Repeat })[];
    expect(mid[0].repeat).toEqual(grid);
  });
});
