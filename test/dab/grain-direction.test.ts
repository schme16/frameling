// The board card grain-peaks-or-pits asked: does paint from a grain land on the peaks of the paper or in the pits?
// The look look-grain-dir settled it: on the peaks, the way real chalk catches on the tooth of the paper, which is also
// what the dry media already did. These tests pin that direction so it cannot change by accident. If you mean to flip it
// again, change these on purpose and look at brand/ab/grain-dir first (the same stroke both ways).
import { describe, expect, it } from 'vitest';
import { grainCut, grainHeight } from '../../src/dab/texture';
import { MEDIA, pigmentAt } from '../../src/dry/maths';
import { paperHeight, paperTile, PAPER_IDS, TILE } from '../../src/dry/paper';

// On paper, a height of 1 is a peak (the top of the tooth) and 0 is a pit. The tile is 0 to 255 and grainHeight reads it as 0 to 1.
describe('grain direction (dab engine)', () => {
  it('a peak (height 1) takes paint straight away, however light', () => {
    expect(grainCut(0.1, 1, 1)).toBeGreaterThan(0);
    expect(grainCut(0.01, 1, 1)).toBeGreaterThan(0);
  });

  it('a pit (height 0) takes nothing until the paint is full, so light paint skips the pits', () => {
    expect(grainCut(0.5, 0, 1)).toBe(0);
    expect(grainCut(0.99, 0, 1)).toBe(0);
    expect(grainCut(1, 0, 1)).toBe(0);
  });

  it('paint lands on higher paper before lower paper, at any strength', () => {
    for (const add of [0.2, 0.5, 0.8]) {
      let last = Infinity;
      for (const h of [1, 0.75, 0.5, 0.25, 0]) {
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

describe('the dry media (chalk, charcoal on pixel layers and vector strokes) go the same way', () => {
  // The dry media take pigment on the peaks first. Since the look, so does the dab engine's grain. This pins that they agree.
  const chalk = MEDIA.find((m) => m.id === 'chalk')!;
  it('light pressure reaches a peak and not a pit', () => {
    const light = 0.3;
    expect(pigmentAt(chalk, 'rough', 1, light, 0)).toBeGreaterThan(0);
    expect(pigmentAt(chalk, 'rough', 0, light, 0)).toBe(0);
  });

  it('so the dab grain and the dry media agree about which end of the paper catches first', () => {
    const light = 0.3;
    expect(pigmentAt(chalk, 'rough', 1, light, 0) > 0).toBe(true);
    expect(grainCut(light, 1, 1) > 0).toBe(true);
    expect(grainCut(light, 0, 1) > 0).toBe(false);
  });
});
