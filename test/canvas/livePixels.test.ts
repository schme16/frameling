// The pieces a sparse live pixel preview is drawn in, and the screens where it is drawn whole instead.
import { describe, expect, it } from 'vitest';
import { around, edgeOnMiddle } from '../../src/canvas/livePixels';

const area = (rs: { w: number; h: number }[]) => rs.reduce((a, r) => a + r.w * r.h, 0);
const tile = (tx: number, ty: number, w = 128, h = 128) => ({ x: tx * 128, y: ty * 128, w, h });

describe('around: what the tiles leave free of a drawing', () => {
  const box = { x: 0, y: 0, w: 512, h: 512 };
  it('with no tiles it is the whole box', () => {
    expect(around(box, [])).toEqual([box]);
  });
  it('the pieces and the tiles together cover the box exactly once', () => {
    for (const tiles of [[tile(1, 1)], [tile(0, 0), tile(1, 0), tile(2, 0)], [tile(1, 1), tile(2, 1), tile(1, 2)], [tile(0, 0), tile(3, 3)], [tile(0, 1), tile(3, 1), tile(1, 2)]]) {
      const free = around(box, tiles);
      expect(area(free) + area(tiles)).toBe(512 * 512);
      // Nothing overlaps: mark every art pixel and count.
      const seen = new Uint8Array(512 * 512);
      for (const r of [...free, ...tiles]) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) seen[y * 512 + x]++;
      expect(seen.every((n) => n === 1)).toBe(true);
    }
  });
  it('a box that is not on the lattice, and tiles that stick out of it', () => {
    const b = { x: 100, y: 70, w: 300, h: 250 };
    const tiles = [tile(0, 0), tile(1, 0), tile(1, 1), tile(3, 3, 40, 40)];
    const free = around(b, tiles);
    const seen = new Uint8Array(600 * 600);
    for (const r of free) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) seen[y * 600 + x]++;
    for (const t of tiles) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) seen[y * 600 + x]++;
    for (let y = 70; y < 320; y++) for (let x = 100; x < 400; x++) expect(seen[y * 600 + x]).toBe(1);
    // Nothing outside the box.
    for (const r of free) expect(r.x >= 100 && r.y >= 70 && r.x + r.w <= 400 && r.y + r.h <= 320).toBe(true);
  });
});

describe('edgeOnMiddle: when a screen pixel sits exactly on the edge between two art pixels', () => {
  it('whole-number zooms on a whole-pixel pan never do; on a half-pixel pan they do', () => {
    for (const z of [1, 2, 3, 4, 8]) expect(edgeOnMiddle(z, 20, 900), `${z}x`).toBe(false);
    for (const z of [1, 2, 3]) expect(edgeOnMiddle(z, 20.5, 900), `${z}x at .5`).toBe(true);
  });
  it('150% and 125% do on whole-pixel pans (the edges land on pixel middles every few pixels)', () => {
    expect(edgeOnMiddle(1.5, 20, 900)).toBe(true);
    expect(edgeOnMiddle(1.25, 20.5, 900)).toBe(true);
  });
  it('a zoom with no such edge does not', () => {
    expect(edgeOnMiddle(1.3719, 20.25, 900)).toBe(false);
    expect(edgeOnMiddle(2.7, 20.25, 900)).toBe(false);
  });
  it('zoomed out, only an exact landing counts', () => {
    expect(edgeOnMiddle(0.5, 20, 900)).toBe(true);
    expect(edgeOnMiddle(0.35, 20, 900)).toBe(true);
    expect(edgeOnMiddle(0.4, 20.1, 900)).toBe(true);
    // Far out (a screen pixel stands for three or more art pixels) it is never told apart: a big drawing fitted to the screen.
    expect(edgeOnMiddle(0.3, 20, 900)).toBe(false);
    expect(edgeOnMiddle(0.15, 20, 900)).toBe(false);
    expect(edgeOnMiddle(0.25, 20.25, 900)).toBe(false);
    expect(edgeOnMiddle(0.683712345, 20.3137, 900)).toBe(false);
    expect(edgeOnMiddle(0.149372519, 12.7183, 600)).toBe(false);
  });
});
