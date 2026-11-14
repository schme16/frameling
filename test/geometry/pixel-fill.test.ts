import { describe, expect, it } from 'vitest';
import { floodFillPixels, floodFillPoints, parseColor, wallsFromLayers, type Rgba } from '../../src/geometry/pixel-fill';

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

describe('pixel flood fill: colour match', () => {
  it('stays exact at zero, and takes close colours when asked', () => {
    const { px, w, h } = grid(['.....']);
    // A slightly off red, then a very different blue, then clear.
    px.set([255, 0, 0, 255], 0);
    px.set([250, 6, 0, 255], 4);
    px.set([0, 0, 255, 255], 8);
    const exact = floodFillPixels(px, w, h, 0, 0, [0, 255, 0, 255]);
    expect(exact.changed).toBe(1);
    const close = floodFillPixels(px, w, h, 0, 0, [0, 255, 0, 255], { tolerance: 10 });
    expect(close.changed).toBe(2);
    expect([...close.pixels.slice(4, 8)]).toEqual([0, 255, 0, 255]);
    // The blue is too far off at this setting.
    expect([...close.pixels.slice(8, 12)]).toEqual([0, 0, 255, 255]);
    expect(floodFillPixels(px, w, h, 0, 0, [0, 255, 0, 255], { tolerance: 255 }).changed).toBe(5);
  });

  it('tidies near colours to the one you pour even when the click is already that colour', () => {
    const { px, w, h } = grid(['rr']);
    px.set([250, 4, 0, 255], 4);
    expect(floodFillPixels(px, w, h, 0, 0, [255, 0, 0, 255]).changed).toBe(0);
    const r = floodFillPixels(px, w, h, 0, 0, [255, 0, 0, 255], { tolerance: 20 });
    expect(r.changed).toBe(1);
    expect([...r.pixels.slice(4, 8)]).toEqual([255, 0, 0, 255]);
  });

  it('leaves transparent alone unless it is close in alpha', () => {
    const { px, w, h } = grid(['..']);
    px.set([0, 0, 0, 20], 4);
    expect(floodFillPixels(px, w, h, 0, 0, BLUE, { tolerance: 10 }).changed).toBe(1);
    expect(floodFillPixels(px, w, h, 0, 0, BLUE, { tolerance: 30 }).changed).toBe(2);
  });
});

describe('pixel flood fill: walls from other layers', () => {
  const walls = (rows: string[]) => Uint8Array.from(rows.join('').split('').map((c) => (c === '#' ? 1 : 0)));

  it('fills only inside the lines of another layer', () => {
    const { px, w, h } = grid(['.....', '.....', '.....', '.....', '.....']);
    const wl = walls(['.###.', '.#.#.', '.#.#.', '.###.', '.....']);
    const r = floodFillPixels(px, w, h, 2, 1, BLUE, { walls: wl });
    expect(r.changed).toBe(2);
    expect(show(r.pixels, w)).toEqual(['.....', '..b..', '..b..', '.....', '.....']);
  });

  it('does nothing when you click right on a wall, and never paints a wall', () => {
    const { px, w, h } = grid(['.....', '.....']);
    const wl = walls(['..#..', '..#..']);
    expect(floodFillPixels(px, w, h, 2, 0, BLUE, { walls: wl }).changed).toBe(0);
    const r = floodFillPixels(px, w, h, 0, 0, BLUE, { walls: wl });
    expect(show(r.pixels, w)).toEqual(['bb...', 'bb...']);
  });

  it('stops "fill all of this colour" at walls too, and works with mirrored points', () => {
    const { px, w, h } = grid(['.....']);
    const wl = walls(['..#..']);
    const all = floodFillPixels(px, w, h, 0, 0, BLUE, { mode: 'all', walls: wl });
    expect(show(all.pixels, w)).toEqual(['bb.bb']);
    const two = floodFillPoints(px, w, h, [[0, 0], [4, 0]], BLUE, { walls: wl });
    expect(show(two.pixels, w)).toEqual(['bb.bb']);
  });

  it('combines with a colour match', () => {
    const { px, w, h } = grid(['.....']);
    px.set([0, 0, 0, 10], 4);
    const wl = walls(['..#..']);
    const r = floodFillPixels(px, w, h, 0, 0, BLUE, { walls: wl, tolerance: 20 });
    expect(r.changed).toBe(2);
  });
});

describe('walls from layers', () => {
  const layer = (rows: string[]) => grid(rows).px;
  it('marks every pixel that has ink on any layer', () => {
    const a = layer(['#....', '.....']);
    const b = layer(['....#', '.....']);
    const w = wallsFromLayers([a, b], 5, 2)!;
    expect([...w]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  });
  it('ignores a backdrop that covers most of the picture, so it cannot wall everything in', () => {
    const backdrop = layer(['#####', '#####']);
    const line = layer(['..#..', '.....']);
    expect([...wallsFromLayers([backdrop, line], 5, 2)!]).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('is null when nothing is drawn elsewhere', () => {
    expect(wallsFromLayers([], 3, 3)).toBeNull();
    expect(wallsFromLayers([layer(['...', '...', '...'])], 3, 3)).toBeNull();
  });
  it('lets faint ink through but counts a clear line', () => {
    const px = new Uint8ClampedArray(2 * 4);
    px[3] = 10;
    px[7] = 200;
    expect([...wallsFromLayers([px], 2, 1)!]).toEqual([0, 1]);
  });
});
