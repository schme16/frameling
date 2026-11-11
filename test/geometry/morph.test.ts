import { describe, expect, it } from 'vitest';
import { dilate, distanceTransform } from '../../src/geometry/morph';

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function randomMask(w: number, h: number, density: number, seed = 1) {
  const r = rng(seed);
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = r() < density ? 1 : 0;
  return m;
}
function brute(m: Uint8Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h).fill(Infinity);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) if (m[j * w + i]) out[y * w + x] = Math.min(out[y * w + x], (x - i) ** 2 + (y - j) ** 2);
  return out;
}

describe('distance transform', () => {
  it('matches a brute force search exactly', () => {
    const w = 23;
    const h = 17;
    for (const [density, seed] of [[0.02, 1], [0.1, 2], [0.4, 3]] as const) {
      const m = randomMask(w, h, density, seed);
      if (!m.includes(1)) m[5] = 1;
      const d = distanceTransform(m, w, h);
      const b = brute(m, w, h);
      for (let i = 0; i < d.length; i++) expect(d[i]).toBeCloseTo(b[i], 3);
    }
  });

  it('is zero on the set pixels and grows away from a single pixel', () => {
    const w = 11;
    const m = new Uint8Array(w * w);
    m[5 * w + 5] = 1;
    const d = distanceTransform(m, w, w);
    expect(d[5 * w + 5]).toBe(0);
    expect(d[5 * w + 8]).toBe(9);
    expect(d[8 * w + 9]).toBe(9 + 16);
  });
});

describe('dilation', () => {
  it('equals thresholding the distance transform, for whole and fractional radii', () => {
    const w = 60;
    const h = 40;
    for (const r of [1, 2, 3.5, 6, 9.2]) {
      const m = randomMask(w, h, 0.01, 7);
      m.fill(1, 20 * w + 10, 20 * w + 25); // a run as well as specks
      const d = distanceTransform(m, w, h);
      const out = dilate(m, w, h, r);
      for (let i = 0; i < out.length; i++) expect(out[i]).toBe(d[i] <= r * r + 1e-6 ? 1 : 0);
    }
  });

  it('leaves the input alone and handles r below 1', () => {
    const m = randomMask(10, 10, 0.1, 3);
    const copy = m.slice();
    const out = dilate(m, 10, 10, 0.5);
    expect(m).toEqual(copy);
    expect(out).toEqual(copy);
    expect(out).not.toBe(m);
  });

  it('closes a gap of up to twice the radius', () => {
    const w = 40;
    const m = new Uint8Array(w * 10);
    m.fill(1, 5 * w + 2, 5 * w + 18);
    m.fill(1, 5 * w + 24, 5 * w + 38); // gap of 6
    const open = dilate(m, w, 10, 2);
    expect(open[5 * w + 20]).toBe(0);
    const closed = dilate(m, w, 10, 3);
    expect(closed[5 * w + 20]).toBe(1);
    expect(closed[5 * w + 21]).toBe(1);
  });
});
