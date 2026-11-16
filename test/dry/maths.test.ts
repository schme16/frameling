// How much pigment a pixel takes: light pressure catches only the high points, hard pressure fills the pits, a second pass
// takes hold where the first only touched the peaks, and each medium behaves like itself.
import { describe, expect, it } from 'vitest';
import { deposit, isMedium, MEDIA, mediumInfo, pigmentAt, pitDepth, streakAt, type Medium } from '../../src/dry/maths';
import { paperTile, TILE, type PaperKind } from '../../src/dry/paper';

const PEAK = 0.95;
const PIT = 0.05;

/** The share of a paper's pixels a medium covers at all (more than a hair) at a pressure. */
function covered(m: Medium, paper: PaperKind, reach: number, min = 0.3): number {
  const t = paperTile(paper);
  let n = 0;
  for (const v of t) if (pigmentAt(m, paper, v / 255, reach, 0) > min) n++;
  return n / t.length;
}
/** The average cover over a paper, 0 to 1. */
function tone(m: Medium, paper: PaperKind, reach: number, have = 0): number {
  const t = paperTile(paper);
  let s = 0;
  for (const v of t) s += pigmentAt(m, paper, v / 255, reach, have);
  return s / t.length;
}

describe('pitDepth', () => {
  it('is shallow on a peak and deep in a pit', () => {
    expect(pitDepth(PEAK, 1, 1)).toBeLessThan(pitDepth(PIT, 1, 1));
  });
  it('squeezes toward the middle on a smooth paper or a medium that does not care about the tooth', () => {
    expect(pitDepth(PIT, 0.5, 1)).toBeLessThan(pitDepth(PIT, 1, 1));
    expect(pitDepth(PIT, 1, 0)).toBeCloseTo(0.5, 9);
    expect(pitDepth(PEAK, 1, 0)).toBeCloseTo(0.5, 9);
  });
});

describe('deposit', () => {
  const m = { soft: 0.2, ceiling: 1, lift: 0 };
  it('is nothing with no pressure and everything with plenty', () => {
    expect(deposit(0, 0.3, 0, m)).toBe(0);
    expect(deposit(1, 0.3, 0, m)).toBe(1);
  });
  it('rises with pressure and falls with the depth of the pit', () => {
    let prev = -1;
    for (let r = 0; r <= 1.0001; r += 0.05) {
      const a = deposit(r, 0.5, 0, m);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(deposit(0.5, 0.2, 0, m)).toBeGreaterThan(deposit(0.5, 0.8, 0, m));
  });
  it('never goes past the most a pass can cover', () => {
    expect(deposit(1, 0, 0, { soft: 0.2, ceiling: 0.8, lift: 0 })).toBeCloseTo(0.8, 9);
  });
  it('takes hold in a pit when pigment is already there', () => {
    const lifted = { soft: 0.2, ceiling: 1, lift: 0.8 };
    expect(deposit(0.5, 0.7, 1, lifted)).toBeGreaterThan(deposit(0.5, 0.7, 0, lifted));
    expect(deposit(0.5, 0.7, 1, { ...lifted, lift: 0 })).toBe(deposit(0.5, 0.7, 0, lifted));
  });
});

describe('catching and skipping', () => {
  const charcoal = mediumInfo('compressed-charcoal');
  it('a light touch reaches only some of the paper, and a hard one reaches nearly all of it', () => {
    for (const paper of ['smooth', 'medium', 'rough'] as const) {
      const light = covered(charcoal, paper, 0.25);
      const hard = covered(charcoal, paper, 1);
      expect(light).toBeGreaterThan(0.05);
      expect(light).toBeLessThan(paper === 'smooth' ? 0.7 : 0.45);
      expect(hard).toBeGreaterThan(0.9);
    }
  });
  it('light pressure takes the high points first: what it covers is a subset of what more pressure covers', () => {
    const t = paperTile('medium');
    for (const v of t) {
      const h = v / 255;
      if (pigmentAt(charcoal, 'medium', h, 0.3, 0) > 0.5) expect(pigmentAt(charcoal, 'medium', h, 0.6, 0)).toBeGreaterThanOrEqual(pigmentAt(charcoal, 'medium', h, 0.3, 0));
    }
  });
  it('the tone gets darker steadily with pressure', () => {
    let prev = -1;
    for (let r = 0.05; r <= 1.0001; r += 0.05) {
      const v = tone(charcoal, 'medium', r);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('a second pass is darker than the first, and fills in pits the first skipped', () => {
    const one = tone(charcoal, 'medium', 0.4, 0);
    const two = tone(charcoal, 'medium', 0.4, 0.6);
    expect(two).toBeGreaterThan(one);
  });
});

describe('the media', () => {
  it('have nine, each told apart by id and name', () => {
    expect(MEDIA.length).toBe(9);
    expect(new Set(MEDIA.map((m) => m.id)).size).toBe(9);
    expect(new Set(MEDIA.map((m) => m.label)).size).toBe(9);
    expect(isMedium('crayon')).toBe(true);
    expect(isMedium('paint')).toBe(false);
  });
  it('keep every number inside its range, and no em dashes in the words', () => {
    for (const m of MEDIA) {
      expect(m.size).toBeGreaterThanOrEqual(1);
      for (const k of ['hardness', 'press', 'tooth', 'ceiling', 'lift', 'streak'] as const) {
        expect(m[k], `${m.id} ${k}`).toBeGreaterThanOrEqual(0);
        expect(m[k], `${m.id} ${k}`).toBeLessThanOrEqual(1);
      }
      expect(m.soft).toBeGreaterThan(0);
      expect(m.hint + m.label).not.toMatch(/[–—]/);
    }
  });
  it('vine charcoal never goes fully black, compressed does, and a pastel covers the paper', () => {
    const full = (id: string) => tone(mediumInfo(id as never), 'medium', 1);
    expect(full('vine-charcoal')).toBeLessThan(full('compressed-charcoal'));
    expect(full('vine-charcoal')).toBeLessThanOrEqual(0.9);
    expect(full('soft-pastel')).toBeGreaterThan(0.95);
  });
  it('a crayon skips the pits at pressures where a pastel has already filled them', () => {
    expect(tone(mediumInfo('crayon'), 'medium', 0.6)).toBeLessThan(tone(mediumInfo('soft-pastel'), 'medium', 0.6));
  });
  it('an oil pastel shows less of the paper than chalk does at the same pressure', () => {
    expect(tone(mediumInfo('oil-pastel'), 'medium', 0.5)).toBeGreaterThan(tone(mediumInfo('chalk'), 'medium', 0.5));
  });
  it('a smooth paper shows less tooth than a rough one: the light stroke is more even', () => {
    // On a rougher paper the same light pressure leaves the pixels more varied, some covered and some bare.
    const spread = (paper: PaperKind) => {
      const m = mediumInfo('compressed-charcoal');
      const t = paperTile(paper);
      const vals = Array.from(t, (v) => pigmentAt(m, paper, v / 255, 0.4, 0));
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    };
    expect(spread('smooth')).toBeLessThan(spread('rough'));
  });
});

describe('the stick streaks', () => {
  it('stay between 0 and 1 and are the same at the same place', () => {
    for (let x = -20; x < 20; x += 0.37) {
      const v = streakAt(x, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(streakAt(x, 7)).toBe(v);
    }
  });
  it('are different for another stroke', () => {
    let same = 0;
    for (let x = 0; x < 40; x += 1.3) if (streakAt(x, 1) === streakAt(x, 2)) same++;
    expect(same).toBeLessThan(3);
  });
  it('change smoothly across the stick', () => {
    for (let x = 0; x < 30; x += 0.1) expect(Math.abs(streakAt(x + 0.1, 3) - streakAt(x, 3))).toBeLessThan(0.2);
  });
});

void TILE;
