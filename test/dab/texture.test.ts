// Grain and dual brush: how paint is caught by paper, the dots of a second tip, and both read back safely.
import { describe, expect, it } from 'vitest';
import { PAPER_IDS, TILE } from '../../src/dry/paper';
import { cleanDab } from '../../src/dab/maths';
import { cleanDual, cleanGrain, dotCount, dualAt, dualTile, grainCut, grainHeight, grainThreshold, DEFAULT_GRAIN, sameDual, sameGrain } from '../../src/dab/texture';

describe('grain', () => {
  it('lets everything through at depth 0', () => {
    for (const h of [0, 0.4, 1]) expect(grainCut(0.5, h, 0)).toBe(0.5);
  });

  it('lets nothing through where the paint is lighter than the paper is high, at depth 1', () => {
    expect(grainCut(0.3, 0.5, 1)).toBe(0);
    expect(grainCut(0.5, 0.5, 1)).toBe(0);
    expect(grainCut(0.8, 0.5, 1)).toBeCloseTo(0.6, 9);
  });

  it('always lets full paint through, so pressing hard fills the pits', () => {
    for (const depth of [0.2, 0.7, 1]) for (const h of [0, 0.5, 0.99]) expect(grainCut(1, h, depth)).toBeCloseTo(1, 9);
  });

  it('catches on more pixels as the paint gets heavier', () => {
    const share = (add: number) => {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (grainCut(add, grainHeight({ paper: 'medium', scale: 1 }, i % 80, Math.floor(i / 80)), 1) > 0) n++;
      return n / 4000;
    };
    expect(share(0.2)).toBeLessThan(share(0.5));
    expect(share(0.5)).toBeLessThan(share(0.9));
    // Papers are spread evenly, so the share is about the paint on offer.
    expect(share(0.5)).toBeGreaterThan(0.4);
    expect(share(0.5)).toBeLessThan(0.6);
  });

  it('reads the paper the dry media use, the same under any page pixel, negative ones too', () => {
    for (const paper of PAPER_IDS) {
      const h = grainHeight({ paper, scale: 1 }, 5, 9);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
      expect(grainHeight({ paper, scale: 1 }, 5 + TILE, 9 - TILE)).toBe(h);
    }
    expect(grainHeight({ paper: 'rough', scale: 1 }, -3, -7)).toBe(grainHeight({ paper: 'rough', scale: 1 }, TILE - 3, TILE - 7));
  });

  it('makes a bigger grain with a bigger scale: each paper pixel covers a block', () => {
    const a = grainHeight({ paper: 'fine', scale: 3 }, 6, 6);
    expect(grainHeight({ paper: 'fine', scale: 3 }, 8, 8)).toBe(a);
    expect(grainHeight({ paper: 'fine', scale: 3 }, 9, 6)).not.toBe(a);
  });

  it('moves with an offset, for a paper that is found in a new place at each dab', () => {
    const g = { paper: 'medium' as const, scale: 1 };
    expect(grainHeight(g, 10, 10, 3, 5)).toBe(grainHeight(g, 13, 15));
  });

  it('lets the paper decide the crisp edge at full depth and the page dither at none', () => {
    expect(grainThreshold(0.4, 0)).toBe(0.4);
    expect(grainThreshold(0.4, 1)).toBe(0);
    expect(grainThreshold(0.4, 0.5)).toBeCloseTo(0.2, 9);
  });

  it('is read back with anything odd put right, and absent stays absent', () => {
    expect(cleanGrain(undefined)).toBeNull();
    expect(cleanGrain('x')).toBeNull();
    expect(cleanGrain({ paper: 'nope', depth: 9, scale: 99 })).toEqual({ paper: 'medium', depth: 1, scale: 8, moving: false });
    expect(cleanGrain({ paper: 'laid', depth: 0.3, scale: 2, moving: true })).toEqual({ paper: 'laid', depth: 0.3, scale: 2, moving: true });
    expect(sameGrain(DEFAULT_GRAIN, { ...DEFAULT_GRAIN })).toBe(true);
    expect(sameGrain(DEFAULT_GRAIN, null)).toBe(false);
  });
});

describe('dual brush', () => {
  it('covers about the share of the page it was asked to', () => {
    for (const density of [0.2, 0.5, 0.8]) {
      const t = dualTile({ tip: 'round', size: 3, density, cut: false });
      let on = 0;
      for (const v of t) if (v) on++;
      expect(on / t.length).toBeGreaterThan(density - 0.08);
      expect(on / t.length).toBeLessThan(density + 0.08);
    }
  });

  it('is always the same tile for the same numbers, and a cut is the other way round', () => {
    const a = dualTile({ tip: 'square', size: 4, density: 0.3, cut: false });
    expect(dualTile({ tip: 'square', size: 4, density: 0.3, cut: false })).toBe(a);
    const c = dualTile({ tip: 'square', size: 4, density: 0.3, cut: true });
    for (let i = 0; i < a.length; i += 97) expect(a[i] === 0).toBe(c[i] !== 0);
  });

  it('makes dots about the size asked for', () => {
    const t = dualTile({ tip: 'round', size: 9, density: 0.05, cut: false });
    // Find one dot and measure its row.
    const start = t.findIndex((v) => v !== 0);
    const row = Math.floor(start / TILE);
    let w = 0;
    for (let x = start % TILE; x < TILE && t[row * TILE + x]; x++) w++;
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(9);
  });

  it('wraps at the tile edge, and a stroke offset moves the dots', () => {
    const t = dualTile({ tip: 'round', size: 5, density: 0.4, cut: false });
    expect(dualAt(t, 3, 4, 0, 0)).toBe(dualAt(t, 3 + TILE, 4 - TILE, 0, 0));
    expect(dualAt(t, 3, 4, 10, 20)).toBe(dualAt(t, 13, 24, 0, 0));
  });

  it('needs more dots for a lower density and for smaller ones', () => {
    expect(dotCount({ tip: 'round', size: 3, density: 0.2, cut: false })).toBeLessThan(dotCount({ tip: 'round', size: 3, density: 0.6, cut: false }));
    expect(dotCount({ tip: 'round', size: 6, density: 0.4, cut: false })).toBeLessThan(dotCount({ tip: 'round', size: 2, density: 0.4, cut: false }));
  });

  it('is read back with anything odd put right', () => {
    expect(cleanDual(undefined)).toBeNull();
    expect(cleanDual({ tip: 'star', size: 900, density: -1 })).toEqual({ tip: 'round', size: 64, density: 0.05, cut: false });
    expect(sameDual(cleanDual({ size: 5 }), cleanDual({ size: 5 }))).toBe(true);
    expect(sameDual(cleanDual({ size: 5 }), cleanDual({ size: 6 }))).toBe(false);
  });

  it('rides along in a brush', () => {
    const b = cleanDab({ grain: { paper: 'laid', depth: 0.5 }, dual: { size: 4 } });
    expect(b.grain?.paper).toBe('laid');
    expect(b.dual?.size).toBe(4);
    expect(cleanDab({ ...b, grain: null }, b).grain).toBeNull();
  });
});
