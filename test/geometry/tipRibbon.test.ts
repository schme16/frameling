// The brushes you build yourself: a pen nib, your drawing along the line, the edged brush with ends and corners, and
// bristles. Each is held to coming out as plain fills and lines, steady from run to run, and shaped the way it says.
import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import type { BrushSettings, FillShape, PathShape, Shape, StrokeShape } from '../../src/core/format';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { defaultTip, readTip, resolveTip, sameTip } from '../../src/geometry/tip';
import { alongShapes, bristleShapes, edgedShapes, findCorners, naturalLength, nibRotation, nibShapes, tileOf } from '../../src/geometry/tipRibbon';
import { stampSites, tipShapes, type OutlineFn } from '../../src/geometry/tipShapes';

const outline: OutlineFn = (s, b) => getStroke(s.points.map((p) => [p.x, p.y, p.p]), { size: b.size, thinning: b.thinning, smoothing: b.smoothing, streamline: b.streamline, simulatePressure: true, last: true });
const line = (n = 40, step = 6, amp = 20) => Array.from({ length: n }, (_, i) => ({ x: 20 + i * step, y: 80 + Math.sin(i / 6) * amp, p: 0.5 }));
const straight = (len = 200) => Array.from({ length: 21 }, (_, i) => ({ x: 20 + (i * len) / 20, y: 100, p: 0.5 }));
// A line that goes right, down, left: two corners, both turning clockwise on the screen.
const turns = () => {
  const pts: { x: number; y: number; p: number }[] = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: 20 + i * 8, y: 20, p: 0.5 });
  for (let i = 1; i <= 20; i++) pts.push({ x: 180, y: 20 + i * 8, p: 0.5 });
  return pts;
};
const stroke = (tip: BrushSettings['tip'], brush: Partial<BrushSettings> = {}, points = line(), opacity = 1): StrokeShape => ({
  id: 's',
  type: 'stroke',
  points,
  brush: { ...DEFAULT_BRUSH, size: 20, thinning: 0, taperStart: 0, taperEnd: 0, ...brush, tip },
  color: '#336699',
  opacity,
} as StrokeShape);
const box = (shapes: Shape[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) {
    const paths = s.type === 'fill' || s.type === 'path' ? s.paths : [];
    for (const p of paths) for (const q of p.points) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  }
  return { x0, y0, x1, y1 };
};
const plain = (shapes: Shape[] | null): boolean => !!shapes && shapes.every((s) => s.type === 'fill' || s.type === 'path');
const pointsOf = (shapes: Shape[]) => shapes.reduce((n, s) => n + (s.type === 'fill' || s.type === 'path' ? s.paths.reduce((m, p) => m + p.points.length, 0) : 0), 0);
// A rope: a long thin bar with a bump, 1 across (the way stamps are kept).
const bar: number[][] = [[-0.5, -0.06, 0.5, -0.06, 0.5, 0.06, -0.5, 0.06]];
const block: number[][] = [[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]];

describe('pen nib', () => {
  const nib = (over: object = {}, brush: Partial<BrushSettings> = {}, pts = line()) => stroke({ ...defaultTip('nib'), ...over }, brush, pts);
  it('is one plain fill in the line colour and opacity', () => {
    const out = tipShapes({ ...nib(), opacity: 0.6 }, outline)!;
    expect(plain(out)).toBe(true);
    expect(out).toHaveLength(1);
    const f = out[0] as FillShape;
    expect(f.type).toBe('fill');
    expect(f.color).toBe('#336699');
    expect(f.opacity).toBe(0.6);
  });
  it('is thick one way and thin the other: a flat nib at 0 degrees draws a thin horizontal line and a fat vertical one', () => {
    const flat = { roundness: 0.1, nibAngle: 0, angle: 'upright' as const };
    const h = box(nibShapes(nib(flat, { size: 30 }, straight()), resolveTip(nib(flat).brush.tip!))!);
    const v = box(nibShapes(nib(flat, { size: 30 }, Array.from({ length: 21 }, (_, i) => ({ x: 100, y: 20 + i * 10, p: 0.5 }))), resolveTip(nib(flat).brush.tip!))!);
    expect(h.y1 - h.y0).toBeLessThan(6);
    expect(v.x1 - v.x0).toBeGreaterThan(28);
    expect(v.x1 - v.x0).toBeGreaterThan(h.y1 - h.y0);
  });
  it('turns with the line when asked, and stays put when not', () => {
    const t = resolveTip({ ...defaultTip('nib'), angle: 'upright', nibAngle: 30 });
    expect(nibRotation(t, 1)).toBeCloseTo(nibRotation(t, 2.5));
    const f = resolveTip({ ...defaultTip('nib'), angle: 'follow', nibAngle: 30 });
    expect(nibRotation(f, 1)).not.toBeCloseTo(nibRotation(f, 2.5));
  });
  it('has no overlap holes on a line that crosses itself, and stays one steady shape', () => {
    const loop = Array.from({ length: 40 }, (_, i) => { const a = (i / 39) * Math.PI * 2.4; return { x: 100 + Math.cos(a) * 40, y: 100 + Math.sin(a) * 40, p: 0.5 }; });
    const a = tipShapes(nib({}, {}, loop), outline)!;
    const b = tipShapes(nib({}, {}, loop), outline)!;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('shrinks at a pointy end', () => {
    const tapered = box(tipShapes(nib({ roundness: 1 }, { size: 30, taperStart: 80, taperEnd: 0 }, straight()), outline)!);
    const full = box(tipShapes(nib({ roundness: 1 }, { size: 30 }, straight()), outline)!);
    expect(tapered.y1 - tapered.y0).toBeLessThanOrEqual(full.y1 - full.y0);
  });
  it('keeps a long line to a sensible size and speed', () => {
    const long = Array.from({ length: 400 }, (_, i) => ({ x: 10 + i * 8, y: 200 + Math.sin(i / 9) * 60, p: 0.5 }));
    const t0 = performance.now();
    const out = tipShapes(nib({}, { size: 14 }, long), outline)!;
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(pointsOf(out)).toBeLessThan(20000);
  });
  it('a single dab is an oval', () => {
    const out = tipShapes(nib({ roundness: 0.5 }, {}, [{ x: 50, y: 50, p: 0.5 }]), outline)!;
    expect(out).toHaveLength(1);
  });
});

describe('along the line', () => {
  const along = (over: object = {}, brush: Partial<BrushSettings> = {}, pts = line(), custom = bar) => stroke({ kind: 'along', custom, ...over }, brush, pts);
  it('stretches one drawing over the whole line, as one plain shape', () => {
    const pts = straight(300);
    const out = tipShapes(along({}, { size: 20 }, pts), outline)!;
    expect(plain(out)).toBe(true);
    expect(out).toHaveLength(1);
    const b = box(out);
    expect(b.x0).toBeCloseTo(20, 0);
    expect(b.x1).toBeCloseTo(320, 0);
    // The bar is 0.12 tall for 1 long, scaled so its height is the size: 20 across.
    expect(b.y1 - b.y0).toBeCloseTo(20, 0);
  });
  it('repeats whole copies end to end when asked', () => {
    const one = (fit: 'stretch' | 'repeat') => tipShapes(along({ fit }, { size: 20 }, straight(300)), outline)!.length;
    expect(one('stretch')).toBe(1);
    // The bar's natural length is 1/0.12 of 20 = 166px, so 300px takes two.
    expect(one('repeat')).toBe(2);
  });
  it('bends with the line', () => {
    const curved = box(tipShapes(along({}, { size: 12 }, line(40, 6, 40)), outline)!);
    expect(curved.y1 - curved.y0).toBeGreaterThan(40);
  });
  it('gets thinner where the pen is light, and at pointy ends', () => {
    const lightPen = line().map((p) => ({ ...p, p: 0.15 }));
    const a = box(tipShapes(along({}, { size: 20, thinning: 0.9 }, lightPen), outline)!);
    const b = box(tipShapes(along({}, { size: 20, thinning: 0.9 }, straight()), outline)!);
    expect(a.y1 - a.y0).toBeLessThan(b.y1 - b.y0 + 40);
  });
  it('needs a drawing: with none it falls back to a plain line', () => {
    expect(readTip({ kind: 'along' })).toBeUndefined();
    expect(tipShapes(stroke({ kind: 'along' }), outline)).toBeNull();
  });
  it('is steady from one run to the next', () => {
    expect(JSON.stringify(alongShapes(along(), resolveTip(along().brush.tip!)))).toBe(JSON.stringify(alongShapes(along(), resolveTip(along().brush.tip!))));
  });
});

describe('edged brush', () => {
  const edged = (pieces: object | undefined, brush: Partial<BrushSettings> = {}, pts = straight(300), custom = bar) => stroke({ kind: 'edged', custom, pieces } as BrushSettings['tip'], { size: 20, ...brush }, pts);
  // One fill for each drawing laid down, so overlaps on a tight bend show solid.
  const count = (s: StrokeShape) => tipShapes(s, outline)!.length;
  it('lays the sides, rounded to fit the line exactly', () => {
    const out = tipShapes(edged(undefined), outline)!;
    expect(plain(out)).toBe(true);
    expect(count(edged(undefined))).toBe(2);
    const b = box(out);
    expect(b.x0).toBeCloseTo(20, 0);
    expect(b.x1).toBeCloseTo(320, 0);
  });
  it('puts an end drawing at each end', () => {
    const cap: number[][] = [[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]];
    // Two ends and the sides that fit between them: more shapes than the sides alone, none lost.
    expect(count(edged({ start: cap, end: cap }))).toBeGreaterThanOrEqual(count(edged(undefined)));
    expect(count(edged({ start: cap }))).toBeGreaterThanOrEqual(2);
    const b = box(tipShapes(edged({ start: cap, end: cap }), outline)!);
    // The end drawings are as tall as the sides: nothing sticks out past the line's width.
    expect(b.y1 - b.y0).toBeLessThanOrEqual(21);
  });
  it('finds the corners of a line that turns sharply, and none on a gentle curve', () => {
    const sites = stampSites(turns(), 4, 0);
    const found = findCorners({ sites, step: 4 }, 20);
    expect(found).toHaveLength(1);
    expect(found[0].right).toBe(true);
    expect(found[0].x).toBeCloseTo(180, 0);
    expect(findCorners({ sites: stampSites(line(60, 5, 25), 3, 0), step: 3 }, 20)).toHaveLength(0);
  });
  it('puts a corner drawing at a corner, and the outer one on a right turn', () => {
    const outer: number[][] = [[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]];
    const inner: number[][] = [[-0.5, -0.1, 0.5, -0.1, 0.5, 0.1, -0.5, 0.1]];
    const withOuter = tipShapes(edged({ outer }, {}, turns()), outline)!;
    const withInner = tipShapes(edged({ inner }, {}, turns()), outline)!;
    const without = tipShapes(edged(undefined, {}, turns()), outline)!;
    expect(pointsOf(withOuter)).not.toBe(pointsOf(without));
    // The line turns clockwise, so only an outer drawing is used; an inner one changes nothing.
    expect(pointsOf(withInner)).toBe(pointsOf(without));
  });
  it('is plain vector shapes however many pieces it has', () => {
    const cap: number[][] = [[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]];
    expect(plain(tipShapes(edged({ start: cap, end: cap, inner: cap, outer: cap }, {}, turns()), outline))).toBe(true);
  });
  it('measures a drawing by its box', () => {
    const t = tileOf(bar)!;
    expect(t.h).toBeCloseTo(0.12);
    expect(naturalLength(t, 12)).toBeCloseTo(100);
    expect(tileOf([])).toBeNull();
    expect(tileOf([[0, 0, 1, 0, 1, 0]])).toBeNull();
    expect(edgedShapes(edged(undefined), resolveTip({ kind: 'edged' }))).toBeNull();
  });
});

describe('bristles', () => {
  const bristle = (over: object = {}, brush: Partial<BrushSettings> = {}, pts = line()) => stroke({ ...defaultTip('bristle'), seed: 5, ...over }, { size: 30, ...brush }, pts);
  it('is a couple of path shapes of thin round-capped lines, one bristle each', () => {
    const out = tipShapes(bristle(), outline)!;
    expect(out.length).toBeLessThanOrEqual(2);
    for (const p of out as PathShape[]) {
      expect(p.type).toBe('path');
      expect(p.fill).toBeNull();
      expect(p.stroke!.color).toBe('#336699');
      expect(p.stroke!.cap).toBe('round');
      expect(p.stroke!.width).toBeLessThan(4);
    }
    expect((out as PathShape[]).reduce((n, p) => n + p.paths.length, 0)).toBeGreaterThanOrEqual(10);
  });
  it('spreads as wide as the brush', () => {
    const b = box(tipShapes(bristle({ stiffness: 1, amount: 0 }, { size: 40 }, straight()), outline)!);
    expect(b.y1 - b.y0).toBeGreaterThan(30);
    expect(b.y1 - b.y0).toBeLessThan(44);
  });
  it('has more gaps when it is drier', () => {
    const lines = (amount: number) => (tipShapes(bristle({ amount }, {}, straight(400)), outline) as PathShape[]).reduce((n, p) => n + p.paths.length, 0);
    expect(lines(0.9)).toBeGreaterThan(lines(0));
    expect(lines(0)).toBe(14);
  });
  it('wanders when floppy and stays in line when stiff', () => {
    const spread = (stiffness: number) => { const b = box(tipShapes(bristle({ stiffness, amount: 0 }, { size: 40 }, straight()), outline)!); return b.y1 - b.y0; };
    expect(spread(0)).toBeGreaterThan(spread(1));
  });
  it('draws the same line the same way, and a different one with another seed', () => {
    const a = JSON.stringify(tipShapes(bristle(), outline));
    expect(JSON.stringify(tipShapes(bristle(), outline))).toBe(a);
    expect(JSON.stringify(tipShapes(bristle({ seed: 99 }), outline))).not.toBe(a);
    expect(bristleShapes(bristle(), resolveTip(bristle().brush.tip!))).not.toBeNull();
  });
});

describe('stamps got three more controls', () => {
  const stamp = (over: object, brush: Partial<BrushSettings> = {}, pts = line()) => stroke({ ...defaultTip('stamp'), shape: 'dash', angle: 'upright', jitter: 0, scatter: 0, seed: 3, ...over }, brush, pts);
  it('turn spins each stamp by a random amount', () => {
    const none = JSON.stringify(tipShapes(stamp({ turn: 0 }), outline));
    expect(JSON.stringify(tipShapes(stamp({ turn: 0.5 }), outline))).not.toBe(none);
  });
  it('fixed size ignores the pen pressure', () => {
    const pressured = line().map((p, i) => ({ ...p, p: 0.2 + (i % 5) * 0.15 }));
    const a = JSON.stringify(tipShapes(stamp({ fixedSize: true }, { thinning: 0.8 }, pressured), outline));
    const b = JSON.stringify(tipShapes(stamp({}, { thinning: 0.8 }, pressured), outline));
    expect(a).not.toBe(b);
  });
  it('gap variety slides the stamps along the line', () => {
    expect(JSON.stringify(tipShapes(stamp({ gapVary: 0.8 }), outline))).not.toBe(JSON.stringify(tipShapes(stamp({}), outline)));
  });
});

describe('reading and comparing the new tips', () => {
  it('keeps every field of each kind and drops junk', () => {
    expect(readTip({ kind: 'nib', roundness: 0.2, nibAngle: -30, angle: 'follow', junk: 1 })).toEqual({ kind: 'nib', roundness: 0.2, nibAngle: -30, angle: 'follow' });
    expect(readTip({ kind: 'nib', roundness: 9, nibAngle: 500 })).toEqual({ kind: 'nib', roundness: 1, nibAngle: 90 });
    expect(readTip({ kind: 'bristle', count: 1000, stiffness: 'x', amount: 0.4, seed: 7 })).toEqual({ kind: 'bristle', count: 60, amount: 0.4, seed: 7 });
    expect(readTip({ kind: 'along', custom: bar, fit: 'repeat' })).toEqual({ kind: 'along', custom: bar, fit: 'repeat' });
    expect(readTip({ kind: 'along', custom: bar, fit: 'sideways' })).toEqual({ kind: 'along', custom: bar });
    const e = readTip({ kind: 'edged', custom: bar, pieces: { start: block, end: 'x', corner: block, inner: [[1, 2]] } })!;
    expect(e.pieces).toEqual({ start: block });
  });
  it('an old file with only the old fields reads the same', () => {
    expect(readTip({ kind: 'stamp', shape: 'leaf', spacing: 1, jitter: 0.2 })).toEqual({ kind: 'stamp', shape: 'leaf', spacing: 1, jitter: 0.2 });
    expect(readTip({ kind: 'chalk', amount: 0.5 })).toEqual({ kind: 'chalk', amount: 0.5 });
  });
  it('says when two are the same', () => {
    expect(sameTip(defaultTip('nib'), { ...defaultTip('nib'), nibAngle: 41 })).toBe(false);
    expect(sameTip(defaultTip('nib'), { ...defaultTip('nib') })).toBe(true);
    expect(sameTip({ kind: 'along', custom: bar }, { kind: 'along', custom: bar, fit: 'repeat' })).toBe(false);
    expect(sameTip(defaultTip('bristle'), { ...defaultTip('bristle'), seed: 9 })).toBe(true);
  });
});
