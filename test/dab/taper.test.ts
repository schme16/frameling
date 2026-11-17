// A line that thins to a point at its ends (DabBrush.taper). The start is drawn as the line goes; the end is only known
// when the pen lifts, so the last stretch is taken back and drawn again. What is pinned here: a brush without a taper
// draws exactly as before, the widths at the start, middle and end, and that taking the tail back leaves the pixels
// under it as they were.
import { describe, expect, it } from 'vitest';
import { cleanDab, cleanTaper, DEFAULT_DAB, sameDab, sameTaper, taperAt, type DabBrush, type Taper } from '../../src/dab/maths';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';

const W = 400;
const H = 60;
const taper: Taper = { start: 4, end: 4, size: 1, opacity: 0 };

function draw(brush: Partial<DabBrush>, to = 360, under?: Uint8ClampedArray): Uint8ClampedArray {
  const px = under ? under.slice() : new Uint8ClampedArray(W * H * 4);
  const b: DabBrush = { ...DEFAULT_DAB, size: 20, spacing: 0.05, aliased: false, ...brush };
  const s = new DabStroke(bufferSurface(px, W, H), { brush: b, color: [0, 0, 0, 255], edge: b.aliased ? 'crisp' : 'smooth', seed: 5 });
  for (let x = 40; x <= to; x += 2) s.moveTo({ x, y: H / 2 }, b.size, 1, { pressure: 1, speed: 0 });
  s.finish();
  return px;
}
/** How many pixels down a column hold paint: the line's width there. */
const width = (px: Uint8ClampedArray, x: number): number => {
  let n = 0;
  for (let y = 0; y < H; y++) if (px[(y * W + x) * 4 + 3] > 127) n++;
  return n;
};

describe('taper: the numbers', () => {
  it('a taper is read back whole, held in range, and is nothing when it does nothing', () => {
    expect(cleanTaper(taper)).toEqual(taper);
    expect(cleanTaper({ start: 999, end: -2, size: 3, opacity: 0.5 })).toEqual({ start: 60, end: 0, size: 1, opacity: 0.5 });
    expect(cleanTaper({ start: 0, end: 0, size: 1, opacity: 0 })).toBeNull();
    expect(cleanTaper({ start: 4, end: 4, size: 0, opacity: 0 })).toBeNull();
    expect(cleanTaper('yes')).toBeNull();
    // The start can fade differently from the end; when it does not, nothing extra is kept.
    expect(cleanTaper({ ...taper, opacity: 0.6, startOpacity: 0 })).toEqual({ ...taper, opacity: 0.6, startOpacity: 0 });
    expect(cleanTaper({ ...taper, opacity: 0.6, startOpacity: 0.6 })).toEqual({ ...taper, opacity: 0.6 });
    expect(cleanTaper({ ...taper, opacity: 0.6, startOpacity: 9 })).toEqual({ ...taper, opacity: 0.6, startOpacity: 1 });
    expect(sameTaper({ ...taper, opacity: 0.6 }, { ...taper, opacity: 0.6, startOpacity: 0 })).toBe(false);
  });

  it('a brush keeps its taper when it is cleaned, an older brush has none, and switching it off takes it away', () => {
    expect(cleanDab({ taper }).taper).toEqual(taper);
    expect(cleanDab({})).not.toHaveProperty('taper');
    expect(cleanDab({ taper: null }, cleanDab({ taper }))).not.toHaveProperty('taper');
    expect(cleanDab({ size: 9 }, cleanDab({ taper })).taper).toEqual(taper);
    expect(sameDab(cleanDab({ taper }), cleanDab({}))).toBe(false);
  });

  it('runs from the tip (nothing left) to the end of its length (all of it)', () => {
    expect(taperAt(taper, 0, 80).size).toBe(0);
    expect(taperAt(taper, 40, 80).size).toBeCloseTo(0.5);
    expect(taperAt(taper, 200, 80).size).toBe(1);
    expect(taperAt({ ...taper, size: 0.5, opacity: 1 }, 0, 80)).toEqual({ size: 0.5, cap: 0 });
    // The start may fade by its own amount.
    expect(taperAt({ ...taper, size: 0.5, opacity: 1 }, 0, 80, 0)).toEqual({ size: 0.5, cap: 1 });
  });
});

describe('taper: the line', () => {
  it('thin at the start, full in the middle, thin at the end', () => {
    const px = draw({ taper });
    // The tapers are four widths long: 80 pixels in from each end.
    expect(width(px, 46)).toBeLessThan(5);
    expect(width(px, 80)).toBeGreaterThan(7);
    expect(width(px, 80)).toBeLessThan(13);
    expect(width(px, 200)).toBeGreaterThanOrEqual(19);
    expect(width(px, 320)).toBeGreaterThan(7);
    expect(width(px, 320)).toBeLessThan(13);
    expect(width(px, 354)).toBeLessThan(5);
  });

  it('without a taper the line is as it always was: full width to both ends', () => {
    const px = draw({});
    expect(width(px, 46)).toBeGreaterThanOrEqual(19);
    expect(width(px, 354)).toBeGreaterThanOrEqual(19);
  });

  it('only the end: the start is blunt and the end is a point', () => {
    const px = draw({ taper: { ...taper, start: 0 } });
    expect(width(px, 46)).toBeGreaterThanOrEqual(19);
    expect(width(px, 354)).toBeLessThan(5);
  });

  it('a fade at the end only: the start stays solid, the end goes faint (a start of its own can be left unfaded)', () => {
    const faint = (px: Uint8ClampedArray, x: number): number => px[((H / 2) * W + x) * 4 + 3];
    const both = draw({ taper: { start: 4, end: 4, size: 0.5, opacity: 1 } });
    const endOnly = draw({ taper: { start: 4, end: 4, size: 0.5, opacity: 1, startOpacity: 0 } });
    // Right at the start the line is thin but, with startOpacity 0, as strong as the middle.
    expect(faint(endOnly, 48)).toBeGreaterThan(200);
    expect(faint(both, 48)).toBeLessThan(120);
    // The end fades the same either way.
    expect(faint(endOnly, 352)).toBeLessThan(120);
    expect(faint(endOnly, 352)).toBe(faint(both, 352));
  });

  it('taking the tail back puts the picture under it back exactly', () => {
    const under = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) under.set([200, (i * 7) % 256, 40, 255], i * 4);
    const px = draw({ taper }, 360, under);
    // Beside the tip, where the full width line was before the pen lifted, the old picture is back untouched.
    for (const y of [H / 2 - 8, H / 2 + 7]) {
      const i = (y * W + 352) * 4;
      expect([...px.slice(i, i + 4)]).toEqual([...under.slice(i, i + 4)]);
    }
    // And the middle of the line is still painted.
    expect(px[((H / 2) * W + 200) * 4]).toBeLessThan(10);
  });

  it('a long line only keeps its tail: the middle is not drawn twice, so it is the same as an untapered line there', () => {
    const plain = draw({ flow: 0.2 });
    const tapered = draw({ flow: 0.2, taper: { ...taper, start: 0 } });
    for (let y = 0; y < H; y++) expect(tapered[(y * W + 150) * 4 + 3]).toBe(plain[(y * W + 150) * 4 + 3]);
  });

  it('a flick shorter than its two tapers shares itself between them, so it is still a line', () => {
    const px = draw({ taper }, 100);
    expect(width(px, 70)).toBeGreaterThan(3);
    expect(width(px, 44)).toBeLessThan(width(px, 70));
    expect(width(px, 97)).toBeLessThan(width(px, 70));
  });

  it('a wet brush comes to a point as well (Dry Ink v2 is wet and tapers), and its tail keeps the ink colour over a coloured sheet', () => {
    const under = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) under.set([200, 120, 40, 255], i * 4);
    const px = draw({ taper, wet: 0.5 }, 360, under);
    const dark = (x: number): number => {
      let n = 0;
      for (let y = 0; y < H; y++) if (Math.abs(px[(y * W + x) * 4] - 200) > 40) n++;
      return n;
    };
    expect(dark(354)).toBeLessThan(5);
    expect(dark(200)).toBeGreaterThanOrEqual(19);
    // The tail is as dark as the line before it: the second laying did not lose its paint or tint it with the sheet.
    const at = (x: number): number => px[((H / 2) * W + x) * 4];
    expect(Math.abs(at(330) - at(200))).toBeLessThan(40);
    expect(at(200)).toBeLessThan(160);
  });

  it('a sharp pixel line is left as it was drawn', () => {
    const sharp = draw({ aliased: true, taper: { ...taper, start: 0 } });
    expect(width(sharp, 354)).toBeGreaterThanOrEqual(17);
  });
});
