import { describe, expect, it } from 'vitest';
import { BLEND_MODES, compositeOp, isBlendMode, isPixelBlend } from '../../src/effects/model';
import { blendPixels, premultipliedByte, ROUND_NUDGE, settleCanvasBytes, straightByte, toByte } from '../../src/effects/pixelBlend';
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
    // 0.5 x 200 + 0.5 x 255 is exactly 227.5, a tie, and a tie rounds up (it used to come out 227 by floating point luck).
    expect([...d2]).toEqual([228, 228, 228, 255]);
  });

  it('are what Aseprite Addition, Subtract and Divide import as', () => {
    expect(blendFor(16)).toBe('linear-dodge');
    expect(blendFor(17)).toBe('subtract');
    expect(blendFor(18)).toBe('divide');
  });
});

describe('GPU path for the pixel-mixed blend modes', () => {
  it('says no (so the CPU path runs) when there is no WebGL2, or the mode is not one of the three', async () => {
    const { blitPixelsGpu, setPixelBlendGpu } = await import('../../src/effects/pixelBlendGL');
    const g = { canvas: { width: 2, height: 2 } } as never;
    const top = { width: 2, height: 2 } as never;
    expect(blitPixelsGpu(g, top, 'divide', 1)).toBe(false);
    expect(blitPixelsGpu(g, top, 'multiply', 1)).toBe(false);
    setPixelBlendGpu(false);
    expect(blitPixelsGpu(g, top, 'subtract', 1)).toBe(false);
    setPixelBlendGpu(true);
  });
});

describe('the one rounding rule the CPU and GPU paths share', () => {
  it('un-premultiplies half up, in whole numbers, for every stored byte pair', () => {
    for (let a = 1; a < 256; a++) {
      for (let p = 0; p <= a; p++) {
        // Exact: round(255 p / a) half up, by integer maths with no floats in sight.
        const want = Math.min(255, Math.floor((2 * 255 * p + a) / (2 * a)));
        expect(straightByte(p, a)).toBe(want);
      }
    }
    // The tie the canvas rounds either way: 255 x 1 / 170 = 1.5.
    expect(straightByte(1, 170)).toBe(2);
    expect(straightByte(90, 180)).toBe(128);
    expect(straightByte(77, 0)).toBe(0);
    expect(straightByte(200, 255)).toBe(200);
  });

  it('recovers the stored bytes from a canvas answer that is off by up to half a level', () => {
    // A canvas rounds 255 p / a to a whole level by its own rule, ties either way, so its answer is within half a level of the exact one.
    // Rounding that back to premultiplied gives the stored byte again, which is what lets the CPU path start from what the GPU path sees.
    for (let a = 1; a < 255; a++) {
      for (let p = 0; p <= a; p++) {
        const exact = (255 * p) / a;
        for (const s of [Math.floor(exact), Math.ceil(exact)]) {
          if (Math.abs(s - exact) <= 0.5 && s <= 255) expect(premultipliedByte(s, a)).toBe(p);
        }
      }
    }
  });

  it('settles canvas bytes onto that rule and leaves solid and empty pixels alone', () => {
    // 90 stored under alpha 180 is the tie 127.5: one canvas hands back 127, another 128. Both settle to 128.
    for (const given of [127, 128]) {
      const d = px(given, 10, 20, 180, 5, 6, 7, 255, 9, 9, 9, 0);
      settleCanvasBytes(d);
      expect(d[0]).toBe(128);
      expect([...d.slice(4)]).toEqual([5, 6, 7, 255, 9, 9, 9, 0]);
    }
  });

  it('rounds a tie up, whatever the last bit of the arithmetic says', () => {
    // 0.5 x 200/255 + 0.5 x 1, the arithmetic that used to give 227.4999 in doubles.
    expect(toByte(0.5 * (200 / 255) + 0.5 * 1)).toBe(228);
    expect(toByte(227.5 / 255)).toBe(228);
    expect(toByte(227.5 / 255 - 1e-9)).toBe(228);
    expect(toByte(227.4 / 255)).toBe(227);
    expect(toByte(0)).toBe(0);
    expect(toByte(1)).toBe(255);
  });

  it('is written into the shader the same way: whole-number un-premultiply, the same nudge, rounded both times', async () => {
    const { FRAG } = await import('../../src/effects/pixelBlendGL');
    expect(FRAG).toContain(`NUDGE = ${ROUND_NUDGE.toFixed(6)}`);
    expect(FRAG).toContain('(510 * bi.rgb + bi.a) / (2 * bi.a)');
    expect(FRAG).toContain('(510 * ti.rgb + ti.a) / (2 * ti.a)');
    expect(FRAG.match(/\+ 0\.5 \+ NUDGE/g)).toHaveLength(2);
  });
});
