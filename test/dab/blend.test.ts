// Blend modes per brush: the same maths as a layer's, normal untouched, a stroke that blends with what is under it and never
// stacks on itself, and a brush read from a file that names a mode we do not have.
import { describe, expect, it } from 'vitest';
import { blendPaint, BRUSH_BLENDS, cleanBlend, isBrushBlend, stepBlend } from '../../src/dab/blend';
import { blendOnto } from '../../src/effects/blendPure';
import { cleanDab, DEFAULT_DAB, sameDab, type DabBrush } from '../../src/dab/maths';
import { cleanSpec, sameSpec } from '../../src/dab/spec';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { paintOver } from '../../src/soft/maths';

type C = [number, number, number, number];
const out = (): Uint8ClampedArray => new Uint8ClampedArray(4);

describe('the list of modes', () => {
  it('starts with normal, offers the layer modes, and leaves out the canvas only Add', () => {
    expect(BRUSH_BLENDS[0]).toBe('normal');
    for (const m of ['multiply', 'screen', 'overlay', 'color', 'luminosity', 'subtract']) expect(BRUSH_BLENDS).toContain(m);
    expect(BRUSH_BLENDS).not.toContain('add');
  });

  it('reads a name safely', () => {
    expect(cleanBlend('multiply')).toBe('multiply');
    expect(cleanBlend('add')).toBe('normal');
    expect(cleanBlend('wibble', 'screen')).toBe('screen');
    expect(cleanBlend(7)).toBe('normal');
    expect(isBrushBlend(null)).toBe(false);
  });

  it('steps round the list in both directions', () => {
    expect(stepBlend('normal', 1)).toBe(BRUSH_BLENDS[1]);
    expect(stepBlend('normal', -1)).toBe(BRUSH_BLENDS[BRUSH_BLENDS.length - 1]);
    expect(stepBlend(BRUSH_BLENDS[BRUSH_BLENDS.length - 1], 1)).toBe('normal');
  });
});

describe('blending one pixel', () => {
  it('normal is the plain paint over, the same as before', () => {
    const base: C = [200, 100, 50, 255];
    const paint: C = [10, 220, 30, 255];
    for (const cov of [0, 0.3, 1]) {
      const a = out();
      const b = out();
      blendPaint('normal', base, paint, cov, a);
      paintOver(base, 0, paint, cov, b);
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });

  it('multiply darkens and screen lightens, and white and black do what they should', () => {
    const o = out();
    blendPaint('multiply', [200, 200, 200, 255], [128, 128, 128, 255], 1, o);
    expect(o[0]).toBeLessThan(200);
    blendPaint('screen', [100, 100, 100, 255], [128, 128, 128, 255], 1, o);
    expect(o[0]).toBeGreaterThan(128);
    blendPaint('multiply', [90, 160, 30, 255], [255, 255, 255, 255], 1, o);
    expect(Array.from(o)).toEqual([90, 160, 30, 255]);
    blendPaint('multiply', [90, 160, 30, 255], [0, 0, 0, 255], 1, o);
    expect(Array.from(o)).toEqual([0, 0, 0, 255]);
  });

  it('agrees with the layer maths exactly', () => {
    const base = new Uint8ClampedArray([180, 60, 220, 200]);
    const paint = new Uint8ClampedArray([40, 200, 90, 255]);
    for (const m of BRUSH_BLENDS) {
      const want = base.slice();
      blendOnto(want, paint, m, 0.6);
      const got = out();
      blendPaint(m, base, paint, 0.6, got);
      expect(Array.from(got), m).toEqual(Array.from(want));
    }
  });

  it('on a spot with nothing there the paint lands as it is, and no paint changes nothing', () => {
    const o = out();
    blendPaint('multiply', [0, 0, 0, 0], [30, 120, 220, 255], 1, o);
    expect(Array.from(o)).toEqual([30, 120, 220, 255]);
    blendPaint('overlay', [10, 20, 30, 255], [30, 120, 220, 255], 0, o);
    expect(Array.from(o)).toEqual([10, 20, 30, 255]);
  });

  it('a share of the way is between the two', () => {
    const full = out();
    const half = out();
    blendPaint('multiply', [220, 220, 220, 255], [60, 60, 60, 255], 1, full);
    blendPaint('multiply', [220, 220, 220, 255], [60, 60, 60, 255], 0.5, half);
    expect(half[0]).toBeLessThan(220);
    expect(half[0]).toBeGreaterThan(full[0]);
  });
});

describe('a stroke with a mode', () => {
  const W = 40;
  const H = 20;
  const YELLOW: C = [230, 200, 40, 255];
  function paint(b: Partial<DabBrush>, o: { colour?: C; smooth?: boolean; double?: boolean } = {}): Uint8ClampedArray {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) px.set(i % W < 20 ? YELLOW : [0, 0, 0, 0], i * 4);
    const brush = { ...DEFAULT_DAB, size: 8, ...b };
    const s = new DabStroke(bufferSurface(px, W, H), { brush, color: o.colour ?? [90, 120, 220, 255], edge: o.smooth ? 'smooth' : 'crisp', seed: 1 });
    for (let k = 0; k < (o.double ? 2 : 1); k++) for (const x of [8, 12, 16, 20, 24, 28, 32]) s.moveTo({ x, y: 10 }, 8, 1);
    s.finish();
    return px;
  }
  const at = (g: Uint8ClampedArray, x: number, y: number): C => [g[(y * W + x) * 4], g[(y * W + x) * 4 + 1], g[(y * W + x) * 4 + 2], g[(y * W + x) * 4 + 3]];

  it('multiply tints the paint it crosses and lands plain on empty layer', () => {
    const g = paint({ blend: 'multiply' });
    const over = at(g, 14, 10);
    expect(over[3]).toBe(255);
    // Blue times yellow: darker than either, and not the blue itself.
    expect(over[0]).toBeLessThan(90);
    expect(over[2]).toBeLessThan(60);
    expect(at(g, 30, 10)).toEqual([90, 120, 220, 255]);
  });

  it('is not the same as normal, and normal is untouched by this change', () => {
    expect(Array.from(paint({ blend: 'multiply' }))).not.toEqual(Array.from(paint({ blend: 'normal' })));
    expect(at(paint({}), 14, 10)).toEqual([90, 120, 220, 255]);
  });

  it('a second pass over the same ground does not darken it twice within one stroke', () => {
    expect(Array.from(paint({ blend: 'multiply' }, { double: true }))).toEqual(Array.from(paint({ blend: 'multiply' })));
  });

  it('a smooth edge blends by the share of paint, so the rim sits between yellow and the full blend', () => {
    const g = paint({ blend: 'multiply', hardness: 0, aliased: false }, { smooth: true });
    const mid = at(g, 14, 10);
    const rim = at(g, 8, 10);
    expect(rim[2]).toBeGreaterThanOrEqual(mid[2] - 1);
    expect(at(g, 1, 10)).toEqual(YELLOW);
  });
});

describe('a saved brush with a mode', () => {
  it('keeps it, defaults old brushes to normal, and drops a mode it does not know', () => {
    expect(cleanDab({ blend: 'screen' }).blend).toBe('screen');
    expect(cleanDab({}).blend).toBe('normal');
    expect(cleanDab({ blend: 'sparkle' }).blend).toBe('normal');
    expect(cleanDab({ blend: 'sparkle' }, { ...DEFAULT_DAB, blend: 'overlay' }).blend).toBe('overlay');
  });

  it('counts as a difference between two brushes and round trips through a spec', () => {
    const a = cleanDab({ blend: 'multiply' });
    expect(sameDab(a, cleanDab({}))).toBe(false);
    const back = cleanSpec(JSON.parse(JSON.stringify({ kind: 'dab', dab: a })))!;
    expect(sameSpec(back, { kind: 'dab', dab: a })).toBe(true);
  });
});
