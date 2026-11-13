// Rubbing out part of a shape on a layer that keeps shapes separate (object drawing): pure geometry.
import { describe, expect, it } from 'vitest';
import type { FillShape, InstanceShape, Shape, TextShape } from '../../src/core/format';
import { followSelection, resolveFollowed, shapeLineage } from '../../src/core/followSelection';
import { eraseBits, geomArea, geomBox, shapeParts, sweepGeom } from '../../src/geometry/merge';
import { pointInPaths } from '../../src/geometry/hit';
import { rectPath, stroke } from './helpers';

const area = (s: Shape) => shapeParts(s).reduce((a, p) => a + geomArea(p.geom), 0);
const fills = (list: Shape[]) => list as FillShape[];
const swipe = (x0: number, y0: number, x1: number, y1: number, r = 10) => sweepGeom({ x: x0, y: y0 }, { x: x1, y: y1 }, r);
const line = () => stroke([[10, 100], [100, 100], [200, 100]], 8);
const solid = (id: string, x: number, y: number, w: number, h: number): FillShape => ({ id, type: 'fill', color: '#ff0000', opacity: 1, paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }] });

describe('eraseBits: a brush stroke', () => {
  it('is cut in two by a swipe across it, and the pieces stay separate shapes', () => {
    const s = line();
    const before = area(s);
    const r = eraseBits([s], swipe(100, 80, 100, 120));
    expect(r.changed).toBe(true);
    expect(r.shapes).toHaveLength(2);
    expect(r.shapes.every((p) => p.type === 'fill')).toBe(true);
    const [a, b] = r.shapes.map((p) => geomBox(shapeParts(p)[0].geom)!);
    expect(a.x1).toBeLessThan(100);
    expect(b.x0).toBeGreaterThan(100);
    // About a 20 wide slice of an 8 thick line is gone.
    expect(before - r.shapes.reduce((n, p) => n + area(p), 0)).toBeGreaterThan(8 * 18);
    // Colour and strength carry over.
    expect(fills(r.shapes).every((p) => p.color === s.color && p.opacity === s.opacity)).toBe(true);
  });

  it('keeps the first piece id, and gives the other a new one', () => {
    const s = line();
    const r = eraseBits([s], swipe(100, 80, 100, 120));
    const ids = r.shapes.map((p) => p.id);
    expect(ids.filter((id) => id === s.id)).toHaveLength(1);
    expect(new Set(ids).size).toBe(2);
  });

  it('is nibbled at the end by a swipe along it, leaving one shorter piece', () => {
    const s = line();
    const r = eraseBits([s], swipe(170, 100, 230, 100));
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0].id).toBe(s.id);
    const b = geomBox(shapeParts(r.shapes[0])[0].geom)!;
    expect(b.x1).toBeLessThan(165);
    expect(b.x0).toBeLessThan(15);
  });

  it('is rubbed away entirely when the area covers it', () => {
    const s = stroke([[50, 50], [60, 50]], 6);
    const r = eraseBits([s], swipe(30, 50, 80, 50, 20));
    expect(r.changed).toBe(true);
    expect(r.shapes).toHaveLength(0);
  });
});

describe('eraseBits: other shapes', () => {
  it('rubs a hole in the middle of a filled shape and keeps it one shape', () => {
    const f = solid('f1', 0, 0, 100, 100);
    const r = eraseBits([f], swipe(50, 50, 50, 50, 12));
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0].id).toBe('f1');
    expect((r.shapes[0] as FillShape).paths).toHaveLength(2);
    expect(pointInPaths((r.shapes[0] as FillShape).paths, 50, 50)).toBe(false);
    expect(pointInPaths((r.shapes[0] as FillShape).paths, 10, 10)).toBe(true);
    // The rubbed circle is a many-sided polygon, so allow a little.
    expect(Math.abs(area(r.shapes[0]) - (10000 - Math.PI * 144))).toBeLessThan(20);
  });

  it('cuts an outlined shape into fills in the same colours, fill behind line', () => {
    const p = rectPath(0, 0, 100, 60, { fill: '#00ff00', stroke: { color: '#0000ff', width: 6, join: 'round', cap: 'round' } });
    const r = eraseBits([p], swipe(50, -20, 50, 80, 8));
    const colours = fills(r.shapes).map((f) => f.color);
    expect(colours).toContain('#00ff00');
    expect(colours).toContain('#0000ff');
    // The fill pieces come before the line pieces.
    expect(colours.indexOf('#00ff00')).toBeLessThan(colours.lastIndexOf('#0000ff'));
    expect(r.shapes.length).toBeGreaterThanOrEqual(4);
  });

  it('leaves shapes the area does not reach exactly as they were (the same objects)', () => {
    const near = stroke([[20, 200], [20, 20], [200, 20]], 4);
    const far = solid('far', 300, 300, 20, 20);
    const hit = line();
    const r = eraseBits([near, far, hit], swipe(100, 80, 100, 120));
    // `near` has a box over the swipe but never touches it.
    expect(r.shapes[0]).toBe(near);
    expect(r.shapes[1]).toBe(far);
    expect(r.shapes).toHaveLength(4);
    expect(r.changed).toBe(true);
  });

  it('reports no change, and returns the same shapes, when nothing is touched', () => {
    const a = line();
    const r = eraseBits([a], swipe(100, 160, 100, 180));
    expect(r.changed).toBe(false);
    expect(r.shapes[0]).toBe(a);
  });

  it('leaves symbols and text alone', () => {
    const inst = { id: 'i1', type: 'instance', symbolId: 'x', transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 }, opacity: 1 } as unknown as InstanceShape;
    const text = { id: 't1', type: 'text', x: 100, y: 100, text: 'hi' } as unknown as TextShape;
    const r = eraseBits([inst, text], swipe(90, 90, 110, 110, 30));
    expect(r.changed).toBe(false);
    expect(r.shapes).toEqual([inst, text]);
  });

  it('keeps a group on every piece', () => {
    const s = { ...line(), group: 'g1' };
    const r = eraseBits([s], swipe(100, 80, 100, 120));
    expect(r.shapes).toHaveLength(2);
    expect(r.shapes.every((p) => p.group === 'g1')).toBe(true);
  });

  it('keeps stacking order: pieces take the place of the shape', () => {
    const under = solid('u', 0, 0, 20, 20);
    const over = solid('o', 300, 0, 20, 20);
    const r = eraseBits([under, line(), over], swipe(100, 80, 100, 120));
    expect(r.shapes[0]).toBe(under);
    expect(r.shapes.at(-1)).toBe(over);
    expect(r.shapes).toHaveLength(4);
  });

  it('can be applied again and again as the eraser moves, always cutting what is left', () => {
    let list: Shape[] = [line()];
    for (const x of [40, 80, 120, 160]) list = eraseBits(list, swipe(x, 80, x, 120, 6)).shapes;
    expect(list).toHaveLength(5);
  });
});

describe('eraseBits: lineage', () => {
  it('gives every piece the origin of the shape, so a selection still finds it', () => {
    const s = { ...line(), origin: 'line1' };
    const r = eraseBits([s], swipe(100, 80, 100, 120));
    expect(r.shapes.map((p) => shapeLineage(p))).toEqual(['line1', 'line1']);
  });

  it('a shape with no origin of its own passes its id on, as the first of its line', () => {
    const s = line();
    const r = eraseBits([s], swipe(100, 80, 100, 120));
    expect(r.shapes.map((p) => shapeLineage(p))).toEqual([s.id, s.id]);
    // The piece that kept the id needs no origin; the new one points back.
    expect(r.shapes[0].origin).toBeUndefined();
    expect(r.shapes[1].origin).toBe(s.id);
  });

  it('a selection of the cut piece resolves in a key that still has the whole line', () => {
    const whole = { ...line(), id: 'w2', origin: 'line1' };
    const cutKey = eraseBits([{ ...line(), id: 'w1', origin: 'line1' }], swipe(100, 80, 100, 120)).shapes;
    const d1 = { id: 'd1', kind: 'vector' as const, shapes: cutKey };
    const d2 = { id: 'd2', kind: 'vector' as const, shapes: [whole] };
    const wanted = [{ lineage: shapeLineage(cutKey[0]), at: 0, type: cutKey[0].type, legacy: false, of: cutKey.length }];
    expect(resolveFollowed(d2, wanted)).toEqual(['w2']);
    expect(resolveFollowed(d1, wanted)).toEqual([cutKey[0].id]);
    expect(typeof followSelection).toBe('function');
  });
});

describe('eraseBits: cost', () => {
  it('stays cheap over a busy layer: only shapes the sweep reaches are clipped', () => {
    const list: Shape[] = [];
    for (let i = 0; i < 400; i++) list.push(stroke([[(i % 20) * 40, Math.floor(i / 20) * 14], [(i % 20) * 40 + 30, Math.floor(i / 20) * 14 + 6]], 3));
    let shapes = list;
    const t0 = performance.now();
    let n = 0;
    for (let x = 0; x < 800; x += 8) {
      shapes = eraseBits(shapes, swipe(x, 140, x + 8, 140, 10)).shapes;
      n++;
    }
    const per = (performance.now() - t0) / n;
    // Loose on purpose: a slow machine must not fail this; it is here to catch a return to clipping everything.
    expect(per).toBeLessThan(25);
  });
});
