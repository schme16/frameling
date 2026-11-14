import { describe, expect, it } from 'vitest';
import type { MotionPath } from '../../src/core/format';
import { pointOnPath } from '../../src/core/symbols';
import { splitPath } from '../../src/core/tweenCut';

const WAVY: MotionPath = {
  orient: true,
  points: [
    { x: 10, y: 50 },
    { x: 60, y: 160, c1: { x: 10, y: 150 }, c2: { x: 20, y: 200 } },
    { x: 140, y: 40, c1: { x: 100, y: 120 }, c2: { x: 90, y: -20 } },
    { x: 200, y: 90 },
  ],
};

/** A very fine polyline of the path, for checking against (distance, point, heading). */
function reference(p: MotionPath, steps = 40000) {
  const pts: { x: number; y: number; s: number; a: number }[] = [];
  let s = 0;
  for (let i = 1; i < p.points.length; i++) {
    const a = p.points[i - 1];
    const q = p.points[i];
    for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      const x = q.c1 && q.c2 ? u * u * u * a.x + 3 * u * u * t * q.c1.x + 3 * u * t * t * q.c2.x + t * t * t * q.x : a.x + (q.x - a.x) * t;
      const y = q.c1 && q.c2 ? u * u * u * a.y + 3 * u * u * t * q.c1.y + 3 * u * t * t * q.c2.y + t * t * t * q.y : a.y + (q.y - a.y) * t;
      const last = pts[pts.length - 1];
      if (last) s += Math.hypot(x - last.x, y - last.y);
      pts.push({ x, y, s, a: 0 });
    }
  }
  return { pts, total: s };
}

describe('the path follower', () => {
  const ref = reference(WAVY);
  it('walks by distance exactly, on every curve', () => {
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const got = pointOnPath(WAVY, t);
      const s = t * ref.total;
      const j = ref.pts.findIndex((p) => p.s >= s);
      const near = ref.pts[Math.max(0, j)];
      expect(Math.hypot(got.x - near.x, got.y - near.y)).toBeLessThan(0.02);
    }
  });

  it('faces the exact tangent', () => {
    const e = 1e-4;
    for (let i = 1; i < 100; i++) {
      const t = i / 100;
      const a = pointOnPath(WAVY, t - e);
      const b = pointOnPath(WAVY, t + e);
      const want = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const got = pointOnPath(WAVY, t).angle;
      expect(Math.abs((((got - want) % 360) + 540) % 360 - 180)).toBeLessThan(0.3);
    }
  });

  it('moves at an even speed along a curve', () => {
    const d = (t: number) => {
      const a = pointOnPath(WAVY, t);
      const b = pointOnPath(WAVY, t + 0.0005);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    const ds = [0.05, 0.15, 0.25, 0.4, 0.55, 0.7, 0.85].map(d);
    // Corners round off between the curves, so compare inside a curve only.
    expect(Math.max(...ds.slice(0, 2)) / Math.min(...ds.slice(0, 2))).toBeLessThan(1.001);
  });

  it('keeps going straight past the ends', () => {
    const end = pointOnPath(WAVY, 1);
    const past = pointOnPath(WAVY, 1.1);
    const heading = (end.angle * Math.PI) / 180;
    const over = Math.hypot(past.x - end.x, past.y - end.y);
    expect(past.x - end.x).toBeCloseTo(Math.cos(heading) * over, 6);
    expect(past.y - end.y).toBeCloseTo(Math.sin(heading) * over, 6);
  });

  it('a path of no length does not break it', () => {
    expect(pointOnPath({ orient: true, points: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }, 0.5)).toEqual({ x: 5, y: 5, angle: 0 });
  });

  it('a cut path is the same line: pieces follow the whole to a hair', () => {
    for (const e of [0.1, 0.37, 0.5, 0.82]) {
      const [p1, p2] = splitPath(WAVY.points, e);
      const a: MotionPath = { orient: true, points: p1 };
      const b: MotionPath = { orient: true, points: p2 };
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const w1 = pointOnPath(WAVY, u * e);
        const g1 = pointOnPath(a, u);
        expect(Math.hypot(w1.x - g1.x, w1.y - g1.y)).toBeLessThan(0.01);
        expect(Math.abs(w1.angle - g1.angle)).toBeLessThan(0.05);
        const w2 = pointOnPath(WAVY, e + u * (1 - e));
        const g2 = pointOnPath(b, u);
        expect(Math.hypot(w2.x - g2.x, w2.y - g2.y)).toBeLessThan(0.01);
        expect(Math.abs(w2.angle - g2.angle)).toBeLessThan(0.05);
      }
    }
  });
});
