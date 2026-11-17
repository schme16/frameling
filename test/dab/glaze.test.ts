// What came in with the Procreate reading (docs/brush-import.md): a paper that thins the paint instead of stopping
// it, how much of a paper's depth holds the whole stroke back, and a pen control on opacity, which says how faint the
// whole line is however closely the dabs sit. All three are left out of every brush made before them, so the first
// thing pinned here is that leaving them out changes nothing.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DAB, type DabBrush } from '../../src/dab/maths';
import { effectsOf, type DynRoute } from '../../src/dab/dynamics';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { cleanGrain, sameGrain, type Grain } from '../../src/dab/texture';
import { MAX_SOFT_STAMP, MAX_STAMP, readPixelStamp } from '../../src/brushes/stamps';

const W = 120;
const H = 40;

/** One pass along the middle of a small page, at one pressure. Gives the paint (0 to 1) on each pixel of the middle row band. */
function draw(brush: Partial<DabBrush>, pressure = 1): Float32Array {
  const px = new Uint8ClampedArray(W * H * 4);
  const b: DabBrush = { ...DEFAULT_DAB, size: 16, spacing: 0.05, hardness: 1, aliased: false, ...brush };
  const s = new DabStroke(bufferSurface(px, W, H), { brush: b, color: [0, 0, 0, 255], edge: 'smooth', seed: 3 });
  for (let x = 20; x <= 100; x++) s.moveTo({ x, y: H / 2 }, b.size, 1, { pressure, speed: 0 });
  s.finish();
  const out = new Float32Array(60 * 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 60; x++) out[y * 60 + x] = px[((H / 2 - 4 + y) * W + 30 + x) * 4 + 3] / 255;
  return out;
}
const mean = (v: Float32Array): number => v.reduce((a, b) => a + b, 0) / v.length;
const share = (v: Float32Array, test: (x: number) => boolean): number => v.filter(test).length / v.length;
const paper: Grain = { paper: 'fine', depth: 1, scale: 1, moving: false };

describe('a paper that thins the paint', () => {
  it('is kept when a brush is read back, and left out otherwise', () => {
    expect(cleanGrain({ ...paper, thin: true })).toMatchObject({ thin: true });
    expect(cleanGrain(paper)).not.toHaveProperty('thin');
    expect(cleanGrain({ ...paper, thin: 'yes' })).not.toHaveProperty('thin');
    expect(sameGrain({ ...paper, thin: true }, paper)).toBe(false);
  });

  it('a light touch leaves paint on every pixel, where a paper that stops the paint leaves bare pits', () => {
    const light = [{ from: 'pressure', to: 'flow', amount: 1, invert: false } as DynRoute];
    const stops = draw({ grain: paper, dynamics: light }, 0.3);
    const thins = draw({ grain: { ...paper, thin: true }, dynamics: light }, 0.3);
    expect(share(stops, (x) => x === 0)).toBeGreaterThan(0.3);
    expect(share(thins, (x) => x === 0)).toBeLessThan(0.02);
  });

  it('one that stays put still says how dark each pixel may get: the stroke keeps the paper, it does not fill in', () => {
    const v = draw({ grain: { ...paper, thin: true } });
    // Frameling's papers run evenly from pit to peak, so about half the paint is held back at full depth.
    expect(mean(v)).toBeGreaterThan(0.4);
    expect(mean(v)).toBeLessThan(0.6);
  });
});

describe('how much of a paper holds the whole stroke back', () => {
  it('is kept under 1, left out at 1 and when it is not a number', () => {
    expect(cleanGrain({ ...paper, hold: 0.12 })).toMatchObject({ hold: 0.12 });
    expect(cleanGrain({ ...paper, hold: 1 })).not.toHaveProperty('hold');
    expect(cleanGrain({ ...paper, hold: 'x' })).not.toHaveProperty('hold');
    expect(cleanGrain({ ...paper, hold: -3 })).toMatchObject({ hold: 0 });
    expect(sameGrain({ ...paper, hold: 0.5 }, paper)).toBe(false);
  });

  it('left out, a firm stroke stays as grey as the paper; held only a little, it fills in nearly solid', () => {
    const half = { ...paper, depth: 0.75 };
    const held = draw({ grain: half });
    const let_go = draw({ grain: { ...half, hold: 0.12 } });
    expect(mean(held)).toBeLessThan(0.7);
    expect(mean(let_go)).toBeGreaterThan(0.9);
  });
});

describe('a pen control on opacity', () => {
  const route = (to: 'opacity' | 'flow'): DynRoute[] => [{ from: 'pressure', to, amount: 1, invert: false }];

  it('multiplies like size and flow, and leaves the others alone', () => {
    const fx = effectsOf(route('opacity'), { pressure: 0.25 }, 100);
    expect(fx.opacity).toBeCloseTo(0.25);
    expect(fx.flow).toBe(1);
    expect(effectsOf([], { pressure: 0.25 }, 100).opacity).toBe(1);
  });

  it('a light touch stays faint however closely the dabs sit, where flow builds back up to solid', () => {
    const faint = draw({ dynamics: route('opacity') }, 0.3);
    const built = draw({ dynamics: route('flow') }, 0.3);
    // Twenty dabs cross every pixel. Opacity holds the line at the touch; flow has long since filled it in.
    expect(Math.max(...faint)).toBeLessThan(0.33);
    expect(mean(faint)).toBeGreaterThan(0.25);
    expect(mean(built)).toBeGreaterThan(0.95);
  });

  it('a firmer touch later lifts what a lighter one left', () => {
    const px = new Uint8ClampedArray(W * H * 4);
    const b: DabBrush = { ...DEFAULT_DAB, size: 16, spacing: 0.05, aliased: false, dynamics: route('opacity') };
    const s = new DabStroke(bufferSurface(px, W, H), { brush: b, color: [0, 0, 0, 255], edge: 'smooth', seed: 3 });
    for (let x = 20; x <= 100; x++) s.moveTo({ x, y: H / 2 }, 16, 1, { pressure: 0.3, speed: 0 });
    for (let x = 100; x >= 20; x--) s.moveTo({ x, y: H / 2 }, 16, 1, { pressure: 0.8, speed: 0 });
    s.finish();
    expect(px[((H / 2) * W + 60) * 4 + 3] / 255).toBeCloseTo(0.8, 1);
  });
});

describe('a soft tip from a brush file may be finer than one drawn by hand', () => {
  const stamp = (side: number, soft: boolean) => ({ w: side, h: side, colours: ['#00000080'], cells: new Array(side * side).fill(1), keep: false, ...(soft ? { soft: true } : {}) });
  it('reads back at up to 256 across when it is soft, and at 32 when it is not', () => {
    expect(MAX_SOFT_STAMP).toBe(256);
    expect(readPixelStamp(stamp(MAX_SOFT_STAMP, true))).not.toBeNull();
    expect(readPixelStamp(stamp(MAX_SOFT_STAMP + 1, true))).toBeNull();
    expect(readPixelStamp(stamp(MAX_STAMP, false))).not.toBeNull();
    expect(readPixelStamp(stamp(MAX_STAMP + 1, false))).toBeNull();
  });
});
