import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { Doc, FillShape, PathShape, ShapeHint, StrokeShape, SubPath, VectorDrawing } from '../../src/core/format';
import { fromSegs, matchOutlines, mixColors, morphShapes, resampleStroke, toSegs } from '../../src/core/shape-tween';
import { poseAt, tweenInstance } from '../../src/core/symbols';
import { DEFAULT_BRUSH } from '../../src/core/doc';

const ring = (pts: [number, number][]): SubPath => ({ closed: true, points: pts.map(([x, y]) => ({ x, y })) });
const square = (x: number, y: number, s: number): SubPath => ring([[x, y], [x + s, y], [x + s, y + s], [x, y + s]]);
function circle(cx: number, cy: number, r: number, n: number): SubPath {
  return ring(Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)] as [number, number]));
}
const fill = (id: string, paths: SubPath[], color = '#ff0000'): FillShape => ({ id, type: 'fill', paths, color, opacity: 1 });
const vd = (id: string, shapes: VectorDrawing['shapes']): VectorDrawing => ({ id, kind: 'vector', shapes });
const blend = (a: any, b: any, t: number) => tweenInstance(a, b, { ease: 'linear' }, t);

describe('outline matching', () => {
  it('round-trips a subpath through segments', () => {
    const sp = square(0, 0, 10);
    const back = fromSegs(toSegs(sp), true);
    expect(back.points.length).toBe(4);
    expect(back.points.map((p) => [p.x, p.y])).toEqual(expect.arrayContaining([[0, 0], [10, 0], [10, 10], [0, 10]]));
  });

  it('gives both sides the same number of segments when counts differ', () => {
    const pairs = matchOutlines([square(0, 0, 10)], [circle(50, 50, 20, 13)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].from.length).toBe(13);
    expect(pairs[0].to.length).toBe(13);
  });

  it('starts at the matching corner (no twist) for a square moved along', () => {
    // The same square, listed from a different corner: matching should line the corners back up.
    const a = square(0, 0, 10);
    const b = ring([[110, 10], [110, 0], [100, 0], [100, 10]].reverse() as [number, number][]);
    const [p] = matchOutlines([a], [b]);
    for (let i = 0; i < p.from.length; i++) {
      expect(p.to[i].a.x - p.from[i].a.x).toBeCloseTo(100);
      expect(p.to[i].a.y - p.from[i].a.y).toBeCloseTo(0);
    }
  });

  it('shrinks a spare hole away and grows a new one', () => {
    const donut = [square(0, 0, 40), square(10, 10, 20)];
    const plain = [square(0, 0, 40)];
    const pairs = matchOutlines(donut, plain);
    expect(pairs).toHaveLength(2);
    const spare = pairs[1];
    const xs = new Set(spare.to.map((s) => `${s.a.x.toFixed(3)},${s.a.y.toFixed(3)}`));
    expect(xs.size).toBe(1);
    const grow = matchOutlines(plain, donut);
    expect(grow).toHaveLength(2);
    expect(new Set(grow[1].from.map((s) => `${s.a.x},${s.a.y}`)).size).toBe(1);
  });

  it('a hint pins a start point to an end point', () => {
    const a = square(0, 0, 10);
    const b = square(0, 0, 10);
    // Ask the top-left corner to travel to the bottom-right: a half turn.
    const hint: ShapeHint = { id: 'h1', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } };
    const [p] = matchOutlines([a], [b], [hint]);
    const k = p.from.findIndex((s) => Math.abs(s.a.x) < 1e-6 && Math.abs(s.a.y) < 1e-6);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(p.to[k].a.x).toBeCloseTo(10);
    expect(p.to[k].a.y).toBeCloseTo(10);
    // Without the hint it would stay put.
    const [q] = matchOutlines([a], [b]);
    const j = q.from.findIndex((s) => Math.abs(s.a.x) < 1e-6 && Math.abs(s.a.y) < 1e-6);
    expect(q.to[j].a.x).toBeCloseTo(0);
  });

  it('a hint in the middle of an edge splits it there', () => {
    const hint: ShapeHint = { id: 'h', from: { x: 5, y: 0 }, to: { x: 10, y: 5 } };
    const [p] = matchOutlines([square(0, 0, 10)], [square(0, 0, 10)], [hint]);
    const k = p.from.findIndex((s) => Math.abs(s.a.x - 5) < 1e-3 && Math.abs(s.a.y) < 1e-3);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(p.to[k].a.x).toBeCloseTo(10, 2);
    expect(p.to[k].a.y).toBeCloseTo(5, 2);
  });

  it('two hints keep their order round the outline and split it into stretches', () => {
    const hints: ShapeHint[] = [
      { id: 'a', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      { id: 'b', from: { x: 10, y: 10 }, to: { x: 20, y: 5 } },
    ];
    const [p] = matchOutlines([square(0, 0, 10)], [circle(10, 5, 10, 16)], hints);
    expect(p.from.length).toBe(p.to.length);
    const ka = p.from.findIndex((s) => s.a.x === 0 && s.a.y === 0);
    const kb = p.from.findIndex((s) => Math.abs(s.a.x - 10) < 1e-6 && Math.abs(s.a.y - 10) < 1e-6);
    expect(p.to[kb].a.x).toBeCloseTo(20, 1);
    expect(p.to[kb].a.y).toBeCloseTo(5, 1);
    expect(Math.hypot(p.to[ka].a.x - 0, p.to[ka].a.y - 0)).toBeLessThan(1.5);
  });
});

describe('colours and strokes', () => {
  it('blends colours with alpha, and a missing fill fades', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#ff000000', '#ff0000', 0.5)).toBe('#ff000080');
    expect(mixColors(null, '#00ff00', 0.25)).toBe('#00ff0040');
    expect(mixColors('#00ff00', null, 1)).toBeNull();
  });

  it('resamples a stroke evenly', () => {
    const pts = resampleStroke([{ x: 0, y: 0, p: 0 }, { x: 10, y: 0, p: 1 }], 5);
    expect(pts.map((p) => p.x)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(pts[2].p).toBeCloseTo(0.5);
  });
});

describe('morphing drawings', () => {
  it('square to circle: halfway has the blended colour and the in-between outline', () => {
    const a = vd('a', [fill('s', [square(0, 0, 100)], '#ff0000')]);
    const b = vd('b', [fill('c', [circle(50, 50, 50, 24)], '#0000ff')]);
    const mid = morphShapes(a, b, 0.5, [], blend);
    expect(mid).toHaveLength(1);
    const f = mid[0] as FillShape;
    expect(f.type).toBe('fill');
    expect(f.color).toBe('#800080');
    expect(f.paths[0].points.length).toBe(24);
    const end = morphShapes(a, b, 1, [], blend)[0] as FillShape;
    for (const p of end.paths[0].points) expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(50, 0);
  });

  it('a path with a stroke blends its line width and colour, and fill with no fill fades', () => {
    const pa: PathShape = { id: 'p', type: 'path', paths: [square(0, 0, 10)], fill: '#ffffff', stroke: { color: '#000000', width: 2, join: 'round', cap: 'round' }, opacity: 1 };
    const pb: PathShape = { ...pa, fill: null, stroke: { color: '#ffffff', width: 6, join: 'round', cap: 'round' } };
    const m = morphShapes(vd('a', [pa]), vd('b', [pb]), 0.5, [], blend)[0] as PathShape;
    expect(m.stroke?.width).toBe(4);
    expect(m.stroke?.color).toBe('#808080');
    expect(m.fill).toBe('#ffffff80');
  });

  it('strokes morph point by point; extra shapes shrink away', () => {
    const s1: StrokeShape = { id: 'k', type: 'stroke', points: [{ x: 0, y: 0, p: 0.5 }, { x: 10, y: 0, p: 0.5 }], brush: { ...DEFAULT_BRUSH, size: 4 }, color: '#000000', opacity: 1 };
    const s2: StrokeShape = { ...s1, points: [{ x: 0, y: 10, p: 0.5 }, { x: 5, y: 10, p: 0.5 }, { x: 10, y: 10, p: 0.5 }], brush: { ...DEFAULT_BRUSH, size: 8 } };
    const extra = fill('e', [square(50, 50, 10)]);
    const m = morphShapes(vd('a', [s1, extra]), vd('b', [s2]), 0.5, [], blend);
    expect(m).toHaveLength(2);
    const st = m[0] as StrokeShape;
    expect(st.points).toHaveLength(3);
    expect(st.points[0].y).toBeCloseTo(5);
    expect(st.brush.size).toBe(6);
    expect((m[1] as FillShape).opacity).toBeCloseTo(0.5);
  });

  it('poseAt shows the morph on in-between frames and the key itself on its own frame', () => {
    const doc: Doc = newDoc({ width: 200, height: 200, length: 10 });
    const a = vd('a', [fill('s', [square(0, 0, 100)])]);
    const b = vd('b', [fill('s2', [square(100, 100, 50)], '#0000ff')]);
    doc.drawings.a = a;
    doc.drawings.b = b;
    doc.layers[0].cels = [
      { id: 'c1', start: 0, length: 4, drawingId: 'a', tween: { kind: 'shape', ease: 'linear' } },
      { id: 'c2', start: 4, length: 6, drawingId: 'b' },
    ];
    expect(poseAt(doc, doc.layers[0], 0)).toBe(a);
    const mid = poseAt(doc, doc.layers[0], 2) as VectorDrawing;
    expect(mid).not.toBe(a);
    expect((mid.shapes[0] as FillShape).color).toBe('#800080');
    // The same frame twice is the same object (the canvas's bitmap cache keys on it).
    expect(poseAt(doc, doc.layers[0], 2)).toBe(mid);
    expect(poseAt(doc, doc.layers[0], 5)).toBe(b);
  });
});
