import { describe, expect, it } from 'vitest';
import {
  clearPixels,
  clipToMask,
  combineMasks,
  coverOf,
  extractPixels,
  featherMask,
  fromCover,
  growMask,
  invertMask,
  maskCount,
  maskHas,
  mixPixel,
  rectMask,
  resizeMask,
  shiftMask,
} from '../../src/select/mask';

const solid = (w: number, h: number, c: number[]) => {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) p.set(c, i * 4);
  return p;
};
const px = (p: Uint8ClampedArray, w: number, x: number, y: number) => [...p.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe('grow and shrink a selection', () => {
  it('growing a single pixel by 2 gives a disc of the right size', () => {
    const m = rectMask(11, 11, 5, 5, 5, 5);
    const g = growMask(m, 2);
    expect(maskHas(g, 5, 5)).toBe(true);
    expect(maskHas(g, 7, 5)).toBe(true);
    expect(maskHas(g, 8, 5)).toBe(false);
    expect(maskHas(g, 7, 7)).toBe(false); // the corner is further than 2
    expect(maskCount(g)).toBe(13);
  });

  it('shrinking a box by 1 takes one pixel off every side', () => {
    const m = rectMask(10, 10, 2, 2, 7, 7);
    const s = growMask(m, -1);
    expect(maskCount(s)).toBe(4 * 4);
    expect(maskHas(s, 3, 3)).toBe(true);
    expect(maskHas(s, 2, 2)).toBe(false);
  });

  it('grow then shrink by the same amount gives a box back', () => {
    const m = rectMask(20, 20, 5, 5, 12, 12);
    const back = growMask(growMask(m, 3), -3);
    expect(maskCount(back)).toBeGreaterThanOrEqual(maskCount(m) - 0);
    expect(maskHas(back, 8, 8)).toBe(true);
  });

  it('shrinking far enough empties it, and growing keeps to the picture', () => {
    expect(maskCount(growMask(rectMask(8, 8, 3, 3, 4, 4), -3))).toBe(0);
    expect(maskCount(growMask(rectMask(4, 4, 0, 0, 3, 3), 5))).toBe(16);
  });

  it('a selection that runs to the border is not eaten in from the border', () => {
    const m = rectMask(8, 8, 0, 0, 7, 3);
    const s = growMask(m, -2);
    expect(maskHas(s, 0, 0)).toBe(true);
    expect(maskHas(s, 7, 0)).toBe(true);
    expect(maskHas(s, 3, 2)).toBe(false);
  });

  it('zero changes nothing and the input is never changed', () => {
    const m = rectMask(6, 6, 1, 1, 3, 3);
    const before = m.bits.slice();
    expect(growMask(m, 0).bits).toEqual(before);
    growMask(m, 2);
    expect(m.bits).toEqual(before);
  });
});

describe('feather', () => {
  it('a feathered box is solid inside, clear outside and part way across the edge', () => {
    const m = rectMask(40, 40, 10, 10, 29, 29);
    const f = featherMask(m, 6);
    const c = f.soft!;
    expect(c[20 * 40 + 20]).toBe(255);
    expect(c[0]).toBe(0);
    const across = [...Array(12).keys()].map((i) => c[20 * 40 + 4 + i]);
    // Rises steadily from the outside to the inside along a row.
    for (let i = 1; i < across.length; i++) expect(across[i]).toBeGreaterThanOrEqual(across[i - 1]);
    expect(across.some((v) => v > 0 && v < 255)).toBe(true);
  });

  it('the bits are where the cover is half or more, so the outline stays about where the edge was', () => {
    const m = rectMask(40, 40, 10, 10, 29, 29);
    const f = featherMask(m, 6);
    expect(maskHas(f, 10, 20)).toBe(true);
    expect(maskHas(f, 9, 20)).toBe(false);
    for (let i = 0; i < f.bits.length; i++) expect(f.bits[i]).toBe(f.soft![i] >= 128 ? 1 : 0);
  });

  it('a tiny radius returns the mask as it was, and a selection at the border stays solid there', () => {
    const m = rectMask(10, 10, 2, 2, 5, 5);
    expect(featherMask(m, 0.2)).toBe(m);
    const edge = featherMask(rectMask(20, 60, 0, 10, 19, 49), 6);
    expect(edge.soft![30 * 20 + 0]).toBe(255);
    expect(edge.soft![30 * 20 + 19]).toBe(255);
  });

  it('the cover holds the same amount: what it loses inside it gains outside', () => {
    const m = rectMask(60, 60, 20, 20, 39, 39);
    const f = featherMask(m, 5);
    const total = coverOf(f).reduce((a, b) => a + b, 0) / 255;
    expect(Math.abs(total - 400)).toBeLessThan(6);
  });

  it('a fully solid cover is a plain mask again', () => {
    const f = fromCover(2, 1, new Uint8Array([255, 0]));
    expect(f.soft).toBeUndefined();
    expect([...f.bits]).toEqual([1, 0]);
  });
});

describe('what a soft selection does to pixels', () => {
  const m = fromCover(3, 1, new Uint8Array([255, 128, 0]));
  it('delete clears the cover part: whole, half, none', () => {
    const out = clearPixels(solid(3, 1, [200, 0, 0, 255]), m);
    expect(px(out, 3, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 3, 1, 0)[3]).toBe(127);
    expect(px(out, 3, 2, 0)).toEqual([200, 0, 0, 255]);
  });

  it('copy takes the cover part as see-through, so a paste fades out', () => {
    const out = extractPixels(solid(3, 1, [200, 0, 0, 255]), m);
    expect(px(out, 3, 0, 0)).toEqual([200, 0, 0, 255]);
    expect(px(out, 3, 1, 0)).toEqual([200, 0, 0, 128]);
    expect(px(out, 3, 2, 0)).toEqual([0, 0, 0, 0]);
  });

  it('a copy and a delete of the same soft edge add back up to the original', () => {
    const orig = solid(3, 1, [10, 20, 30, 255]);
    const left = clearPixels(orig, m);
    const lifted = extractPixels(orig, m);
    expect(left[7] + lifted[7]).toBeGreaterThanOrEqual(254);
    expect(left[7] + lifted[7]).toBeLessThanOrEqual(256);
  });

  it('paint and fill (the clip) blend the new colour in by the cover', () => {
    const before = solid(3, 1, [0, 0, 255, 255]);
    const after = solid(3, 1, [255, 0, 0, 255]);
    const out = clipToMask(before, after, m);
    expect(px(out, 3, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(out, 3, 1, 0)).toEqual([128, 0, 127, 255]);
    expect(px(out, 3, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  it('mixing onto nothing keeps the new colour and only its opacity fades', () => {
    const out = new Uint8ClampedArray(4);
    mixPixel(new Uint8ClampedArray(4), new Uint8ClampedArray([255, 0, 0, 255]), 0, 128, out);
    expect([...out]).toEqual([255, 0, 0, 128]);
  });
});

describe('soft masks through the other mask operations', () => {
  const soft = featherMask(rectMask(40, 40, 10, 10, 29, 29), 4);
  it('moving keeps the soft edge', () => {
    const s = shiftMask(soft, 3, 2);
    expect(s.soft![(10 + 2) * 40 + 10 + 3]).toBe(soft.soft![10 * 40 + 10]);
  });
  it('resizing keeps it', () => {
    expect(resizeMask(soft, 50, 50).soft![20 * 50 + 20]).toBe(soft.soft![20 * 40 + 20]);
  });
  it('inverting flips the cover', () => {
    const inv = invertMask(soft);
    expect(inv.soft![0]).toBe(255);
    expect(inv.soft![20 * 40 + 20]).toBe(0);
    expect(inv.soft![10 * 40 + 9] + soft.soft![10 * 40 + 9]).toBe(255);
  });
  it('adding and taking away use the cover', () => {
    const half = rectMask(40, 40, 0, 0, 19, 39);
    const cut = combineMasks(soft, half, 'subtract');
    expect(cut.soft![20 * 40 + 10]).toBe(0);
    expect(cut.soft![20 * 40 + 24]).toBeGreaterThan(250);
    expect(combineMasks(soft, rectMask(40, 40, 0, 0, 1, 1), 'add').soft![10 * 40 + 9]).toBe(soft.soft![10 * 40 + 9]);
  });
});
