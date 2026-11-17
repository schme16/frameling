// The picture tip editor's grid: painting, flipping, turning, filling, and the tip it makes.
import { describe, expect, it } from 'vitest';
import {
  cellAt, colourCount, copyGrid, fillFrom, flipAcross, flipDown, gridFromPicture, gridFromStamp, harden, invertShape, isEmpty, MAX_GRID, newGrid, paintLine, resizeGrid, sameGrid, setCell, shift, stampFromGrid, turnRight,
  type Cell, type TipGrid,
} from '../../src/brushes/tipGrid';
import { stampCells, readPixelStamp } from '../../src/brushes/stamps';

const BLACK: Cell = [0, 0, 0, 255];
const RED: Cell = [220, 40, 40, 255];
const BLUE: Cell = [40, 40, 220, 255];

/** A grid from rows of text: # is black, r red, b blue, 1 to 9 a shade of black, anything else clear. */
function rows(...r: string[]): TipGrid {
  const g = newGrid(Math.max(...r.map((s) => s.length)), r.length);
  r.forEach((s, y) => [...s].forEach((c, x) => {
    if (c === '#') setCell(g, x, y, BLACK);
    else if (c === 'r') setCell(g, x, y, RED);
    else if (c === 'b') setCell(g, x, y, BLUE);
    else if (/[1-9]/.test(c)) setCell(g, x, y, [0, 0, 0, Number(c) * 28]);
  }));
  return g;
}
const alphas = (g: TipGrid): string => Array.from({ length: g.h }, (_, y) => Array.from({ length: g.w }, (_, x) => (cellAt(g, x, y)[3] > 6 ? '#' : '.')).join('')).join('/');

describe('a new grid', () => {
  it('is empty and never bigger than a picture tip can be', () => {
    expect(isEmpty(newGrid(8, 8))).toBe(true);
    const big = newGrid(999, -5);
    expect([big.w, big.h]).toEqual([MAX_GRID, 1]);
    expect(newGrid(NaN, 3).w).toBe(1);
  });

  it('ignores a cell off its edge', () => {
    const g = newGrid(3, 3);
    setCell(g, -1, 0, BLACK);
    setCell(g, 3, 0, BLACK);
    setCell(g, 0, 9, BLACK);
    expect(isEmpty(g)).toBe(true);
    expect(cellAt(g, 5, 5)).toEqual([0, 0, 0, 0]);
  });
});

describe('painting', () => {
  it('draws a line with no gaps, in any direction', () => {
    for (const [x0, y0, x1, y1] of [[0, 0, 7, 2], [7, 0, 0, 7], [3, 3, 3, 3], [0, 5, 7, 5]]) {
      const g = newGrid(8, 8);
      paintLine(g, x0, y0, x1, y1, BLACK);
      expect(cellAt(g, x0, y0)[3]).toBe(255);
      expect(cellAt(g, x1, y1)[3]).toBe(255);
      let n = 0;
      for (let i = 3; i < g.rgba.length; i += 4) if (g.rgba[i]) n++;
      expect(n).toBe(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1);
    }
  });

  it('survives a line that starts or ends off the grid', () => {
    const g = newGrid(4, 4);
    paintLine(g, -50, -50, 60, 60, BLACK);
    expect(isEmpty(g)).toBe(false);
  });

  it('fills a patch and stops at its edge', () => {
    const g = rows('..#..', '..#..', '..#..');
    expect(fillFrom(g, 0, 0, RED)).toBe(6);
    expect(alphas(g)).toBe('###../###../###..');
    expect(cellAt(g, 2, 1)).toEqual(BLACK);
    expect(cellAt(g, 1, 1)).toEqual(RED);
    expect(cellAt(g, 4, 2)[3]).toBe(0);
  });

  it('fills nothing when the colour is already there, or the click is off the grid', () => {
    const g = rows('##', '##');
    expect(fillFrom(g, 0, 0, BLACK)).toBe(0);
    expect(fillFrom(g, 9, 9, RED)).toBe(0);
  });

  it('treats every empty cell as the same colour for a fill', () => {
    const g = newGrid(3, 1);
    setCell(g, 1, 0, [9, 9, 9, 0]);
    expect(fillFrom(g, 0, 0, RED)).toBe(3);
  });
});

describe('changing the whole picture', () => {
  const arrow = rows('#..', '##.', '###');

  it('flips across and down, and twice is back where it started', () => {
    expect(alphas(flipAcross(arrow))).toBe('..#/.##/###');
    expect(alphas(flipDown(arrow))).toBe('###/##./#..');
    expect(sameGrid(flipAcross(flipAcross(arrow)), arrow)).toBe(true);
    expect(sameGrid(flipDown(flipDown(arrow)), arrow)).toBe(true);
  });

  it('turns a quarter clockwise, swaps the sides, and four turns is no turn', () => {
    const wide = rows('#..', '##.');
    const t = turnRight(wide);
    expect([t.w, t.h]).toEqual([2, 3]);
    expect(alphas(t)).toBe('##/#./..'.replace('..', '..'));
    expect(sameGrid(turnRight(turnRight(turnRight(turnRight(arrow)))), arrow)).toBe(true);
  });

  it('moves by whole cells and loses what goes off the edge', () => {
    expect(alphas(shift(arrow, 1, 0))).toBe('.#./.##/.##');
    expect(alphas(shift(arrow, 0, 1))).toBe('.../#../##.');
    expect(isEmpty(shift(arrow, 9, 0))).toBe(true);
  });

  it('swaps paint and gaps, and swapping twice gives the shape back', () => {
    const inv = invertShape(arrow, BLACK);
    expect(alphas(inv)).toBe('.##/..#/...');
    expect(alphas(invertShape(inv, BLACK))).toBe(alphas(arrow));
  });

  it('swaps shades too: a faint cell becomes a strong one', () => {
    const g = rows('1');
    expect(cellAt(invertShape(g, BLACK), 0, 0)[3]).toBe(255 - 28);
  });

  it('makes every shade full or empty with crisp edges', () => {
    const g = rows('19', '55');
    const h = harden(g);
    expect(h.rgba.filter((_, i) => i % 4 === 3)).toEqual(new Uint8ClampedArray([0, 255, 255, 255]));
    expect(sameGrid(copyGrid(g), g)).toBe(true);
  });

  it('changes the canvas size and keeps the drawing in the middle', () => {
    const dot = rows('#');
    const g = resizeGrid(dot, 5, 5);
    expect(cellAt(g, 2, 2)[3]).toBe(255);
    expect(isEmpty(resizeGrid(arrow, 1, 1))).toBe(false);
    expect(resizeGrid(arrow, 40, 40).w).toBe(MAX_GRID);
  });
});

describe('the tip a grid makes', () => {
  it('is nothing when nothing is drawn', () => {
    expect(stampFromGrid(newGrid(8, 8), false)).toBeNull();
    expect(stampFromGrid(newGrid(8, 8), true)).toBeNull();
  });

  it('trims the empty margin and says the size to draw it pixel for pixel', () => {
    const g = resizeGrid(rows('###', '#..'), 20, 20);
    const t = stampFromGrid(g, false)!;
    expect([t.stamp.w, t.stamp.h, t.size]).toEqual([3, 2, 3]);
  });

  it('is a plain shape when every cell is full, and a soft one when there are shades', () => {
    const plain = stampFromGrid(rows('##', '#.'), false)!.stamp;
    expect(plain.soft).toBeUndefined();
    expect(plain.keep).toBe(false);
    expect(plain.colours).toEqual(['#000000']);
    const soft = stampFromGrid(rows('#5', '5.'), false)!.stamp;
    expect(soft.soft).toBe(true);
    expect(soft.colours).toContain('#000000');
    expect(soft.colours.length).toBe(2);
  });

  it('keeps full cells exactly full in a soft tip, and shades in order', () => {
    const t = stampFromGrid(rows('13#'), false)!.stamp;
    const a = stampCells(t).map((c) => c.rgba[3]);
    expect(a[0]).toBeLessThan(a[1]);
    expect(a[2]).toBe(255);
    const c = stampFromGrid(rows('1#'), false)!.stamp;
    expect(stampCells(c).map((x) => x.rgba[3])[1]).toBe(255);
  });

  it('keeps the colours when asked and there are several, and is read back by the reader that loads saved brushes', () => {
    const t = stampFromGrid(rows('rb'), true)!.stamp;
    expect(t.keep).toBe(true);
    expect(t.colours.length).toBe(2);
    expect(readPixelStamp(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(readPixelStamp(JSON.parse(JSON.stringify(stampFromGrid(rows('#5', '5#'), false)!.stamp)))).not.toBeNull();
  });

  it('does not keep colours when there is only one', () => {
    expect(stampFromGrid(rows('rr'), true)!.stamp.keep).toBe(false);
  });

  it('gives a tip with up to 256 colours back exactly and thins out more than that', () => {
    const g = newGrid(32, 32);
    for (let i = 0; i < 1024; i++) setCell(g, i % 32, Math.floor(i / 32), [i & 255, (i >> 2) & 255, (i * 7) & 255, 255]);
    const t = stampFromGrid(g, true)!.stamp;
    expect(t.colours.length).toBeLessThanOrEqual(256);
    expect(t.w).toBe(32);
  });

  it('goes to a grid and back to the same picture', () => {
    for (const colour of [false, true]) {
      const g = colour ? rows('rb.', 'b#r') : rows('#5.', '5#1');
      const t = stampFromGrid(g, colour)!;
      const back = stampFromGrid(gridFromStamp(t.stamp), t.stamp.keep)!;
      expect(back.stamp).toEqual(t.stamp);
    }
  });
});

describe('a picture shrunk into a grid', () => {
  const pixels = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray => {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set(f(x, y), (y * w + x) * 4);
    return a;
  };

  it('never makes a grid bigger than 32 by 32, whatever the picture is', () => {
    const g = gridFromPicture(3000, 1500, pixels(3000, 1500, () => [0, 0, 0, 255]), 'dark', false);
    expect([g.w, g.h]).toEqual([32, 16]);
    expect(gridFromPicture(5, 7, pixels(5, 7, () => [0, 0, 0, 255]), 'dark', false).w).toBe(5);
  });

  it('takes the dark parts as the brush, or the light parts', () => {
    const p = pixels(4, 4, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const dark = gridFromPicture(4, 4, p, 'dark', false);
    expect(cellAt(dark, 0, 0)[3]).toBe(255);
    expect(cellAt(dark, 3, 0)[3]).toBe(0);
    const light = gridFromPicture(4, 4, p, 'light', false);
    expect(cellAt(light, 0, 0)[3]).toBe(0);
    expect(cellAt(light, 3, 0)[3]).toBe(255);
  });

  it('keeps its own shape and colours when it has see-through parts', () => {
    const p = pixels(4, 4, (x) => (x < 2 ? [200, 30, 30, 255] : [0, 0, 0, 0]));
    const g = gridFromPicture(4, 4, p, 'colours', true);
    expect(cellAt(g, 0, 0)).toEqual([200, 30, 30, 255]);
    expect(cellAt(g, 3, 3)[3]).toBe(0);
    expect(colourCount(g)).toBe(1);
  });

  it('a solid picture kept as it is is a block in its colours', () => {
    const g = gridFromPicture(2, 2, pixels(2, 2, (x) => (x ? [255, 0, 0, 255] : [0, 0, 255, 255])), 'colours', false);
    expect(colourCount(g)).toBe(2);
  });

  it('is empty when there is nothing to paint with (a white page, taken as the dark parts)', () => {
    expect(isEmpty(gridFromPicture(8, 8, pixels(8, 8, () => [255, 255, 255, 255]), 'dark', false))).toBe(true);
  });
});
