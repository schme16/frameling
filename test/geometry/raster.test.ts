import { describe, expect, it } from 'vitest';
import { fillRings, ringArea2 } from '../../src/geometry/raster';
import { thickPolyline } from '../../src/geometry/barrier';

const count = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
function circle(cx: number, cy: number, r: number, n = 180, cw = true) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (cw ? 1 : -1) * (i / n) * Math.PI * 2;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

describe('scanline rasteriser', () => {
  it('covers the pixels whose centres are inside a rectangle', () => {
    const w = 20;
    const h = 20;
    const m = new Uint8Array(w * h);
    fillRings(m, w, h, [rect(2, 3, 7, 9)], 'evenodd');
    expect(count(m)).toBe(5 * 6);
    expect(m[3 * w + 2]).toBe(1);
    expect(m[8 * w + 6]).toBe(1);
    expect(m[3 * w + 7]).toBe(0);
    expect(m[9 * w + 2]).toBe(0);
  });

  it('includes a pixel only when its centre is inside', () => {
    const m = new Uint8Array(10 * 10);
    fillRings(m, 10, 10, [rect(0.6, 0.6, 3.4, 3.4)], 'nonzero');
    // Centres at 0.5 are outside, 1.5 2.5 are inside, 3.5 is outside.
    expect(count(m)).toBe(4);
  });

  it('draws a circle with about the right area', () => {
    const w = 200;
    const m = new Uint8Array(w * w);
    fillRings(m, w, w, [circle(100, 100, 60)], 'nonzero');
    expect(Math.abs(count(m) - Math.PI * 3600)).toBeLessThan(Math.PI * 3600 * 0.01);
  });

  it('even-odd leaves a hole where nonzero fills it', () => {
    const w = 60;
    const outer = rect(5, 5, 55, 55);
    const inner = rect(20, 20, 40, 40); // same winding as the outer one
    const eo = new Uint8Array(w * w);
    fillRings(eo, w, w, [outer, inner], 'evenodd');
    expect(count(eo)).toBe(50 * 50 - 20 * 20);
    expect(eo[30 * w + 30]).toBe(0);
    const nz = new Uint8Array(w * w);
    fillRings(nz, w, w, [outer, inner], 'nonzero');
    expect(count(nz)).toBe(50 * 50);
    // Opposite winding makes a hole in nonzero too.
    const hole = new Uint8Array(w * w);
    fillRings(hole, w, w, [outer, [20, 40, 40, 40, 40, 20, 20, 20]], 'nonzero');
    expect(count(hole)).toBe(50 * 50 - 20 * 20);
  });

  it('clips to the mask', () => {
    const w = 10;
    const m = new Uint8Array(w * w);
    fillRings(m, w, w, [rect(-50, -50, 5, 100)], 'evenodd');
    expect(count(m)).toBe(5 * 10);
    fillRings(m, w, w, [rect(100, 100, 200, 200)], 'evenodd');
    expect(count(m)).toBe(5 * 10);
  });

  it('handles concave and self-overlapping rings', () => {
    const w = 40;
    // An L shape.
    const L = [2, 2, 12, 2, 12, 22, 30, 22, 30, 32, 2, 32];
    const m = new Uint8Array(w * w);
    fillRings(m, w, w, [L], 'evenodd');
    expect(count(m)).toBe(10 * 30 + 18 * 10);
    expect(ringArea2(L) / 2).toBe(10 * 30 + 18 * 10);
  });

  it('thick polylines cover their width', () => {
    const w = 100;
    const m = new Uint8Array(w * w);
    fillRings(m, w, w, thickPolyline([10, 50, 90, 50], false, 8), 'nonzero');
    // 80 long, 8 wide, plus the round ends.
    expect(count(m)).toBeGreaterThan(80 * 8);
    expect(count(m)).toBeLessThan(80 * 8 + 60);
    expect(m[50 * w + 50]).toBe(1);
    expect(m[46 * w + 50]).toBe(1);
    expect(m[44 * w + 50]).toBe(0);
  });
});
