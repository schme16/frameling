import { describe, expect, it } from 'vitest';
import { BLEND_MODES, compositeOp, isBlendMode, isPixelBlend } from '../../src/effects/model';
import { blendPixels } from '../../src/effects/pixelBlend';
import { blendFor } from '../../src/aseprite/convert';

const px = (...v: number[]) => Uint8ClampedArray.from(v);

describe('pixel blend modes (Linear dodge, Subtract, Divide)', () => {
  it('are blend modes the canvas leaves to the compositor', () => {
    for (const m of ['linear-dodge', 'subtract', 'divide'] as const) {
      expect(isBlendMode(m)).toBe(true);
      expect(isPixelBlend(m)).toBe(true);
      expect(compositeOp(m)).toBe('source-over');
      expect(BLEND_MODES.some((b) => b.mode === m)).toBe(true);
    }
    expect(isPixelBlend('multiply')).toBe(false);
  });

  it('subtract takes the layer colours away from a solid backdrop', () => {
    const dst = px(200, 100, 50, 255);
    blendPixels(dst, px(50, 150, 50, 255), 'subtract', 1);
    expect([...dst]).toEqual([150, 0, 0, 255]);
  });

  it('subtract fades in with the layer opacity and the source alpha', () => {
    const dst = px(200, 200, 200, 255);
    blendPixels(dst, px(100, 100, 100, 255), 'subtract', 0.5);
    expect([...dst]).toEqual([150, 150, 150, 255]);
    const d2 = px(200, 200, 200, 255);
    blendPixels(d2, px(100, 100, 100, 128), 'subtract', 1);
    expect(d2[0]).toBeGreaterThan(148);
    expect(d2[0]).toBeLessThan(152);
  });

  it('divide: black stays black, a brighter backdrop goes to full, else the ratio', () => {
    const dst = px(0, 100, 200, 255);
    blendPixels(dst, px(50, 200, 100, 255), 'divide', 1);
    expect([...dst]).toEqual([0, 128, 255, 255]);
  });

  it('shows the layer as it is over an empty backdrop, and leaves a backdrop alone under an empty layer', () => {
    const dst = px(0, 0, 0, 0);
    blendPixels(dst, px(10, 20, 30, 255), 'subtract', 1);
    expect([...dst]).toEqual([10, 20, 30, 255]);
    const d2 = px(9, 8, 7, 200);
    blendPixels(d2, px(1, 2, 3, 0), 'divide', 1);
    expect([...d2]).toEqual([9, 8, 7, 200]);
  });

  it('linear dodge adds the colours and clips, mixing see-through parts like Aseprite', () => {
    const dst = px(200, 100, 0, 255);
    blendPixels(dst, px(100, 100, 100, 255), 'linear-dodge', 1);
    expect([...dst]).toEqual([255, 200, 100, 255]);
    // Half see-through over a solid backdrop: halfway to the clipped sum, not a clipped half sum.
    const d2 = px(200, 200, 200, 255);
    blendPixels(d2, px(200, 200, 200, 255), 'linear-dodge', 0.5);
    expect([...d2]).toEqual([227, 227, 227, 255]);
  });

  it('are what Aseprite Addition, Subtract and Divide import as', () => {
    expect(blendFor(16)).toBe('linear-dodge');
    expect(blendFor(17)).toBe('subtract');
    expect(blendFor(18)).toBe('divide');
  });
});
