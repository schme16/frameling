import { describe, expect, it } from 'vitest';
import type { PathShape, PathStroke, SubPath } from '../../src/core/format';
import { areaOfPaths, geomArea } from '../../src/geometry/merge';
import { sampleSubPath } from '../../src/geometry/bezier';
import {
  DASH_PRESETS,
  WIDTH_PRESETS,
  cleanStrokeStyle,
  cleanWidths,
  dashKindOf,
  dashPx,
  dashWindows,
  expandStroke,
  hasLineStyle,
  headFor,
  headLength,
  lineAreaStyled,
  reversePath,
  styleReach,
  trimEnd,
  widthAt,
  widthKindOf,
} from '../../src/geometry/lineStyle';

const line = (x0: number, y0: number, x1: number, y1: number): SubPath => ({ closed: false, points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
const st = (extra: Partial<PathStroke> = {}): PathStroke => ({ color: '#112233', width: 10, join: 'round', cap: 'butt', ...extra });
const shape = (paths: SubPath[], stroke: PathStroke | null, extra: Partial<PathShape> = {}): PathShape => ({ id: 's1', type: 'path', paths, fill: null, stroke, opacity: 1, ...extra });
const area = (paths: SubPath[]) => geomArea(areaOfPaths(paths));

describe('dash patterns', () => {
  it('turns line widths into pixels, and makes odd lists even', () => {
    expect(dashPx({ dash: [3, 2], width: 4 })).toEqual([12, 8]);
    expect(dashPx({ dash: [3], width: 2 })).toEqual([6, 6]);
    expect(dashPx({ dash: [3, 2, 1], width: 1 })).toEqual([3, 2, 1, 3, 2, 1]);
  });

  it('treats an empty, zero or damaged pattern as a solid line', () => {
    expect(dashPx({ dash: [], width: 4 })).toBeNull();
    expect(dashPx({ dash: [0, 0], width: 4 })).toBeNull();
    expect(dashPx({ dash: [NaN, -1], width: 4 })).toBeNull();
    expect(dashPx({ width: 4 })).toBeNull();
  });

  it('cuts a line into dashes', () => {
    expect(dashWindows(100, [10, 10], 0)).toEqual([[0, 10], [20, 30], [40, 50], [60, 70], [80, 90]]);
  });

  it('the last dash is cut where the line ends', () => {
    expect(dashWindows(25, [10, 10], 0)).toEqual([[0, 10], [20, 25]]);
  });

  it('starts part way into the pattern with an offset', () => {
    expect(dashWindows(30, [10, 10], 5)).toEqual([[0, 5], [15, 25]]);
    expect(dashWindows(30, [10, 10], -5)).toEqual([[5, 15], [25, 30]]);
  });

  it('a dot is a dash of no length, and every cycle has one', () => {
    const w = dashWindows(30, [0, 10], 0);
    expect(w).toEqual([[0, 0], [10, 10], [20, 20]]);
  });

  it('gives up on a pattern too fine to see, drawing it solid', () => {
    expect(dashWindows(1e6, [0.02, 0.02], 0)).toEqual([[0, 1e6]]);
  });

  it('knows the quick choices by their pattern', () => {
    expect(dashKindOf(undefined)).toBe('solid');
    expect(dashKindOf(DASH_PRESETS.dashed.dash)).toBe('dashed');
    expect(dashKindOf(DASH_PRESETS.dotted.dash)).toBe('dotted');
    expect(dashKindOf([7, 7])).toBeNull();
    expect(widthKindOf(WIDTH_PRESETS.swell.widths)).toBe('swell');
    expect(widthKindOf(undefined)).toBe('even');
  });
});

describe('width along a line', () => {
  it('is the multiplier at each stop and eases between them', () => {
    const stops = [{ at: 0, w: 0 }, { at: 1, w: 2 }];
    expect(widthAt(stops, 0)).toBe(0);
    expect(widthAt(stops, 1)).toBe(2);
    expect(widthAt(stops, 0.5)).toBeCloseTo(1, 6);
    expect(widthAt(stops, 0.25)).toBeLessThan(0.5);
    expect(widthAt(null, 0.3)).toBe(1);
  });

  it('tidies stops that are out of order or out of range', () => {
    expect(cleanWidths([{ at: 2, w: 1 }, { at: -1, w: 99 }, { at: NaN, w: 1 }])).toEqual([{ at: 0, w: 8 }, { at: 1, w: 1 }]);
    expect(cleanWidths([])).toBeNull();
  });

  it('a swelling line covers more than a thin one and less than a fat one, near the maths', () => {
    const base = st({ width: 10, cap: 'butt' });
    const even = lineAreaStyled([line(0, 0, 200, 0)], base, false)!;
    expect(area(even)).toBeCloseTo(2000, -1);
    const taper = lineAreaStyled([line(0, 0, 200, 0)], { ...base, widths: [{ at: 0, w: 1 }, { at: 1, w: 0 }] }, false)!;
    // Eased from full to nothing: about half the area (smoothstep is symmetric).
    expect(area(taper)).toBeGreaterThan(900);
    expect(area(taper)).toBeLessThan(1100);
  });

  it('keeps a bend smooth and the area right on a curve', () => {
    const arc: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0, c1: { x: 30, y: -40 }, c2: { x: 70, y: -40 } }] };
    const g = lineAreaStyled([arc], st({ width: 8, widths: [{ at: 0, w: 0.5 }, { at: 0.5, w: 1.5 }, { at: 1, w: 0.5 }] }), false)!;
    expect(g.length).toBeGreaterThan(0);
    expect(area(g)).toBeGreaterThan(600);
    expect(area(g)).toBeLessThan(1100);
  });

  it('a corner gets a join, so the strip has no notch', () => {
    const corner: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] };
    const miter = lineAreaStyled([corner], st({ width: 10, join: 'miter', widths: [{ at: 0, w: 1 }, { at: 1, w: 1 }] }), false)!;
    // Two 100 x 10 strips overlapping in a 10 x 10 corner: 1900 for a bevel, 2000 with the miter filled in.
    expect(area(miter)).toBeGreaterThan(1990);
    expect(area(miter)).toBeLessThan(2010);
  });

  it('a closed shape gets a ring', () => {
    const sq: SubPath = { closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] };
    const g = lineAreaStyled([sq], st({ width: 10, join: 'miter', widths: [{ at: 0, w: 1 }, { at: 1, w: 1 }] }), false)!;
    // The ring of a 100 square with a 10 wide line: 110^2 - 90^2.
    expect(area(g)).toBeGreaterThan(4000 - 40);
    expect(area(g)).toBeLessThan(4000 + 40);
  });
});

describe('dashes baked into an outline', () => {
  it('leaves the gaps out', () => {
    const g = lineAreaStyled([line(0, 0, 100, 0)], st({ width: 10, dash: [2, 2] }), true)!;
    // Dashes 20 long, gaps 20: 3 dashes fit (0-20, 40-60, 80-100), 10 wide.
    expect(area(g)).toBeCloseTo(3 * 20 * 10, -1);
  });

  it('draws dots as round dots', () => {
    const g = lineAreaStyled([line(0, 0, 100, 0)], st({ width: 10, cap: 'round', dash: [0.01, 2] }), true)!;
    // A dot every 20: 0, 20, 40, 60, 80 (100 is the end), each about pi * 25.
    expect(area(g)).toBeGreaterThan(5 * 70);
    expect(area(g)).toBeLessThan(6 * 85);
  });

  it('butt dots vanish: no round end, no dot', () => {
    const g = lineAreaStyled([line(0, 0, 100, 0)], st({ width: 10, cap: 'butt', dash: [0.01, 2] }), true);
    expect(g === null || area(g) < 20).toBe(true);
  });
});

describe('arrow heads', () => {
  it('takes a bit off the end of a straight line', () => {
    const t = trimEnd(line(0, 0, 100, 0), 30)!;
    expect(t.points[1].x).toBeCloseTo(70, 6);
  });

  it('cuts a curve exactly: the new end lies on the old curve', () => {
    const arc: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0, c1: { x: 30, y: -40 }, c2: { x: 70, y: -40 } }] };
    const t = trimEnd(arc, 20)!;
    const end = t.points[t.points.length - 1];
    const onOld = sampleSubPath(arc, 400).some((p) => Math.hypot(p.x - end.x, p.y - end.y) < 0.3);
    expect(onOld).toBe(true);
    expect(end.x).toBeLessThan(100);
    expect(t.points[1].c1).toBeDefined();
  });

  it('drops whole pieces when it must, and returns nothing when nothing is left', () => {
    const two: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }] };
    expect(trimEnd(two, 15)!.points.at(-1)!.x).toBeCloseTo(5, 6);
    expect(trimEnd(two, 25)).toBeNull();
  });

  it('reverses a path with its curves', () => {
    const arc: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0, c1: { x: 30, y: -40 }, c2: { x: 70, y: -40 } }] };
    const r = reversePath(arc);
    expect(r.points[0]).toMatchObject({ x: 100, y: 0 });
    expect(r.points[1].c1).toEqual({ x: 70, y: -40 });
    expect(r.points[1].c2).toEqual({ x: 30, y: -40 });
    const a = sampleSubPath(arc, 8);
    const b = sampleSubPath(r, 8).reverse();
    expect(Math.hypot(a[3].x - b[4].x, a[3].y - b[4].y)).toBeLessThan(30);
  });

  it('points the head along the line, tip on the end', () => {
    const h = headFor(line(0, 0, 100, 0), 'triangle', { width: 4, arrowSize: 4 })!;
    expect(h.kind).toBe('fill');
    const pts = h.paths[0].points;
    expect(pts[0]).toMatchObject({ x: 100, y: 0 });
    const L = headLength({ width: 4, arrowSize: 4 });
    expect(pts[1].x).toBeCloseTo(100 - L, 6);
    expect(pts[1].y).toBeCloseTo(-pts[2].y, 6);
  });

  it('has four kinds, and open and bar are lines rather than areas', () => {
    for (const k of ['triangle', 'open', 'dot', 'bar'] as const) expect(headFor(line(0, 0, 50, 0), k, { width: 3 })).not.toBeNull();
    expect(headFor(line(0, 0, 50, 0), 'open', { width: 3 })!.kind).toBe('line');
    expect(headFor(line(0, 0, 50, 0), 'bar', { width: 3 })!.kind).toBe('line');
    expect(headFor(line(0, 0, 50, 0), 'dot', { width: 3 })!.kind).toBe('fill');
  });

  it('a head never has a minimum smaller than something you can see', () => {
    expect(headLength({ width: 0.5 })).toBe(6);
    expect(headLength({ width: 5, arrowSize: 6 })).toBe(30);
  });
});

describe('expandStroke', () => {
  it('hands back the very same shape when there is no style, so old files draw exactly as before', () => {
    const s = shape([line(0, 0, 100, 0)], st());
    const parts = expandStroke(s);
    expect(parts).toHaveLength(1);
    expect(parts[0].shape).toBe(s);
    expect(hasLineStyle(s.stroke)).toBe(false);
  });

  it('dashes only: the same shape, the writer dashes it', () => {
    const s = shape([line(0, 0, 100, 0)], st({ dash: [3, 2] }));
    const parts = expandStroke(s);
    expect(parts).toHaveLength(1);
    expect(parts[0].shape).toBe(s);
  });

  it('dashes baked in when asked: an area of its own', () => {
    const s = shape([line(0, 0, 100, 0)], st({ dash: [3, 2] }));
    const parts = expandStroke(s, { bakeDashes: true });
    expect(parts.map((p) => p.role)).toEqual(['line']);
    expect(parts[0].shape.stroke).toBeNull();
    expect(parts[0].shape.fill).toBe('#112233');
  });

  it('an arrow makes the line, shortened, and a head in the line colour', () => {
    const s = shape([line(0, 0, 100, 0)], st({ width: 4, arrowEnd: 'triangle' }));
    const parts = expandStroke(s);
    expect(parts.map((p) => p.role)).toEqual(['line', 'head-e0']);
    expect(parts[0].shape.paths[0].points.at(-1)!.x).toBeLessThan(100);
    expect(parts[1].shape.fill).toBe('#112233');
    expect(parts[1].shape.stroke).toBeNull();
    expect(parts[0].shape.id).toBe('s1~line');
  });

  it('arrows at both ends, and the line keeps its dashes', () => {
    const s = shape([line(0, 0, 200, 0)], st({ width: 4, arrowStart: 'open', arrowEnd: 'triangle', dash: [3, 2] }));
    const parts = expandStroke(s);
    expect(parts.map((p) => p.role)).toEqual(['line', 'head-e0', 'head-s0']);
    expect(parts[0].shape.stroke!.dash).toEqual([3, 2]);
    expect(parts[2].shape.stroke).toMatchObject({ width: 4, cap: 'round' });
  });

  it('closed shapes get no heads', () => {
    const sq: SubPath = { closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    const parts = expandStroke(shape([sq], st({ arrowEnd: 'triangle' })));
    expect(parts.every((p) => !p.role.startsWith('head'))).toBe(true);
  });

  it('a fill stays a part of its own when the outline becomes an area', () => {
    const s = shape([line(0, 0, 100, 0), line(0, 20, 100, 20)], st({ widths: WIDTH_PRESETS.swell.widths }), { fill: '#ff0000' });
    const parts = expandStroke(s);
    expect(parts.map((p) => p.role)).toEqual(['fill', 'line']);
    expect(parts[0].shape.stroke).toBeNull();
    expect(parts[1].shape.fill).toBe('#112233');
  });

  it('a gradient line keeps its gradient on whatever paints it', () => {
    const g = { kind: 'linear' as const, stops: [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }], from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const s = shape([line(0, 0, 100, 0)], st({ widths: WIDTH_PRESETS.taper.widths, arrowEnd: 'dot' }), { strokeGradient: g });
    const parts = expandStroke(s);
    expect(parts[0].shape.fillGradient).toEqual(g);
    expect(parts[1].shape.fillGradient).toEqual(g);
  });

  it('keeps the shape\'s id lineage and group on every part', () => {
    const s = shape([line(0, 0, 100, 0)], st({ arrowEnd: 'dot' }), { origin: 'o9', group: 'g1' });
    for (const p of expandStroke(s)) {
      expect(p.shape.origin).toBe('o9');
      expect(p.shape.group).toBe('g1');
    }
  });

  it('is remembered per shape, so drawing a frame again costs nothing', () => {
    const s = shape([line(0, 0, 100, 0)], st({ arrowEnd: 'triangle' }));
    expect(expandStroke(s)).toBe(expandStroke(s));
  });

  it('in split mode an unstyled shape still comes as fill and line, so frames pair up', () => {
    const s = shape([line(0, 0, 100, 0)], st());
    expect(expandStroke(s, { split: true }).map((p) => p.role)).toEqual(['line']);
  });

  it('reaches past the line for heads and wide stops, so ink boxes leave room', () => {
    expect(styleReach(st({ width: 4, arrowEnd: 'triangle' }))).toBeGreaterThanOrEqual(headLength({ width: 4 }));
    expect(styleReach(st({ width: 10, widths: [{ at: 0, w: 3 }] }))).toBeGreaterThan(15);
    expect(styleReach(st())).toBe(0);
  });
});

describe('reading a file safely', () => {
  it('drops what makes no sense and keeps the rest', () => {
    const bad = { color: '#000', width: 4, join: 'round', cap: 'round', dash: [0, 0], dashOffset: 3, arrowStart: 'laser', arrowEnd: 'dot', arrowSize: -2, widths: [{ at: 'x', w: 1 }] } as unknown as PathStroke;
    const c = cleanStrokeStyle(bad);
    expect(c.dash).toBeUndefined();
    expect(c.dashOffset).toBeUndefined();
    expect(c.arrowStart).toBeUndefined();
    expect(c.arrowEnd).toBe('dot');
    expect(c.arrowSize).toBeUndefined();
    expect(c.widths).toBeUndefined();
  });

  it('leaves a plain stroke exactly alone', () => {
    const plain = st();
    expect(cleanStrokeStyle(plain)).toEqual(plain);
  });

  it('keeps good fields', () => {
    const good = st({ dash: [3, 2], dashOffset: 1, arrowEnd: 'triangle', arrowSize: 5, widths: [{ at: 0, w: 1 }] });
    expect(cleanStrokeStyle(good)).toEqual(good);
  });
});
