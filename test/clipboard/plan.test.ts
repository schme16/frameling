import { describe, expect, it } from 'vitest';
import { copyScale, decidePaste, fitPicture, hardenEdges, placeOnGrid, sayPicture, sayPixelsToPicture, sayShapesToPixels, shrinkPixels, upscalePixels, visiblePixels } from '../../src/clipboard/plan';

const solid = (w: number, h: number, rgba: [number, number, number, number]): Uint8ClampedArray => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set(rgba, i * 4);
  return a;
};

describe('which paste it is', () => {
  const base = { layer: 'vector' as const, external: false, lastCopied: null, haveShapes: false, havePixels: false };
  it('pastes a picture from another app first', () => {
    expect(decidePaste({ ...base, external: true, haveShapes: true, lastCopied: 'shapes' })).toBe('picture');
  });
  it('pastes the newest thing copied in Frameling, whatever the layer', () => {
    expect(decidePaste({ ...base, haveShapes: true, havePixels: true, lastCopied: 'pixels' })).toBe('pixels');
    expect(decidePaste({ ...base, layer: 'pixel', haveShapes: true, havePixels: true, lastCopied: 'shapes' })).toBe('shapes');
  });
  it('falls back to what is there when the newest is gone', () => {
    expect(decidePaste({ ...base, haveShapes: true, lastCopied: 'pixels' })).toBe('shapes');
    expect(decidePaste({ ...base, havePixels: true })).toBe('pixels');
  });
  it('says nothing when there is nothing', () => {
    expect(decidePaste(base)).toBe('nothing');
  });
});

describe('where a picture goes and how big', () => {
  it('keeps the size of a picture that fits, in the middle', () => {
    expect(fitPicture(10, 6, 32, 20, 'shrink')).toEqual({ width: 10, height: 6, x: 11, y: 7, shrunk: false, cropped: false });
  });
  it('never makes a small picture bigger', () => {
    const f = fitPicture(2, 2, 256, 256, 'shrink');
    expect([f.width, f.height, f.shrunk]).toEqual([2, 2, false]);
  });
  it('shrinks a big picture to fit, keeping its shape', () => {
    const f = fitPicture(400, 200, 100, 100, 'shrink');
    expect([f.width, f.height, f.x, f.y, f.shrunk]).toEqual([100, 50, 0, 25, true]);
  });
  it('can keep the size and cut the edges instead', () => {
    const f = fitPicture(400, 200, 100, 100, 'crop');
    expect([f.width, f.height, f.x, f.y, f.shrunk, f.cropped]).toEqual([400, 200, -150, -50, false, true]);
  });
  it('lays a cropped picture on the grid with the overhang cut', () => {
    const src = solid(4, 4, [255, 0, 0, 255]);
    const fit = fitPicture(4, 4, 2, 2, 'crop');
    const out = placeOnGrid(src, 4, 4, 2, 2, fit);
    expect(visiblePixels(out)).toBe(4);
  });
  it('places a small picture at its spot and leaves the rest clear', () => {
    const src = solid(2, 2, [0, 255, 0, 255]);
    const out = placeOnGrid(src, 2, 2, 6, 6, fitPicture(2, 2, 6, 6, 'shrink'));
    expect(visiblePixels(out)).toBe(4);
    // x = y = 2 in a 6 x 6 grid
    expect(out[(2 * 6 + 2) * 4 + 1]).toBe(255);
    expect(out[(0 * 6 + 0) * 4 + 3]).toBe(0);
  });
});

describe('shrinking', () => {
  it('averages the pixels under each new one', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 255, 200, 200, 200, 255, 0, 0, 0, 255, 200, 200, 200, 255]);
    const out = shrinkPixels(src, 2, 2, 1, 1);
    expect([...out]).toEqual([100, 100, 100, 255]);
  });
  it('does not let see-through pixels darken the colour', () => {
    const src = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const out = shrinkPixels(src, 2, 1, 1, 1);
    expect([out[0], out[1], out[2]]).toEqual([255, 0, 0]);
    expect(out[3]).toBeGreaterThan(100);
    expect(out[3]).toBeLessThan(140);
  });
  it('handles sizes that do not divide evenly', () => {
    const out = shrinkPixels(solid(7, 5, [10, 20, 30, 255]), 7, 5, 3, 2);
    expect(out.length).toBe(3 * 2 * 4);
    expect([out[0], out[1], out[2], out[3]]).toEqual([10, 20, 30, 255]);
  });
});

describe('hard edges', () => {
  it('makes a pixel more than half there solid, and the rest clear', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 200, 10, 20, 30, 60, 1, 2, 3, 255, 0, 0, 0, 0]);
    const r = hardenEdges(src);
    expect([...r.pixels]).toEqual([10, 20, 30, 255, 0, 0, 0, 0, 1, 2, 3, 255, 0, 0, 0, 0]);
    expect(r.softened).toBe(2);
  });
});

describe('what gets said', () => {
  it('says a picture that fits kept its size', () => {
    const t = sayPicture({ from: { w: 32, h: 32 }, fit: fitPicture(32, 32, 100, 100, 'shrink'), into: 'pixel' });
    expect(t).toContain('32 x 32');
    expect(t).toContain('own size');
  });
  it('says a shrunk picture was shrunk, and to what', () => {
    const t = sayPicture({ from: { w: 400, h: 200 }, fit: fitPicture(400, 200, 100, 100, 'shrink'), into: 'vector' });
    expect(t).toContain('shrunk to 100 x 50');
    expect(t).toContain('picture of pixels');
  });
  it('says a cropped picture was cut', () => {
    expect(sayPicture({ from: { w: 400, h: 200 }, fit: fitPicture(400, 200, 100, 100, 'crop'), into: 'pixel' })).toContain('cut off');
  });
  it('says the palette matched colours only when it changed some', () => {
    const fit = fitPicture(4, 4, 8, 8, 'shrink');
    expect(sayPicture({ from: { w: 4, h: 4 }, fit, into: 'pixel', lock: { changed: 5 } })).toContain('palette is locked');
    expect(sayPicture({ from: { w: 4, h: 4 }, fit, into: 'pixel', lock: { changed: 0 } })).not.toContain('palette');
  });
  it('says what shapes lost on the way to pixels', () => {
    const t = sayShapesToPixels({ count: 3, pixelSize: 4, locked: true, offPage: true, instances: false });
    expect(t).toContain('3 shapes as pixels');
    expect(t).toContain('4 x 4');
    expect(t).toContain('palette');
    expect(t).toContain('page edge');
  });
  it('says pixels stay pixels on a vector layer', () => {
    expect(sayPixelsToPicture({ width: 8, height: 8, pixelSize: 1 })).toContain('stays pixels');
  });
  it('never uses an em dash', () => {
    const all = [sayPicture({ from: { w: 9, h: 9 }, fit: fitPicture(9, 9, 4, 4, 'shrink'), into: 'vector', lock: { changed: 1 } }), sayShapesToPixels({ count: 1, pixelSize: 1, locked: true, offPage: true, instances: true }), sayPixelsToPicture({ width: 1, height: 1, pixelSize: 1 })];
    for (const t of all) expect(t).not.toContain('—');
  });
});

describe('pixels going out', () => {
  it('scales each pixel up without smoothing', () => {
    const src = new Uint8ClampedArray([1, 1, 1, 255, 2, 2, 2, 255]);
    const out = upscalePixels(src, 2, 1, 3);
    expect(out.length).toBe(6 * 3 * 4);
    expect([out[0], out[8], out[12 * 1 + 0], out[(5 + 2 * 6) * 4]]).toEqual([1, 1, 2, 2]);
  });
  it('goes out the size it is on the page, but never past the limit', () => {
    expect(copyScale(16, 16, 8)).toBe(8);
    expect(copyScale(1000, 1000, 8)).toBe(4);
    expect(copyScale(5000, 10, 8)).toBe(1);
  });
});
