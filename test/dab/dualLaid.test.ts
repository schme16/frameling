// A dual brush laid along the stroke (a second brush on its own spacing that the first is painted through): read back
// safely, old brushes unchanged, and the mask doing what it says in a real stroke.
import { describe, expect, it } from 'vitest';
import { cleanDab, DEFAULT_DAB } from '../../src/dab/maths';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { cleanDual, sameDual } from '../../src/dab/texture';
import { cleanLaid, LAID_MAX_PIXELS, LAID_SIZE, LAID_SPACING } from '../../src/dab/dualLaid';

const W = 200;
const H = 120;

/** One straight stroke along the middle row; returns the paint (255 minus red) per pixel. */
function draw(raw: Record<string, unknown>, mirror?: { mode: 'h'; ax2: number; ay2: number }): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4).fill(255);
  const brush = cleanDab({ tip: 'round', size: 40, hardness: 1, spacing: 0.1, aliased: false, ...raw });
  const s = new DabStroke(bufferSurface(px, W, H), { brush, color: [0, 0, 0, 255], edge: 'smooth', seed: 5, mirror });
  for (let i = 0; i <= 12; i++) s.moveTo({ x: 30 + i * 11, y: 60 }, 40, 1);
  s.finish();
  const out = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) out[i] = 255 - px[i * 4];
  return out;
}
/** The rows that have any paint (at least 8 of 255) in them. */
const rows = (p: Uint8ClampedArray): number[] => {
  const r: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p[y * W + x] > 8) (r.push(y), (x = W));
  return r;
};
const total = (p: Uint8ClampedArray): number => p.reduce((a, b) => a + b, 0);
const laid = (o: Record<string, unknown> = {}) => ({ laid: { tip: 'round', size: 0.25, spacing: 0.05, ...o } });

describe('a laid dual tip, read back', () => {
  it('is kept whole, with anything odd put right', () => {
    const d = cleanDual({ laid: { tip: 'square', size: 0.5, spacing: 0.3, scatter: 0.4, angleJitter: 0.2, follow: true, roundness: 0.5, hardness: 0.7 } });
    expect(d?.laid).toEqual({ tip: 'square', size: 0.5, spacing: 0.3, scatter: 0.4, angleJitter: 0.2, follow: true, roundness: 0.5, hardness: 0.7 });
    const odd = cleanLaid({ tip: 'star', size: 900, spacing: -4, scatter: 'lots', roundness: 0, hardness: 3 });
    expect(odd).toMatchObject({ tip: 'round', size: LAID_SIZE.max, spacing: LAID_SPACING.min, scatter: 0, roundness: 0.05, hardness: 1 });
    // A picture tip with no picture, or a made up one, is a round tip.
    expect(cleanLaid({ tip: 'picture', picture: { w: 2 } })?.tip).toBe('round');
    expect(cleanLaid(null)).toBeNull();
    expect(cleanLaid([1])).toBeNull();
    expect(cleanDual({ size: 4, laid: 'nope' })).not.toHaveProperty('laid');
  });

  it('a dual without one reads exactly as it always did, and old brushes still open', () => {
    expect(cleanDual({ tip: 'round', size: 3, density: 0.4, cut: false })).toEqual({ tip: 'round', size: 3, density: 0.4, cut: false });
    const old = cleanDab({ dual: { tip: 'square', size: 5, density: 0.5, cut: true } });
    expect(old.dual).toEqual({ tip: 'square', size: 5, density: 0.5, cut: true });
    expect(cleanDab({}).dual).toBeNull();
    expect(DEFAULT_DAB.dual).toBeNull();
  });

  it('two duals differ when their laid tips do, and survive being read twice', () => {
    const a = cleanDual({ laid: { size: 0.5 } });
    expect(sameDual(a, cleanDual({ laid: { size: 0.5 } }))).toBe(true);
    expect(sameDual(a, cleanDual({ laid: { size: 0.6 } }))).toBe(false);
    expect(sameDual(a, cleanDual({}))).toBe(false);
    expect(cleanDab({ dual: a })).toEqual(cleanDab({ dual: cleanDab({ dual: a }).dual }));
  });
});

describe('a laid dual tip, in a stroke', () => {
  it('the first brush only paints where the second has been', () => {
    const plain = rows(draw({}));
    const masked = rows(draw({ dual: laid() }));
    // 40 wide against a 10 wide band: the rows with paint are far fewer, and are the middle ones.
    expect(plain.length).toBeGreaterThanOrEqual(38);
    expect(masked.length).toBeLessThanOrEqual(14);
    expect(masked.length).toBeGreaterThanOrEqual(8);
    expect(Math.min(...masked)).toBeGreaterThanOrEqual(52);
    expect(Math.max(...masked)).toBeLessThanOrEqual(68);
  });

  it('a second brush wider than the first lets all of it through', () => {
    const plain = draw({});
    const wide = draw({ dual: laid({ size: 4 }) });
    expect(Math.abs(total(wide) - total(plain)) / total(plain)).toBeLessThan(0.01);
  });

  it('scatter spreads the second brush off the line, so paint lands further out', () => {
    const tight = rows(draw({ dual: laid({ scatter: 0 }) }));
    const loose = rows(draw({ dual: laid({ scatter: 1.5, spacing: 0.3 }) }));
    expect(loose.length).toBeGreaterThan(tight.length);
  });

  it('spacing is its own: a second brush spaced far apart leaves gaps along the line', () => {
    const solid = draw({ dual: laid({ spacing: 0.05 }) });
    const gappy = draw({ dual: laid({ spacing: 3 }) });
    expect(total(gappy)).toBeLessThan(total(solid) * 0.8);
    // Gaps: some column along the middle has no paint at all.
    let empty = 0;
    for (let x = 40; x < 160; x++) if (gappy[60 * W + x] < 8) empty++;
    expect(empty).toBeGreaterThan(10);
  });

  it('the same seed gives the same stroke, and a laid dual does not disturb the first brush scatter', () => {
    expect(draw({ dual: laid({ scatter: 0.5 }) })).toEqual(draw({ dual: laid({ scatter: 0.5 }) }));
    // Both runs draw the first brush's own dabs from the same seed: with a mask that lets everything through the strokes match.
    const a = draw({ scatter: 0.3, dual: laid({ size: 4 }) });
    const b = draw({ scatter: 0.3 });
    expect(Math.abs(total(a) - total(b)) / total(b)).toBeLessThan(0.01);
  });

  it('a stroke with no dual, or the old dots, is the same as before (nothing laid is asked for)', () => {
    expect(draw({ dual: null })).toEqual(draw({}));
    const dots = draw({ dual: { tip: 'round', size: 3, density: 0.4, cut: false } });
    const none = draw({});
    expect(total(dots)).toBeLessThan(total(none));
    expect(total(dots)).toBeGreaterThan(0);
  });

  it('it is mirrored with the first brush, so both halves are masked the same way', () => {
    const p = draw({ dual: laid() }, { mode: 'h', ax2: W, ay2: 0 });
    const left = rows(p);
    // The mirrored stroke is a copy across the middle column: still only the band rows have paint.
    expect(left.length).toBeLessThanOrEqual(14);
    let mirrored = 0;
    for (let x = 100; x < 170; x++) if (p[60 * W + x] > 8) mirrored++;
    expect(mirrored).toBeGreaterThan(20);
  });

  it('a huge share is capped at the widest dab, so a stroke stays quick to draw', () => {
    expect(LAID_MAX_PIXELS).toBeLessThanOrEqual(1000);
    const t0 = performance.now();
    draw({ size: 300, dual: laid({ size: 4, spacing: 0.02 }) });
    expect(performance.now() - t0).toBeLessThan(8000);
  });

  it('a dab at the edge of the page, and a stroke starting off it, do not throw', () => {
    const px = new Uint8ClampedArray(W * H * 4).fill(255);
    const brush = cleanDab({ tip: 'round', size: 40, spacing: 0.1, aliased: false, dual: laid({ size: 1 }) });
    const s = new DabStroke(bufferSurface(px, W, H), { brush, color: [0, 0, 0, 255], edge: 'smooth', seed: 1 });
    s.moveTo({ x: -30, y: -20 }, 40, 1);
    s.moveTo({ x: 10, y: 10 }, 40, 1);
    s.moveTo({ x: W + 30, y: H + 20 }, 40, 1);
    s.finish();
    expect(px.some((v, i) => i % 4 === 0 && v < 255)).toBe(true);
  });
});
