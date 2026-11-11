import { describe, expect, it } from 'vitest';
import { PixelPerfect, bresenham, brushOffsets, docToPixel, getPx, isElbow, pixelLine, pixelPerfect, setPx } from '../../src/canvas/pixels';
import { hexToHsv, hsvToHex, parseHex, toHex } from '../../src/canvas/colors';

const pts = (list: [number, number][]) => list.map(([x, y]) => ({ x, y }));

describe('bresenham', () => {
  it('draws straight lines including both ends', () => {
    expect(bresenham(0, 0, 3, 0)).toEqual(pts([[0, 0], [1, 0], [2, 0], [3, 0]]));
    expect(bresenham(3, 3, 3, 1)).toEqual(pts([[3, 3], [3, 2], [3, 1]]));
    expect(bresenham(2, 2, 2, 2)).toEqual(pts([[2, 2]]));
  });

  it('draws diagonals and shallow slopes, in either direction', () => {
    expect(bresenham(0, 0, 3, 3)).toEqual(pts([[0, 0], [1, 1], [2, 2], [3, 3]]));
    expect(bresenham(0, 0, 4, 1)).toEqual(pts([[0, 0], [1, 0], [2, 1], [3, 1], [4, 1]]));
    expect(bresenham(4, 1, 0, 0).length).toBe(5);
  });

  it('never skips a pixel (every step touches the last)', () => {
    for (const [x1, y1] of [[17, 5], [-9, 12], [3, -20], [0, 0], [40, 40]] as const) {
      const line = bresenham(0, 0, x1, y1);
      for (let i = 1; i < line.length; i++) {
        expect(Math.max(Math.abs(line[i].x - line[i - 1].x), Math.abs(line[i].y - line[i - 1].y))).toBe(1);
      }
      expect(line[line.length - 1]).toEqual({ x: x1, y: y1 });
    }
  });
});

describe('pixel perfect', () => {
  it('spots the elbow of an L', () => {
    expect(isElbow({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(isElbow({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true);
    expect(isElbow({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
    expect(isElbow({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('removes the corner doubles from a staircase', () => {
    // Right, down, right, down: the classic jaggy staircase.
    const stairs = pts([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]]);
    expect(pixelPerfect(stairs)).toEqual(pts([[0, 0], [1, 1], [2, 2]]));
  });

  it('leaves straight lines and clean diagonals alone', () => {
    const flat = bresenham(0, 0, 6, 0);
    expect(pixelPerfect(flat)).toEqual(flat);
    const diag = bresenham(0, 0, 5, 5);
    expect(pixelPerfect(diag)).toEqual(diag);
  });

  it('cuts the corner off a turn, leaving the long runs whole', () => {
    const l = pts([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
    expect(pixelPerfect(l)).toEqual(pts([[0, 0], [1, 0], [2, 1], [2, 2]]));
  });

  it('streams the same answer one pixel at a time, and says what it dropped', () => {
    const stairs = pts([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]]);
    const pp = new PixelPerfect();
    const dropped = stairs.map((p) => pp.add(p)).filter(Boolean);
    expect(dropped).toEqual(pts([[1, 0], [2, 1]]));
    expect(pp.kept).toEqual(pixelPerfect(stairs));
  });

  it('ignores a repeated pixel', () => {
    const pp = new PixelPerfect();
    pp.add({ x: 1, y: 1 });
    expect(pp.add({ x: 1, y: 1 })).toBeNull();
    expect(pp.kept.length).toBe(1);
  });

  it('makes a line with no L-shaped corners from any freehand path', () => {
    const wobbly = [...bresenham(0, 0, 5, 2), ...bresenham(5, 2, 9, 9).slice(1), ...bresenham(9, 9, 2, 12).slice(1)];
    const clean = pixelPerfect(wobbly);
    for (let i = 2; i < clean.length; i++) expect(isElbow(clean[i - 2], clean[i - 1], clean[i])).toBe(false);
    expect(clean.length).toBeLessThanOrEqual(wobbly.length);
  });

  it('pixelLine optionally cleans up', () => {
    expect(pixelLine(0, 0, 4, 2, false)).toEqual(bresenham(0, 0, 4, 2));
    expect(pixelLine(0, 0, 4, 2, true).length).toBeLessThanOrEqual(5);
  });
});

describe('brush footprints', () => {
  it('is one pixel at size 1 and centred on odd sizes', () => {
    expect(brushOffsets(1, 'square')).toEqual(pts([[0, 0]]));
    const three = brushOffsets(3, 'square');
    expect(three.length).toBe(9);
    expect(three.some((o) => o.x === -1 && o.y === -1)).toBe(true);
    expect(three.some((o) => o.x === 1 && o.y === 1)).toBe(true);
  });

  it('covers size x size for even sizes, leaning up and left', () => {
    const two = brushOffsets(2, 'square');
    expect(two.length).toBe(4);
    expect(Math.min(...two.map((o) => o.x))).toBe(0);
    expect(Math.min(...two.map((o) => o.x))).toBe(0);
    expect(brushOffsets(4, 'square').some((o) => o.x === -1)).toBe(true);
  });

  it('rounds off the corners of bigger round brushes', () => {
    expect(brushOffsets(5, 'round').length).toBeLessThan(25);
    expect(brushOffsets(5, 'round').length).toBeGreaterThan(15);
    expect(brushOffsets(2, 'round').length).toBe(4);
  });
});

describe('pixel buffers', () => {
  it('writes and reads, ignoring anything off the grid', () => {
    const buf = new Uint8ClampedArray(4 * 4 * 4);
    expect(setPx(buf, 4, 4, 1, 2, [10, 20, 30, 255])).toBe(true);
    expect(getPx(buf, 4, 1, 2)).toEqual([10, 20, 30, 255]);
    expect(setPx(buf, 4, 4, 4, 0, [1, 1, 1, 1])).toBe(false);
    expect(setPx(buf, 4, 4, -1, 0, [1, 1, 1, 1])).toBe(false);
  });

  it('maps document positions to art pixels', () => {
    expect(docToPixel(15.9, 16, 8)).toEqual({ x: 1, y: 2 });
    expect(docToPixel(-0.5, 0, 8)).toEqual({ x: -1, y: 0 });
  });
});

describe('colours', () => {
  it('reads short, long and alpha hex', () => {
    expect(parseHex('#fa0')).toEqual([255, 170, 0, 255]);
    expect(parseHex('ff9e6d')).toEqual([255, 158, 109, 255]);
    expect(parseHex('#11223380')).toEqual([17, 34, 51, 128]);
    expect(parseHex('nope')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
  });

  it('writes hex, with alpha only when it is not opaque', () => {
    expect(toHex(255, 158, 109)).toBe('#ff9e6d');
    expect(toHex(17, 34, 51, 128)).toBe('#11223380');
  });

  it('goes round trip through HSV', () => {
    for (const hex of ['#ff9e6d', '#1d1b26', '#ffffff', '#5ab8ff', '#000000']) expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
  });
});
