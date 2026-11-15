// Pen modifiers, the logic with no app around it: the tremor, the overlay on the person's settings, the stroke filter, and the list.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PEN } from '../../src/tablet/settings';
import { effectiveToolPen, penSizeFactor, penEffect } from '../../src/penmods/active';
import { PenFilter } from '../../src/penmods/filter';
import { Wobble, MAX_PULL, RAMP } from '../../src/penmods/wobble';
import { penMods, penModById, shortId } from '../../src/penmods/catalogue';

const tool = DEFAULT_PEN.tools.brush;
const line = (n: number, step = 4) => Array.from({ length: n }, (_, i) => ({ x: 20 + i * step, y: 100 }));
const maxOff = (pts: { y: number }[]) => Math.max(...pts.map((p) => Math.abs(p.y - 100)));

describe('the tremor (Wobble)', () => {
  it('starts exactly where the pen went down, and eases in', () => {
    const w = new Wobble(1, 1);
    const pts = line(40);
    const out = pts.map((p) => w.push(p));
    expect(out[0]).toEqual(pts[0]);
    // Within the ramp the pull is still small.
    const early = out.filter((_, i) => i * 4 < RAMP / 2);
    expect(maxOff(early)).toBeLessThan(MAX_PULL * 0.6);
  });

  it('pulls a straight line off by a few pixels, never more than the most', () => {
    const w = new Wobble(1, 1);
    const out = line(200).map((p) => w.push(p));
    expect(maxOff(out)).toBeGreaterThan(2);
    expect(maxOff(out)).toBeLessThanOrEqual(MAX_PULL + 1e-9);
  });

  it('does nothing at amount 0, and a pen held still does not twitch', () => {
    const calm = new Wobble(0, 1);
    for (const p of line(30)) expect(calm.push(p)).toEqual(p);
    const w = new Wobble(1, 1);
    w.push({ x: 50, y: 50 });
    const a = w.push({ x: 50, y: 50 });
    const b = w.push({ x: 50, y: 50 });
    expect(a).toEqual(b);
  });

  it('depends on the way travelled, not on how many samples there were', () => {
    const dense = new Wobble(1, 1);
    const sparse = new Wobble(1, 1);
    let d = { x: 0, y: 0 };
    for (let x = 0; x <= 120; x += 1) d = dense.push({ x, y: 0 });
    let s = { x: 0, y: 0 };
    for (let x = 0; x <= 120; x += 6) s = sparse.push({ x, y: 0 });
    expect(s.x).toBeCloseTo(d.x, 6);
    expect(s.y).toBeCloseTo(d.y, 6);
  });

  it('looks the same size on screen at any zoom', () => {
    // Twice as zoomed in: the same on-screen pull is half as many document pixels.
    const at1 = new Wobble(1, 1);
    const at2 = new Wobble(1, 2);
    const a = line(300, 2).map((p) => at1.push(p));
    const b = Array.from({ length: 300 }, (_, i) => at2.push({ x: 20 + i, y: 100 }));
    expect(maxOff(b)).toBeCloseTo(maxOff(a) / 2, 0);
  });

  it('a different set of phases makes a different line', () => {
    const a = new Wobble(1, 1, [0, 0.25, 0.5, 0.75]);
    const b = new Wobble(1, 1, [0.3, 0.6, 0.1, 0.9]);
    const pa = line(60).map((p) => a.push(p));
    const pb = line(60).map((p) => b.push(p));
    expect(JSON.stringify(pa)).not.toBe(JSON.stringify(pb));
  });
});

describe('the overlay on the person\'s settings', () => {
  it('is the very same object when nothing is on, or when only the size changes', () => {
    expect(effectiveToolPen(tool, null)).toBe(tool);
    expect(effectiveToolPen(tool, { size: 0.35 })).toBe(tool);
    expect(effectiveToolPen(tool, { wobble: 1 })).toBe(tool);
  });

  it('steadier wins: a modifier raises the stabilizer but never lowers one the person set higher', () => {
    expect(effectiveToolPen(tool, { stabilizer: 70, stabMode: 'string' }).stabilizer).toBe(70);
    expect(effectiveToolPen({ ...tool, stabilizer: 90 }, { stabilizer: 70, stabMode: 'string' }).stabilizer).toBe(90);
    expect(effectiveToolPen({ ...tool, stabMode: 'average' }, { stabilizer: 70, stabMode: 'string' }).stabMode).toBe('string');
  });

  it('never changes the settings object it was given', () => {
    const before = JSON.stringify(tool);
    effectiveToolPen(tool, { stabilizer: 100, stabMode: 'string', wobble: 1, size: 3 });
    expect(JSON.stringify(tool)).toBe(before);
  });

  it('size factor is 1 with nothing on, and what the modifier says while on', () => {
    expect(penSizeFactor()).toBe(1);
    const mine = { size: 0.35 };
    penEffect.set(mine);
    expect(penSizeFactor()).toBe(0.35);
    penEffect.set(null);
    expect(penSizeFactor()).toBe(1);
    penEffect.set({ size: Number.NaN });
    expect(penSizeFactor()).toBe(1);
    penEffect.set(null);
  });
});

describe('the stroke filter', () => {
  const start = { x: 20, y: 100, pressure: 0.5 };
  const run = (f: PenFilter | null, pts: { x: number; y: number }[]) => pts.map((p) => (f ? f.push({ ...p, pressure: 0.5 }) : p));

  it('with nothing on and the stabilizer off there is nothing to do', () => {
    expect(new PenFilter({ ...tool, stabilizer: 0 }, 1, start, null).active).toBe(false);
  });

  it('the person\'s own stabilizer still works, as before', () => {
    expect(new PenFilter(tool, 1, start, null).active).toBe(true);
  });

  it('steady hand smooths a jittery line more than the plain stabilizer does', () => {
    const jitter = Array.from({ length: 80 }, (_, i) => ({ x: 20 + i * 3, y: 100 + (i % 2 ? 4 : -4) }));
    const plain = run(new PenFilter(tool, 1, start, null), jitter);
    const steady = run(new PenFilter(tool, 1, start, { stabilizer: 70, stabMode: 'string' }), jitter);
    const wiggle = (pts: { y: number }[]) => Math.max(...pts.slice(10).map((p) => Math.abs(p.y - 100)));
    expect(wiggle(steady)).toBeLessThan(wiggle(plain));
  });

  it('shaky hand pulls a straight line off line, and finishing lands on a shaken last point', () => {
    const f = new PenFilter({ ...tool, stabilizer: 0 }, 1, start, { wobble: 1 });
    expect(f.active).toBe(true);
    const out = run(f, line(100));
    expect(maxOff(out)).toBeGreaterThan(2);
    const end = f.finish({ x: 420, y: 100, pressure: 0.5 });
    expect(end.before).toEqual([]);
    expect(Number.isFinite(end.last.x) && Number.isFinite(end.last.y)).toBe(true);
  });

  it('long rope trails behind the pen and the line catches up when the pen lifts', () => {
    const f = new PenFilter(tool, 1, start, { stabilizer: 100, stabMode: 'string' });
    const out = run(f, line(40, 1));
    expect(out[out.length - 1].x).toBeLessThan(20 + 39 - 20);
    const end = f.finish({ x: 59, y: 100, pressure: 0.5 });
    expect(end.before.length).toBeGreaterThan(0);
  });
});

describe('the list', () => {
  it('has the ones that were asked for, with plain words and unique ids', () => {
    const ids = penMods.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const want of ['penmod.steady', 'penmod.shaky', 'penmod.thin', 'penmod.fat']) expect(ids).toContain(want);
    for (const m of penMods) {
      expect(penModById(m.id)).toBe(m);
      expect(shortId(m.id)).not.toContain('.');
      expect(m.about.length).toBeGreaterThan(20);
      expect(m.feel.length).toBeGreaterThan(5);
      expect(Object.keys(m.effect).length).toBeGreaterThan(0);
      // No em dashes in anything a person reads.
      expect(`${m.label}${m.about}${m.feel}`).not.toContain('—');
    }
  });

  it('thin is smaller and fat is bigger, and both stay sensible', () => {
    expect(penModById('penmod.thin')!.effect.size!).toBeLessThan(1);
    expect(penModById('penmod.thin')!.effect.size!).toBeGreaterThan(0.1);
    expect(penModById('penmod.fat')!.effect.size!).toBeGreaterThan(1);
    expect(penModById('penmod.fat')!.effect.size!).toBeLessThanOrEqual(4);
  });
});
