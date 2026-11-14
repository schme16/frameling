import { describe, expect, it } from 'vitest';
import { newDoc, newPixelLayer, newVectorLayer } from '../../src/core/doc';
import { hardenEdges, modePixels } from '../../src/convert/rasterize';
import { hexOf, separateColours } from '../../src/convert/separate';
import { suggestTrace } from '../../src/convert/shapes';
import { bytesWords, clampPixelSize, edgesForPixels, gridBytes, gridOf, isPixelArtDoc, MAX_PIXEL_SIZE, sizeChoices, sizeForAcross, usualPixelSize } from '../../src/convert/size';

describe('size maths', () => {
  it('makes whole-number pixel sizes in range', () => {
    expect(clampPixelSize(0)).toBe(1);
    expect(clampPixelSize(3.6)).toBe(4);
    expect(clampPixelSize(9999)).toBe(MAX_PIXEL_SIZE);
    expect(clampPixelSize(NaN, 2)).toBe(2);
    expect(clampPixelSize('x')).toBe(1);
  });
  it('rounds the grid up, like a pixel layer does', () => {
    expect(gridOf(256, 256, 8)).toEqual({ width: 32, height: 32 });
    expect(gridOf(100, 50, 8)).toEqual({ width: 13, height: 7 });
    expect(gridOf(1280, 720, 1)).toEqual({ width: 1280, height: 720 });
  });
  it('finds the size for a number of pixels across', () => {
    expect(sizeForAcross(1280, 160)).toBe(8);
    expect(sizeForAcross(1280, 0)).toBe(1);
    expect(sizeForAcross(100, 1000)).toBe(1);
  });
  it('only offers sizes that leave a real grid', () => {
    expect(sizeChoices(1280, 720)).toEqual([1, 2, 4, 8, 16, 32]);
    expect(sizeChoices(64, 64)).toEqual([1, 2, 4, 8]);
    expect(sizeChoices(4, 4)).toEqual([1]);
  });
  it('starts on the pixel size the drawing already uses', () => {
    const doc = newDoc({ width: 256, height: 256 });
    expect(usualPixelSize(doc)).toBe(1);
    doc.layers = [newVectorLayer('v'), newPixelLayer('a', 4), newPixelLayer('b', 4), newPixelLayer('c', 8)];
    expect(usualPixelSize(doc)).toBe(4);
  });
  it('follows what the drawing is for edges', () => {
    const vec = newDoc();
    expect(edgesForPixels(vec, 1, 'follow')).toBe('smooth');
    expect(edgesForPixels(vec, 4, 'follow')).toBe('hard');
    const mixed = newDoc();
    mixed.layers = [newVectorLayer('v'), newPixelLayer('p', 1)];
    expect(edgesForPixels(mixed, 1, 'follow')).toBe('hard');
    expect(edgesForPixels(vec, 8, 'smooth')).toBe('smooth');
    expect(isPixelArtDoc(vec)).toBe(false);
    mixed.layers = [newPixelLayer('p', 1)];
    expect(isPixelArtDoc(mixed)).toBe(true);
  });
  it('says memory in plain words', () => {
    expect(gridBytes(100, 100, 3)).toBe(120000);
    expect(bytesWords(500)).toBe('1 KB');
    expect(bytesWords(5 * 1024 * 1024)).toBe('5 MB');
    expect(bytesWords(3 * 1024 ** 3)).toBe('3.0 GB');
  });
});

describe('hardenEdges', () => {
  it('paints pixels that are half or more covered, and empties the rest', () => {
    const px = new Uint8ClampedArray([10, 20, 30, 200, 10, 20, 30, 127, 1, 2, 3, 128, 9, 9, 9, 0]);
    hardenEdges(px);
    expect([...px]).toEqual([10, 20, 30, 255, 0, 0, 0, 0, 1, 2, 3, 255, 0, 0, 0, 0]);
  });
});

describe('modePixels', () => {
  const px = (rgba: number[][]) => Uint8ClampedArray.from(rgba.flat());
  const D = [0, 0, 0, 255];
  const B = [100, 150, 250, 255];
  const T = [0, 0, 0, 0];

  it('takes the colour most of the pixel has, so a thin outline does not smear into its neighbour', () => {
    // one art pixel made of 2 x 2 samples: three dark, one blue
    expect([...modePixels(px([D, D, D, B]), 2, 2, 2)]).toEqual([0, 0, 0, 255]);
    expect([...modePixels(px([B, B, D, B]), 2, 2, 2)]).toEqual([100, 150, 250, 255]);
  });
  it('paints a pixel only when half or more of it is covered', () => {
    expect([...modePixels(px([D, T, T, T]), 2, 2, 2)]).toEqual([0, 0, 0, 0]);
    expect([...modePixels(px([D, D, T, T]), 2, 2, 2)]).toEqual([0, 0, 0, 255]);
  });
  it('makes one pixel per block', () => {
    const src = px([D, D, B, B, D, D, B, B]);
    expect([...modePixels(src, 4, 2, 2)]).toEqual([0, 0, 0, 255, 100, 150, 250, 255]);
  });
});

describe('separateColours', () => {
  const rgba = (rows: number[][][]) => Uint8ClampedArray.from(rows.flat(2));
  const R = [255, 0, 0, 255];
  const G = [0, 255, 0, 255];
  const B = [0, 0, 255, 255];
  const T = [0, 0, 0, 0];

  it('keeps every colour as it is when there are few, biggest first, with see-through left out', () => {
    const s = separateColours(rgba([[R, R, G, T], [R, B, G, T]]), 4, 2, 8);
    expect(s.exact).toBe(true);
    expect(s.distinct).toBe(3);
    expect(s.solid).toBe(6);
    expect(s.colours.map(hexOf)).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(s.counts).toEqual([3, 2, 1]);
    expect([...s.index]).toEqual([0, 0, 1, -1, 0, 2, 1, -1]);
  });

  it('merges to the nearest colour when there are more than the limit', () => {
    const near = [250, 5, 5, 255];
    const s = separateColours(rgba([[R, near, G, B]]), 4, 1, 3);
    expect(s.exact).toBe(false);
    expect(s.colours.length).toBeLessThanOrEqual(3);
    expect(s.index[0]).toBe(s.index[1]);
  });

  it('looks only inside a mask', () => {
    const s = separateColours(rgba([[R, G, B, R]]), 4, 1, 8, [0, 1, 1, 0]);
    expect(s.solid).toBe(2);
    expect(s.index[0]).toBe(-1);
    expect(s.index[3]).toBe(-1);
  });

  it('counts a picture of nothing as nothing', () => {
    const s = separateColours(new Uint8ClampedArray(16), 2, 2, 4);
    expect(s.colours).toEqual([]);
    expect(s.solid).toBe(0);
  });
});

describe('suggestTrace', () => {
  it('keeps flat art exactly and steps for chunky pixels; photos get fewer colours, bigger specks and curves', () => {
    expect(suggestTrace({ pixelSize: 8, width: 32, height: 32, distinct: 5 }, { edges: 'follow' })).toMatchObject({ colours: 5, edges: 'hug', speck: 1, photo: false, smooth: 0.1 });
    const photo = suggestTrace({ pixelSize: 1, width: 640, height: 480, distinct: 20000 }, { edges: 'follow' });
    expect(photo).toMatchObject({ colours: 16, edges: 'smooth', speck: 6, photo: true, smooth: 0.5 });
    expect(suggestTrace({ pixelSize: 1, width: 640, height: 480, distinct: 20000 }, { edges: 'hug' }).edges).toBe('hug');
  });
});
