// Putting selected pixels through a matrix: what is exact, what is picked again, and that no new colour is ever made.
import { describe, expect, it } from 'vitest';
import { multiply, rotateAbout, scaleAbout, translate, type Matrix } from '../../src/canvas/geometry';
import { rotateQuarter, flipH, type Img } from '../../src/pixel/transform';
import { isLossless, isSquare, isWholeMove, pixelOp, resamplePixels } from '../../src/transform/pixels';

const W = 12;
const H = 12;
const box = { x0: 2, y0: 3, x1: 5, y1: 6 };

/** A 4 x 4 sprite at (2,3) with a different colour in every cell, so any mix-up shows. */
function sprite(): Img {
  const pixels = new Uint8ClampedArray(W * H * 4);
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const i = (y * W + x) * 4;
      n++;
      pixels.set([n * 10, 255 - n * 9, (n * 37) % 256, 255], i);
    }
  return { width: W, height: H, pixels };
}
const at = (p: Uint8ClampedArray, x: number, y: number) => Array.from(p.slice((y * W + x) * 4, (y * W + x) * 4 + 4)).join(',');
const colours = (p: Uint8ClampedArray) => {
  const out = new Set<string>();
  for (let i = 0; i < p.length; i += 4) if (p[i + 3]) out.add(`${p[i]},${p[i + 1]},${p[i + 2]},${p[i + 3]}`);
  return out;
};
const count = (p: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i]) n++;
  return n;
};

describe('what stays exact', () => {
  it('a move by whole pixels is the same pixels somewhere else', () => {
    const img = sprite();
    const out = resamplePixels(img, box, translate(3, 2));
    expect(at(out, 5, 5)).toBe(at(img.pixels, 2, 3));
    expect(at(out, 8, 8)).toBe(at(img.pixels, 5, 6));
    expect(count(out)).toBe(16);
  });

  it('a flip about the middle of the box is the flip', () => {
    const img = sprite();
    const m: Matrix = scaleAbout(-1, 1, 4, 5);
    const out = resamplePixels(img, box, m);
    expect(Array.from(out)).toEqual(Array.from(flipH(img, box)));
  });

  it('a quarter turn about the middle is the quarter turn', () => {
    const img = sprite();
    const out = resamplePixels(img, box, rotateAbout(Math.PI / 2, 4, 5));
    expect(Array.from(out)).toEqual(Array.from(rotateQuarter(img, 1, box)));
  });

  it('knows which of those are lossless', () => {
    expect(isLossless(translate(3, 2), box)).toBe(true);
    expect(isLossless(scaleAbout(-1, 1, 4, 5), box)).toBe(true);
    expect(isLossless(rotateAbout(Math.PI / 2, 4, 5), box)).toBe(true);
    expect(isLossless(translate(0.5, 0), box)).toBe(false);
    expect(isLossless(scaleAbout(2, 2, 2, 3), box)).toBe(false);
    expect(isLossless(rotateAbout(0.3, 4, 5), box)).toBe(false);
    expect(isWholeMove(translate(3, 2))).toBe(true);
    expect(isSquare(rotateAbout(0.3, 4, 5))).toBe(false);
  });
});

describe('what is picked again', () => {
  it('a stretch repeats pixels and each one stays one of the originals', () => {
    const img = sprite();
    const out = resamplePixels(img, box, scaleAbout(2, 2, 2, 3));
    expect(count(out)).toBe(64);
    expect(at(out, 2, 3)).toBe(at(img.pixels, 2, 3));
    expect(at(out, 3, 4)).toBe(at(img.pixels, 2, 3));
    expect(at(out, 9, 10)).toBe(at(img.pixels, 5, 6));
  });

  it('a squash skips pixels', () => {
    const out = resamplePixels(sprite(), box, scaleAbout(0.5, 1, 2, 3));
    expect(count(out)).toBe(8);
  });

  it('turning or slanting never makes a colour that was not there, either way', () => {
    const img = sprite();
    const before = colours(img.pixels);
    for (const how of ['crisp', 'plain'] as const) {
      for (const m of [rotateAbout(0.5, 4, 5), multiply(translate(0, 0), [1, 0, 0.6, 1, -2, 0] as Matrix), rotateAbout(2.2, 4, 5)]) {
        const out = resamplePixels(img, box, m, how);
        expect(count(out)).toBeGreaterThan(0);
        for (const c of colours(out)) expect(before.has(c)).toBe(true);
      }
    }
  });

  it('is deterministic, so a preview and the landing agree', () => {
    const img = sprite();
    const m = rotateAbout(0.7, 4, 5);
    expect(Array.from(resamplePixels(img, box, m))).toEqual(Array.from(resamplePixels(img, box, m)));
  });

  it('drops what lands off the grid', () => {
    const out = resamplePixels(sprite(), box, translate(20, 0));
    expect(count(out)).toBe(0);
  });

  it('a matrix that squashes everything flat leaves nothing', () => {
    expect(count(resamplePixels(sprite(), box, [0, 0, 0, 0, 4, 4]))).toBe(0);
  });

  it('the pixel operation is the same thing in the shape editPixels wants', () => {
    const img = sprite();
    const m = translate(1, 1);
    expect(Array.from(pixelOp(m)(img, box)!)).toEqual(Array.from(resamplePixels(img, box, m)));
    expect(pixelOp(m)(img)).toBeNull();
  });
});
