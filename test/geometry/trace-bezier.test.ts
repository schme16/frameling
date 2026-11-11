import { describe, expect, it } from 'vitest';
import { fitClosedLoop, fitCurve, findCorners, rdp, sampleSubPath, type V } from '../../src/geometry/bezier';
import { fillRings, ringArea2 } from '../../src/geometry/raster';
import { traceMask } from '../../src/geometry/trace';

function distToPolyline(p: V, poly: V[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}
const toPts = (flat: number[]): V[] => {
  const o: V[] = [];
  for (let i = 0; i < flat.length; i += 2) o.push({ x: flat[i], y: flat[i + 1] });
  return o;
};

describe('marching squares', () => {
  it('traces a ring as an outer loop and a hole turned the other way', () => {
    const w = 80;
    const m = new Uint8Array(w * w);
    const c = (r: number) => {
      const o: number[] = [];
      for (let i = 0; i < 120; i++) o.push(40 + Math.cos((i / 120) * 6.2832) * r, 40 + Math.sin((i / 120) * 6.2832) * r);
      return o;
    };
    fillRings(m, w, w, [c(30), c(12)], 'evenodd');
    const loops = traceMask(m, w, w, { x0: 0, y0: 0, x1: w - 1, y1: w - 1 });
    expect(loops).toHaveLength(2);
    const areas = loops.map((l) => ringArea2(l) / 2).sort((a, b) => b - a);
    expect(areas[0]).toBeGreaterThan(0);
    expect(areas[1]).toBeLessThan(0);
    expect(Math.abs(areas[0] - Math.PI * 900)).toBeLessThan(Math.PI * 900 * 0.02);
    expect(Math.abs(-areas[1] - Math.PI * 144)).toBeLessThan(Math.PI * 144 * 0.05);
  });

  it('a full single pixel traces as a small diamond, and diagonal neighbours stay apart', () => {
    const w = 6;
    const m = new Uint8Array(w * w);
    m[2 * w + 2] = 1;
    m[3 * w + 3] = 1; // touches the first only at a corner
    const loops = traceMask(m, w, w, { x0: 0, y0: 0, x1: 5, y1: 5 });
    expect(loops).toHaveLength(2);
    for (const l of loops) expect(ringArea2(l) / 2).toBeCloseTo(0.5, 5);
  });

  it('puts contour points on pixel edges, in mask coordinates', () => {
    const w = 8;
    const m = new Uint8Array(w * w);
    for (let y = 2; y < 5; y++) for (let x = 3; x < 6; x++) m[y * w + x] = 1;
    const [loop] = traceMask(m, w, w, { x0: 3, y0: 2, x1: 5, y1: 4 });
    const xs = loop.filter((_, i) => i % 2 === 0);
    const ys = loop.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBe(3);
    expect(Math.max(...xs)).toBe(6);
    expect(Math.min(...ys)).toBe(2);
    expect(Math.max(...ys)).toBe(5);
  });
});

describe('simplify and curve fitting', () => {
  it('rdp keeps ends and stays within its tolerance', () => {
    const pts: V[] = [];
    for (let i = 0; i <= 100; i++) pts.push({ x: i, y: Math.sin(i / 10) * 5 + (i % 2 ? 0.2 : -0.2) });
    const s = rdp(pts, 0.5);
    expect(s[0]).toBe(pts[0]);
    expect(s[s.length - 1]).toBe(pts[100]);
    expect(s.length).toBeLessThan(pts.length / 2);
    for (const p of pts) expect(distToPolyline(p, s.slice(0, s.length))).toBeLessThanOrEqual(0.5 + 1e-9 + (p === pts[100] ? 1e9 : 0));
  });

  it('fits a quarter circle with one cubic, within tolerance', () => {
    const pts: V[] = [];
    for (let i = 0; i <= 40; i++) pts.push({ x: Math.cos((i / 40) * Math.PI / 2) * 50, y: Math.sin((i / 40) * Math.PI / 2) * 50 });
    const cubics = fitCurve(pts, 0.5, { x: 0, y: 1 }, { x: 1, y: 0 });
    expect(cubics.length).toBeLessThanOrEqual(2);
    for (let k = 0; k < cubics.length; k++) for (let t = 0; t <= 1; t += 0.05) {
      const b = cubics[k];
      const mt = 1 - t;
      const x = mt ** 3 * b[0].x + 3 * mt * mt * t * b[1].x + 3 * mt * t * t * b[2].x + t ** 3 * b[3].x;
      const y = mt ** 3 * b[0].y + 3 * mt * mt * t * b[1].y + 3 * mt * t * t * b[2].y + t ** 3 * b[3].y;
      expect(Math.abs(Math.hypot(x, y) - 50)).toBeLessThan(0.6);
    }
  });

  it('keeps a noisy traced circle within about a pixel of the pixels, with few points', () => {
    const w = 300;
    const m = new Uint8Array(w * w);
    const ring: number[] = [];
    for (let i = 0; i < 400; i++) ring.push(150 + Math.cos((i / 400) * 6.2832) * 100.3, 150 + Math.sin((i / 400) * 6.2832) * 100.3);
    fillRings(m, w, w, [ring], 'nonzero');
    const [loop] = traceMask(m, w, w, { x0: 0, y0: 0, x1: w - 1, y1: w - 1 });
    const raw = toPts(loop);
    const sp = fitClosedLoop(raw)!;
    expect(sp.closed).toBe(true);
    expect(sp.points.length).toBeLessThanOrEqual(16);
    const curve = sampleSubPath(sp, 24);
    // Every sample of the fitted curve is near the traced loop, and the loop is near the curve.
    for (const p of curve) expect(distToPolyline(p, raw)).toBeLessThan(1.3);
    for (let i = 0; i < raw.length; i += 3) expect(distToPolyline(raw[i], curve)).toBeLessThan(1.3);
    // And near the true circle.
    for (const p of curve) expect(Math.abs(Math.hypot(p.x - 150, p.y - 150) - 100.3)).toBeLessThan(1.3);
  });

  it('keeps the corners of a square sharp', () => {
    const w = 100;
    const m = new Uint8Array(w * w);
    fillRings(m, w, w, [[20, 20, 80, 20, 80, 70, 20, 70]], 'nonzero');
    const [loop] = traceMask(m, w, w, { x0: 0, y0: 0, x1: w - 1, y1: w - 1 });
    const pts = toPts(loop);
    expect(findCorners(pts, 58).length).toBe(4);
    const sp = fitClosedLoop(pts)!;
    expect(sp.points.length).toBe(4);
    // Straight sides carry no control points.
    expect(sp.points.filter((p) => p.c1).length).toBe(0);
    const curve = sampleSubPath(sp);
    for (const p of curve) expect(distToPolyline(p, pts)).toBeLessThan(1);
  });

  it('copes with tiny and degenerate loops', () => {
    expect(fitClosedLoop([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    expect(fitClosedLoop([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])).toBeNull();
    const tri = fitClosedLoop([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }]);
    expect(tri).not.toBeNull();
  });
});
