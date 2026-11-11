import { describe, expect, it } from 'vitest';
import { floodFillPixels, floodFillPoints, parseColor, type Rgba } from '../../src/geometry/pixel-fill';

/** Builds an RGBA grid from rows of characters: `.` transparent, `#` black, `r` red. */
function grid(rows: string[]): { px: Uint8ClampedArray; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const px = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const i = (y * w + x) * 4;
    if (c === '#') px.set([0, 0, 0, 255], i);
    if (c === 'r') px.set([255, 0, 0, 255], i);
  }));
  return { px, w, h };
}
const show = (px: Uint8ClampedArray, w: number): string[] => {
  const rows: string[] = [];
  for (let y = 0; y < px.length / 4 / w; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      s += px[i + 3] === 0 ? '.' : px[i + 2] === 255 ? 'b' : px[i] === 0 && px[i + 1] === 0 ? '#' : px[i] === 255 && px[i + 1] === 0 ? 'r' : '?';
    }
    rows.push(s);
  }
  return rows;
};
const BLUE: Rgba = [0, 0, 255, 255];

describe('pixel flood fill', () => {
  const rows = ['.....', '.###.', '.#.#.', '.###.', '.....'];

  it('fills a contiguous area, 4-way, and does not leak through a diagonal', () => {
    const { px, w, h } = grid(['..#..', '.#...', '#....', '.....']);
    // The diagonal wall (0,2)-(1,1)-(2,0) splits the corner pocket from the rest.
    const r = floodFillPixels(px, w, h, 0, 0, BLUE);
    expect(show(r.pixels, w)).toEqual(['bb#..', 'b#...', '#....', '.....']);
    expect(r.changed).toBe(3);
  });

  it('fills the inside of a ring and leaves the outside', () => {
    const { px, w, h } = grid(rows);
    const r = floodFillPixels(px, w, h, 2, 2, BLUE);
    expect(show(r.pixels, w)).toEqual(['.....', '.###.', '.#b#.', '.###.', '.....']);
    expect(r.changed).toBe(1);
    const out = floodFillPixels(px, w, h, 0, 0, BLUE);
    expect(show(out.pixels, w)).toEqual(['bbbbb', 'b###b', 'b#.#b', 'b###b', 'bbbbb']);
  });

  it('never changes its input', () => {
    const { px, w, h } = grid(rows);
    const copy = px.slice();
    const r = floodFillPixels(px, w, h, 2, 2, BLUE);
    expect(px).toEqual(copy);
    expect(r.pixels).not.toBe(px);
    const same = floodFillPixels(px, w, h, 0, 0, [0, 0, 0, 0]);
    expect(same.pixels).not.toBe(px);
    expect(same.pixels).toEqual(copy);
    expect(same.changed).toBe(0);
  });

  it('all-of-this-colour mode recolours every match, connected or not', () => {
    const { px, w, h } = grid(rows);
    const r = floodFillPixels(px, w, h, 0, 0, BLUE, { mode: 'all' });
    // Outside and the lone pixel in the ring are both transparent, so both change.
    expect(show(r.pixels, w)).toEqual(['bbbbb', 'b###b', 'b#b#b', 'b###b', 'bbbbb']);
    expect(r.changed).toBe(16 + 1);
    const black = floodFillPixels(px, w, h, 1, 1, BLUE, { mode: 'all' });
    expect(show(black.pixels, w)).toEqual(['.....', '.bbb.', '.b.b.', '.bbb.', '.....']);
  });

  it('tolerance is zero: a slightly different colour is a different area', () => {
    const { px, w, h } = grid(['rrrr']);
    px[4] = 254; // second pixel is one step off
    const r = floodFillPixels(px, w, h, 0, 0, BLUE);
    expect(show(r.pixels, w)).toEqual(['b?rr']);
  });

  it('treats all fully transparent pixels as one colour', () => {
    const { px, w, h } = grid(['...']);
    px[1 * 4] = 200; // hidden rgb under alpha 0
    const r = floodFillPixels(px, w, h, 0, 0, BLUE);
    expect(r.changed).toBe(3);
  });

  it('ignores clicks outside the grid, and handles a 1x1 grid', () => {
    const { px, w, h } = grid(rows);
    expect(floodFillPixels(px, w, h, -1, 0, BLUE).changed).toBe(0);
    expect(floodFillPixels(px, w, h, 5, 5, BLUE).changed).toBe(0);
    expect(floodFillPixels(new Uint8ClampedArray(4), 1, 1, 0, 0, BLUE).changed).toBe(1);
  });

  it('parses hex colours', () => {
    expect(parseColor('#ff8000')).toEqual([255, 128, 0, 255]);
    expect(parseColor('#ff800080')).toEqual([255, 128, 0, 128]);
    expect(parseColor('#f80')).toEqual([255, 136, 0, 255]);
    expect(parseColor('nonsense')).toEqual([0, 0, 0, 255]);
  });
});

describe('floodFillPoints', () => {
  it('fills from each point on the result of the last, skipping points off the grid', () => {
    const src = new Uint8ClampedArray(4 * 1 * 4);
    src.set([0, 0, 0, 255], 4 * 1); // a wall at x = 1
    const r = floodFillPoints(src, 4, 1, [[0, 0], [3, 0], [9, 0], [0, 0]], [255, 0, 0, 255]);
    expect(r.changed).toBe(3);
    expect([...r.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...r.pixels.slice(12, 16)]).toEqual([255, 0, 0, 255]);
    expect(r.pixels).not.toBe(src);
  });
});
