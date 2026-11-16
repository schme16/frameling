// Brushes made from a selection: the silhouette of shapes, and a small picture from pixels.
import { describe, expect, it } from 'vitest';
import type { FillShape, PathShape, Shape, StrokeShape } from '../../src/core/format';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { hasColours, MAX_STAMP, pixelStampFrom, readPixelStamp, stampCells, stampSpacing, vectorStampFrom } from '../../src/brushes/stamps';
import { MAX_CUSTOM_POINTS, MAX_CUSTOM_RINGS, readCustom } from '../../src/geometry/tip';
import { rectMask, emptyMask } from '../../src/select/mask';

const rect = (x: number, y: number, w: number, h: number, id = 'r'): FillShape => ({ id, type: 'fill', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], color: '#000000', opacity: 1 });
const ngon = (n: number, r: number, id = 'n'): FillShape => ({ id, type: 'fill', paths: [{ closed: true, points: Array.from({ length: n }, (_, i) => ({ x: 100 + Math.cos((i / n) * Math.PI * 2) * r, y: 100 + Math.sin((i / n) * Math.PI * 2) * r })) }], color: '#000000', opacity: 1 });

const bounds = (rings: number[][]) => {
  const xs = rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
  const ys = rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('a stamp from shapes', () => {
  it('is centred on 0 and one unit across, whatever the size or place', () => {
    const r = vectorStampFrom([rect(300, 40, 80, 40)])!;
    expect(r.side).toBeCloseTo(80, 0);
    const b = bounds(r.rings);
    expect(b.x1 - b.x0).toBeCloseTo(1, 2);
    expect(b.y1 - b.y0).toBeCloseTo(0.5, 2);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0, 2);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(0, 2);
  });
  it('joins shapes that overlap into one silhouette, and keeps ones that do not touch apart', () => {
    expect(vectorStampFrom([rect(0, 0, 20, 20, 'a'), rect(10, 0, 20, 20, 'b')])!.rings).toHaveLength(1);
    expect(vectorStampFrom([rect(0, 0, 10, 10, 'a'), rect(50, 0, 10, 10, 'b')])!.rings).toHaveLength(2);
  });
  it('keeps a hole as a second outline', () => {
    const ring: PathShape = { id: 'p', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }] }, { closed: true, points: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }] }], fill: '#000000', stroke: null, opacity: 1 };
    expect(vectorStampFrom([ring])!.rings).toHaveLength(2);
  });
  it('turns a line into its outline', () => {
    const s: StrokeShape = { id: 's', type: 'stroke', points: [{ x: 0, y: 0, p: 0.5 }, { x: 60, y: 10, p: 0.5 }, { x: 120, y: 0, p: 0.5 }], brush: { ...DEFAULT_BRUSH, size: 12 }, color: '#000', opacity: 1 };
    const r = vectorStampFrom([s])!;
    expect(r.rings.length).toBeGreaterThan(0);
    expect(r.side).toBeGreaterThan(100);
  });
  it('simplifies a round shape until it is small enough to keep in every line', () => {
    const r = vectorStampFrom([ngon(400, 50)])!;
    const n = r.rings.reduce((a, x) => a + x.length / 2, 0);
    expect(n).toBeLessThanOrEqual(MAX_CUSTOM_POINTS);
    expect(n).toBeGreaterThan(12);
    expect(r.rings.length).toBeLessThanOrEqual(MAX_CUSTOM_RINGS);
  });
  it('what it makes is what a saved brush will read back', () => {
    const r = vectorStampFrom([ngon(30, 50), rect(300, 0, 20, 20)])!;
    expect(readCustom(r.rings)).toEqual(r.rings);
  });
  it('counts what it cannot use (text, symbols) and gives nothing when that is all there is', () => {
    const text = { id: 't', type: 'text' } as unknown as Shape;
    const r = vectorStampFrom([rect(0, 0, 10, 10), text])!;
    expect(r.skipped).toBe(1);
    expect(vectorStampFrom([text])).toBeNull();
    expect(vectorStampFrom([])).toBeNull();
  });
});

const grid = (w: number, h: number, at: (x: number, y: number) => number[] | null): Uint8ClampedArray => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(at(x, y) ?? [0, 0, 0, 0], (y * w + x) * 4);
  return px;
};

describe('a pixel brush from a selection', () => {
  const W = 20;
  const px = grid(W, W, (x, y) => (x >= 4 && x < 8 && y >= 5 && y < 7 ? (x < 6 ? [255, 0, 0, 255] : [0, 0, 255, 255]) : null));
  it('is the selected pixels that have something in them, trimmed to their box', () => {
    const r = pixelStampFrom(px, W, rectMask(W, W, 0, 0, 19, 19), true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.stamp.w, r.stamp.h]).toEqual([4, 2]);
    expect(r.stamp.colours).toEqual(['#ff0000', '#0000ff']);
    expect(r.stamp.cells).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
    expect(r.colourCount).toBe(2);
    expect(hasColours(r.stamp)).toBe(true);
    expect(r.stamp.keep).toBe(true);
  });
  it('ignores selected pixels with nothing in them', () => {
    const r = pixelStampFrom(px, W, rectMask(W, W, 0, 0, 10, 10), false);
    expect(r.ok && [r.stamp.w, r.stamp.h]).toEqual([4, 2]);
  });
  it('keeps the colours only when there is more than one to keep', () => {
    const one = grid(W, W, (x, y) => (x < 3 && y < 3 ? [10, 20, 30, 255] : null));
    const r = pixelStampFrom(one, W, rectMask(W, W, 0, 0, 5, 5), true);
    expect(r.ok && r.stamp.keep).toBe(false);
  });
  it('keeps see-through pixels as colours with their alpha', () => {
    const half = grid(W, W, (x, y) => (x < 2 && y < 1 ? [10, 20, 30, x ? 255 : 128] : null));
    const r = pixelStampFrom(half, W, rectMask(W, W, 0, 0, 5, 5), true);
    expect(r.ok && r.stamp.colours).toEqual(['#0a141e80', '#0a141e']);
  });
  it('says no to nothing selected, and to a selection that is too big', () => {
    expect(pixelStampFrom(px, W, emptyMask(W, W), true)).toEqual({ ok: false, why: 'empty' });
    expect(pixelStampFrom(px, W, rectMask(W, W, 0, 0, 2, 2), true)).toEqual({ ok: false, why: 'empty' });
    const big = grid(80, 80, () => [1, 2, 3, 255]);
    expect(pixelStampFrom(big, 80, rectMask(80, 80, 0, 0, MAX_STAMP, MAX_STAMP), true)).toEqual({ ok: false, why: 'big' });
    expect(pixelStampFrom(big, 80, rectMask(80, 80, 0, 0, MAX_STAMP - 1, MAX_STAMP - 1), true).ok).toBe(true);
  });
  it('gives cells around the middle pixel, and spacing of its longer side', () => {
    const r = pixelStampFrom(px, W, rectMask(W, W, 0, 0, 19, 19), true);
    if (!r.ok) throw new Error('no stamp');
    const cells = stampCells(r.stamp);
    expect(cells).toHaveLength(8);
    expect(cells.map((c) => `${c.x},${c.y}`)).toContain('0,0');
    expect(Math.min(...cells.map((c) => c.x))).toBe(-1);
    expect(Math.max(...cells.map((c) => c.x))).toBe(2);
    expect(cells.find((c) => c.x === -1 && c.y === 0)?.rgba).toEqual([255, 0, 0, 255]);
    expect(stampSpacing(r.stamp)).toBe(4);
  });
});

describe('reading a pixel brush back', () => {
  const ok = { w: 2, h: 1, colours: ['#ff0000'], cells: [1, 0], keep: false };
  it('accepts a good one', () => {
    expect(readPixelStamp(ok)).toEqual(ok);
    expect(readPixelStamp({ ...ok, keep: 'yes' })?.keep).toBe(false);
  });
  it('gives nothing for anything off', () => {
    for (const bad of [null, 3, [], { ...ok, w: 0 }, { ...ok, w: 99 }, { ...ok, w: 1.5 }, { ...ok, colours: ['red'] }, { ...ok, colours: 'x' }, { ...ok, cells: [1] }, { ...ok, cells: [1, 9] }, { ...ok, cells: [0, 0] }, { ...ok, cells: [1, -1] }]) expect(readPixelStamp(bad)).toBeNull();
  });
});
