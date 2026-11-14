import { describe, expect, it } from 'vitest';
import { pictureSymbol } from '../../src/clipboard/convert';

describe('a picture of pixels as a symbol', () => {
  const grid = (w: number, h: number, dots: [number, number][]): Uint8ClampedArray => {
    const a = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of dots) a.set([10, 200, 90, 255], (y * w + x) * 4);
    return a;
  };
  it('holds only the part that shows, where it was, with its origin in the middle', () => {
    const s = pictureSymbol(grid(16, 16, [[4, 6], [7, 9]]), 16, 16, 4, 'Picture')!;
    expect(s.drawing).toMatchObject({ kind: 'pixel', x: 4, y: 6, width: 4, height: 4 });
    expect(s.symbol.origin).toEqual({ x: 6 * 4, y: 8 * 4 });
    expect(s.symbol.layers[0]).toMatchObject({ kind: 'pixel', pixelSize: 4 });
    expect(s.symbol.layers[0].cels[0].drawingId).toBe(s.drawing.id);
    expect(s.instance).toMatchObject({ type: 'instance', symbolId: s.symbolId });
    expect(s.instance.transform).toMatchObject({ x: 24, y: 32, scaleX: 1, scaleY: 1, rotation: 0 });
  });
  it('is nothing when nothing shows', () => {
    expect(pictureSymbol(grid(8, 8, []), 8, 8, 1, 'Picture')).toBeNull();
  });
  it('does not share pixels with what it was made from', () => {
    const src = grid(8, 8, [[1, 1]]);
    const s = pictureSymbol(src, 8, 8, 1, 'Picture')!;
    src.fill(0);
    expect(s.drawing.pixels[0]).toBe(10);
  });
});
