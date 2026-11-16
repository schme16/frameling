// Colour for the pixel brush: hue, saturation and lightness, mixing toward the back colour, and the wet load.
import { describe, expect, it } from 'vitest';
import { hslToRgb, mixRgb, pickUp, rgbToHsl, shiftColour, type Rgb } from '../../src/dab/colour';

describe('hue, saturation and lightness', () => {
  it('turns a colour into hsl and back to the same colour', () => {
    for (const c of [[220, 40, 40], [0, 0, 0], [255, 255, 255], [10, 200, 90], [128, 128, 128], [30, 60, 250]]) {
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      expect(hslToRgb(h, s, l, [0, 0, 0])).toEqual(c);
    }
  });

  it('knows the primaries', () => {
    expect(rgbToHsl(255, 0, 0)[0]).toBe(0);
    expect(rgbToHsl(0, 255, 0)[0]).toBe(120);
    expect(rgbToHsl(0, 0, 255)[0]).toBe(240);
  });

  it('turns red to green with a third of a turn, and back round with a whole one', () => {
    expect(shiftColour(255, 0, 0, 120, 0, 0, [0, 0, 0])).toEqual([0, 255, 0]);
    expect(shiftColour(255, 0, 0, 360, 0, 0, [0, 0, 0])).toEqual([255, 0, 0]);
    expect(shiftColour(255, 0, 0, -120, 0, 0, [0, 0, 0])).toEqual([0, 0, 255]);
  });

  it('keeps saturation and lightness in range, and greys out at saturation -1', () => {
    expect(shiftColour(255, 0, 0, 0, -1, 0, [0, 0, 0])).toEqual([128, 128, 128]);
    expect(shiftColour(255, 0, 0, 0, 0, 5, [0, 0, 0])).toEqual([255, 255, 255]);
    expect(shiftColour(255, 0, 0, 0, 0, -5, [0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('mixing', () => {
  it('goes part of the way between two colours', () => {
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0.5, [0, 0, 0])).toEqual([100, 50, 25]);
    expect(mixRgb([10, 20, 30], [90, 80, 70], 0, [0, 0, 0])).toEqual([10, 20, 30]);
    expect(mixRgb([10, 20, 30], [90, 80, 70], 1, [0, 0, 0])).toEqual([90, 80, 70]);
  });
});

describe('the wet load', () => {
  it('stays the paint colour over clear canvas', () => {
    const load: Rgb = [200, 0, 0];
    pickUp(load, [0, 0, 255, 0]);
    expect(load).toEqual([200, 0, 0]);
  });

  it('drifts toward the paint it passes over, faster over solid paint than over half-clear', () => {
    const a: Rgb = [200, 0, 0];
    const b: Rgb = [200, 0, 0];
    pickUp(a, [0, 0, 255, 255]);
    pickUp(b, [0, 0, 255, 100]);
    expect(a[2]).toBeGreaterThan(b[2]);
    expect(b[2]).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) pickUp(a, [0, 0, 255, 255]);
    expect(a[2]).toBeGreaterThan(250);
    expect(a[0]).toBeLessThan(5);
  });
});
