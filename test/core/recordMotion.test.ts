import { describe, expect, it } from 'vitest';
import { fitEase, fitPath, planMove, playKeys, progressOf, resample, stageScale, thinKeys, toleranceFor, type Sample } from '../../src/core/recordMotion';
import { pointOnPath } from '../../src/core/symbols';

/** A seeded wobble, so a failure repeats. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A hand movement sampled every 8 ms: pos(u) for u in 0..1 over `secs`, plus a little shake. */
function drag(secs: number, pos: (u: number) => { x: number; y: number }, shake = 0, seed = 1): Sample[] {
  const r = rng(seed);
  const out: Sample[] = [];
  for (let t = 0; t <= secs + 1e-9; t += 0.008) {
    const p = pos(Math.min(1, t / secs));
    out.push({ t, x: p.x + (r() - 0.5) * shake, y: p.y + (r() - 0.5) * shake });
  }
  return out;
}

const line = (u: number) => ({ x: 400 * u, y: 100 * u });

describe('reading a drag once per frame', () => {
  it('makes one point per frame, relative to where it started', () => {
    const pts = resample(drag(1, (u) => ({ x: 50 + 100 * u, y: 20 }), 0), 24);
    expect(pts.length).toBe(25);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[24].x).toBeCloseTo(100, 3);
    expect(pts[12].x).toBeCloseTo(50, 0);
  });

  it('copes with unsorted, repeated and bad readings, and with too little', () => {
    expect(resample([], 24)).toEqual([]);
    expect(resample([{ t: 0, x: 0, y: 0 }], 24)).toEqual([]);
    const pts = resample([{ t: 0.5, x: 10, y: 0 }, { t: 0, x: 0, y: 0 }, { t: 0.5, x: 10, y: 0 }, { t: NaN, x: 1, y: 1 }], 10);
    expect(pts.length).toBe(6);
    expect(pts[5].x).toBeCloseTo(10);
  });

  it('never runs past the longest recording', () => {
    const pts = resample([{ t: 0, x: 0, y: 0 }, { t: 600, x: 10, y: 0 }], 24);
    expect(pts.length).toBe(30 * 24 + 1);
  });
});

describe('thinning to keys', () => {
  it('a steady straight drag is two keys', () => {
    const keys = thinKeys(resample(drag(1, line, 2), 24), toleranceFor(0.5));
    expect(keys.map((k) => k.frame)).toEqual([0, 24]);
    expect(keys[0].ease).toBe('linear');
  });

  it('a turn keeps a key at the corner', () => {
    const keys = thinKeys(resample(drag(1, (u) => (u < 0.5 ? { x: 400 * u * 2, y: 0 } : { x: 400, y: 300 * (u - 0.5) * 2 }), 1), 24), toleranceFor(0.5));
    expect(keys.length).toBe(3);
    expect(Math.abs(keys[1].frame - 12)).toBeLessThanOrEqual(1);
  });

  it('a slow start becomes a gentle start, not extra keys', () => {
    const keys = thinKeys(resample(drag(1, (u) => ({ x: 400 * u * u * u, y: 0 }), 0), 24), toleranceFor(0.5));
    expect(keys.length).toBe(2);
    expect(keys[0].ease).toBe('easeIn');
  });

  it('a pause in the middle keeps its keys, so the timing survives', () => {
    const keys = thinKeys(resample(drag(2, (u) => ({ x: u < 0.4 ? 200 * (u / 0.4) : u < 0.6 ? 200 : 200 + 200 * ((u - 0.6) / 0.4), y: 0 }), 0), 24), toleranceFor(0.5));
    expect(keys.length).toBeGreaterThanOrEqual(4);
    const x = playKeys(keys);
    expect(x[24].x).toBeCloseTo(200, -1);
    expect(x[22].x).toBeCloseTo(200, -1);
  });

  it('detail 1 keeps every frame, and the keys fall as detail falls', () => {
    const pts = resample(drag(3, (u) => ({ x: 600 * u, y: 120 * Math.sin(u * 14) }), 3, 7), 24);
    expect(thinKeys(pts, toleranceFor(1)).length).toBe(pts.length);
    const counts = [0.9, 0.7, 0.5, 0.3, 0.1].map((d) => thinKeys(pts, toleranceFor(d)).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    expect(counts[0]).toBeGreaterThan(counts[4]);
    expect(counts[2]).toBeLessThan(pts.length / 3);
  });

  it('never strays further than the tolerance from the hand (random drags)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const a = r() * 6;
      const b = r() * 6;
      const pts = resample(drag(1 + r() * 3, (u) => ({ x: 500 * u + 80 * Math.sin(u * a * 3), y: 200 * Math.cos(u * b * 3) }), 4, seed), 24);
      for (const d of [0.2, 0.5, 0.8]) {
        const tol = toleranceFor(d);
        const keys = thinKeys(pts, tol);
        const back = playKeys(keys);
        expect(back.length).toBe(pts.length);
        for (let f = 0; f < pts.length; f++) expect(Math.hypot(back[f].x - pts[f].x, back[f].y - pts[f].y)).toBeLessThanOrEqual(tol + 1e-6);
        expect(keys[0].frame).toBe(0);
        expect(keys[keys.length - 1].frame).toBe(pts.length - 1);
      }
    }
  });

  it('a bigger stage forgives a bigger wobble', () => {
    expect(toleranceFor(0.5, stageScale(2000, 1000))).toBeCloseTo(toleranceFor(0.5, 1) * 2);
    expect(toleranceFor(0, 1)).toBeGreaterThan(toleranceFor(0.9, 1));
    expect(toleranceFor(1)).toBe(0);
  });
});

describe('keeping it as a path', () => {
  it('a straight drag is a straight line', () => {
    const p = fitPath(resample(drag(1, line, 1), 24), toleranceFor(0.5));
    expect(p!.length).toBe(2);
    expect(p![1].c1).toBeUndefined();
  });

  it('a curved drag becomes a few curves that stay near the hand', () => {
    const pts = resample(drag(2, (u) => ({ x: 400 * u, y: 200 * Math.sin(u * Math.PI) }), 1), 24);
    const tol = toleranceFor(0.5);
    const p = fitPath(pts, tol)!;
    expect(p.length).toBeLessThan(10);
    expect(p.length).toBeGreaterThanOrEqual(2);
    const path = { points: p, orient: false };
    // The fitted line passes near points of the hand's own route.
    for (const q of pts.filter((_, i) => i % 6 === 0)) {
      let best = Infinity;
      for (let k = 0; k <= 200; k++) {
        const o = pointOnPath(path, k / 200);
        best = Math.min(best, Math.hypot(o.x - q.x, o.y - q.y));
      }
      expect(best).toBeLessThan(tol * 2 + 2);
    }
  });

  it('too still a hand makes no path', () => {
    expect(fitPath([{ x: 0, y: 0 }, { x: 0, y: 0 }], 5)).toBeNull();
  });

  it('fits the timing: steady, gentle start, gentle stop, and a custom curve for the rest', () => {
    const at = (f: (u: number) => number) => progressOf(resample(drag(2, (u) => ({ x: 300 * f(u), y: 0 }), 0), 24));
    expect(fitEase(at((u) => u))).toBe('linear');
    expect(fitEase(at((u) => u * u * u))).toBe('easeIn');
    expect(fitEase(at((u) => 1 - Math.pow(1 - u, 3)))).toBe('easeOut');
    expect(fitEase(at((u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)))).toBe('easeInOut');
    const odd = fitEase(at((u) => Math.pow(u, 0.25)));
    expect(Array.isArray(odd)).toBe(true);
    const c = odd as number[];
    expect(c.length).toBe(4);
    for (const v of c) expect(v >= 0 && v <= 1).toBe(true);
  });
});

describe('the plan', () => {
  it('has keys from 0 to the last frame, relative to the start', () => {
    const plan = planMove(drag(1.5, line, 2), 24, 0.5, 'keys', 1)!;
    expect(plan.frames).toBe(36);
    expect(plan.keys[0]).toMatchObject({ frame: 0, x: 0, y: 0 });
    expect(plan.keys[plan.keys.length - 1].frame).toBe(36);
    expect(plan.path).toBeUndefined();
  });

  it('path mode is two keys, a line and an easing, ending where the hand did', () => {
    const plan = planMove(drag(1.5, (u) => ({ x: 400 * u, y: 100 * Math.sin(u * 3) }), 1), 24, 0.5, 'path', 1)!;
    expect(plan.keys.length).toBe(2);
    expect(plan.path!.points.length).toBeGreaterThanOrEqual(2);
    const end = plan.path!.points[plan.path!.points.length - 1];
    expect(end.x).toBeCloseTo(plan.keys[1].x, 6);
    expect(end.y).toBeCloseTo(plan.keys[1].y, 6);
    expect(plan.path!.points[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('a click, or a hand that did not move, gives nothing', () => {
    expect(planMove([{ t: 0, x: 5, y: 5 }], 24, 0.5)).toBeNull();
    expect(planMove(drag(1, () => ({ x: 10, y: 10 }), 0), 24, 0.5)).toBeNull();
  });
});
