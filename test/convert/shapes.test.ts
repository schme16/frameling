import { describe, expect, it } from 'vitest';
import { fillRings, ringArea2 } from '../../src/geometry/raster';
import { traceMask } from '../../src/geometry/trace';
import { blobsOf, roundCorners, DEFAULT_TRACE, dropStraight, exactCorners, pixelsToShapes, traceAdvice, type TraceOptions } from '../../src/convert/shapes';
import type { FillShape } from '../../src/core/format';

const ids = () => {
  let n = 0;
  return () => `s${++n}`;
};

/** A grid from rows of letters: . is see-through, other letters are colours. */
function grid(rows: string[], colours: Record<string, [number, number, number]>) {
  const h = rows.length;
  const w = rows[0].length;
  const px = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = colours[ch];
      px.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }),
  );
  return { px, w, h };
}

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];
const opts = (o: Partial<TraceOptions> = {}): TraceOptions => ({ ...DEFAULT_TRACE, ...o });

/** Paints a shape's paths back into a mask of w x h pixels (pixel centres), even-odd, to compare with the picture. */
function paint(shape: FillShape, w: number, h: number, scale: number): Uint8Array {
  const m = new Uint8Array(w * h);
  const rings = shape.paths.map((p) => p.points.flatMap((q) => [q.x / scale, q.y / scale]));
  fillRings(m, w, h, rings, 'evenodd');
  return m;
}

describe('exactCorners', () => {
  it('puts the corners back on a single pixel', () => {
    const m = new Uint8Array(25);
    m[2 * 5 + 3] = 1;
    const loop = traceMask(m, 5, 5, { x0: 3, y0: 2, x1: 3, y1: 2 })[0];
    const c = dropStraight(exactCorners(loop));
    expect(c.length).toBe(8);
    expect(Math.abs(ringArea2(c))).toBe(2);
    const xs = c.filter((_, i) => i % 2 === 0);
    const ys = c.filter((_, i) => i % 2 === 1);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([3, 4, 2, 3]);
  });

  it('keeps stair steps exactly: the area is the pixel count', () => {
    const { px, w, h } = grid(['..#..', '.###.', '#####', '.###.', '..#..'], { '#': RED });
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = px[i * 4 + 3] ? 1 : 0;
    const loops = traceMask(m, w, h, { x0: 0, y0: 0, x1: 4, y1: 4 });
    const c = dropStraight(exactCorners(loops[0]));
    expect(Math.abs(ringArea2(c)) / 2).toBe(13);
    // every corner is a whole number
    expect(c.every((v) => Number.isInteger(v))).toBe(true);
  });
});

describe('roundCorners', () => {
  it('cuts corners and keeps the loop closed and inside the original', () => {
    const out = roundCorners([0, 0, 4, 0, 4, 4, 0, 4], 2);
    expect(out.length).toBe(4 * 4 * 2);
    for (let i = 0; i < out.length; i += 2) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(4);
    }
    // the sharp corner is gone
    expect(out.some((v, i) => i % 2 === 0 && v === 0 && out[i + 1] === 0)).toBe(false);
  });
});

describe('dropStraight', () => {
  it('removes points on a straight run', () => {
    expect(dropStraight([0, 0, 1, 0, 2, 0, 2, 2, 0, 2])).toEqual([0, 0, 2, 0, 2, 2, 0, 2]);
  });
});

describe('blobsOf', () => {
  it('gives a hole to the blob around it and leaves separate blobs apart', () => {
    const rows = ['#######..###', '#.....#..###', '#.###.#..###', '#.###.#.....', '#.....#.....', '#######.....'];
    const w = rows[0].length;
    const h = rows.length;
    const m = new Uint8Array(w * h);
    rows.forEach((r, y) => [...r].forEach((ch, x) => (m[y * w + x] = ch === '#' ? 1 : 0)));
    const loops = traceMask(m, w, h, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 });
    expect(loops.length).toBe(4);
    const groups = blobsOf(loops).map((g) => g.length).sort();
    expect(groups).toEqual([1, 1, 2]);
  });
});

describe('pixelsToShapes', () => {
  const pic = grid(['..RR..', '.RRRR.', 'RRBBRR', 'RRBBRR', '.RRRR.', '..RR..'], { R: RED, B: BLUE });

  it('makes one shape per colour, biggest at the back, and paints back exactly the same picture', () => {
    const r = pixelsToShapes(pic.px, pic.w, pic.h, 1, opts({ layering: 'pieces' }), ids());
    expect(r.shapes.length).toBe(2);
    expect(r.exact).toBe(true);
    expect(r.shapes[0].color).toBe('#ff0000');
    expect(r.shapes[1].color).toBe('#0000ff');
    const red = paint(r.shapes[0], pic.w, pic.h, 1);
    const blue = paint(r.shapes[1], pic.w, pic.h, 1);
    for (let i = 0; i < pic.w * pic.h; i++) {
      const isBlue = pic.px[i * 4 + 2] === 255 && pic.px[i * 4] === 0;
      const isRed = pic.px[i * 4] === 255;
      expect(blue[i]).toBe(isBlue ? 1 : 0);
      expect(red[i]).toBe(isRed ? 1 : 0);
    }
  });

  it('stacked: the bottom shape is the whole silhouette, with no hole where the top colour sits', () => {
    const r = pixelsToShapes(pic.px, pic.w, pic.h, 1, opts({ layering: 'stacked' }), ids());
    expect(r.shapes.length).toBe(2);
    expect(r.shapes[0].paths.length).toBe(1);
    const base = paint(r.shapes[0], pic.w, pic.h, 1);
    expect(base.reduce((a, b) => a + b, 0)).toBe(24);
  });

  it('scales the shapes to where the pixels are drawn', () => {
    const r = pixelsToShapes(pic.px, pic.w, pic.h, 8, opts(), ids());
    const xs = r.shapes[0].paths[0].points.map((p) => p.x);
    expect(Math.max(...xs)).toBe(48);
    expect(Math.min(...xs)).toBe(0);
  });

  it('one shape per blob splits a colour that is in two places', () => {
    const two = grid(['R..R', 'R..R'], { R: RED });
    const per = pixelsToShapes(two.px, two.w, two.h, 1, opts({ split: 'colour' }), ids());
    const blobs = pixelsToShapes(two.px, two.w, two.h, 1, opts({ split: 'blob' }), ids());
    expect(per.shapes.length).toBe(1);
    expect(per.shapes[0].paths.length).toBe(2);
    expect(blobs.shapes.length).toBe(2);
  });

  it('ignores specks smaller than the limit', () => {
    const dot = grid(['R....', '.....', '..RRR', '..RRR'], { R: RED });
    const all = pixelsToShapes(dot.px, dot.w, dot.h, 1, opts({ speck: 1, split: 'blob' }), ids());
    const tidy = pixelsToShapes(dot.px, dot.w, dot.h, 1, opts({ speck: 2, split: 'blob' }), ids());
    expect(all.shapes.length).toBe(2);
    expect(tidy.shapes.length).toBe(1);
  });

  it('only traces inside a mask', () => {
    const mask = new Uint8Array(pic.w * pic.h);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 3; x++) mask[y * pic.w + x] = 1;
    const r = pixelsToShapes(pic.px, pic.w, pic.h, 1, opts({ layering: 'pieces' }), ids(), mask);
    const xs = r.shapes.flatMap((s) => s.paths.flatMap((p) => p.points.map((q) => q.x)));
    expect(Math.max(...xs)).toBe(3);
  });

  it('smooth edges give curves, and nothing for an empty picture', () => {
    const n = 24;
    const disc = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x - 11.5) ** 2 + (y - 11.5) ** 2 <= 100) disc.set([0, 0, 0, 255], (y * n + x) * 4);
    const r = pixelsToShapes(disc, n, n, 1, opts({ edges: 'smooth' }), ids());
    expect(r.shapes.length).toBe(1);
    expect(r.shapes[0].paths[0].points.some((p) => p.c1)).toBe(true);
    // fewer points than the stair steps it came from, and about the same area
    const hug = pixelsToShapes(disc, n, n, 1, opts({ edges: 'hug' }), ids());
    expect(r.points).toBeLessThan(hug.points);
    const m = paint(r.shapes[0], n, n, 1).reduce((a, b) => a + b, 0);
    const want = paint(hug.shapes[0], n, n, 1).reduce((a, b) => a + b, 0);
    expect(Math.abs(m - want) / want).toBeLessThan(0.05);
    const none = pixelsToShapes(new Uint8ClampedArray(16), 2, 2, 1, opts(), ids());
    expect(none.shapes).toEqual([]);
  });

  it('reduces to the most colours asked for', () => {
    const w = 8;
    const h = 8;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([i * 4, 255 - i * 4, (i * 7) % 256, 255], i * 4);
    const r = pixelsToShapes(px, w, h, 1, opts({ colours: 4 }), ids());
    expect(r.colours).toBeLessThanOrEqual(4);
    expect(r.exact).toBe(false);
  });
});

describe('traceAdvice', () => {
  it('says nothing for flat art, and warns about photos and heavy traces in plain words', () => {
    expect(traceAdvice({ distinct: 8, exact: true, points: 100, shapes: [] as FillShape[] })).toBeNull();
    expect(traceAdvice({ distinct: 40000, exact: false, points: 100, shapes: [] as FillShape[] })?.level).toBe('mess');
    expect(traceAdvice({ distinct: 40, exact: true, points: 50000, shapes: [] as FillShape[] })?.level).toBe('heavy');
    expect(traceAdvice({ distinct: 300, exact: false, points: 100, shapes: [] as FillShape[] })?.level).toBe('many');
  });
});
