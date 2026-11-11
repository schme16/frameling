import { describe, expect, it } from 'vitest';
import { i420Size, rgbaToI420 } from '../../src/export/yuv';

const px = (w: number, h: number, rgb: number[]) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i += 4) a.set([...rgb, 255], i);
  return a;
};

describe('rgbaToI420 (limited range BT.709)', () => {
  it('black, white and grey land on 16, 235 and the middle, with neutral chroma', () => {
    for (const [v, y] of [[0, 16], [255, 235], [128, 126]]) {
      const out = rgbaToI420(px(2, 2, [v, v, v]), 2, 2);
      expect(Array.from(out)).toEqual([y, y, y, y, 128, 128]);
    }
  });

  it('primaries match the BT.709 table', () => {
    const at = (rgb: number[]) => Array.from(rgbaToI420(px(2, 2, rgb), 2, 2).slice(3));
    expect(at([255, 0, 0])).toEqual([63, 102, 240]);
    expect(at([0, 255, 0])).toEqual([173, 42, 26]);
    expect(at([0, 0, 255])).toEqual([32, 240, 118]);
  });

  it('averages each 2 x 2 block for chroma and handles odd sizes', () => {
    expect(i420Size(3, 3)).toBe(9 + 2 * 4);
    const img = px(3, 1, [0, 0, 0]);
    img.set([255, 255, 255, 255], 0);
    const out = rgbaToI420(img, 3, 1);
    expect(out.length).toBe(3 + 2 * 2);
    expect(Array.from(out.slice(0, 3))).toEqual([235, 16, 16]);
    expect(Array.from(out.slice(3))).toEqual([128, 128, 128, 128]);
  });

  it('reuses the buffer it is given', () => {
    const buf = new Uint8Array(i420Size(2, 2));
    expect(rgbaToI420(px(2, 2, [1, 2, 3]), 2, 2, buf)).toBe(buf);
  });
});
