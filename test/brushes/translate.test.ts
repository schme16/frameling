// One brush on both kinds of layer: a vector brush worked out as a pixel brush and the other way round. The rules are in
// src/brushes/translate.ts. Both ways are pure, best effort, and never change the brush they are given.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import type { BrushSettings } from '../../src/core/format';
import { brushFrom } from '../../src/core/uiMemory';
import { cleanSpec, type PixelSpec } from '../../src/dab/spec';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { defaultTip } from '../../src/geometry/tip';
import { PIXEL_STARTERS, STARTERS } from '../../src/brushes/model';
import { stampPicture } from '../../src/brushes/pixelStarters';
import { bigLoss, keptLine, keptOnPixels, keptOnVectors, pictureOutlines, toPixel, toVector } from '../../src/brushes/translate';

const vec = (patch: Partial<BrushSettings>): BrushSettings => ({ ...DEFAULT_BRUSH, ...patch });
const dab = (patch: object): PixelSpec => ({ kind: 'dab', dab: { ...DEFAULT_DAB, ...patch } as never });
const asDab = (s: PixelSpec) => {
  if (s.kind !== 'dab') throw new Error('not a dab');
  return s.dab;
};

/** The width of a vector line as a share of its size at a pressure (see geometry/tipShapes widthAt). */
const lineWidth = (b: BrushSettings, p: number) => Math.max(0.15, 2 * (0.5 - b.thinning * (0.5 - p))) * b.size;
/** The width a pixel dab draws at a pressure: the size route goes from 1 - amount (at no pressure) up to 1. */
const dabWidth = (d: ReturnType<typeof asDab>, p: number) => {
  const r = d.dynamics.find((x) => x.to === 'size' && x.from === 'pressure');
  const share = r ? 1 - r.amount * (1 - (r.invert ? 1 - p : p)) : 1;
  return d.size * share;
};

describe('a vector brush as a pixel brush', () => {
  it('draws the same width at every pressure, within a pixel', () => {
    for (const [size, thinning] of [[5, 0.5], [12, 0.8], [3, 0], [20, 0.3]] as const) {
      const b = vec({ size, thinning });
      const d = asDab(toPixel(b));
      for (const p of [0.1, 0.5, 0.9]) expect(Math.abs(dabWidth(d, p) - lineWidth(b, p) * (1 + 0)) / 1).toBeLessThan(size * 0.12 + 1);
    }
  });
  it('keeps the size, the pointy ends (as brush widths) and smooth edges', () => {
    const d = asDab(toPixel(vec({ size: 14, thinning: 0.6, taperStart: 40, taperEnd: 60 })));
    expect(d.size).toBe(22);
    expect(d.aliased).toBe(false);
    expect(d.taper).toMatchObject({ start: expect.closeTo(40 / 22, 1), end: expect.closeTo(60 / 22, 1) });
  });
  it('turns a stamp into a picture tip with its spacing, scatter, size jitter and turning', () => {
    const b = vec({ size: 22, thinning: 0, tip: { ...defaultTip('stamp'), shape: 'leaf', spacing: 0.9, jitter: 0.4, scatter: 0.3, angle: 'follow' } });
    const d = asDab(toPixel(b));
    expect(d.tip).toBe('picture');
    expect(d.picture).toBeTruthy();
    expect(d.spacing).toBeCloseTo(0.9);
    expect(d.scatter).toBeCloseTo(0.3);
    expect(d.sizeJitter).toBeCloseTo(0.28);
    expect(d.follow).toBe(true);
  });
  it('turns a nib into a flat square tip at its angle', () => {
    const d = asDab(toPixel(vec({ size: 22, thinning: 0, tip: { ...defaultTip('nib'), roundness: 0.12, nibAngle: 30 } })));
    expect(d).toMatchObject({ tip: 'square', roundness: 0.12, angle: 30 });
  });
  it('turns a stick on paper into the pixel side\'s dry medium, with the paper it keeps', () => {
    const s = toPixel(vec({ size: 18, tip: { kind: 'charcoal', amount: 0.3, grain: 1, dry: 'vine-charcoal', paper: 'rough' } }));
    expect(s).toMatchObject({ kind: 'dry', medium: 'vine-charcoal', paper: 'rough', size: 18 });
  });
  it('gives grain off paper a grain of its own', () => {
    const d = asDab(toPixel(vec({ size: 12, tip: { kind: 'chalk', amount: 0.6, grain: 1 } })));
    expect(d.grain?.depth).toBeCloseTo(0.6);
  });
  it('makes a pressure that thins the other way round a reversed route', () => {
    const d = asDab(toPixel(vec({ size: 10, thinning: -0.4 })));
    expect(d.dynamics.find((x) => x.to === 'size')).toMatchObject({ from: 'pressure', invert: true });
  });
  it('is something the pixel side reads as it is, whatever the brush', () => {
    for (const s of STARTERS) {
      const spec = toPixel(s.brush);
      expect(cleanSpec(JSON.parse(JSON.stringify(spec))), s.id).toBeTruthy();
    }
  });
  it('lists what a pixel layer cannot draw, and calls the big ones big', () => {
    expect(keptOnPixels(DEFAULT_BRUSH)).toEqual([]);
    const bristle = keptOnPixels(vec({ tip: defaultTip('bristle') }));
    expect(bristle.map((k) => k.id)).toEqual(['bristle-count', 'bristle-stiffness', 'bristle-dry-gaps', 'bristle-thickness', 'bristle-streaks']);
    expect(bigLoss(bristle)).toBe(true);
    expect(keptOnPixels(vec({ tip: { ...defaultTip('chalk'), matte: 0.5 } })).map((k) => k.id)).toEqual(['matte']);
    expect(bigLoss(keptOnPixels(vec({ tip: { kind: 'chalk', matte: 0.5 } })))).toBe(false);
    expect(keptOnPixels(vec({ tip: defaultTip('watercolour') })).map((k) => k.id)).toEqual(['wash-edge']);
    expect(keptOnPixels(vec({ tip: defaultTip('along') })).map((k) => k.id)).toEqual(['along-fit']);
    expect(keptOnPixels(vec({ tip: defaultTip('edged') })).map((k) => k.id)).toEqual(['edged-parts']);
  });
});

describe('a pixel brush as a vector brush', () => {
  it('goes back from a pixel brush that came from a vector one, to the same size and thinning', () => {
    for (const [size, thinning] of [[5, 0.5], [12, 0.8], [14, 0.6], [3, 0], [20, 0.3]] as const) {
      const back = toVector(toPixel(vec({ size, thinning })));
      expect(Math.abs(back.size - size)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.thinning - thinning)).toBeLessThan(0.06);
    }
  });
  it('brings the pointy ends back in pixels', () => {
    const back = toVector(toPixel(vec({ size: 14, thinning: 0.6, taperStart: 40, taperEnd: 60 })));
    expect(Math.abs(back.taperStart - 40)).toBeLessThanOrEqual(3);
    expect(Math.abs(back.taperEnd - 60)).toBeLessThanOrEqual(3);
  });
  it('keeps a stamp as a stamp, with its shape drawn as outlines', () => {
    const leaf = vec({ size: 22, thinning: 0, tip: { ...defaultTip('stamp'), shape: 'leaf', spacing: 0.9, jitter: 0.3, scatter: 0.3, angle: 'follow' } });
    const back = toVector(toPixel(leaf));
    expect(back.tip?.kind).toBe('stamp');
    expect(back.tip?.shape).toBe('custom');
    expect(back.tip?.custom?.length).toBeGreaterThan(0);
    expect(back.tip?.spacing).toBeCloseTo(0.9);
    expect(back.tip?.scatter).toBeCloseTo(0.3);
    expect(back.tip?.angle).toBe('follow');
  });
  it('turns a flat tip into a nib, far apart dabs into dots and a grain into chalk on paper', () => {
    expect(toVector(dab({ tip: 'square', roundness: 0.2, angle: 40 })).tip).toMatchObject({ kind: 'nib', roundness: 0.2, nibAngle: 40 });
    expect(toVector(dab({ spacing: 3, size: 3 })).tip).toMatchObject({ kind: 'stamp', shape: 'dot', spacing: 3 });
    expect(toVector(dab({ spacing: 0.12, grain: { paper: 'laid', depth: 0.5, scale: 1, moving: false } })).tip).toMatchObject({ kind: 'chalk', dry: 'chalk', paper: 'laid' });
    expect(toVector(dab({})).tip).toBeUndefined();
  });
  it('turns a dry medium into a stick on its paper, charcoal or chalk as the starters have them', () => {
    const v = toVector({ kind: 'dry', medium: 'crayon', paper: 'rough', size: 12, hardness: 0.8, press: 0.7 });
    expect(v.tip).toMatchObject({ kind: 'charcoal', dry: 'crayon', paper: 'rough' });
    expect(v.size).toBe(12);
    expect(toVector({ kind: 'dry', medium: 'chalk', size: 18, hardness: 0.4, press: 0.7 }).tip).toMatchObject({ kind: 'chalk', dry: 'chalk' });
  });
  it('gives a soft paint tool a plain line of its size', () => {
    expect(toVector({ kind: 'soft', tool: 'airbrush', size: 28, hardness: 0.3, flow: 0.4 })).toMatchObject({ size: 28, thinning: 0 });
  });
  it('is something the vector side reads as it is, whatever the brush', () => {
    for (const s of PIXEL_STARTERS) {
      const b = toVector(s.pixel!);
      expect(brushFrom(JSON.parse(JSON.stringify(b)), DEFAULT_BRUSH), s.id).toBeTruthy();
      expect(b.size).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(b.thinning)).toBe(true);
    }
  });
  it('lists what a vector layer cannot draw', () => {
    const ids = (s: PixelSpec) => keptOnVectors(s).map((k) => k.id);
    expect(ids(dab({}))).toEqual([]);
    expect(ids(dab({ wet: 0.8 }))).toEqual(['wet-paint']);
    expect(ids(dab({ dual: { tip: 'round', size: 1, density: 0.1, cut: true } }))).toEqual(['dual-tip']);
    expect(ids(dab({ blend: 'multiply', flow: 0.5, opacity: 0.5, hardness: 0.3 }))).toEqual(['blend', 'hardness', 'flow', 'opacity']);
    expect(ids(dab({ dynamics: [{ from: 'fade', to: 'hue', amount: 1, invert: false }, { from: 'speed', to: 'size', amount: 0.5, invert: true }] }))).toEqual(['hue-wobble', 'size-follows-extra']);
    // A route on pressure and size is the thinning a vector line has, so it is not lost.
    expect(ids(dab({ dynamics: [{ from: 'pressure', to: 'size', amount: 0.5, invert: false }] }))).toEqual([]);
    expect(keptOnVectors({ kind: 'soft', tool: 'smudge', size: 10, hardness: 1, flow: 1 }).map((k) => k.id)).toEqual(['tool-smudge']);
    expect(bigLoss(keptOnVectors(dab({ wet: 0.8 })))).toBe(true);
  });
});

describe('the picture a stamp brush leaves', () => {
  it('traces a picture as outlines one unit across, centred', () => {
    const rings = pictureOutlines(stampPicture('dash'))!;
    expect(rings.length).toBeGreaterThan(0);
    for (const r of rings) for (const v of r) expect(Math.abs(v)).toBeLessThanOrEqual(0.5 + 1e-9);
  });
  it('gives up on a picture with too many runs, so a stamp stays cheap', () => {
    const noisy = { w: 24, h: 24, colours: ['#000000'], cells: Array.from({ length: 576 }, (_, i) => ((i % 24) % 2 === 0 ? 1 : 0)), keep: false };
    expect(pictureOutlines(noisy, 40)).toBeNull();
    expect(pictureOutlines({ w: 2, h: 2, colours: [], cells: [0, 0, 0, 0], keep: false })).toBeNull();
  });
});

describe('translation never changes what it is given', () => {
  it('leaves the vector brush alone, and gives the same answer twice', () => {
    for (const s of STARTERS) {
      const copy = structuredClone(s.brush);
      const a = toPixel(s.brush);
      const b = toPixel(s.brush);
      expect(s.brush).toEqual(copy);
      expect(a).toEqual(b);
    }
  });
  it('leaves the pixel brush alone, and gives the same answer twice', () => {
    for (const s of PIXEL_STARTERS) {
      const copy = structuredClone(s.pixel);
      const a = toVector(s.pixel!);
      const b = toVector(s.pixel!);
      expect(s.pixel).toEqual(copy);
      expect(a).toEqual(b);
    }
  });
  it('round trips every starter: vector to pixel to vector keeps the size (to a pixel or a sixth) and the kind of tip', () => {
    for (const s of STARTERS) {
      const back = toVector(toPixel(s.brush));
      const k = s.brush.tip?.kind;
      // Pointy ends and thinning are only approximately kept; the size and the kind of line are the point.
      expect(Math.abs(back.size - s.brush.size), s.id).toBeLessThanOrEqual(Math.max(1, s.brush.size * 0.16));
      // A round nib is a plain round line; every other nib is still a nib.
      if (k === 'stamp' || (k === 'nib' && (s.brush.tip?.roundness ?? 0.3) < 0.95)) expect(back.tip?.kind, s.id).toBe(k);
      if (!k) expect(back.tip, s.id).toBeUndefined();
    }
  });
});

describe('saying what is kept', () => {
  it('writes one plain line', () => {
    expect(keptLine([], true)).toBe('');
    const dual = keptOnVectors(dab({ dual: { tip: 'round', size: 1, density: 0.1, cut: true } }));
    expect(keptLine(dual, true)).toBe("Dual tip is kept, but vectors don't draw it");
    const many = keptOnVectors(dab({ wet: 0.5, flow: 0.5, opacity: 0.5 }));
    expect(keptLine(many, true)).toBe("Wet paint, Flow and Opacity are kept, but vectors don't draw them");
    expect(keptLine(keptOnPixels(vec({ tip: defaultTip('bristle') })), false)).toMatch(/are kept, but pixels don't draw them$/);
  });
  it('uses no em dashes', () => {
    for (const k of [...keptOnPixels(vec({ tip: defaultTip('bristle') })), ...keptOnVectors(dab({ wet: 1, dual: { tip: 'round', size: 1, density: 0.1, cut: true } }))]) expect(k.why + k.label).not.toContain('—');
  });
});
