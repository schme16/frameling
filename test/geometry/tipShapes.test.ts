// What the tips draw: plain shapes, steady from one run to the next, kept inside the line, and held to their limits.
import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import type { BrushSettings, FillShape, PathShape, Shape, StrokeShape, SubPath } from '../../src/core/format';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { defaultTip } from '../../src/geometry/tip';
import { cover, hash3, MAX_HOLES, MAX_STAMPS, resample, ringFrom, stampSites, tipShapes, vnoise, type OutlineFn } from '../../src/geometry/tipShapes';

const outline: OutlineFn = (s, b) => getStroke(s.points.map((p) => [p.x, p.y, p.p]), { size: b.size, thinning: b.thinning, smoothing: b.smoothing, streamline: b.streamline, simulatePressure: true, last: true });

const line = (n = 40, step = 6, amp = 20): { x: number; y: number; p: number }[] => Array.from({ length: n }, (_, i) => ({ x: 20 + i * step, y: 80 + Math.sin(i / 6) * amp, p: 0.5 }));
const stroke = (tip: BrushSettings['tip'], brush: Partial<BrushSettings> = {}, points = line(), opacity = 1): StrokeShape => ({ id: 's', type: 'stroke', points, brush: { ...DEFAULT_BRUSH, size: 20, ...brush, ...(tip ? { tip } : {}) }, color: '#336699', opacity });

const fills = (shapes: Shape[] | null): FillShape[] => (shapes ?? []).filter((s): s is FillShape => s.type === 'fill');
const area = (r: { x: number; y: number }[]): number => Math.abs(r.reduce((a, p, i) => a + (p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y), 0) / 2);
const inside = (pt: { x: number; y: number }, ring: { x: number; y: number }[]): boolean => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

describe('a plain line', () => {
  it('has nothing to expand', () => {
    expect(tipShapes(stroke(undefined), outline)).toBeNull();
  });
});

describe('noise', () => {
  it('is steady and in range', () => {
    for (let i = 0; i < 50; i++) {
      const h = hash3(i, i * 3, 7);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(hash3(i, i * 3, 7)).toBe(h);
      const v = vnoise(i * 0.37, i * 0.11, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(hash3(1, 2, 3)).not.toBe(hash3(1, 2, 4));
  });
});

describe('chalk and charcoal', () => {
  for (const kind of ['chalk', 'charcoal'] as const) {
    it(`${kind}: one fill, the line's colour and opacity, with grain holes inside the line`, () => {
      const s = stroke(defaultTip(kind), {}, line(), 0.8);
      const out = fills(tipShapes(s, outline));
      expect(out).toHaveLength(1);
      expect(out[0].color).toBe('#336699');
      expect(out[0].opacity).toBe(0.8);
      expect(out[0].paths.length).toBeGreaterThan(30);
      expect(out[0].paths.every((p) => p.closed && p.points.length >= 3 && p.points.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)))).toBe(true);
      const [outer, ...holes] = out[0].paths;
      for (const h of holes.slice(0, 80)) for (const q of h.points) expect(inside(q, outer.points)).toBe(true);
    });
    it(`${kind}: the same line gives the same shapes every time, and a line moved along the page gets different grain`, () => {
      const a = tipShapes(stroke(defaultTip(kind)), outline);
      const b = tipShapes(stroke(defaultTip(kind)), outline);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const moved = tipShapes(stroke(defaultTip(kind), {}, line().map((p) => ({ ...p, x: p.x + 1000.3 }))), outline);
      expect(JSON.stringify(moved)).not.toBe(JSON.stringify(a));
    });
  }
  it('more grain means more holes, and none at 0', () => {
    const count = (amount: number) => (fills(tipShapes(stroke({ kind: 'chalk', amount }), outline))[0]?.paths.length ?? 0) - 1;
    expect(count(0.05)).toBeLessThan(count(0.4));
    expect(count(0.4)).toBeLessThan(count(1));
    expect(count(0)).toBe(0);
  });
  it('coarser grain means fewer, bigger holes', () => {
    const holes = (grain: number) => fills(tipShapes(stroke({ kind: 'chalk', amount: 0.6, grain }), outline))[0].paths.slice(1);
    const fine = holes(0.6);
    const coarse = holes(2.5);
    expect(coarse.length).toBeLessThan(fine.length);
    const mean = (hs: SubPath[]) => hs.reduce((n, h) => n + area(h.points), 0) / hs.length;
    expect(mean(coarse)).toBeGreaterThan(mean(fine));
  });
  it('keeps to the hole limit on a huge line', () => {
    const big = Array.from({ length: 12 }, (_, i) => ({ x: 20 + i * 400, y: 200 + (i % 2) * 300, p: 0.5 }));
    const out = fills(tipShapes(stroke({ kind: 'charcoal', amount: 1, grain: 0.5 }, { size: 120 }, big), outline));
    expect(out[0].paths.length).toBeLessThanOrEqual(MAX_HOLES * 1.1 + 5);
  });
  it('a line that crosses itself is joined into one shape, with no hole where it overlaps', () => {
    const loop = Array.from({ length: 60 }, (_, i) => ({ x: 100 + Math.cos(i / 8) * 40 + i * 2, y: 100 + Math.sin(i / 8) * 40, p: 0.5 }));
    const s = stroke({ kind: 'chalk', amount: 0 }, { size: 16 }, loop);
    const out = fills(tipShapes(s, outline));
    // No grain, so every path is an outline; with the overlaps joined none of them is inside another one's overlap.
    expect(out[0].paths.length).toBeGreaterThanOrEqual(1);
    const o = ringFrom(outline(s, s.brush), 2);
    expect(cover([o], 3, false)!.maxWind).toBeGreaterThanOrEqual(2);
    for (const p of out[0].paths) {
      const r = p.points.map((q): [number, number] => [q.x, q.y]);
      expect(cover([r], 3, false)!.maxWind).toBeLessThanOrEqual(2);
    }
  });
  it('a dot (a lone click) still works', () => {
    const p = { x: 50, y: 50, p: 0.5 };
    const out = fills(tipShapes(stroke(defaultTip('chalk'), { size: 30 }, [p, { ...p }]), outline));
    expect(out).toHaveLength(1);
  });
});

describe('watercolour', () => {
  const s = stroke(defaultTip('watercolour'), { size: 30, thinning: 0 }, line(), 0.9);
  const out = tipShapes(s, outline)!;
  it('is a halo, a body and an edge line, in the line colour, none of them solid', () => {
    expect(out.map((x) => x.type)).toEqual(['stroke', 'stroke', 'path']);
    for (const x of out) {
      expect(x.opacity).toBeGreaterThan(0);
      expect(x.opacity).toBeLessThan(0.9);
    }
    const [halo, body, rim] = out as [StrokeShape, StrokeShape, PathShape];
    expect(halo.brush.size).toBeGreaterThan(body.brush.size);
    expect(halo.brush.tip).toBeUndefined();
    expect(body.brush.tip).toBeUndefined();
    expect(rim.fill).toBeNull();
    expect(rim.stroke?.color).toBe('#336699');
    expect(rim.stroke!.width).toBeGreaterThan(0);
  });
  it('a stronger edge draws a bolder, darker edge line', () => {
    const edge = (amount: number) => tipShapes(stroke({ kind: 'watercolour', amount }, { size: 30 }), outline)![2] as PathShape;
    expect(edge(1).stroke!.width).toBeGreaterThan(edge(0).stroke!.width);
    expect(edge(1).opacity).toBeGreaterThan(edge(0).opacity);
  });
  it('has unique ids derived from the line', () => {
    expect(new Set(out.map((x) => x.id)).size).toBe(3);
    expect(out.every((x) => x.id.startsWith('s~'))).toBe(true);
  });
});

describe('stamps', () => {
  const tip = (over: object = {}) => ({ kind: 'stamp' as const, shape: 'star' as const, spacing: 1, jitter: 0, scatter: 0, angle: 'upright' as const, seed: 3, ...over });
  const run = (s: StrokeShape) => fills(tipShapes(s, outline));
  it('puts a shape every spacing along the line', () => {
    const wide = run(stroke(tip({ spacing: 2 }), { size: 10 }));
    const close = run(stroke(tip({ spacing: 1 }), { size: 10 }));
    expect(close.length).toBeGreaterThan(wide.length * 1.7);
    const len = 39 * Math.hypot(6, 3);
    expect(close.length).toBeGreaterThan(len / 11);
    expect(close.length).toBeLessThan(len / 7);
  });
  it('is vector fills in the line colour, each one a closed star of ten points', () => {
    const out = run(stroke(tip(), { size: 10 }));
    expect(out.every((f) => f.color === '#336699' && f.paths.length === 1 && f.paths[0].points.length === 10)).toBe(true);
  });
  it('is steady for one seed and different for another', () => {
    const a = JSON.stringify(run(stroke(tip({ jitter: 0.6, scatter: 0.5, angle: 'random' }))));
    expect(JSON.stringify(run(stroke(tip({ jitter: 0.6, scatter: 0.5, angle: 'random' }))))).toBe(a);
    expect(JSON.stringify(run(stroke(tip({ jitter: 0.6, scatter: 0.5, angle: 'random', seed: 4 }))))).not.toBe(a);
  });
  it('size variety makes the stamps differ in size, and none is bigger than the brush', () => {
    const sizes = (jitter: number) => run(stroke(tip({ jitter }), { size: 20 })).map((f) => Math.max(...f.paths[0].points.map((p) => p.x)) - Math.min(...f.paths[0].points.map((p) => p.x)));
    const flat = sizes(0);
    const varied = sizes(1);
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(0.1);
    expect(Math.max(...varied) - Math.min(...varied)).toBeGreaterThan(2);
    expect(Math.max(...varied)).toBeLessThanOrEqual(20.1);
  });
  it('wander moves stamps off the line', () => {
    const off = (scatter: number) => Math.max(...run(stroke(tip({ scatter }), {}, Array.from({ length: 20 }, (_, i) => ({ x: i * 8, y: 100, p: 0.5 })))).map((f) => Math.abs(f.paths[0].points[0].y - 100)));
    expect(off(0)).toBeLessThan(11);
    expect(off(1.5)).toBeGreaterThan(off(0) + 5);
  });
  it('pointy ends make the first and last stamps smaller', () => {
    const out = run(stroke(tip(), { size: 20, taperStart: 80, taperEnd: 80 }));
    const w = (f: FillShape) => Math.max(...f.paths[0].points.map((p) => p.x)) - Math.min(...f.paths[0].points.map((p) => p.x));
    expect(w(out[0])).toBeLessThan(w(out[Math.floor(out.length / 2)]) * 0.6);
    expect(w(out[out.length - 1])).toBeLessThan(w(out[Math.floor(out.length / 2)]) * 0.6);
  });
  it('stamps a custom shape from its outlines, holes and all', () => {
    const square = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
    const hole = [-0.1, -0.1, 0.1, -0.1, 0.1, 0.1, -0.1, 0.1];
    const out = run(stroke(tip({ shape: 'custom', custom: [square, hole], spacing: 2 }), { size: 10 }));
    expect(out.length).toBeGreaterThan(3);
    expect(out[0].paths).toHaveLength(2);
    expect(Math.max(...out[0].paths[0].points.map((p) => p.x)) - Math.min(...out[0].paths[0].points.map((p) => p.x))).toBeCloseTo(10, 0);
  });
  it('joins see-through stamps so overlaps do not show darker', () => {
    const out = fills(tipShapes(stroke(tip({ spacing: 0.4, shape: 'dot' }), { size: 20 }, line(), 0.5), outline));
    expect(out).toHaveLength(1);
    expect(out[0].opacity).toBe(0.5);
  });
  it('keeps to the stamp limit however long the line', () => {
    const long = Array.from({ length: 400 }, (_, i) => ({ x: i * 50, y: 100 + (i % 2) * 40, p: 0.5 }));
    expect(run(stroke(tip({ spacing: 0.2 }), { size: 4 }, long)).length).toBeLessThanOrEqual(MAX_STAMPS);
  });
  it('a lone click gives one stamp; no points gives nothing', () => {
    expect(run(stroke(tip(), {}, [{ x: 5, y: 5, p: 0.5 }]))).toHaveLength(1);
    expect(tipShapes(stroke(tip(), {}, []), outline)).toBeNull();
  });
  it('sites follow the line and turn with it', () => {
    const sites = stampSites([{ x: 0, y: 0, p: 0.5 }, { x: 100, y: 0, p: 0.5 }], 20, 0);
    expect(sites).toHaveLength(6);
    expect(sites[2].x).toBeCloseTo(40, 5);
    expect(sites[2].ang).toBeCloseTo(0, 5);
    const down = stampSites([{ x: 0, y: 0, p: 0.5 }, { x: 0, y: 100, p: 0.5 }], 20, 0);
    expect(down[2].ang).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('outlines helpers', () => {
  it('resample keeps the first point and spaces the rest', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const r = resample(sq, 2);
    expect(r[0]).toEqual([0, 0]);
    expect(r.length).toBe(20);
  });
  it('cover finds the cells in a square, the whole page grid', () => {
    const c = cover([[[0, 0], [10, 0], [10, 10], [0, 10]]], 1, true)!;
    expect(c.inside.reduce((a, b) => a + b, 0)).toBe(100);
    expect(c.maxWind).toBe(1);
  });
});
