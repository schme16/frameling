// Pressure curves: reading them safely, the smooth line through the points, the editor's moves, and a route that uses one.
import { describe, expect, it } from 'vitest';
import { addPoint, cleanCurve, curveAt, feelOf, FEELS, isStraight, MAX_CURVE_POINTS, MIN_GAP, movePoint, removePoint, sameCurve, shape, STRAIGHT, thin } from '../../src/dab/curve';
import { cleanRoutes, effectsOf, sameRoutes, withRoute, type DynRoute } from '../../src/dab/dynamics';
import { cleanDab, DEFAULT_DAB } from '../../src/dab/maths';
import { cleanSpec, sameSpec } from '../../src/dab/spec';

describe('reading a curve', () => {
  it('keeps a good curve as it is', () => {
    expect(cleanCurve([[0, 0], [0.5, 0.8], [1, 1]])).toEqual([[0, 0], [0.5, 0.8], [1, 1]]);
  });

  it('gives nothing back for a straight line, junk, or too little', () => {
    expect(cleanCurve([[0, 0], [1, 1]])).toBeNull();
    expect(cleanCurve('no')).toBeNull();
    expect(cleanCurve([[0, 0]])).toBeNull();
    expect(cleanCurve([['a', 1], [NaN, 2]])).toBeNull();
    expect(cleanCurve(null)).toBeNull();
  });

  it('holds points to 0 to 1, puts them in order and pins the ends', () => {
    const c = cleanCurve([[1, 1], [0.5, 2], [-3, 0.2]])!;
    expect(c[0][0]).toBe(0);
    expect(c[c.length - 1][0]).toBe(1);
    expect(c.every((p) => p[1] >= 0 && p[1] <= 1)).toBe(true);
    for (let i = 1; i < c.length; i++) expect(c[i][0]).toBeGreaterThan(c[i - 1][0]);
  });

  it('merges points that sit on top of each other', () => {
    const c = cleanCurve([[0, 0], [0.5, 0.2], [0.505, 0.9], [1, 1]])!;
    expect(c).toHaveLength(3);
  });

  it('thins a long list down to the limit and keeps the shape', () => {
    const many = Array.from({ length: 40 }, (_, i) => [i / 39, Math.pow(i / 39, 2)] as [number, number]);
    const c = cleanCurve(many)!;
    expect(c.length).toBeLessThanOrEqual(MAX_CURVE_POINTS);
    for (const x of [0.2, 0.5, 0.8]) expect(Math.abs(curveAt(c, x) - x * x)).toBeLessThan(0.05);
  });

  it('thin drops a point on the line before it drops a corner', () => {
    const t = thin([[0, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.9], [1, 1]], 4);
    expect(t.map((p) => p[0])).not.toContain(0.25);
    expect(t.map((p) => p[0])).toContain(0.75);
  });
});

describe('the line through the points', () => {
  it('passes through every point and is straight when they are', () => {
    const c = [[0, 0], [0.3, 0.6], [1, 1]] as const;
    for (const p of c) expect(curveAt(c, p[0])).toBeCloseTo(p[1], 9);
    expect(curveAt(STRAIGHT, 0.37)).toBeCloseTo(0.37, 9);
  });

  it('never wiggles past its own points (monotone) and stays in 0 to 1', () => {
    for (const f of FEELS) {
      let last = -1;
      for (let i = 0; i <= 200; i++) {
        const y = curveAt(f.curve, i / 200);
        expect(y).toBeGreaterThanOrEqual(last - 1e-9);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
        last = y;
      }
    }
  });

  it('light touch lifts the middle and firm hand holds it down', () => {
    const light = FEELS.find((f) => f.id === 'light')!.curve;
    const firm = FEELS.find((f) => f.id === 'firm')!.curve;
    expect(curveAt(light, 0.3)).toBeGreaterThan(0.3);
    expect(curveAt(firm, 0.3)).toBeLessThan(0.3);
  });

  it('ignore the lightest gives nothing under a fifth', () => {
    const c = FEELS.find((f) => f.id === 'ignore-light')!.curve;
    expect(curveAt(c, 0.1)).toBe(0);
    expect(curveAt(c, 0.2)).toBeCloseTo(0, 9);
    expect(curveAt(c, 1)).toBe(1);
  });

  it('the lookup agrees with the direct sum to within a hair', () => {
    const c = FEELS[1].curve;
    for (let i = 0; i <= 97; i++) expect(Math.abs(shape(c, i / 97) - curveAt(c, i / 97))).toBeLessThan(0.002);
    expect(shape(c, -1)).toBe(0);
    expect(shape(c, 5)).toBe(1);
  });
});

describe('the editor moves', () => {
  const base = [[0, 0], [0.5, 0.5], [1, 1]] as const;

  it('moves a middle point inside its neighbours, and an end only up and down', () => {
    expect(movePoint(base, 1, 0.999, 0.3)[1]).toEqual([1 - MIN_GAP, 0.3]);
    expect(movePoint(base, 0, 0.4, 0.2)[0]).toEqual([0, 0.2]);
    expect(movePoint(base, 2, 0.4, 2)[2]).toEqual([1, 1]);
  });

  it('adds a point on the curve where it is, so nothing changes until it is dragged', () => {
    const a = addPoint(base, 0.25)!;
    expect(a.index).toBe(1);
    expect(a.curve).toHaveLength(4);
    expect(curveAt(a.curve, 0.25)).toBeCloseTo(curveAt(base, 0.25), 2);
  });

  it('refuses a point that crowds another, and one past the limit', () => {
    expect(addPoint(base, 0.51)).toBeNull();
    const full = Array.from({ length: MAX_CURVE_POINTS }, (_, i) => [i / (MAX_CURVE_POINTS - 1), i / (MAX_CURVE_POINTS - 1)] as const);
    expect(addPoint(full, 0.05)).toBeNull();
  });

  it('removes a middle point and never an end', () => {
    expect(removePoint(base, 1)).toHaveLength(2);
    expect(removePoint(base, 0)).toBe(base);
    expect(removePoint(base, 2)).toBe(base);
  });

  it('knows the ready-made feels, and none for a hand-made one', () => {
    for (const f of FEELS) expect(feelOf(f.curve)?.id).toBe(f.id);
    expect(feelOf([[0, 0], [0.5, 0.9], [1, 1]])).toBeNull();
    expect(isStraight(undefined)).toBe(true);
    expect(sameCurve(undefined, STRAIGHT)).toBe(true);
  });
});

describe('a route with a curve', () => {
  const r = (curve?: DynRoute['curve'], invert = false): DynRoute => ({ from: 'pressure', to: 'size', amount: 1, invert, ...(curve ? { curve } : {}) });
  const light = FEELS[1].curve;

  it('changes what the route feels, and nothing else', () => {
    const plain = effectsOf([r()], { pressure: 0.3 }, 150).size;
    const bent = effectsOf([r(light)], { pressure: 0.3 }, 150).size;
    expect(plain).toBeCloseTo(0.3, 9);
    expect(bent).toBeGreaterThan(plain);
    expect(effectsOf([r(light)], { pressure: 1 }, 150).size).toBeCloseTo(1, 9);
  });

  it('is applied before the flip, so the graph reads the same either way round', () => {
    const a = effectsOf([r(light, true)], { pressure: 0.3 }, 150).size;
    expect(a).toBeCloseTo(1 - curveAt(light, 0.3), 2);
  });

  it('a mouse (no pressure to bend) still gets the plain brush', () => {
    expect(effectsOf([r(light)], {}, 150).size).toBe(1);
  });

  it('survives being read back, and a malformed curve is dropped, not trusted', () => {
    const back = cleanRoutes(JSON.parse(JSON.stringify([r(light)])));
    expect(back[0].curve).toEqual(light);
    expect(cleanRoutes([{ from: 'pressure', to: 'size', amount: 1, invert: false, curve: 'junk' }])[0].curve).toBeUndefined();
    expect(cleanRoutes([{ from: 'pressure', to: 'size', amount: 1, invert: false, curve: [[0, 0], [1, 1]] }])[0]).not.toHaveProperty('curve');
  });

  it('counts as a difference between two routes', () => {
    expect(sameRoutes([r()], [r(light)])).toBe(false);
    expect(sameRoutes([r(light)], [r(light)])).toBe(true);
  });

  it('withRoute sets and clears it without touching the rest', () => {
    const once = withRoute([r()], 'size', { curve: light });
    expect(once[0].curve).toEqual(light);
    expect(once[0].amount).toBe(1);
    expect(withRoute(once, 'size', { curve: undefined })[0].curve).toBeUndefined();
  });

  it('rides along in a saved brush', () => {
    const dab = cleanDab({ ...DEFAULT_DAB, dynamics: [r(light)] });
    const spec = cleanSpec(JSON.parse(JSON.stringify({ kind: 'dab', dab })))!;
    expect(sameSpec(spec, { kind: 'dab', dab })).toBe(true);
    expect(sameSpec(spec, { kind: 'dab', dab: cleanDab({ ...DEFAULT_DAB, dynamics: [r()] }) })).toBe(false);
  });
});
