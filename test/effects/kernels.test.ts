import { describe, expect, it } from 'vitest';
import type { LayerEffect } from '../../src/core/format';
import { activeEffects, defaultValues, EFFECTS, grainPattern, isNoop } from '../../src/effects/model';
import { effectReach } from '../../src/core/render';
import { hash01, hash3, isKernelKind, kernelParams, MOTION_MAX_SAMPLES, runKernelBytes, type KernelKind, type StageRect } from '../../src/effects/kernels';

const stage = (w: number, h: number): StageRect => ({ x: 0, y: 0, w, h });

/** A w x h picture of one colour (straight RGBA), or see-through where `ink` says so. */
function picture(w: number, h: number, rgba: [number, number, number, number], ink: (x: number, y: number) => boolean = () => true): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) d.set(rgba, (y * w + x) * 4);
  return d;
}
const at = (d: Uint8ClampedArray, w: number, x: number, y: number) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

function run(kind: KernelKind, v: Record<string, number | string>, src: Uint8ClampedArray, w: number, h: number, scale = 1, st = stage(w, h)): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  runKernelBytes(kernelParams(kind, { ...defaultValues(kind), ...v }, scale, st), src, out, w, h);
  return out;
}

describe('the finishing effects in the catalogue', () => {
  it('have plain names, a term, a description without em dashes, and an icon', () => {
    for (const k of ['grain', 'wave', 'fringe', 'vignette', 'motionblur'] as const) {
      const info = EFFECTS.find((e) => e.kind === k)!;
      expect(isKernelKind(k)).toBe(true);
      expect(info.label.length).toBeGreaterThan(3);
      expect(info.icon).toBe(`fx-${k === 'motionblur' ? 'motion' : k}`);
      for (const text of [info.label, info.term, info.description, ...info.params.map((p) => p.label)]) expect(text).not.toMatch(/—|–/);
      for (const p of info.params) if (p.type === 'number') expect(p.default as number).toBeGreaterThanOrEqual(p.min ?? -Infinity);
    }
  });

  it('are skipped when their strength is zero', () => {
    expect(isNoop('grain', { amount: 0 })).toBe(true);
    expect(isNoop('wave', { amount: 0 })).toBe(true);
    expect(isNoop('fringe', { distance: 0 })).toBe(true);
    expect(isNoop('vignette', { amount: 0 })).toBe(true);
    expect(isNoop('motionblur', { length: 0 })).toBe(true);
    for (const k of ['grain', 'wave', 'fringe', 'vignette', 'motionblur'] as const) expect(isNoop(k, defaultValues(k))).toBe(false);
  });

  it('reach as far as they can move the drawing, so exports leave room', () => {
    expect(effectReach('wave', { amount: 10, ripple: 0 })).toBeCloseTo(11);
    expect(effectReach('wave', { amount: 10, ripple: 100 })).toBeGreaterThan(14);
    expect(effectReach('fringe', { distance: 5 })).toBe(6);
    expect(effectReach('motionblur', { length: 30 })).toBe(31);
    expect(effectReach('grain', { amount: 50 })).toBe(0);
    expect(effectReach('vignette', { amount: 50 })).toBe(0);
  });
});

describe('film grain pattern', () => {
  it('moves on every N frames, stays put for 0, and changes with the pattern number', () => {
    expect(grainPattern(0, 1, 5)).not.toBe(grainPattern(0, 1, 6));
    expect(grainPattern(0, 2, 4)).toBe(grainPattern(0, 2, 5));
    expect(grainPattern(0, 2, 5)).not.toBe(grainPattern(0, 2, 6));
    expect(grainPattern(7, 0, 0)).toBe(grainPattern(7, 0, 90));
    expect(grainPattern(1, 0, 0)).not.toBe(grainPattern(2, 0, 0));
  });

  it('is worked out for the frame, so animated and still grain read differently', () => {
    const list: LayerEffect[] = [{ id: 'g', kind: 'grain', values: { change: 1 } }];
    const a = activeEffects(list, 3)[0].v.pattern;
    const b = activeEffects(list, 4)[0].v.pattern;
    expect(a).not.toBe(b);
    list[0].values.change = 0;
    expect(activeEffects(list, 3)[0].v.pattern).toBe(activeEffects(list, 40)[0].v.pattern);
  });

  it('hashes the same numbers to the same bits, and spreads them evenly', () => {
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3));
    expect(hash3(1, 2, 3)).not.toBe(hash3(2, 1, 3));
    expect(hash3(-5, 7, 0)).toBeGreaterThanOrEqual(0);
    let sum = 0;
    let lo = 1;
    let hi = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const u = hash01(i % 63, (i / 63) | 0, 11);
      sum += u;
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
    expect(sum / n).toBeGreaterThan(0.47);
    expect(sum / n).toBeLessThan(0.53);
    expect(lo).toBeLessThan(0.01);
    expect(hi).toBeGreaterThan(0.99);
  });
});

describe('film grain', () => {
  const w = 40;
  const h = 40;
  const grey = picture(w, h, [128, 128, 128, 255]);

  it('speckles the colour around where it was, by about the strength', () => {
    const out = run('grain', { amount: 40, size: 1, colour: 0, pattern: 3 }, grey, w, h);
    let lo = 255;
    let hi = 0;
    let sum = 0;
    for (let i = 0; i < out.length; i += 4) {
      lo = Math.min(lo, out[i]);
      hi = Math.max(hi, out[i]);
      sum += out[i];
      // Plain grain moves all three colours together.
      expect(out[i + 1]).toBe(out[i]);
      expect(out[i + 3]).toBe(255);
    }
    expect(sum / (w * h)).toBeGreaterThan(120);
    expect(sum / (w * h)).toBeLessThan(136);
    // 40% is up to 0.2 of the range either way: about 51 levels.
    expect(hi - lo).toBeGreaterThan(70);
    expect(hi - lo).toBeLessThanOrEqual(102);
  });

  it('gives colourful grain different specks in each colour', () => {
    const out = run('grain', { amount: 40, size: 1, colour: 100, pattern: 3 }, grey, w, h);
    let differ = 0;
    for (let i = 0; i < out.length; i += 4) if (out[i] !== out[i + 1] || out[i + 1] !== out[i + 2]) differ++;
    expect(differ).toBeGreaterThan(w * h * 0.8);
  });

  it('makes square specks as big as the size, and bigger on a bigger canvas', () => {
    const big = run('grain', { amount: 40, size: 4, colour: 0, pattern: 0 }, grey, w, h);
    // A 4 px cell is one value, so neighbours inside it agree and the next cell usually does not.
    expect(at(big, w, 1, 1)).toEqual(at(big, w, 2, 2));
    expect(at(big, w, 0, 0)).toEqual(at(big, w, 3, 3));
    const x2 = run('grain', { amount: 40, size: 2, colour: 0, pattern: 0 }, picture(w, h, [128, 128, 128, 255]), w, h, 2);
    expect(at(x2, w, 1, 1)).toEqual(at(x2, w, 2, 2));
    expect(at(x2, w, 0, 0)).toEqual(at(x2, w, 3, 3));
  });

  it('keeps the same pattern for the same frame, and a new one for the next', () => {
    const a = run('grain', { amount: 30, pattern: 1009 }, grey, w, h);
    const b = run('grain', { amount: 30, pattern: 1009 }, grey, w, h);
    const c = run('grain', { amount: 30, pattern: 1010 }, grey, w, h);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('only touches the drawing: see-through stays see-through, and half see-through stays so', () => {
    const half = picture(w, h, [200, 100, 50, 128], (x) => x < 20);
    const out = run('grain', { amount: 60, size: 1, colour: 100, pattern: 2 }, half, w, h);
    expect(at(out, w, 30, 5)).toEqual([0, 0, 0, 0]);
    for (let y = 0; y < h; y++) expect(out[(y * w + 5) * 4 + 3]).toBe(128);
  });

  it('keeps grain on pure white and black visible only where it can go, never past the ends', () => {
    const white = run('grain', { amount: 100, size: 1 }, picture(w, h, [255, 255, 255, 255]), w, h);
    let darker = 0;
    for (let i = 0; i < white.length; i += 4) {
      expect(white[i]).toBeLessThanOrEqual(255);
      if (white[i] < 250) darker++;
    }
    expect(darker).toBeGreaterThan(w * h * 0.3);
  });
});

describe('wave', () => {
  const w = 60;
  const h = 40;
  // A tall bar, so a sideways wobble that changes down the picture moves its edge.
  const bar = picture(w, h, [255, 0, 0, 255], (x) => x >= 25 && x < 35);

  it('does nothing at amount 0 and shifts rows sideways, differently down the picture, otherwise', () => {
    const none = run('wave', { amount: 0 }, bar, w, h);
    expect(Array.from(none)).toEqual(Array.from(bar));
    const out = run('wave', { amount: 6, length: 40, ripple: 0, phase: 0 }, bar, w, h);
    const left = (y: number) => {
      for (let x = 0; x < w; x++) if (out[(y * w + x) * 4 + 3] > 127) return x;
      return -1;
    };
    // At phase 0 each row looks sin(2 pi y / 40) * 6 px to the right: none at y 0, most at y 10, none at y 20, the other way at y 30.
    // So the bar's edge sits that far to the left on row 10, and to the right on row 30.
    expect(Math.abs(left(0) - 25)).toBeLessThanOrEqual(1);
    expect(Math.abs(left(10) - (25 - 6))).toBeLessThanOrEqual(1);
    expect(Math.abs(left(20) - 25)).toBeLessThanOrEqual(1);
    expect(Math.abs(left(30) - (25 + 6))).toBeLessThanOrEqual(1);
  });

  it('moves the waves when the phase moves, and turns them with the angle', () => {
    const a = run('wave', { amount: 6, length: 40, ripple: 0, phase: 0 }, bar, w, h);
    const b = run('wave', { amount: 6, length: 40, ripple: 0, phase: 90 }, bar, w, h);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    // Turned a quarter, the push is up and down and varies along the picture's width: a bar of full height stays a bar.
    const wide = picture(w, h, [255, 0, 0, 255], (_x, y) => y >= 15 && y < 25);
    const t = run('wave', { amount: 5, length: 40, ripple: 0, angle: 90 }, wide, w, h);
    const topEdge = (x: number) => {
      for (let y = 0; y < h; y++) if (t[(y * w + x) * 4 + 3] > 127) return y;
      return -1;
    };
    expect(Math.abs(topEdge(10) - (15 + 5))).toBeLessThanOrEqual(1);
    expect(Math.abs(topEdge(0) - 15)).toBeLessThanOrEqual(1);
  });

  it('measures its settings in document pixels', () => {
    const p1 = kernelParams('wave', { ...defaultValues('wave'), amount: 4, length: 50 }, 1, stage(10, 10));
    const p2 = kernelParams('wave', { ...defaultValues('wave'), amount: 4, length: 50 }, 2, stage(10, 10));
    expect(p2.a[0]).toBeCloseTo(p1.a[0] * 2);
    expect(p2.a[1]).toBeCloseTo(p1.a[1] / 2);
  });
});

describe('colour fringe', () => {
  const w = 40;
  const h = 12;
  const block = picture(w, h, [255, 255, 255, 255], (x) => x >= 15 && x < 25);

  it('slides red one way and blue the other, leaving green where it is', () => {
    const out = run('fringe', { distance: 3, angle: 0 }, block, w, h);
    // Left edge: the red is pushed right of where white starts, so the first columns are blue and green, and not red.
    // Red comes from 3 px to the left of each pixel, so it starts 3 px later; blue 3 px earlier.
    expect(at(out, w, 14, 5)).toEqual([0, 0, 255, 255]);
    expect(at(out, w, 12, 5)).toEqual([0, 0, 255, 255]);
    expect(at(out, w, 15, 5)).toEqual([0, 255, 255, 255]);
    expect(at(out, w, 17, 5)).toEqual([0, 255, 255, 255]);
    expect(at(out, w, 18, 5)).toEqual([255, 255, 255, 255]);
    expect(at(out, w, 21, 5)).toEqual([255, 255, 255, 255]);
    // Right edge: red runs 3 px further, blue stops 3 px sooner.
    expect(at(out, w, 22, 5)).toEqual([255, 255, 0, 255]);
    expect(at(out, w, 24, 5)).toEqual([255, 255, 0, 255]);
    expect(at(out, w, 26, 5)).toEqual([255, 0, 0, 255]);
    expect(at(out, w, 28, 5)).toEqual([0, 0, 0, 0]);
  });

  it('turns with the angle and does nothing to a flat colour inside the shape', () => {
    const down = run('fringe', { distance: 3, angle: 90 }, picture(12, 40, [255, 255, 255, 255], (_x, y) => y >= 15 && y < 25), 12, 40);
    expect(at(down, 12, 5, 14)).toEqual([0, 0, 255, 255]);
    expect(at(down, 12, 5, 26)).toEqual([255, 0, 0, 255]);
    const grey = picture(20, 20, [90, 120, 200, 255]);
    expect(Array.from(run('fringe', { distance: 4, angle: 33 }, grey, 20, 20).slice(4 * (10 * 20 + 10), 4 * (10 * 20 + 10) + 4))).toEqual([90, 120, 200, 255]);
  });
});

describe('dark corners (vignette)', () => {
  const w = 100;
  const h = 60;
  const white = picture(w, h, [255, 255, 255, 255]);

  it('leaves the middle alone and darkens the corners by the strength', () => {
    const out = run('vignette', { amount: 60, size: 50, softness: 40, color: '#000000' }, white, w, h);
    expect(at(out, w, 50, 30)).toEqual([255, 255, 255, 255]);
    const corner = at(out, w, 0, 0);
    // Full strength at the corner: 60% black over white is 40% white.
    expect(corner[0]).toBeGreaterThan(95);
    expect(corner[0]).toBeLessThan(110);
    expect(corner[3]).toBe(255);
    // Darker the further out, along a line.
    let last = 256;
    for (let x = 50; x < w; x += 5) {
      const v = at(out, w, x, 30)[0];
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });

  it('fills see-through areas with the colour, so it works on an empty layer, and can tint', () => {
    const clear = picture(w, h, [0, 0, 0, 0], () => false);
    const out = run('vignette', { amount: 100, size: 0, softness: 0, color: '#ff0000' }, clear, w, h);
    // Size 0 and softness 0: red everywhere but the very middle.
    expect(at(out, w, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(at(out, w, 95, 55)).toEqual([255, 0, 0, 255]);
    const soft = run('vignette', { amount: 50, size: 70, softness: 50, color: '#ff0000' }, clear, w, h);
    expect(at(soft, w, 50, 30)[3]).toBe(0);
    expect(at(soft, w, 0, 0)[3]).toBeGreaterThan(100);
  });

  it('is measured from the stage, not from the canvas it is drawn on', () => {
    // The stage sits in the right half of a canvas twice as wide: its corner is dark, the canvas's left part is not its middle.
    const wide = picture(200, 60, [255, 255, 255, 255]);
    const out = run('vignette', { amount: 100, size: 20, softness: 20, color: '#000000' }, wide, 200, 60, 1, { x: 100, y: 0, w: 100, h: 60 });
    expect(at(out, 200, 150, 30)[0]).toBeGreaterThan(250);
    expect(at(out, 200, 101, 1)[0]).toBeLessThan(20);
  });
});

describe('motion blur', () => {
  const w = 60;
  const h = 20;
  const dot = picture(w, h, [255, 255, 255, 255], (x) => x >= 29 && x < 31);

  it('smears along the direction, keeping about the same total', () => {
    const out = run('motionblur', { length: 10, angle: 0, trail: 0 }, dot, w, h);
    let before = 0;
    let after = 0;
    for (let x = 0; x < w; x++) {
      before += dot[(5 * w + x) * 4 + 3];
      after += out[(5 * w + x) * 4 + 3];
    }
    expect(after / before).toBeGreaterThan(0.93);
    expect(after / before).toBeLessThan(1.07);
    // Spread out to about 5 px either side, and nothing above or below (the direction is sideways).
    expect(at(out, w, 25, 5)[3]).toBeGreaterThan(0);
    expect(at(out, w, 35, 5)[3]).toBeGreaterThan(0);
    expect(at(out, w, 20, 5)[3]).toBe(0);
    expect(at(out, w, 40, 5)[3]).toBe(0);
    expect(at(out, w, 30, 5)[3]).toBeLessThan(255);
  });

  it('trails behind the way it moves when asked, instead of both ways', () => {
    const both = run('motionblur', { length: 12, angle: 0, trail: 0 }, dot, w, h);
    const behind = run('motionblur', { length: 12, angle: 0, trail: 100 }, dot, w, h);
    // Moving right (angle 0), the trail is on the left: nothing smears to the right of the dot.
    expect(at(behind, w, 24, 5)[3]).toBeGreaterThan(0);
    expect(at(behind, w, 33, 5)[3]).toBe(0);
    expect(at(both, w, 33, 5)[3]).toBeGreaterThan(0);
  });

  it('takes the angle, and caps its samples so a long smear stays cheap', () => {
    const down = run('motionblur', { length: 8, angle: 90 }, picture(20, 40, [255, 255, 255, 255], (_x, y) => y === 20), 20, 40);
    expect(at(down, 20, 5, 17)[3]).toBeGreaterThan(0);
    expect(at(down, 20, 5, 22)[3]).toBeGreaterThan(0);
    expect(kernelParams('motionblur', { length: 150, angle: 0, trail: 0 }, 4, stage(10, 10)).n).toBe(MOTION_MAX_SAMPLES);
  });
});

describe('the edges of the picture', () => {
  it('stay filled when a drawing that covers everything is bent, split or smeared', () => {
    const w = 30;
    const h = 20;
    const full = picture(w, h, [40, 160, 90, 255]);
    for (const [kind, v] of [
      ['wave', { amount: 8, length: 25, ripple: 100 }],
      ['fringe', { distance: 6, angle: 20 }],
      ['motionblur', { length: 20, angle: 45, trail: 50 }],
    ] as const) {
      const out = run(kind, v, full, w, h);
      for (let i = 0; i < out.length; i += 4) expect(out[i + 3]).toBe(255);
      expect(at(out, w, 0, 0)).toEqual([40, 160, 90, 255]);
      expect(at(out, w, w - 1, h - 1)).toEqual([40, 160, 90, 255]);
    }
  });
});
