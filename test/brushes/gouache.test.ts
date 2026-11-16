// Gouache has to read as gouache and not as a marker: matte, chalky, covering what is underneath. It once drew the same flat
// stroke as Marker and Block marker. This holds it to what it is: a solid body (so it covers), a matte finish (so it is not
// glossy), and no finish at all on the brushes that never had one (so old brushes and documents draw as they did).
import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import type { Drawing, PathShape, Shape, StrokeShape } from '../../src/core/format';
import { STARTERS } from '../../src/brushes/starters';
import { readTip, resolveTip, sameTip } from '../../src/geometry/tip';
import { tipShapes, type OutlineFn } from '../../src/geometry/tipShapes';
import { withTips } from '../../src/core/tips';
import { buildStroke, lineEffects, matteEffects, toothEffects } from '../../src/tools/vectorStroke';
import { drawableShapeFx } from '../../src/effects/shapeFx';

const outline: OutlineFn = (s, b) => getStroke(s.points.map((p) => [p.x, p.y, p.p]), { size: b.size, thinning: b.thinning, smoothing: b.smoothing, streamline: b.streamline, simulatePressure: true, last: true });
const preset = (id: string) => STARTERS.find((b) => b.id === `starter:${id}`)!;
const points = Array.from({ length: 25 }, (_, i) => ({ x: 20 + (i * 240) / 24, y: 60, p: 0.6 }));
const line = (id: string): StrokeShape => buildStroke(points, preset(id).brush, '#336699', 1, false, 7);

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
  const ys = [...cells].map((c) => +c.split(',')[1]);
  return cells.size / (Math.max(...ys) - Math.min(...ys) + 1) / ((210 - 70) * Q / 8);
}

describe('Gouache', () => {
  it('is not a marker: it has a tip of its own, and Marker and Block marker have none', () => {
    expect(preset('gouache').brush.tip).toBeTruthy();
    expect(preset('marker').brush.tip).toBeUndefined();
    expect(preset('block-marker').brush.tip).toBeUndefined();
  });
  it('is one solid body, so it covers what is underneath completely', () => {
    const shapes = tipShapes(line('gouache'), outline) as PathShape[];
    expect(coverage(shapes)).toBeGreaterThan(0.95);
    expect(resolveTip(preset('gouache').brush.tip!).amount).toBe(0);
  });
  it('is flat: only a trace of brush marks, much less than oil paint', () => {
    const tone = resolveTip(preset('gouache').brush.tip!).tone;
    expect(tone).toBeGreaterThan(0);
    expect(tone).toBeLessThan(resolveTip(preset('oil').brush.tip!).tone / 4);
  });
  it('is finished matte: paler and chalkier, with a faint grain, as effects the Effects panel can edit', () => {
    const fx = line('gouache').effects!;
    expect(fx.map((e) => e.kind)).toEqual(['adjust', 'grain']);
    const adjust = fx[0].values, grain = fx[1].values;
    expect(adjust.brightness).toBeGreaterThan(100);
    expect(adjust.saturation).toBeLessThan(100);
    expect(grain.amount).toBeGreaterThan(0);
    expect(grain.amount).toBeLessThanOrEqual(15);
    expect(grain.change).toBe(0);
  });
  it('keeps its colour fully solid: the matte finish never makes the line see-through', () => {
    const s = line('gouache');
    expect(s.opacity).toBe(1);
    for (const e of s.effects!) expect(['blur', 'glow', 'shadow']).not.toContain(e.kind);
    // The line itself is drawn solid: every effect that would run on it is a colour or grain one.
    expect(drawableShapeFx(s).map((e) => e.kind)).toEqual(['adjust', 'grain']);
  });
});

describe('the matte finish', () => {
  it('only a brush that asks for it gets one: the brushes that never had one carry no effects', () => {
    for (const id of ['marker', 'block-marker', 'oil', 'bristle', 'watercolour', 'ink']) expect(line(id).effects, id).toBeUndefined();
    expect(matteEffects(preset('marker').brush)).toBeUndefined();
    expect(matteEffects({ ...preset('gouache').brush, tip: { kind: 'bristle', matte: 0 } })).toBeUndefined();
  });
  it('scales with how matte the tip is', () => {
    const at = (matte: number) => matteEffects({ ...preset('gouache').brush, tip: { kind: 'bristle', matte } }, 3)!;
    expect(Number(at(0.5)[1].values.amount)).toBeLessThan(Number(at(1)[1].values.amount));
    expect(Number(at(0.5)[0].values.brightness)).toBeLessThan(Number(at(1)[0].values.brightness));
  });
  it('goes after paper tooth when a tip has both, since the tooth draws the line itself', () => {
    const brush = { ...preset('chalk').brush, tip: { ...preset('chalk').brush.tip!, matte: 1 } };
    expect(lineEffects(brush, 1)!.map((e) => e.kind)).toEqual(['tooth', 'adjust', 'grain']);
    expect(toothEffects(brush, 1)!).toHaveLength(1);
  });
  it('is steady from run to run for the same seed', () => {
    const shape = (seed: number) => JSON.stringify(matteEffects(preset('gouache').brush, seed)!.map((e) => e.values));
    expect(shape(5)).toBe(shape(5));
  });
});

describe('the matte setting in saved data', () => {
  it('is read, held to 0 to 1, and dropped when it is off or junk', () => {
    expect(readTip({ kind: 'bristle', matte: 0.5 })).toEqual({ kind: 'bristle', matte: 0.5 });
    expect(readTip({ kind: 'bristle', matte: 4 })).toEqual({ kind: 'bristle', matte: 1 });
    expect(readTip({ kind: 'bristle', matte: 0 })).toEqual({ kind: 'bristle' });
    expect(readTip({ kind: 'bristle', matte: 'x' })).toEqual({ kind: 'bristle' });
    expect(readTip({ kind: 'chalk', matte: 1 })).toEqual({ kind: 'chalk', matte: 1 });
  });
  it('an old tip with no matte reads and draws exactly as before', () => {
    const old = { kind: 'bristle' as const, count: 18, stiffness: 0.7, amount: 0.2 };
    expect(readTip(old)).toEqual(old);
    expect(sameTip(old, { ...old, matte: 0 })).toBe(true);
    expect(sameTip(old, { ...old, matte: 0.5 })).toBe(false);
  });
  it('the starter itself survives a save and read', () => {
    expect(readTip(JSON.parse(JSON.stringify(preset('gouache').brush.tip)))).toEqual(preset('gouache').brush.tip);
  });
});

describe('a tipped line with an effect', () => {
  const drawing = (s: StrokeShape): Drawing => ({ id: 'd', kind: 'vector', shapes: [s] });
  // Swapping a line for its shapes drops its effects, so a line with one is kept whole (found when gouache showed no finish on the canvas).
  it('stays one line when it carries an effect, so the effect runs on the whole of it', () => {
    const s = line('gouache');
    expect(withTips(drawing(s)).kind === 'vector' && (withTips(drawing(s)) as Extract<Drawing, { kind: 'vector' }>).shapes).toEqual([s]);
  });
  it('still turns into its shapes when it has none', () => {
    const s = line('oil');
    const out = withTips(drawing(s)) as Extract<Drawing, { kind: 'vector' }>;
    expect(out.shapes.length).toBeGreaterThan(1);
    expect(out.shapes.every((x) => x.type !== 'stroke')).toBe(true);
  });
  it('a switched-off effect does not keep it whole', () => {
    const s = line('gouache');
    const off: StrokeShape = { ...s, effects: s.effects!.map((e) => ({ ...e, on: false })) };
    expect((withTips(drawing(off)) as Extract<Drawing, { kind: 'vector' }>).shapes.every((x) => x.type !== 'stroke')).toBe(true);
  });
});
