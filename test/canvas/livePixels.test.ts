// The pieces a sparse live pixel preview is drawn in, and the screens where it is drawn whole instead.
import { describe, expect, it } from 'vitest';
import { around, drawLivePixels, edgeOnMiddle, SPARSE_BELOW, tileSpan } from '../../src/canvas/livePixels';

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
    // Far out with no tiles to look at, nothing is asked: a big drawing fitted to the screen stays on the sparse preview.
    expect(edgeOnMiddle(0.3, 20, 900)).toBe(false);
    expect(edgeOnMiddle(0.15, 20, 900)).toBe(false);
  });
});

describe('far out, among the edges the touched tiles span', () => {
  // The tiles of a stroke in the middle of a 600 x 420 drawing, two across and one down (a tile is 128 art pixels).
  const span = tileSpan([tile(2, 1), tile(3, 1)])!;
  it('the span runs a pixel past the tiles, so a seam on a tile edge is looked at', () => {
    expect(span).toEqual({ x: { from: 255, to: 513 }, y: { from: 127, to: 257 } });
    expect(tileSpan([])).toBeUndefined();
  });
  it('the zooms that land exactly (30%, 25%, 15%, 12.5%, 5%) are told apart, and the sparse preview is given up for the whole picture', () => {
    for (const z of [0.3, 0.25, 0.15, 0.1, 0.05, 0.125]) {
      expect(z < SPARSE_BELOW).toBe(true);
      // The pan the harness uses: the drawing put in the middle of the view, on a whole screen pixel.
      const pan = Math.round((1300 - 600 * z) / 2);
      expect(edgeOnMiddle(z, pan, 1300, span.x) || edgeOnMiddle(z, Math.round((780 - 420 * z) / 2), 780, span.y), `${z * 100}%`).toBe(true);
    }
  });
  it('the arbitrary far-out zooms stay sparse (28.37%, 12.34%, 7.77%)', () => {
    for (const z of [0.2837, 0.1234, 0.0777]) {
      const pan = Math.round((1300 - 600 * z) / 2);
      expect(edgeOnMiddle(z, pan, 1300, span.x), `${z * 100}% across`).toBe(false);
      expect(edgeOnMiddle(z, Math.round((780 - 420 * z) / 2), 780, span.y), `${z * 100}% down`).toBe(false);
    }
  });
  it('20% never lands (its edges fall on fifths, never halves) and stays sparse', () => {
    expect(edgeOnMiddle(0.2, 590, 1300, span.x)).toBe(false);
  });
  it('only the edges inside the span count: a landing outside the tiles is left alone', () => {
    // At 30% an edge lands on a screen middle every 10 art pixels, so a span of a few pixels between landings is clear of one.
    expect(edgeOnMiddle(0.3, 0, 900, { from: 5, to: 5 })).toBe(true);
    expect(edgeOnMiddle(0.3, 0, 900, { from: 6, to: 14 })).toBe(false);
    expect(edgeOnMiddle(0.3, 0, 900, { from: 6, to: 15 })).toBe(true);
  });
  it('a flipped view (a negative scale) is treated the same, not as far out with nothing to see', () => {
    expect(edgeOnMiddle(-0.3, 400, 900, { from: 5, to: 5 })).toBe(true);
    expect(edgeOnMiddle(-0.5, 400, 900)).toBe(true);
    expect(edgeOnMiddle(-0.2837, 400.5, 900, span.x)).toBe(false);
  });
});

describe('drawLivePixels: when a far-out stroke is asked to fill', () => {
  /** A stand-in for the canvas context: only what the live draw touches. A matrix (zoom, pan) and a screen size. */
  function run(zoom: number, pan: { x: number; y: number }, tiles: { x: number; y: number; w: number; h: number }[], screen = { width: 1300, height: 780 }) {
    const calls: string[] = [];
    const g = {
      canvas: screen,
      imageSmoothingEnabled: true,
      getTransform: () => ({ a: zoom, b: 0, c: 0, d: zoom, e: pan.x, f: pan.y }),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      setTransform: () => {},
      drawImage: () => calls.push('draw'),
    };
    let filled = 0;
    const lv = { layerId: 'l', kind: 'pixel' as const, canvas: {} as CanvasImageSource, x: 0, y: 0, width: 600, height: 420, sparse: { base: null, tiles, fill: () => filled++ } };
    drawLivePixels(g as never, lv as never, 1);
    return { filled, calls };
  }
  const tiles = [tile(2, 1), tile(3, 1)];
  const centred = (z: number) => ({ x: Math.round((1300 - 600 * z) / 2), y: Math.round((780 - 420 * z) / 2) });
  it('an exact landing (30%, 15%, 25%) fills, so the held stroke is the finished one', () => {
    for (const z of [0.3, 0.15, 0.25, 0.125]) expect(run(z, centred(z), tiles).filled, `${z * 100}%`).toBe(1);
  });
  it('any other far-out zoom stays sparse (28.37%, 12.34%), and draws each tile', () => {
    for (const z of [0.2837, 0.1234]) {
      const r = run(z, centred(z), tiles);
      expect(r.filled, `${z * 100}%`).toBe(0);
      expect(r.calls.length).toBe(tiles.length);
    }
  });
  it('a landing that is nowhere near the touched tiles does not fill', () => {
    // At 30% on a whole pan an edge lands every ten art pixels, so a tile always has one inside it; a tile of one pixel between two does not.
    expect(run(0.3, { x: 0, y: 0 }, [{ x: 5, y: 6, w: 0, h: 0 }]).filled).toBe(1);
    expect(run(0.3, { x: 0, y: 0 }, [{ x: 7, y: 7, w: 1, h: 1 }]).filled).toBe(0);
  });
  it('a flipped view lands the same way', () => {
    expect(run(-0.3, { x: 400, y: 300 }, tiles).filled).toBe(1);
  });
});
