// The papers: each is a repeating tile of heights, spread evenly, the same every time, and different from the others.
import { describe, expect, it } from 'vitest';
import { PAPER_IDS, PAPERS, paperHeight, paperInfo, paperTile, TILE, isPaper } from '../../src/dry/paper';

describe('paper', () => {
  it('has a tile of one height per pixel for each paper', () => {
    for (const k of PAPER_IDS) expect(paperTile(k).length).toBe(TILE * TILE);
  });

  it('is spread evenly from pit to peak, so the same pressure reaches the same share of every paper', () => {
    for (const k of PAPER_IDS) {
      const t = paperTile(k);
      const bins = new Array(10).fill(0);
      for (const v of t) bins[Math.min(9, Math.floor((v / 256) * 10))]++;
      for (const b of bins) expect(Math.abs(b / t.length - 0.1)).toBeLessThan(0.01);
    }
  });

  it('is the same every time it is asked', () => {
    for (const k of PAPER_IDS) {
      const a = paperHeight(k, 37, 91);
      expect(paperHeight(k, 37, 91)).toBe(a);
    }
  });

  it('repeats across the page without a seam, in every direction', () => {
    for (const k of PAPER_IDS) {
      expect(paperHeight(k, 5 + TILE, 9)).toBe(paperHeight(k, 5, 9));
      expect(paperHeight(k, 5, 9 + 3 * TILE)).toBe(paperHeight(k, 5, 9));
      expect(paperHeight(k, -1, -1)).toBe(paperHeight(k, TILE - 1, TILE - 1));
    }
  });

  it('is not the same paper twice', () => {
    for (let i = 0; i < PAPER_IDS.length; i++)
      for (let j = i + 1; j < PAPER_IDS.length; j++) {
        let same = 0;
        const a = paperTile(PAPER_IDS[i]);
        const b = paperTile(PAPER_IDS[j]);
        for (let n = 0; n < a.length; n++) if (a[n] === b[n]) same++;
        expect(same / a.length).toBeLessThan(0.1);
      }
  });

  it('has a plain-words label and hint for each, and the rougher ones come later in the list', () => {
    expect(PAPERS.map((p) => p.id)).toEqual(PAPER_IDS);
    for (const p of PAPERS) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.hint).not.toMatch(/[–—]/);
    }
    expect(paperInfo('smooth').tooth).toBeLessThan(paperInfo('rough').tooth);
    expect(isPaper('rough')).toBe(true);
    expect(isPaper('glossy')).toBe(false);
  });

  it('has the laid paper run in threads: neighbours along a row agree more than far-apart pixels', () => {
    // Threads repeat every four pixels, so pixels four apart are alike more often than pixels two apart.
    const t = paperTile('laid');
    const corr = (d: number) => {
      let s = 0;
      let n = 0;
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          s += Math.abs(t[y * TILE + x] - t[y * TILE + ((x + d) % TILE)]);
          n++;
        }
      return s / n;
    };
    expect(corr(4)).toBeLessThan(corr(2));
  });
});
