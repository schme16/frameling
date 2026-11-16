import { describe, expect, it } from 'vitest';
import type { PathShape, SubPath } from '../../src/core/format';
import { areaOfPaths, geomArea } from '../../src/geometry/merge';
import { coverOf } from '../../src/geometry/boolean';
import { along, applyBuild, clusterAt, buildRegions, lookFor, lookMatters, plansNothing, pointInGeom, regionAt, MAX_SHAPES } from '../../src/geometry/regions';

const rect = (x: number, y: number, w: number, h: number): SubPath => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const disc = (cx: number, cy: number, r: number): SubPath => ({
  closed: true,
  points: Array.from({ length: 48 }, (_, i) => ({ x: cx + r * Math.cos((i / 48) * Math.PI * 2), y: cy + r * Math.sin((i / 48) * Math.PI * 2) })),
});
const shape = (id: string, paths: SubPath[], fill: string | null = '#ff0000', extra: Partial<PathShape> = {}): PathShape => ({ id, type: 'path', paths, fill, stroke: null, opacity: 1, ...extra });
const total = (shapes: readonly PathShape[]) => shapes.reduce((n, s) => n + geomArea(coverOf(s)), 0);
let n = 0;
const fresh = () => `new${++n}`;

// a: 0..100, b: 50..150 (overlap 50x50), both 100 tall squares offset diagonally.
const a = shape('a', [rect(0, 0, 100, 100)], '#ff0000');
const b = shape('b', [rect(50, 50, 100, 100)], '#0000ff');

describe('buildRegions', () => {
  it('cuts two overlapping squares into three regions', () => {
    const arr = buildRegions([a, b]);
    expect(arr.regions).toHaveLength(3);
    expect(arr.regions.map((r) => r.members.join('+')).sort()).toEqual(['0', '0+1', '1']);
    const lens = arr.regions.find((r) => r.members.length === 2)!;
    expect(lens.area).toBeCloseTo(2500, 0);
  });

  it('gives back the area the shapes covered, nothing lost and nothing doubled', () => {
    const arr = buildRegions([a, b]);
    const sum = arr.regions.reduce((s, r) => s + r.area, 0);
    expect(sum).toBeCloseTo(100 * 100 * 2 - 2500, 0);
  });

  it('makes seven regions of three circles that all cross', () => {
    const arr = buildRegions([shape('x', [disc(100, 100, 60)]), shape('y', [disc(160, 100, 60)]), shape('z', [disc(130, 150, 60)])]);
    expect(arr.regions).toHaveLength(7);
    expect(arr.regions.filter((r) => r.members.length === 3)).toHaveLength(1);
  });

  it('counts a piece a third shape cuts in two as two regions', () => {
    const bar = shape('bar', [rect(40, -20, 20, 140)]);
    const arr = buildRegions([shape('wide', [rect(0, 0, 100, 100)]), bar]);
    // The wide one is split into left and right of the bar; the bar has its top and bottom stubs and the middle.
    expect(arr.regions.filter((r) => r.members.join() === '0')).toHaveLength(2);
    expect(arr.regions.filter((r) => r.members.join() === '1')).toHaveLength(2);
    expect(arr.regions.filter((r) => r.members.join() === '0,1')).toHaveLength(1);
  });

  it('leaves shapes that touch nothing as one region each', () => {
    const arr = buildRegions([a, shape('far', [rect(300, 300, 20, 20)])]);
    expect(arr.regions).toHaveLength(2);
  });

  it('keeps a hole in a region', () => {
    const donut = shape('ring', [rect(0, 0, 100, 100), rect(30, 30, 40, 40)]);
    const arr = buildRegions([donut, shape('cap', [rect(20, 20, 60, 60)])]);
    const inHole = arr.regions.filter((r) => r.members.join() === '1');
    expect(inHole).toHaveLength(1);
    expect(inHole[0].area).toBeCloseTo(40 * 40, 0);
    const over = arr.regions.filter((r) => r.members.join() === '0,1');
    expect(over).toHaveLength(1);
    expect(over[0].area).toBeCloseTo(60 * 60 - 40 * 40, 0);
    expect(arr.regions.reduce((s, r) => s + r.area, 0)).toBeCloseTo(100 * 100, 0);
  });

  it('skips things that cannot be combined, and stops at the cap', () => {
    const text = { id: 't', type: 'text' } as never;
    expect(buildRegions([a, text, b]).shapes.map((s) => s.id)).toEqual(['a', 'b']);
    const many = Array.from({ length: MAX_SHAPES + 10 }, (_, i) => shape(`s${i}`, [rect(i * 3, 0, 10, 10)]));
    expect(buildRegions(many).shapes).toHaveLength(MAX_SHAPES);
  });
});

describe('finding the region under a point', () => {
  const arr = buildRegions([a, b]);
  it('finds the lens, and each crescent, and nothing outside', () => {
    expect(regionAt(arr, 75, 75)!.members).toEqual([0, 1]);
    expect(regionAt(arr, 10, 10)!.members).toEqual([0]);
    expect(regionAt(arr, 140, 140)!.members).toEqual([1]);
    expect(regionAt(arr, 200, 10)).toBeNull();
  });
  it('does not count a hole', () => {
    const donut = buildRegions([shape('ring', [rect(0, 0, 100, 100), rect(30, 30, 40, 40)])]);
    expect(regionAt(donut, 50, 50)).toBeNull();
    expect(regionAt(donut, 10, 10)).not.toBeNull();
    expect(pointInGeom(donut.regions[0].geom, 50, 50)).toBe(false);
  });
  it('tries the last region first, and still finds a different one', () => {
    const lens = regionAt(arr, 75, 75)!;
    expect(regionAt(arr, 76, 76, lens.id)!.id).toBe(lens.id);
    expect(regionAt(arr, 10, 10, lens.id)!.members).toEqual([0]);
  });
  it('walks a move in small steps so a thin region cannot be skipped', () => {
    const pts = along({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(pts.length).toBeGreaterThanOrEqual(25);
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
    expect(along({ x: 0, y: 0 }, { x: 0, y: 0 }, 4)).toHaveLength(1);
    expect(along({ x: 0, y: 0 }, { x: 5000, y: 0 }, 1)).toHaveLength(96);
  });
});

describe('clusterAt', () => {
  const far = shape('far', [rect(500, 500, 20, 20)]);
  const chain = shape('chain', [rect(140, 140, 40, 40)]);
  it('takes what is under the point and what that touches, and leaves the rest', () => {
    expect(clusterAt([a, b, chain, far], 10, 10).map((s) => s.id)).toEqual(['a', 'b', 'chain']);
    expect(clusterAt([a, b, chain, far], 510, 510).map((s) => s.id)).toEqual(['far']);
  });
  it('is empty on bare paper', () => {
    expect(clusterAt([a, b, far], 300, 10)).toEqual([]);
  });
  it('stops at the cap, with what is under the point still in', () => {
    const many = Array.from({ length: MAX_SHAPES + 20 }, (_, i) => shape(`s${i}`, [rect(i * 5, 0, 30, 30)]));
    const c = clusterAt(many, 2, 2);
    expect(c).toHaveLength(MAX_SHAPES);
    expect(c[0].id).toBe('s0');
  });
});

describe('applyBuild', () => {
  const find = (arr: ReturnType<typeof buildRegions>, ...m: number[]) => arr.regions.find((r) => r.members.join() === m.join())!.id;

  it('joins the lens and a crescent into one shape and leaves the rest as shapes of their own', () => {
    const arr = buildRegions([a, b]);
    const res = applyBuild([a, b], arr, { join: [find(arr, 0), find(arr, 0, 1)], remove: [] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    expect(res.shapes).toHaveLength(2);
    expect(res.joined).toBe(2);
    expect(res.ids).toEqual([res.made]);
    // The joined shape is all of a; the other is what is left of b.
    const joined = res.shapes.find((s) => s.id === res.made)!;
    expect(geomArea(coverOf(joined))).toBeCloseTo(10000, -1);
    const rest = res.shapes.find((s) => s.id !== res.made)!;
    expect(geomArea(coverOf(rest))).toBeCloseTo(7500, -1);
  });

  it('merges with no hairline: the joined shape is one piece with no hole', () => {
    const arr = buildRegions([a, b]);
    const res = applyBuild([a, b], arr, { join: [find(arr, 0), find(arr, 0, 1), find(arr, 1)], remove: [] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    expect(res.shapes).toHaveLength(1);
    const g = coverOf(res.shapes[0]);
    expect(g).toHaveLength(1);
    expect(g[0]).toHaveLength(1);
    expect(geomArea(g)).toBeCloseTo(17500, -1);
  });

  it('takes a region away and keeps the others', () => {
    const arr = buildRegions([a, b]);
    const res = applyBuild([a, b], arr, { join: [], remove: [find(arr, 0, 1)] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    expect(res.shapes).toHaveLength(2);
    expect(res.removed).toBe(1);
    expect(total(res.shapes as PathShape[])).toBeCloseTo(15000, -1);
    expect(regionAt(buildRegions(res.shapes), 75, 75)).toBeNull();
  });

  it('wears the colours of the region you dragged from, or of the lowest shape', () => {
    const arr = buildRegions([a, b]);
    const ids = [find(arr, 1), find(arr, 0, 1)];
    expect(lookFor(arr, ids, 'dragged').id).toBe('b');
    expect(lookFor(arr, ids, 'bottom').id).toBe('a');
    const fromB = applyBuild([a, b], arr, { join: ids, remove: [] }, 'dragged', fresh);
    const fromA = applyBuild([a, b], arr, { join: ids, remove: [] }, 'bottom', fresh);
    if (fromB === 'nothing' || fromA === 'nothing') throw new Error('expected a build');
    expect((fromB.shapes.find((s) => s.id === fromB.made) as PathShape).fill).toBe('#0000ff');
    expect((fromA.shapes.find((s) => s.id === fromA.made) as PathShape).fill).toBe('#ff0000');
  });

  it('knows when the answer would matter', () => {
    const arr = buildRegions([a, b]);
    expect(lookMatters(arr, [find(arr, 1), find(arr, 0, 1)])).toBe(true);
    expect(lookMatters(arr, [find(arr, 0, 1)])).toBe(false);
    const same = buildRegions([a, shape('c', [rect(50, 50, 100, 100)], '#ff0000')]);
    expect(lookMatters(same, [find(same, 1), find(same, 0, 1)])).toBe(false);
  });

  it('gives every piece its own id', () => {
    const arr = buildRegions([a, b]);
    const res = applyBuild([a, b], arr, { join: [find(arr, 0, 1)], remove: [] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    const ids = res.shapes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.shapes).toHaveLength(3);
  });

  it('keeps a shape that overlaps nothing exactly as it was', () => {
    const far = shape('far', [rect(300, 300, 20, 20)], '#00ff00', { stroke: { color: '#000000', width: 3, join: 'round', cap: 'round' } });
    const arr = buildRegions([a, b, far]);
    const res = applyBuild([a, b, far], arr, { join: [find(arr, 0), find(arr, 0, 1)], remove: [] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    expect(res.shapes[res.shapes.length - 1]).toBe(far);
  });

  it('keeps the stacking: pieces stay where their top shape was, shapes between stay between', () => {
    const mid = shape('mid', [rect(400, 0, 10, 10)], '#00ff00');
    const arr = buildRegions([a, b]);
    const res = applyBuild([a, mid, b], arr, { join: [find(arr, 0), find(arr, 0, 1)], remove: [] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    const order = res.shapes.map((s) => s.id);
    // a's own piece went into the joined shape, which takes the top of the two's place, above the shape between.
    expect(order[0]).toBe('mid');
    expect(order[1]).toBe(res.made);
    expect(order).toHaveLength(3);
  });

  it('does nothing when there is nothing to do', () => {
    const arr = buildRegions([a, b]);
    expect(applyBuild([a, b], arr, { join: [], remove: [] })).toBe('nothing');
    const lone = buildRegions([a, shape('far', [rect(300, 300, 20, 20)])]);
    expect(plansNothing(lone, { join: [find(lone, 0)], remove: [] })).toBe(true);
    expect(applyBuild([a], lone, { join: [find(lone, 0)], remove: [] })).toBe('nothing');
    expect(plansNothing(arr, { join: [find(arr, 0)], remove: [] })).toBe(false);
  });

  it('a click on one region of a crossing pair pulls it out as a shape of its own', () => {
    const arr = buildRegions([a, b]);
    const res = applyBuild([a, b], arr, { join: [find(arr, 0, 1)], remove: [] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    expect(res.made).not.toBeNull();
    expect(geomArea(coverOf(res.shapes.find((s) => s.id === res.made)!))).toBeCloseTo(2500, 0);
  });

  it('takes shapes out of their group', () => {
    const g1 = shape('g1', [rect(0, 0, 100, 100)], '#ff0000', { group: 'grp' });
    const g2 = shape('g2', [rect(50, 50, 100, 100)], '#0000ff', { group: 'grp' });
    const arr = buildRegions([g1, g2]);
    const res = applyBuild([g1, g2], arr, { join: [find(arr, 0, 1)], remove: [] }, 'dragged', fresh);
    if (res === 'nothing') throw new Error('expected a build');
    expect(res.shapes.every((s) => !s.group)).toBe(true);
  });
});

describe('with a lot of shapes', () => {
  it('works out a field of overlapping circles and finds a region quickly', () => {
    const shapes = Array.from({ length: 30 }, (_, i) => shape(`c${i}`, [disc(60 + (i % 6) * 50, 60 + Math.floor(i / 6) * 50, 40)], `#${(i * 8000 + 100000).toString(16).slice(0, 6).padStart(6, '0')}`));
    const t0 = performance.now();
    const arr = buildRegions(shapes);
    const built = performance.now() - t0;
    expect(arr.regions.length).toBeGreaterThan(60);
    expect(arr.regions.reduce((s, r) => s + r.area, 0)).toBeGreaterThan(0);
    const t1 = performance.now();
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (regionAt(arr, (i * 7) % 330, (i * 13) % 280)) hits++;
    const per = (performance.now() - t1) / 2000;
    expect(hits).toBeGreaterThan(1000);
    // A pointer move is a handful of polygon tests: well under a millisecond even with no hint to start from.
    expect(per).toBeLessThan(0.5);
    // Working the regions out is the once-per-gesture cost: generous bound, the number is for the board.
    expect(built).toBeLessThan(8000);
    console.log(`regions: ${shapes.length} circles -> ${arr.regions.length} regions in ${built.toFixed(0)} ms; ${per.toFixed(3)} ms per lookup`);
  });
});

void areaOfPaths;
