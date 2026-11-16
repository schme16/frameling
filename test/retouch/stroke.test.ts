// The retouch brushes through the real dab engine, on a plain buffer: a clone copies pixels from the gap away, a blur softens
// only where the brush went, a sharpen steepens an edge, the opacity limits how far it goes, and the original is never smeared.
import { describe, expect, it } from 'vitest';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { DEFAULT_DAB, type DabBrush } from '../../src/dab/maths';
import { blurPick, clonePick, sharpenPick } from '../../src/retouch/picks';
import { readerOf } from '../../src/retouch/source';

const W = 40;
const H = 30;
const px = (f: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray => {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a.set(f(x, y), (y * W + x) * 4);
  return a;
};
const get = (a: Uint8ClampedArray, x: number, y: number) => Array.from(a.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
const brush = (b: Partial<DabBrush> = {}): DabBrush => ({ ...DEFAULT_DAB, size: 7, hardness: 1, aliased: true, spacing: 0.2, ...b });

function run(pixels: Uint8ClampedArray, b: DabBrush, pts: [number, number][], pick: (s: ReturnType<typeof bufferSurface>) => ConstructorParameters<typeof DabStroke>[1]['pick']) {
  const surface = bufferSurface(pixels, W, H);
  const s = new DabStroke(surface, { brush: b, color: [0, 0, 0, 255], edge: b.aliased ? 'crisp' : 'smooth', seed: 1, pick: pick(surface) });
  for (const [x, y] of pts) s.moveTo({ x, y }, b.size, 1);
  s.finish();
}

describe('the clone stamp', () => {
  // Left half red, right half blue, with a green blemish in the red.
  const picture = () => px((x, y) => (x === 8 && y === 8 ? [0, 200, 0, 255] : x < 20 ? [200, 0, 0, 255] : [0, 0, 200, 255]));

  it('paints the pixels that are the offset away, covering a blemish with its neighbours', () => {
    const a = picture();
    // Copy from 4 pixels left of where we paint: covering the blemish at 8, 8 with red from 4, 8.
    run(a, brush({ size: 5 }), [[8, 8]], (s) => clonePick((x, y, o) => s.read(x, y, o), { x: -4, y: 0 }));
    expect(get(a, 8, 8)).toEqual([200, 0, 0, 255]);
  });

  it('reads the picture as it was before the stroke, so painting over its own source does not smear', () => {
    const a = px((x) => [x * 5, 0, 0, 255]);
    // Copying from 3 pixels to the left while moving right: a smear would copy pixels this very stroke had already painted.
    run(a, brush({ size: 1 }), [[10.5, 5.5], [11.5, 5.5], [12.5, 5.5], [13.5, 5.5], [14.5, 5.5], [15.5, 5.5], [16.5, 5.5]], (s) => clonePick((x, y, o) => s.read(x, y, o), { x: -3, y: 0 }));
    expect(get(a, 13, 5)[0]).toBe(50);
    expect(get(a, 16, 5)[0]).toBe(65);
  });

  it('can copy from a separate picture, such as everything you can see', () => {
    const a = px(() => [0, 0, 0, 0]);
    const seen = readerOf({ width: W, height: H, pixels: px((x) => [x * 5, 0, 0, 255]) });
    run(a, brush({ size: 1 }), [[10, 10]], () => clonePick(seen, { x: 3, y: 0 }));
    expect(get(a, 10, 10)).toEqual([65, 0, 0, 255]);
  });

  it('copies see-through too, so a clone from a clear patch clears', () => {
    const a = px((x) => (x < 10 ? [0, 0, 0, 0] : [200, 0, 0, 255]));
    run(a, brush({ size: 1 }), [[15, 5]], (s) => clonePick((x, y, o) => s.read(x, y, o), { x: -10, y: 0 }));
    expect(get(a, 15, 5)).toEqual([0, 0, 0, 0]);
  });

  it('changes nothing outside the brush', () => {
    const a = picture();
    const before = a.slice();
    run(a, brush({ size: 5 }), [[8, 8]], (s) => clonePick((x, y, o) => s.read(x, y, o), { x: -4, y: 0 }));
    expect(get(a, 20, 20)).toEqual(Array.from(before.slice((20 * W + 20) * 4, (20 * W + 20) * 4 + 4)));
    expect(get(a, 8, 2)).toEqual([200, 0, 0, 255]);
  });

  it('is limited by the opacity, so half opacity is half way between what was there and the copy', () => {
    const a = px((x) => (x < 10 ? [200, 0, 0, 255] : [0, 0, 200, 255]));
    run(a, brush({ size: 1, aliased: false, opacity: 0.5, hardness: 1 }), [[15.5, 5.5], [15.5, 5.5]], (s) => clonePick((x, y, o) => s.read(x, y, o), { x: -10, y: 0 }));
    const p = get(a, 15, 5);
    expect(p[3]).toBe(255);
    expect(p[0]).toBeGreaterThan(80);
    expect(p[0]).toBeLessThan(120);
    expect(p[2]).toBeGreaterThan(80);
    expect(p[2]).toBeLessThan(120);
  });
});

describe('the blur brush', () => {
  const edge = () => px((x) => (x < 20 ? [255, 255, 255, 255] : [0, 0, 0, 255]));

  it('softens an edge where it went and nowhere else', () => {
    const a = edge();
    run(a, brush({ size: 9, aliased: false, hardness: 1 }), [[20, 10], [20, 11], [20, 12]], (s) => blurPick(s, 0.5));
    // Next to the edge: a grey, not the pure white or black it was.
    expect(get(a, 19, 11)[0]).toBeLessThan(250);
    expect(get(a, 20, 11)[0]).toBeGreaterThan(5);
    // Far from the stroke nothing moved.
    expect(get(a, 19, 25)).toEqual([255, 255, 255, 255]);
    expect(get(a, 30, 11)).toEqual([0, 0, 0, 255]);
  });

  it('does not add or take away any light overall: the average of the picture stays put', () => {
    const a = edge();
    const total = (b: Uint8ClampedArray) => { let t = 0; for (let i = 0; i < b.length; i += 4) t += b[i]; return t; };
    const before = total(a);
    run(a, brush({ size: 9, aliased: false, hardness: 1 }), [[20, 10], [20, 11], [20, 12], [20, 13], [20, 14]], (s) => blurPick(s, 0.5));
    expect(Math.abs(total(a) - before) / before).toBeLessThan(0.02);
  });

  it('goes further with a bigger amount', () => {
    const run1 = (amount: number) => {
      const a = edge();
      run(a, brush({ size: 19, aliased: false, hardness: 1 }), [[20, 10], [20, 11], [20, 12]], (s) => blurPick(s, amount));
      return get(a, 15, 11)[0];
    };
    expect(run1(1)).toBeLessThan(run1(0.05));
  });

  it('leaves a flat colour as it is', () => {
    const a = px(() => [50, 120, 200, 255]);
    run(a, brush({ size: 9, aliased: false }), [[10, 10], [20, 12]], (s) => blurPick(s, 1));
    expect(get(a, 10, 10)).toEqual([50, 120, 200, 255]);
    expect(get(a, 20, 12)).toEqual([50, 120, 200, 255]);
  });
});

describe('the sharpen brush', () => {
  it('steepens a soft edge: the light side gets lighter and the dark side darker', () => {
    const a = px((x) => (x < 19 ? [150, 150, 150, 255] : x === 19 ? [140, 140, 140, 255] : x === 20 ? [100, 100, 100, 255] : [90, 90, 90, 255]));
    run(a, brush({ size: 9, aliased: false, hardness: 1 }), [[20, 10], [20, 11]], (s) => sharpenPick(s, 0.6));
    expect(get(a, 19, 10)[0]).toBeGreaterThan(140);
    expect(get(a, 20, 10)[0]).toBeLessThan(100);
  });

  it('leaves a flat colour and clear pixels as they are', () => {
    const a = px((x) => (x < 20 ? [100, 100, 100, 255] : [0, 0, 0, 0]));
    run(a, brush({ size: 9, aliased: false }), [[5, 5]], (s) => sharpenPick(s, 1));
    expect(get(a, 5, 5)).toEqual([100, 100, 100, 255]);
    const b = px(() => [0, 0, 0, 0]);
    run(b, brush({ size: 9, aliased: false }), [[5, 5]], (s) => sharpenPick(s, 1));
    expect(get(b, 5, 5)).toEqual([0, 0, 0, 0]);
  });
});
