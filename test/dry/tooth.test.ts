// Paper tooth for vector lines: the dry media's paper and maths run on a drawn line. Pure, so it is checked on plain numbers.
import { describe, expect, it } from 'vitest';
import { getStrokePoints } from 'perfect-freehand';
import type { StrokePoint } from '../../src/core/format';
import { MEDIA } from '../../src/dry/maths';
import { paperHeight } from '../../src/dry/paper';
import { invert, paperAtPoint, pigment, pressureReach, radiiOf, strokeDabs, toothBytes, toothParams, toothStroke, toothValues, type View, type WidthLaw } from '../../src/dry/tooth';
import { paperTile } from '../../src/dry/paper';

const line = (n = 40, p = 0.5, y = 50, x0 = 10, x1 = 190): StrokePoint[] => Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y, p }));
const ramp = (n = 60): StrokePoint[] => Array.from({ length: n }, (_, i) => ({ x: 10 + (180 * i) / (n - 1), y: 50, p: 0.05 + (0.95 * i) / (n - 1) }));
const law = (o: Partial<WidthLaw> = {}): WidthLaw => ({ size: 20, thinning: 0.3, streamline: 0.4, simulate: false, taperStart: 0, taperEnd: 0, ...o });
const P = toothParams(toothValues('compressed-charcoal', 1, 7));
const INK: [number, number, number] = [20, 20, 24];
const covered = (a: ReturnType<typeof toothStroke>): number => {
  let n = 0;
  if (a) for (let i = 3; i < a.data.length; i += 4) if (a.data[i] > 0) n++;
  return n;
};
const ink = (a: ReturnType<typeof toothStroke>): number => {
  let s = 0;
  if (a) for (let i = 3; i < a.data.length; i += 4) s += a.data[i] / 255;
  return s;
};

describe('the settings', () => {
  it('turn the panel units into the numbers the maths wants, and clamp what is silly', () => {
    const p = toothParams({ press: 80, edge: 30, tooth: 100, soft: 42, cover: 98, streak: 35, paper: 2, grain: 1, seed: 3 });
    expect(p).toMatchObject({ press: 0.8, hardness: 0.3, tooth: 1, soft: 0.42, ceiling: 0.98, streak: 0.35, paper: 'medium', grain: 1, seed: 3 });
    const silly = toothParams({ press: 9000, tooth: -5, soft: 0, cover: 0, paper: 99, grain: 0, seed: 1.6 });
    expect(silly.press).toBe(1);
    expect(silly.tooth).toBe(0);
    expect(silly.soft).toBeGreaterThan(0);
    expect(silly.ceiling).toBeGreaterThan(0);
    expect(silly.paper).toBe('rough');
    expect(silly.grain).toBe(0.25);
    expect(silly.seed).toBe(2);
    expect(toothParams({}).paper).toBe('medium');
  });

  it('start from each dry medium: its own pressure, edge, tooth, softness, cover and streaks', () => {
    for (const m of MEDIA) {
      const v = toothValues(m.id, 1.5, 9);
      const p = toothParams(v);
      expect(p.press).toBeCloseTo(m.press, 2);
      expect(p.hardness).toBeCloseTo(m.hardness, 2);
      expect(p.tooth).toBeCloseTo(m.tooth, 2);
      expect(p.soft).toBeCloseTo(m.soft, 2);
      expect(p.ceiling).toBeCloseTo(m.ceiling, 2);
      expect(p.streak).toBeCloseTo(m.streak, 2);
      expect(p.grain).toBe(1.5);
      expect(p.seed).toBe(9);
    }
  });
});

describe('how wide the line is', () => {
  const sp = (pts: StrokePoint[], size = 20) => getStrokePoints(pts.map((p) => [p.x, p.y, p.p]), { size, streamline: 0.4, last: true });

  it('is the brush size across when nothing thins it, and follows the pen when it does', () => {
    const flat = radiiOf(sp(line()), law({ thinning: 0 }));
    expect(flat.every((r) => Math.abs(r - 10) < 1e-9)).toBe(true);
    // Thinning 0.3 at pressure 0.9 is wider than at 0.25, the same law perfect-freehand draws the outline with.
    expect(radiiOf(sp(line(40, 0.9)), law())[5]).toBeCloseTo(20 * (0.5 - 0.3 * (0.5 - 0.9)), 6);
    expect(radiiOf(sp(line(40, 0.25)), law())[5]).toBeCloseTo(20 * (0.5 - 0.3 * (0.5 - 0.25)), 6);
  });

  it('narrows to the tapers at the two ends', () => {
    const r = radiiOf(sp(line(60)), law({ thinning: 0, taperStart: 40, taperEnd: 40 }));
    expect(r[0]).toBeLessThan(1);
    expect(r[r.length - 1]).toBeLessThan(1);
    expect(r[Math.floor(r.length / 2)]).toBeCloseTo(10, 6);
  });

  it('matches the outline perfect-freehand draws: the dabs stay inside it and reach its edge', async () => {
    const { getStroke } = await import('perfect-freehand');
    const pts = ramp();
    const outline = getStroke(pts.map((p) => [p.x, p.y, p.p]), { size: 20, thinning: 0.3, smoothing: 0.4, streamline: 0.4, simulatePressure: false, last: true });
    const ys = outline.map((q) => q[1]);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const dabs = strokeDabs(pts, law(), 0.8);
    const reachTop = Math.min(...dabs.map((d) => d.y - d.r));
    const reachBottom = Math.max(...dabs.map((d) => d.y + d.r));
    expect(Math.abs(reachTop - top)).toBeLessThan(0.6);
    expect(Math.abs(reachBottom - bottom)).toBeLessThan(0.6);
  });
});

describe('the dabs along a line', () => {
  it('start and end where the line does, and are close enough to leave no gaps', () => {
    const dabs = strokeDabs(line(), law(), 0.8);
    expect(dabs[0].x).toBeCloseTo(10, 0);
    expect(dabs[dabs.length - 1].x).toBeCloseTo(190, 0);
    for (let i = 1; i < dabs.length; i++) expect(Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y)).toBeLessThan(dabs[i].r);
  });

  it('reach into the paper as hard as the pen pressed, with a mouse (even pressure) pressing the usual amount', () => {
    expect(pressureReach(0.5)).toBeCloseTo(1, 6);
    expect(pressureReach(0)).toBeLessThan(pressureReach(0.5));
    expect(pressureReach(1)).toBeGreaterThan(pressureReach(0.5));
    const d = strokeDabs(ramp(), law(), 0.7);
    expect(d[0].s).toBeLessThan(d[Math.floor(d.length / 2)].s);
    expect(d[Math.floor(d.length / 2)].s).toBeLessThan(d[d.length - 1].s + 1e-9);
    expect(Math.max(...d.map((q) => q.s))).toBeLessThanOrEqual(1);
  });

  it('a very long line is spaced out rather than given thousands of dabs', () => {
    const d = strokeDabs(line(400, 0.5, 50, 0, 60000), law({ size: 4 }), 0.8);
    expect(d.length).toBeLessThanOrEqual(2600);
  });

  it('a lone click is a dab', () => {
    const d = strokeDabs([{ x: 30, y: 30, p: 0.5 }, { x: 30, y: 30, p: 0.5 }], law(), 0.8);
    expect(d.length).toBeGreaterThan(0);
    expect(d[0].r).toBeGreaterThan(5);
  });
});

describe('the pigment', () => {
  it('is the same every time, so a line does not change under you', () => {
    const dabs = strokeDabs(line(), law(), 0.8);
    const a = toothStroke(dabs, P, INK, 1)!;
    const b = toothStroke(dabs, P, INK, 1)!;
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it('light pressure leaves only specks and hard pressure fills the pits in (the reach decides how much of the paper is covered)', () => {
    const light = toothStroke(strokeDabs(line(40, 0.5), law(), 0.2), P, INK, 1)!;
    const mid = toothStroke(strokeDabs(line(40, 0.5), law(), 0.5), P, INK, 1)!;
    const hard = toothStroke(strokeDabs(line(40, 0.5), law(), 1), P, INK, 1)!;
    expect(covered(light)).toBeLessThan(covered(mid));
    expect(covered(mid)).toBeLessThan(covered(hard));
    expect(ink(light)).toBeLessThan(ink(mid));
    expect(ink(mid)).toBeLessThan(ink(hard));
  });

  it('a pen pressure ramp goes from specks to solid along the line', () => {
    const pic = toothStroke(strokeDabs(ramp(), law({ thinning: 0 }), 0.8), P, INK, 1)!;
    const third = (from: number, to: number) => {
      let s = 0;
      for (let y = 0; y < pic.h; y++) for (let x = Math.floor(pic.w * from); x < Math.floor(pic.w * to); x++) s += pic.data[(y * pic.w + x) * 4 + 3] / 255;
      return s;
    };
    const a = third(0, 1 / 3);
    const b = third(1 / 3, 2 / 3);
    const c = third(2 / 3, 1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('never covers more of a pixel than the medium can in one pass', () => {
    const vine = toothParams(toothValues('vine-charcoal', 1, 2));
    const pic = toothStroke(strokeDabs(line(), law(), 1), vine, INK, 1)!;
    let max = 0;
    for (let i = 3; i < pic.data.length; i += 4) max = Math.max(max, pic.data[i]);
    expect(max).toBeLessThanOrEqual(Math.round(vine.ceiling * 255));
  });

  it('takes the line colour and its opacity', () => {
    const pic = toothStroke(strokeDabs(line(), law(), 1), P, [200, 10, 30], 0.5)!;
    let any = false;
    for (let i = 0; i < pic.data.length; i += 4)
      if (pic.data[i + 3]) {
        any = true;
        expect([pic.data[i], pic.data[i + 1], pic.data[i + 2]]).toEqual([200, 10, 30]);
        expect(pic.data[i + 3]).toBeLessThanOrEqual(128);
      }
    expect(any).toBe(true);
  });

  it('lands on the pixels the dabs reach and nowhere else, and keeps inside a clip when given one', () => {
    const dabs = strokeDabs(line(), law(), 1);
    const pic = toothStroke(dabs, P, INK, 1)!;
    expect(pic.y).toBeGreaterThanOrEqual(Math.floor(50 - 14));
    expect(pic.y + pic.h).toBeLessThanOrEqual(Math.ceil(50 + 14));
    const clipped = toothStroke(dabs, P, INK, 1, undefined, { w: 100, h: 100 })!;
    expect(clipped.x + clipped.w).toBeLessThanOrEqual(100);
    expect(toothStroke(dabs, P, INK, 1, undefined, { w: 5, h: 5 })).toBeNull();
    expect(toothStroke([], P, INK, 1)).toBeNull();
  });
});

describe('the paper stays still against the page', () => {
  it('is read at the page point under each canvas pixel, so moving the page moves the paper with it', () => {
    const dabs0 = strokeDabs(line(), law(), 1);
    const move: View = { a: 1, b: 0, c: 0, d: 1, e: 7, f: 3 };
    const dabs7 = strokeDabs(line(), law(), 1, move);
    const a = toothStroke(dabs0, P, INK, 1)!;
    const b = toothStroke(dabs7, P, INK, 1, move)!;
    expect(b.x).toBe(a.x + 7);
    expect(b.y).toBe(a.y + 3);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it('two lines over the same place meet the same bumps: where the paper is high both leave pigment', () => {
    const a = toothStroke(strokeDabs(line(), law(), 0.5), { ...P, seed: 1 }, INK, 1)!;
    const b = toothStroke(strokeDabs(line(), law(), 0.5), { ...P, seed: 500 }, INK, 1)!;
    // Different sticks (streaks) but one paper: the pixels both cover are far more than two unrelated scatters would share.
    let both = 0;
    let onlyA = 0;
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4 + 3;
        if (a.data[i] > 0 && b.data[i] > 0) both++;
        else if (a.data[i] > 0) onlyA++;
      }
    expect(both).toBeGreaterThan(onlyA);
  });

  it('more pigment lands on high points of the paper than on pits, at one reach', () => {
    const tile = paperTile('medium');
    expect(tile.length).toBe(256 * 256);
    const high = pigment(P, 0.95, 0.5);
    const low = pigment(P, 0.05, 0.5);
    expect(high).toBeGreaterThan(low);
    expect(pigment(P, 0.5, 0)).toBe(0);
    expect(pigment(P, 0.5, 1)).toBeCloseTo(P.ceiling, 6);
  });

  it('reads the paper tile the way the pixel tool does at one canvas pixel to one page pixel', () => {
    const tile = paperTile('medium');
    for (const [x, y] of [[0, 0], [5, 9], [200, 255], [-3, -7]]) expect(paperAtPoint(tile, x + 0.5, y + 0.5)).toBeCloseTo(paperHeight('medium', x, y), 6);
    // It wraps without a seam.
    expect(paperAtPoint(tile, 256.5, 0.5)).toBeCloseTo(paperAtPoint(tile, 0.5, 0.5), 6);
  });

  it('turns a canvas point back to a page point (the view inverted)', () => {
    const v: View = { a: 2, b: 0, c: 0, d: 2, e: 10, f: -4 };
    const i = invert(v);
    expect(i.a * (2 * 5 + 10) + i.c * (2 * 7 - 4) + i.e).toBeCloseTo(5, 9);
    expect(i.b * (2 * 5 + 10) + i.d * (2 * 7 - 4) + i.f).toBeCloseTo(7, 9);
  });
});

describe('paper tooth on a whole picture', () => {
  it('a solid fill is pressed hard so it is nearly covered, a half see-through one catches only the peaks, and bare stays bare', () => {
    const w = 64;
    const h = 64;
    const solid = new Uint8ClampedArray(w * h * 4);
    const half = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      solid.set([10, 20, 30, 255], i * 4);
      half.set([10, 20, 30, 80], i * 4);
    }
    const bare = new Uint8ClampedArray(w * h * 4);
    const hard = toothParams(toothValues('compressed-charcoal'));
    hard.press = 1;
    toothBytes(solid, w, h, hard);
    toothBytes(half, w, h, hard);
    toothBytes(bare, w, h, hard);
    const sum = (b: Uint8ClampedArray) => b.reduce((n, v, i) => (i % 4 === 3 ? n + v : n), 0);
    expect(sum(solid)).toBeGreaterThan(sum(half));
    expect(sum(half)).toBeGreaterThan(0);
    expect(sum(bare)).toBe(0);
    // Colour is untouched: only the see-through changes.
    expect([solid[0], solid[1], solid[2]]).toEqual([10, 20, 30]);
  });
});
