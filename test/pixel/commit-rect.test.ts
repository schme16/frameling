// Committing a pixel edit writes only the touched rectangle and the old block, and gives what trimming the whole grid gives.
import { describe, expect, it } from 'vitest';
import { cropGrid, setGridPixels, setGridRect } from '../../src/core/pixelBounds';

const W = 40;
const H = 30;
const RED = [255, 0, 0, 255];

function grid(dots: [number, number][]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (const [x, y] of dots) px.set(RED, (y * W + x) * 4);
  return px;
}
const blank = () => ({ width: 0, height: 0, pixels: new Uint8ClampedArray(0) }) as { x?: number; y?: number; width: number; height: number; pixels: Uint8ClampedArray };

describe('setGridRect', () => {
  it('crops a rectangle out of a grid', () => {
    const c = cropGrid(grid([[5, 6]]), W, { x: 4, y: 5, w: 3, h: 2 });
    expect(c.length).toBe(24);
    expect([...c.slice(16, 20)]).toEqual(RED);
  });

  it('matches trimming the whole grid: new strokes, strokes inside the block, erasing the edge', () => {
    const cases: { was: [number, number][]; now: [number, number][]; touched: { x: number; y: number; w: number; h: number } | null }[] = [
      { was: [], now: [[10, 10], [12, 11]], touched: { x: 10, y: 10, w: 3, h: 2 } },
      { was: [[3, 4], [20, 25]], now: [[3, 4], [20, 25], [10, 10]], touched: { x: 10, y: 10, w: 1, h: 1 } },
      { was: [[3, 4], [20, 25]], now: [[3, 4]], touched: { x: 20, y: 25, w: 1, h: 1 } },
      { was: [[3, 4]], now: [], touched: { x: 3, y: 4, w: 1, h: 1 } },
      { was: [[3, 4]], now: [[3, 4]], touched: null },
    ];
    for (const c of cases) {
      const before = blank();
      setGridPixels(before, grid(c.was), W, H);
      const expected = blank();
      setGridPixels(expected, grid(c.now), W, H);
      const got = blank();
      setGridRect(got, grid(c.now), W, before, c.touched);
      expect([got.x, got.y, got.width, got.height]).toEqual([expected.x, expected.y, expected.width, expected.height]);
      expect([...got.pixels]).toEqual([...expected.pixels]);
    }
  });
});
