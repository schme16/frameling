// The chalk and charcoal trials (`tip.trial`): tone from pressure, a thinner edge, a second pass that fills in, all
// inside the current model of fills with holes and see-through fills. Off unless a tip asks for it.
import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import type { BrushSettings, BrushTip, FillShape, Shape, StrokeShape } from '../../src/core/format';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { defaultTip } from '../../src/geometry/tip';
import { GRAIN_LAYERS, idSeed, parseTrial, pressureLookup, pressureRuns, tipShapes, type OutlineFn } from '../../src/geometry/tipShapes';

const outline: OutlineFn = (s, b) => getStroke(s.points.map((p) => [p.x, p.y, p.p]), { size: b.size, thinning: b.thinning, smoothing: b.smoothing, streamline: b.streamline, simulatePressure: true, last: true });
const ramp = (n = 40): { x: number; y: number; p: number }[] => Array.from({ length: n }, (_, i) => ({ x: 20 + i * 6, y: 80 + Math.sin(i / 6) * 20, p: i / (n - 1) }));
const stroke = (trial: string | undefined, points = ramp(), id = 's', size = 20): StrokeShape => ({
  id,
  type: 'stroke',
  points,
  brush: { ...DEFAULT_BRUSH, size, tip: { ...defaultTip('charcoal'), ...(trial ? { trial } : {}) } as BrushTip } as BrushSettings,
  color: '#222222',
  opacity: 1,
});
const fills = (s: Shape[] | null): FillShape[] => (s ?? []).filter((x): x is FillShape => x.type === 'fill');
const holes = (f: FillShape[]): number => f.reduce((a, x) => a + x.paths.length - 1, 0);

describe('parseTrial', () => {
  it('is off without a word, and reads each part', () => {
    expect(parseTrial(undefined)).toBeNull();
    expect(parseTrial('edge+seed')).toEqual({ edge: true, press: false, seed: true, layers: false });
    expect(parseTrial('all')).toEqual({ edge: true, press: true, seed: true, layers: true });
  });
  it('leaves an ordinary tip alone: one fill, opaque', () => {
    const f = fills(tipShapes(stroke(undefined), outline));
    expect(f).toHaveLength(1);
    expect(f[0].opacity).toBe(1);
  });
});

describe('pressureRuns', () => {
  it('cuts a line where the pressure crosses the limit', () => {
    const pts = [0, 0.2, 0.6, 0.8, 0.4, 0.1, 0.7, 0.9].map((p, i) => ({ x: i * 10, y: 0, p }));
    const runs = pressureRuns(pts, 0.5);
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(r.length).toBeGreaterThanOrEqual(2);
      expect(Math.min(...r.map((q) => q.p))).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    // The first run starts three quarters of the way from the 0.2 point to the 0.6 point
    expect(runs[0][0].x).toBeCloseTo(17.5, 5);
  });
  it('gives nothing when the pen never got there, and everything when it always did', () => {
    const pts = [0.1, 0.2, 0.3].map((p, i) => ({ x: i, y: 0, p }));
    expect(pressureRuns(pts, 0.5)).toEqual([]);
    expect(pressureRuns(pts, 0)).toHaveLength(1);
  });
});

describe('pressureLookup', () => {
  it('gives the pressure of the nearest pen sample', () => {
    const at = pressureLookup([{ x: 0, y: 0, p: 0.1 }, { x: 100, y: 0, p: 0.9 }], 20);
    expect(at(5, 3)).toBe(0.1);
    expect(at(96, -2)).toBe(0.9);
  });
});

describe('the pressure trial', () => {
  it('leaves more holes where the pen was light', () => {
    const light = holes(fills(tipShapes(stroke('press', ramp().map((p) => ({ ...p, p: 0.1 }))), outline)));
    const firm = holes(fills(tipShapes(stroke('press', ramp().map((p) => ({ ...p, p: 0.95 }))), outline)));
    expect(light).toBeGreaterThan(firm);
  });
});

describe('the own-seed trial', () => {
  it('moves the holes from one line to the next, and keeps them for one line', () => {
    const a = tipShapes(stroke('seed', ramp(), 'a'), outline);
    const a2 = tipShapes(stroke('seed', ramp(), 'a'), outline);
    const b = tipShapes(stroke('seed', ramp(), 'b'), outline);
    expect(JSON.stringify(a)).toBe(JSON.stringify(a2));
    expect(JSON.stringify(fills(a)[0].paths.slice(1))).not.toBe(JSON.stringify(fills(b)[0].paths.slice(1)));
    expect(idSeed('a')).not.toBe(idSeed('b'));
  });
  it('without it, two lines share their grain (the grid is fixed to the page)', () => {
    const a = fills(tipShapes(stroke(undefined, ramp(), 'a'), outline))[0];
    const b = fills(tipShapes(stroke(undefined, ramp(), 'b'), outline))[0];
    expect(JSON.stringify(a.paths)).toBe(JSON.stringify(b.paths));
  });
});

describe('the layers trial', () => {
  it('is see-through fills, a pale one under the whole line and darker narrower ones where the pen was pressed', () => {
    const f = fills(tipShapes(stroke('layers'), outline));
    expect(f.length).toBeGreaterThan(1);
    for (const x of f) {
      expect(x.opacity).toBeLessThan(1);
      expect(x.color).toBe('#222222');
    }
    expect(Math.max(...f.map((x) => x.opacity))).toBeLessThanOrEqual(Math.max(...GRAIN_LAYERS.map((l) => l.opacity)));
  });
  it('shows fewer layers for a light line than a firm one, so pressure sets the tone', () => {
    const light = fills(tipShapes(stroke('layers', ramp().map((p) => ({ ...p, p: 0.15 }))), outline));
    const firm = fills(tipShapes(stroke('layers', ramp().map((p) => ({ ...p, p: 0.95 }))), outline));
    expect(firm.length).toBeGreaterThan(light.length);
  });
  it('keeps the line opacity as the most any layer can reach', () => {
    const s = { ...stroke('layers'), opacity: 0.5 };
    for (const x of fills(tipShapes(s, outline))) expect(x.opacity).toBeLessThanOrEqual(0.5 * 0.5 + 1e-9);
  });
});
