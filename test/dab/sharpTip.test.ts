// DabBrush.sharp: a picture tip sampled as saved (no smoothing, no smaller copy), so a tip of fine specks stays crisp.
import { describe, expect, it } from 'vitest';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { cleanDab, DEFAULT_DAB, samplerFor, sameDab, type DabBrush } from '../../src/dab/maths';
import type { PixelStamp } from '../../src/brushes/stamps';
import { speckled } from '../../src/brushes/import/procreate';

/** A 64 by 64 soft tip of one cell in ten, each half strength. */
function dust(): PixelStamp {
  const cells = Array.from({ length: 64 * 64 }, (_, i) => (i % 10 === 3 ? 1 : 0));
  return { w: 64, h: 64, colours: ['#00000080'], cells, keep: false, soft: true };
}
const brush = (extra: Partial<DabBrush>): DabBrush => ({ ...DEFAULT_DAB, tip: 'picture', picture: dust(), size: 20, aliased: false, ...extra });

describe('a sharp tip', () => {
  it('is left out unless it is on, and survives a save and a read', () => {
    expect(cleanDab({}).sharp).toBeUndefined();
    expect(cleanDab({ sharp: false }).sharp).toBeUndefined();
    const a = cleanDab({ tip: 'picture', picture: dust(), sharp: true });
    expect(a.sharp).toBe(true);
    const b = cleanDab(JSON.parse(JSON.stringify(a)));
    expect(b.sharp).toBe(true);
    expect(sameDab(a, b)).toBe(true);
    expect(sameDab(a, cleanDab({ tip: 'picture', picture: dust() }))).toBe(false);
  });

  it('samples a cell as it is where the smooth dab blends it away', () => {
    const smooth = samplerFor(brush({}), 20, 0, false);
    const sharp = samplerFor(brush({ sharp: true }), 20, 0, false);
    let hardest = 0;
    let softest = 0;
    for (let y = -10; y < 10; y++)
      for (let x = -10; x < 10; x++) {
        hardest = Math.max(hardest, sharp.cov(x + 0.5, y + 0.5));
        softest = Math.max(softest, smooth.cov(x + 0.5, y + 0.5));
      }
    // The cells hold 0.5 of paint; the smooth dab averages a small speck down, the sharp one keeps its full value.
    expect(hardest).toBeCloseTo(0.5, 2);
    expect(softest).toBeLessThan(hardest);
  });

  it('draws a stroke that differs from the smooth one, and a brush without it is unchanged', () => {
    const draw = (b: DabBrush): Uint8ClampedArray => {
      const px = new Uint8ClampedArray(100 * 40 * 4);
      const s = new DabStroke(bufferSurface(px, 100, 40), { brush: b, color: [0, 0, 0, 255], edge: 'smooth', seed: 3 });
      for (let x = 20; x <= 80; x += 3) s.moveTo({ x, y: 20 }, 20, 1);
      s.finish();
      return px;
    };
    expect(draw(brush({ sharp: true }))).not.toEqual(draw(brush({})));
    expect(draw(brush({ sharp: false }))).toEqual(draw(brush({})));
  });
});

describe('which imported tips are speckled', () => {
  const stamp = (covered: number): { colours: string[]; cells: number[] } => ({
    colours: ['#000000ff', '#00000008'],
    cells: Array.from({ length: 1000 }, (_, i) => (i < covered ? 1 : i < covered + 300 ? 2 : 0)),
  });
  it('is a tip under a tenth covered, and not a solid or soft shape', () => {
    expect(speckled(stamp(40))).toBe(true);
    expect(speckled(stamp(140))).toBe(false);
    expect(speckled(stamp(600))).toBe(false);
  });
  it('does not count the faintest dust as covered', () => {
    expect(speckled({ colours: ['#00000010'], cells: Array.from({ length: 100 }, () => 1) })).toBe(true);
  });
});
