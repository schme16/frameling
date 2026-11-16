// Brush dynamics: what each source does to each setting, routes read back safely, and a path whose dabs follow them.
import { describe, expect, it } from 'vitest';
import { cleanRoutes, drivesFrom, routeFor, START_AMOUNT, withRoute, effectsOf, fadeValue, headingValue, lerpInputs, MAX_ROUTES, NEUTRAL, SPEED_REF, speedValue, touchesColour, type DynRoute } from '../../src/dab/dynamics';
import { cleanDab, DabPath, DEFAULT_DAB, makeRng, type DabBrush } from '../../src/dab/maths';
import { senseOf, SpeedMeter } from '../../src/dab/sense';

const route = (from: DynRoute['from'], to: DynRoute['to'], amount = 1, invert = false): DynRoute => ({ from, to, amount, invert });
const fx = (r: DynRoute[], i: Parameters<typeof effectsOf>[1]) => effectsOf(r, i, 150);

describe('the sources', () => {
  it('speed rises from 0 towards 1 and never passes it', () => {
    expect(speedValue(0)).toBe(0);
    expect(speedValue(SPEED_REF)).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(speedValue(1000)).toBeLessThanOrEqual(1);
    expect(speedValue(0.5)).toBeLessThan(speedValue(1));
  });

  it('fade runs from 1 at the start to 0 at its length, and stays there', () => {
    expect(fadeValue(0, 100)).toBe(1);
    expect(fadeValue(25, 100)).toBe(0.75);
    expect(fadeValue(100, 100)).toBe(0);
    expect(fadeValue(500, 100)).toBe(0);
  });

  it('heading goes round the compass from 0 to 1, for any angle', () => {
    expect(headingValue(0)).toBe(0);
    expect(headingValue(Math.PI)).toBeCloseTo(0.5, 9);
    expect(headingValue(-Math.PI / 2)).toBeCloseTo(0.75, 9);
    expect(headingValue(Math.PI * 4.5)).toBeCloseTo(0.25, 9);
  });
});

describe('what a route does', () => {
  it('shrinks size by its amount where the source is 0, and leaves it alone where it is 1', () => {
    const r = [route('pressure', 'size', 0.8)];
    expect(fx(r, { pressure: 1 }).size).toBe(1);
    expect(fx(r, { pressure: 0 }).size).toBeCloseTo(0.2, 9);
    expect(fx(r, { pressure: 0.5 }).size).toBeCloseTo(0.6, 9);
  });

  it('flips with invert', () => {
    const r = [route('pressure', 'size', 1, true)];
    expect(fx(r, { pressure: 1 }).size).toBe(0);
    expect(fx(r, { pressure: 0 }).size).toBe(1);
  });

  it('multiplies when two routes drive the same setting', () => {
    const r = [route('pressure', 'flow', 0.5), route('speed', 'flow', 0.5)];
    expect(fx(r, { pressure: 0, speed: 0 }).flow).toBeCloseTo(0.25, 9);
  });

  it('adds scatter, turns the angle up to a full turn, and mixes colour towards the back colour', () => {
    expect(fx([route('speed', 'scatter', 0.5)], { speed: 1 }).scatter).toBe(0.5);
    expect(fx([route('tilt', 'angle', 1)], { tilt: 0.25 }).angle).toBeCloseTo(Math.PI / 2, 9);
    expect(fx([route('pressure', 'mix', 1)], { pressure: 0.3 }).mix).toBeCloseTo(0.3, 9);
  });

  it('swings hue, saturation and lightness both ways round the middle of the source', () => {
    const lo = fx([route('random', 'hue', 1), route('random', 'saturation', 1), route('random', 'lightness', 1)], { random: () => 0 });
    const hi = fx([route('random', 'hue', 1), route('random', 'saturation', 1), route('random', 'lightness', 1)], { random: () => 1 });
    expect([lo.hue, lo.sat, lo.light]).toEqual([-180, -1, -0.5]);
    expect([hi.hue, hi.sat, hi.light]).toEqual([180, 1, 0.5]);
    expect(fx([route('random', 'hue', 1)], { random: () => 0.5 }).hue).toBe(0);
  });

  it('sits out a route whose source the device does not have, so a mouse gets the plain brush', () => {
    const r = [route('pressure', 'size', 1), route('tilt', 'flow', 1), route('twist', 'angle', 1)];
    const e = fx(r, {});
    expect([e.size, e.flow, e.angle]).toEqual([1, 1, 0]);
  });

  it('is the neutral push for a brush with no routes', () => {
    expect(fx([], { pressure: 0 })).toEqual(NEUTRAL);
  });

  it('only asks for a random number when a route wants one', () => {
    let asked = 0;
    const random = () => (asked++, 0.5);
    fx([route('pressure', 'size')], { pressure: 1, random });
    expect(asked).toBe(0);
    fx([route('random', 'size')], { random });
    expect(asked).toBe(1);
  });
});

describe('reading routes back', () => {
  it('keeps good ones, drops odd ones, and holds the amount to 0 to 1', () => {
    const r = cleanRoutes([{ from: 'pressure', to: 'size', amount: 4 }, { from: 'nope', to: 'size' }, null, 7, { from: 'speed', to: 'hue', amount: 'x', invert: true }]);
    expect(r).toEqual([
      { from: 'pressure', to: 'size', amount: 1, invert: false },
      { from: 'speed', to: 'hue', amount: 1, invert: true },
    ]);
  });

  it('is empty for anything that is not a list, and capped in length', () => {
    expect(cleanRoutes(undefined)).toEqual([]);
    expect(cleanRoutes({ from: 'speed' })).toEqual([]);
    expect(cleanRoutes(Array.from({ length: 100 }, () => route('speed', 'size')))).toHaveLength(MAX_ROUTES);
  });

  it('rides along in a brush, and a brush from before dynamics gets none', () => {
    const b = cleanDab({ size: 9, dynamics: [route('fade', 'size', 0.5)], fadeLength: 80, wet: 0.4 });
    expect(b.dynamics).toHaveLength(1);
    expect(b.fadeLength).toBe(80);
    expect(b.wet).toBe(0.4);
    const old = cleanDab({ size: 9, spacing: 0.3 });
    expect(old.dynamics).toEqual([]);
    expect(old.grain).toBeNull();
    expect(old.dual).toBeNull();
    expect(old.wet).toBe(0);
  });

  it('knows which settings the brush drives, and which routes touch colour', () => {
    expect(drivesFrom([route('pressure', 'size')], 'size', ['pressure', 'tilt'])).toBe(true);
    expect(drivesFrom([route('speed', 'size')], 'size', ['pressure', 'tilt'])).toBe(false);
    expect(touchesColour([route('speed', 'size')])).toBe(false);
    expect(touchesColour([route('speed', 'hue')])).toBe(true);
  });
});

describe('blending two senses', () => {
  it('goes part of the way, and keeps a missing source missing', () => {
    const o = lerpInputs({ pressure: 0, speed: 0.2 }, { pressure: 1, speed: 0.6 }, 0.25, {});
    expect(o.pressure).toBeCloseTo(0.25, 9);
    expect(o.speed).toBeCloseTo(0.3, 9);
    expect(lerpInputs({}, { pressure: 1 }, 0.5, {}).pressure).toBe(1);
    expect(lerpInputs({ pressure: 1 }, {}, 0.5, {}).pressure).toBeUndefined();
  });
});

describe('the pointer as a sense', () => {
  it('has pressure, tilt and twist only when the device gives them', () => {
    expect(senseOf({ hasPressure: false, pressure: 0.5 }, 0.2)).toEqual({ speed: 0.2 });
    const pen = senseOf({ hasPressure: true, pressure: 0.7, tiltX: 0, tiltY: 0, twist: 90 }, 0);
    expect(pen.pressure).toBe(0.7);
    expect(pen.tilt).toBe(0);
    expect(pen.twist).toBe(90);
  });

  it('measures speed from distance over time, smoothed, and 0 for the first point', () => {
    const m = new SpeedMeter();
    expect(m.push(0, 0, 0)).toBe(0);
    const a = m.push(10, 0, 10);
    const b = m.push(20, 0, 20);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    // Two events in one millisecond change nothing.
    expect(m.push(30, 0, 20)).toBe(b);
  });
});

describe('a path with dynamics', () => {
  const line = (b: Partial<DabBrush>, n = 60) => {
    const p = new DabPath({ ...DEFAULT_DAB, ...b }, makeRng(3));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(...p.to({ x: i * 4, y: 10 }, 10, 1, { pressure: i / n, speed: 0.5 }));
    return out;
  };

  it('is the same as before for a brush with no routes', () => {
    const a = line({});
    const b = new DabPath({ ...DEFAULT_DAB }, makeRng(3));
    const c = [];
    for (let i = 0; i <= 60; i++) c.push(...b.to({ x: i * 4, y: 10 }, 10, 1));
    expect(a).toEqual(c);
  });

  it('makes the dabs bigger as pressure rises, and keeps the gap in step with the size', () => {
    const d = line({ dynamics: [route('pressure', 'size', 1)], spacing: 0.5 });
    expect(d[0].size).toBeLessThan(d[d.length - 1].size);
    const gaps = d.slice(1).map((e, i) => e.x - d[i].x);
    expect(gaps[0]).toBeLessThan(gaps[gaps.length - 1]);
    // The gap is about half the size, at the small end and at the big end.
    expect(gaps[gaps.length - 1]).toBeCloseTo(d[d.length - 2].size * 0.5, 0);
  });

  it('tapers a stroke with a fade, down to the smallest dab at the end', () => {
    const d = line({ dynamics: [route('fade', 'size', 1)], fadeLength: 200, spacing: 0.25 });
    expect(d[0].size).toBeCloseTo(10, 5);
    expect(d[d.length - 1].size).toBeLessThan(d[0].size / 3);
    for (let i = 1; i < d.length; i++) expect(d[i].size).toBeLessThanOrEqual(d[i - 1].size + 1e-9);
  });

  it('carries colour pushes on the dab only when there are some', () => {
    const d = line({ dynamics: [route('pressure', 'hue', 0.5)] });
    expect(d[0].hue).toBeCloseTo(-90, 9);
    expect(d[d.length - 1].hue).toBeCloseTo(90, 5);
    const e = line({ dynamics: [route('random', 'hue', 0.5)] });
    expect(e.some((x) => x.hue !== undefined && x.hue !== 0)).toBe(true);
    expect(line({})[0].hue).toBeUndefined();
  });

  it('is repeatable: the same seed gives the same random dynamics', () => {
    const b = { dynamics: [route('random', 'size', 1)] };
    expect(line(b).map((x) => x.size)).toEqual(line(b).map((x) => x.size));
  });
});

describe('the options rows', () => {
  it('make a route when a source is first picked, at the usual starting amount', () => {
    const r = withRoute([], 'size', { from: 'pressure' });
    expect(r).toEqual([{ from: 'pressure', to: 'size', amount: START_AMOUNT.size, invert: false }]);
    expect(routeFor(r, 'size')?.from).toBe('pressure');
    expect(routeFor(r, 'flow')).toBeNull();
  });

  it('change the first route for a setting and leave the rest', () => {
    const start = [route('speed', 'flow', 0.5), route('pressure', 'size', 0.5), route('fade', 'size', 1)];
    const r = withRoute(start, 'size', { from: 'tilt', amount: 0.9 });
    expect(r[1]).toEqual({ from: 'tilt', to: 'size', amount: 0.9, invert: false });
    expect(r[2]).toEqual(start[2]);
    expect(r[0]).toEqual(start[0]);
  });

  it('take the first route away on null, and do nothing for an amount with no route to change', () => {
    const start = [route('pressure', 'size', 0.5), route('fade', 'size', 1)];
    expect(withRoute(start, 'size', null)).toEqual([start[1]]);
    expect(withRoute(start, 'flow', null)).toEqual(start);
    expect(withRoute([], 'flow', { amount: 0.5 })).toEqual([]);
  });
});
