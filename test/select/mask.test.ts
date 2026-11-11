import { describe, expect, it } from 'vitest';
import {
  clipToMask,
  combineMasks,
  extractPixels,
  invertMask,
  maskBounds,
  maskCount,
  maskEdges,
  maskHas,
  overlayPixels,
  polygonMask,
  rectMask,
  shiftMask,
  wandMask,
} from '../../src/select/mask';
import { applyInSelection } from '../../src/select/ops';
import { flipH, rotateQuarter } from '../../src/pixel/transform';

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

function img(w: number, h: number, paint: (x: number, y: number) => number[] | null) {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = paint(x, y);
      if (c) p.set(c, (y * w + x) * 4);
    }
  return p;
}
const at = (p: Uint8ClampedArray, w: number, x: number, y: number) => [...p.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe('selection masks', () => {
  it('a box picks whole pixels, corners in any order, clamped to the grid', () => {
    const m = rectMask(8, 8, 5, 6, 2, 1);
    expect(maskBounds(m)).toEqual({ x0: 2, y0: 1, x1: 5, y1: 6 });
    expect(maskCount(m)).toBe(4 * 6);
    expect(maskCount(rectMask(8, 8, -5, -5, 20, 1))).toBe(16);
  });

  it('a lasso picks pixels whose centres are inside', () => {
    // A triangle covering the lower left half of a 4x4 grid.
    const m = polygonMask(4, 4, [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]);
    expect(maskHas(m, 0, 3)).toBe(true);
    expect(maskHas(m, 3, 0)).toBe(false);
    expect(maskHas(m, 1, 2)).toBe(true);
    expect(maskCount(m)).toBe(6);
  });

  it('the magic wand picks touching pixels of one colour, or that colour everywhere', () => {
    // Red in columns 0 and 3, blue between.
    const p = img(4, 2, (x) => (x === 0 || x === 3 ? RED : BLUE));
    expect(maskCount(wandMask(p, 4, 2, 0, 0))).toBe(2);
    expect(maskCount(wandMask(p, 4, 2, 0, 0, { contiguous: false }))).toBe(4);
    expect(maskCount(wandMask(p, 4, 2, 1, 1))).toBe(4);
  });

  it('wand tolerance lets close colours in, and empty pixels are one colour', () => {
    const p = img(3, 1, (x) => (x === 0 ? [100, 100, 100, 255] : x === 1 ? [110, 100, 100, 255] : null));
    expect(maskCount(wandMask(p, 3, 1, 0, 0))).toBe(1);
    expect(maskCount(wandMask(p, 3, 1, 0, 0, { tolerance: 12 }))).toBe(2);
    expect(maskCount(wandMask(p, 3, 1, 2, 0))).toBe(1);
  });

  it('adds, takes away, keeps the overlap and inverts', () => {
    const a = rectMask(4, 1, 0, 0, 1, 0);
    const b = rectMask(4, 1, 1, 0, 2, 0);
    expect([...combineMasks(a, b, 'add').bits]).toEqual([1, 1, 1, 0]);
    expect([...combineMasks(a, b, 'subtract').bits]).toEqual([1, 0, 0, 0]);
    expect([...combineMasks(a, b, 'intersect').bits]).toEqual([0, 1, 0, 0]);
    expect([...combineMasks(a, b, 'replace').bits]).toEqual([0, 1, 1, 0]);
    expect([...combineMasks(null, b, 'subtract').bits]).toEqual([0, 0, 0, 0]);
    expect([...invertMask(a).bits]).toEqual([0, 0, 1, 1]);
  });

  it('shifts, dropping what goes off the edge', () => {
    const m = shiftMask(rectMask(4, 4, 0, 0, 1, 1), 3, 1);
    expect(maskBounds(m)).toEqual({ x0: 3, y0: 1, x1: 3, y1: 2 });
  });

  it('outlines a box with four joined edges', () => {
    expect(maskEdges(rectMask(8, 8, 2, 2, 5, 5)).length).toBe(16);
  });

  it('moves pixels over others without punching holes', () => {
    const base = img(3, 1, (x) => (x === 2 ? BLUE : null));
    const src = img(3, 1, (x) => (x === 0 ? RED : null));
    const out = overlayPixels(base, src, 3, 1, 1, 0);
    expect(at(out, 3, 1, 0)).toEqual(RED);
    expect(at(out, 3, 2, 0)).toEqual(BLUE);
  });

  it('keeps edits to the selection', () => {
    const before = img(2, 1, () => RED);
    const after = img(2, 1, () => BLUE);
    const out = clipToMask(before, after, rectMask(2, 1, 1, 0, 1, 0));
    expect(at(out, 2, 0, 0)).toEqual(RED);
    expect(at(out, 2, 1, 0)).toEqual(BLUE);
    expect(at(extractPixels(before, rectMask(2, 1, 1, 0, 1, 0)), 2, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('operations on a selection', () => {
  it('flips just the selection, around its own middle', () => {
    // Row: R B . . R ; select the first three pixels.
    const p = img(5, 1, (x) => (x === 0 || x === 4 ? RED : x === 1 ? BLUE : null));
    const m = rectMask(5, 1, 0, 0, 2, 0);
    const r = applyInSelection({ width: 5, height: 1, pixels: p }, m, 'transform', (d, box) => flipH(d, box ?? 'content'))!;
    expect(at(r.pixels, 5, 2, 0)).toEqual(RED);
    expect(at(r.pixels, 5, 1, 0)).toEqual(BLUE);
    expect(at(r.pixels, 5, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(r.pixels, 5, 4, 0)).toEqual(RED);
    expect(maskCount(r.mask)).toBe(3);
  });

  it('turns the selection with the pixels', () => {
    // A 3x1 bar selected in a 5x5 grid turns into a 1x3 bar.
    const p = img(5, 5, (x, y) => (y === 2 && x >= 1 && x <= 3 ? RED : null));
    const m = rectMask(5, 5, 1, 2, 3, 2);
    const r = applyInSelection({ width: 5, height: 5, pixels: p }, m, 'transform', (d, box) => rotateQuarter(d, 1, box))!;
    expect(maskBounds(r.mask)).toEqual({ x0: 2, y0: 1, x1: 2, y1: 3 });
    expect(at(r.pixels, 5, 2, 1)).toEqual(RED);
    expect(at(r.pixels, 5, 1, 2)).toEqual([0, 0, 0, 0]);
  });

  it('is quick on 256 x 256', () => {
    const w = 256;
    const p = img(w, w, (x, y) => ((x >> 3) + (y >> 3)) % 2 ? RED : BLUE);
    const t0 = performance.now();
    const pts = Array.from({ length: 400 }, (_, i) => ({ x: 128 + 120 * Math.cos(i / 63.7), y: 128 + 120 * Math.sin(i / 63.7) }));
    const lasso = polygonMask(w, w, pts);
    const wand = wandMask(p, w, w, 0, 0, { contiguous: false });
    const both = combineMasks(lasso, wand, 'intersect');
    maskEdges(both);
    applyInSelection({ width: w, height: w, pixels: p }, both, 'transform', (d, box) => rotateQuarter(d, 1, box));
    overlayPixels(p, extractPixels(p, both), w, w, 3, 4);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});
