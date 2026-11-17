// How big a Procreate grain picture is on the page: the width of Procreate's preview canvas against the picture's, and the
// pixels the kept tile covers. The numbers are the ones read off real files (see docs/brush-import.md).
import { describe, expect, it } from 'vitest';
import { encodePng } from '../../src/io/png';
import { paperScale, pngWidth, PREVIEW_CANVAS_WIDTH, USUAL_PICTURE_WIDTH } from '../../src/brushes/import/procreatePaper';

describe('pngWidth', () => {
  it('reads the width from the header, and says null for anything else', () => {
    expect(pngWidth(encodePng({ width: 327, height: 5, pixels: new Uint8ClampedArray(327 * 5 * 4) }))).toBe(327);
    expect(pngWidth(new Uint8Array(40))).toBe(null);
    expect(pngWidth(new Uint8Array(3))).toBe(null);
    const zero = encodePng({ width: 4, height: 4, pixels: new Uint8ClampedArray(64) });
    zero.set([0, 0, 0, 0], 16);
    expect(pngWidth(zero)).toBe(null);
  });
});

describe('paperScale', () => {
  it('is textureScale of the 1500 pixel preview canvas, as the picture shows it', () => {
    expect(PREVIEW_CANVAS_WIDTH).toBe(1500);
    // Albaharu's brushes (scale 0.826, a 1060 wide picture, a 256 pixel grain kept whole): a grain pixel is 0.583 of a picture pixel.
    expect(paperScale(0.8261, 1060, 256, 256)).toBeCloseTo(0.8261 * (1060 / 1500), 3);
    expect(0.8261 * (1060 / 1500)).toBeCloseTo(0.5838, 3);
    // Lace brush (scale 1, 327 wide): 0.219.
    expect(paperScale(1, 327, 64, 64)).toBe(0.25); // too small to scale below a quarter
    expect(paperScale(1, 327, 1339, 256)).toBeCloseTo(0.218 * (1339 / 256), 2);
  });

  it('counts the pixels of the grain that one kept pixel stands for', () => {
    // A 1840 pixel grain kept at 256: seven of its pixels in each.
    expect(paperScale(0.826, 1060, 1840, 256)).toBeCloseTo(0.826 * 0.7067 * (1840 / 256), 2);
    expect(paperScale(0.775, 1060, 2048, 256)).toBeCloseTo(4.38, 2); // Barely There
  });

  it('keeps to the sizes a smooth paper may be, and to a usable number', () => {
    expect(paperScale(100, 1060, 2048, 256)).toBe(8);
    expect(paperScale(0.001, 1060, 64, 64)).toBe(0.25);
    expect(paperScale(0, null, 256, 256)).toBeCloseTo(USUAL_PICTURE_WIDTH / PREVIEW_CANVAS_WIDTH, 2);
    expect(paperScale(Number.NaN, null, 256, 256)).toBeCloseTo(USUAL_PICTURE_WIDTH / PREVIEW_CANVAS_WIDTH, 2);
  });
});
