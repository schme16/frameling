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

describe('rgbaToI420 matches the plain two pass version', () => {
  // The straightforward version it replaced, kept here as the reference.
  function reference(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
    const S = 1 << 16;
    const KR = 0.2126;
    const KB = 0.0722;
    const KG = 1 - KR - KB;
    const ys = 219 / 255;
    const cbs = 224 / 255 / (2 * (1 - KB));
    const crs = 224 / 255 / (2 * (1 - KR));
    const R = Math.round;
    const [YR, YG, YB] = [R(ys * KR * S), R(ys * KG * S), R(ys * KB * S)];
    const [UR, UG, UB] = [R(cbs * -KR * S), R(cbs * -KG * S), R(cbs * (1 - KB) * S)];
    const [VR, VG, VB] = [R(crs * (1 - KR) * S), R(crs * -KG * S), R(crs * -KB * S)];
    const Y0 = 16 * S + S / 2;
    const C0 = 128 * S + S / 2;
    const cw = Math.ceil(width / 2);
    const ch = Math.ceil(height / 2);
    const dst = new Uint8Array(i420Size(width, height));
    for (let i = 0; i < width * height; i++) dst[i] = (YR * rgba[i * 4] + YG * rgba[i * 4 + 1] + YB * rgba[i * 4 + 2] + Y0) >> 16;
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const ys2 = [cy * 2, Math.min(cy * 2 + 1, height - 1)];
        const xs2 = [cx * 2, Math.min(cx * 2 + 1, width - 1)];
        let r = 0;
        let g = 0;
        let b = 0;
        for (const y of ys2) for (const x of xs2) {
          const k = (y * width + x) * 4;
          r += rgba[k];
          g += rgba[k + 1];
          b += rgba[k + 2];
        }
        dst[width * height + cy * cw + cx] = (UR * r + UG * g + UB * b + 4 * C0) >> 18;
        dst[width * height + cw * ch + cy * cw + cx] = (VR * r + VG * g + VB * b + 4 * C0) >> 18;
      }
    }
    return dst;
  }
  it.each([[16, 8], [33, 17], [1, 1], [5, 2], [2, 5]])('%i x %i', (w, h) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) >>> 24;
    expect([...rgbaToI420(px, w, h)]).toEqual([...reference(px, w, h)]);
    // A view that doesn't start on a 4 byte boundary still works.
    const shifted = new Uint8ClampedArray(px.length + 1);
    shifted.set(px, 1);
    expect([...rgbaToI420(shifted.subarray(1), w, h)]).toEqual([...reference(px, w, h)]);
  });
});
