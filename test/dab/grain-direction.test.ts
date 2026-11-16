// The question board card grain-peaks-or-pits asks: does paint from a grain land on the peaks of the paper or in the pits?
// These tests do not say which is right. They pin what the code does today, so that the direction cannot change by accident.
// If you mean to flip it, change these on purpose and look at brand/ab/grain-dir first (the same stroke both ways).
import { describe, expect, it } from 'vitest';
import { grainCut, grainHeight } from '../../src/dab/texture';
import { MEDIA, pigmentAt } from '../../src/dry/maths';
import { paperHeight, paperTile, PAPER_IDS, TILE } from '../../src/dry/paper';

// On paper, a height of 1 is a peak (the top of the tooth) and 0 is a pit. The tile is 0 to 255 and grainHeight reads it as 0 to 1.
describe('grain direction as it is today (dab engine)', () => {
  it('a pit (height 0) takes paint straight away, however light', () => {
    expect(grainCut(0.1, 0, 1)).toBeGreaterThan(0);
    expect(grainCut(0.01, 0, 1)).toBeGreaterThan(0);
  });

  it('a peak (height 1) takes nothing until the paint is full, so light paint skips the peaks', () => {
    expect(grainCut(0.5, 1, 1)).toBe(0);
    expect(grainCut(0.99, 1, 1)).toBe(0);
    expect(grainCut(1, 1, 1)).toBe(0);
  });

  it('paint lands on lower paper before higher paper, at any strength', () => {
    for (const add of [0.2, 0.5, 0.8]) {
      let last = Infinity;
      for (const h of [0, 0.25, 0.5, 0.75, 1]) {
        const got = grainCut(add, h, 1);
        expect(got).toBeLessThanOrEqual(last);
        last = got;
      }
    }
  });

  it('the paper tile and grainHeight use the same numbers: 255 is the highest bump', () => {
    for (const p of PAPER_IDS) {
      const t = paperTile(p);
      expect(Math.min(...t)).toBe(0);
      expect(Math.max(...t)).toBe(255);
      expect(grainHeight({ paper: p, scale: 1 }, 5, 9)).toBe(paperHeight(p, 5, 9));
    }
  });

  it('the share of pixels reached is the same on every paper (the tile is spread evenly), so the direction changes where, not how much', () => {
    for (const p of PAPER_IDS) {
      const t = paperTile(p);
      let reached = 0;
      for (let i = 0; i < t.length; i++) if (grainCut(0.4, t[i] / 255, 1) > 0) reached++;
      expect(reached / t.length).toBeCloseTo(0.4, 1);
    }
    expect(paperTile('medium').length).toBe(TILE * TILE);
  });
});

describe('dry media (chalk, charcoal on pixel layers and vector strokes) go the other way today', () => {
  // The dry media take pigment on the peaks first. The dab engine's grain takes it in the pits first. This pins that they differ.
  const chalk = MEDIA.find((m) => m.id === 'chalk')!;
  it('light pressure reaches a peak and not a pit', () => {
    const light = 0.3;
    expect(pigmentAt(chalk, 'rough', 1, light, 0)).toBeGreaterThan(0);
    expect(pigmentAt(chalk, 'rough', 0, light, 0)).toBe(0);
  });

  it('so the dab grain and the dry media disagree about which end of the paper catches first', () => {
    const light = 0.3;
    const dryPeak = pigmentAt(chalk, 'rough', 1, light, 0) > 0;
    const dabPeak = grainCut(light, 1, 1) > 0;
    expect(dryPeak).toBe(true);
    expect(dabPeak).toBe(false);
  });
});
