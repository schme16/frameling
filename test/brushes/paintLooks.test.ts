// The three paint brushes have to read as their names, and as three different brushes. Oil paint, Bristle brush and Dry
// brush once all drew as the same speckled worm (grain holes cut out of one fill); the pictures were honest, the brushes
// were wrong. This holds each one to what it is, on the numbers a person sees: how solid the stroke is, how many separate
// hairs and shades it has, and whether it catches on the paper.
import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import type { PathShape, Shape, StrokeShape } from '../../src/core/format';
import { STARTERS } from '../../src/brushes/starters';
import { samplePoints, sampleSize } from '../../src/brushes/thumbs';
import { bristleTones } from '../../src/geometry/tipRibbon';
import { readTip, resolveTip, sameTip } from '../../src/geometry/tip';
import { tipShapes, type OutlineFn } from '../../src/geometry/tipShapes';
import { toothEffects } from '../../src/tools/vectorStroke';
import { toothParams } from '../../src/dry/tooth';

const outline: OutlineFn = (s, b) => getStroke(s.points.map((p) => [p.x, p.y, p.p]), { size: b.size, thinning: b.thinning, smoothing: b.smoothing, streamline: b.streamline, simulatePressure: true, last: true });
const preset = (id: string) => STARTERS.find((b) => b.id === `starter:${id}`)!;
const straight = (len = 240) => Array.from({ length: 25 }, (_, i) => ({ x: 20 + (i * len) / 24, y: 60, p: 0.6 }));
const strokeOf = (id: string, color = '#336699'): StrokeShape => ({ id: 's', type: 'stroke', points: straight(), brush: { ...preset(id).brush }, color, opacity: 1 } as StrokeShape);
const shapesOf = (id: string, color?: string): PathShape[] => (tipShapes(strokeOf(id, color), outline) ?? []) as PathShape[];

/** How much of the stroke's band is paint, by stamping every bristle line onto a grid four cells to the pixel. */
function coverage(shapes: Shape[]): number {
  const Q = 4;
  const cells = new Set<string>();
  for (const s of shapes as PathShape[]) {
    const r = ((s.stroke?.width ?? 1) / 2) * Q;
    for (const p of s.paths) {
      for (let i = 0; i + 1 < p.points.length; i++) {
        const a = p.points[i], b = p.points[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * Q));
        for (let k = 0; k <= n; k++) {
          const x = (a.x + ((b.x - a.x) * k) / n) * Q, y = (a.y + ((b.y - a.y) * k) / n) * Q;
          if (x < 70 * Q || x > 210 * Q) continue;
          for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) if (Math.abs(dy) <= r) cells.add(`${Math.round(x / 8)},${Math.round(y + dy)}`);
        }
      }
    }
  }
  // Paint cells over the band the paint spans (the middle of the line only, so the ends do not count).
  const ys = [...cells].map((c) => +c.split(',')[1]);
  return cells.size / (Math.max(...ys) - Math.min(...ys) + 1) / ((210 - 70) * Q / 8);
}

describe('Oil paint', () => {
  it('is bristles fat enough to close into one solid body', () => {
    const t = resolveTip(preset('oil').brush.tip!);
    expect(t.kind).toBe('bristle');
    expect(t.amount).toBe(0);
    expect(coverage(shapesOf('oil'))).toBeGreaterThan(0.9);
  });
  it('runs lighter and darker in streaks, so it looks like paint and not a flat fill', () => {
    const colours = new Set(shapesOf('oil').map((s) => s.stroke!.color));
    expect(colours.size).toBe(3);
    expect(colours.has('#336699')).toBe(true);
  });
});

describe('Bristle brush', () => {
  it('is many separate hairs with dry gaps between them', () => {
    const shapes = shapesOf('bristle');
    expect(shapes.reduce((n, s) => n + s.paths.length, 0)).toBeGreaterThanOrEqual(12);
    const c = coverage(shapes);
    expect(c).toBeGreaterThan(0.6);
    expect(c).toBeLessThan(0.88);
  });
  it('shows its hairs in more than one shade', () => {
    expect(new Set(shapesOf('bristle').map((s) => s.stroke!.color)).size).toBeGreaterThanOrEqual(2);
  });
});

describe('Dry brush', () => {
  const dry = preset('dry-brush').brush;
  it('catches on the paper: a Paper tooth effect with big grain and long streaks', () => {
    const fx = toothEffects(dry, 7);
    expect(fx).toBeTruthy();
    const p = toothParams(fx![0].values);
    expect(p.grain).toBeGreaterThanOrEqual(2);
    expect(p.streak).toBe(1);
    expect(p.tooth).toBeGreaterThanOrEqual(0.9);
  });
  it('is not hairs and not a solid fill, so it reads as neither of the others', () => {
    expect(dry.tip!.kind).not.toBe('bristle');
    expect(toothEffects(preset('oil').brush)).toBeUndefined();
    expect(toothEffects(preset('bristle').brush)).toBeUndefined();
  });
});

describe('the three are different brushes', () => {
  it('oil is more solid than bristle, and each has a look the others lack', () => {
    expect(coverage(shapesOf('oil'))).toBeGreaterThan(coverage(shapesOf('bristle')) + 0.05);
    const tones = (id: string) => resolveTip(preset(id).brush.tip!).tone;
    expect(tones('oil')).toBeGreaterThan(0.5);
    expect(tones('bristle')).toBeGreaterThan(0);
    expect(resolveTip(preset('oil').brush.tip!).body).toBeGreaterThan(resolveTip(preset('bristle').brush.tip!).body);
  });
  it('the picture size does not change what each is', () => {
    for (const id of ['oil', 'bristle', 'dry-brush']) {
      const b = preset(id).brush;
      expect(sampleSize(b.size, 40), id).toBeGreaterThan(8);
      expect(samplePoints(240, 40).length, id).toBeGreaterThan(10);
    }
  });
});

describe('Rake', () => {
  it('is separate tines with clear gaps, not a solid band', () => {
    const shapes = shapesOf('rake');
    expect(shapes.reduce((n, s) => n + s.paths.length, 0)).toBe(6);
    expect(coverage(shapes)).toBeLessThan(0.7);
  });
});

describe('the bristle tip keeps its new settings', () => {
  it('reads thickness and streaks, clamps them and drops junk', () => {
    expect(readTip({ kind: 'bristle', count: 20, body: 0.5, tone: 2, junk: 1 })).toEqual({ kind: 'bristle', count: 20, body: 0.5, tone: 1 });
    expect(readTip({ kind: 'bristle', body: 'x', tone: -1 })).toEqual({ kind: 'bristle', tone: 0 });
    expect(readTip({ kind: 'bristle', body: -3 })).toEqual({ kind: 'bristle', body: -1 });
    expect(readTip({ kind: 'charcoal', dry: 'crayon', streak: 3 })).toEqual({ kind: 'charcoal', dry: 'crayon', streak: 1 });
    expect(readTip({ kind: 'charcoal', streak: 0.5 })).toEqual({ kind: 'charcoal' });
  });
  it('an old bristle brush draws exactly as before: no thickness, no streaks, two shapes of one colour', () => {
    const tip = { kind: 'bristle' as const, count: 18, stiffness: 0.7, amount: 0.2 };
    const t = resolveTip(tip);
    expect([t.body, t.tone]).toEqual([0, 0]);
    expect(bristleTones('#336699', 0)).toEqual(['#336699']);
    expect(sameTip(tip, { ...tip, tone: 0 })).toBe(true);
    expect(sameTip(tip, { ...tip, tone: 0.5 })).toBe(false);
    expect(sameTip(tip, { ...tip, body: 0.5 })).toBe(false);
  });
  it('a colour that is not a plain hex stays one colour', () => {
    expect(bristleTones('rgba(1,2,3,0.5)', 1)).toEqual(['rgba(1,2,3,0.5)']);
    expect(bristleTones('#336699', 1)).toHaveLength(3);
  });
  it('is steady from run to run', () => {
    expect(JSON.stringify(shapesOf('oil'))).toBe(JSON.stringify(shapesOf('oil')));
  });
});
