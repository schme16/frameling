import { describe, expect, it } from 'vitest';
import { celGap, labelStep, thinCels, TINY_CEL } from '../../src/timeline/geometry';
import { MAX_CW, MIN_CW, cwToSlider, setTl, sliderToCw, tl, resetTl } from '../../src/timeline/state';

const cel = (start: number, length = 1) => ({ start, length });

describe('very narrow frames', () => {
  it('lets a frame go far narrower than it used to, so a long clip can fit', () => {
    expect(MIN_CW).toBeLessThan(1);
    // 419 frames across about 900 px is roughly 2 px a frame, which the old 5 px floor refused.
    setTl({ cw: 900 / 420 });
    expect(tl().cw).toBeCloseTo(2.143, 2);
    // 5000 frames across 1000 px still fits.
    setTl({ cw: 1000 / 5000 });
    expect(tl().cw).toBeCloseTo(0.2, 3);
    // Past the floor it stops, and the top end is where it was.
    setTl({ cw: 0.01 });
    expect(tl().cw).toBe(MIN_CW);
    setTl({ cw: 500 });
    expect(tl().cw).toBe(MAX_CW);
    resetTl();
  });

  it('puts the zoom slider on a log scale, both ends included', () => {
    expect(cwToSlider(MIN_CW)).toBeCloseTo(0, 6);
    expect(cwToSlider(MAX_CW)).toBeCloseTo(1, 6);
    expect(sliderToCw(0)).toBeCloseTo(MIN_CW, 6);
    expect(sliderToCw(1)).toBeCloseTo(MAX_CW, 6);
    for (const cw of [0.3, 1, 5, 22, 60]) expect(sliderToCw(cwToSlider(cw))).toBeCloseTo(cw, 6);
    // The middle of the track is in the middle of the range, not at the roomy end.
    expect(sliderToCw(0.5)).toBeLessThan(10);
  });

  it('keeps ruler numbers apart however tight the frames get', () => {
    const gap = (cw: number) => labelStep(cw) * cw;
    for (const cw of [22, 12, 8, 5, 3, 2, 1.2, 1, 0.5, 0.3, 0.2]) expect(gap(cw), `cw ${cw}`).toBeGreaterThanOrEqual(20);
    expect(labelStep(22)).toBe(5);
    expect(labelStep(5)).toBe(50);
    expect(labelStep(0.2)).toBe(500);
  });

  it('leaves less gap between blocks as they narrow, and none at the tightest', () => {
    expect(celGap(22)).toBe(2);
    expect(celGap(5)).toBe(2);
    expect(celGap(3)).toBe(1);
    expect(celGap(1)).toBe(0);
  });

  it('draws every drawing as it is while they are wide enough', () => {
    const cels = Array.from({ length: 10 }, (_, i) => cel(i));
    const out = thinCels(cels, 22);
    expect(out).toHaveLength(10);
    expect(out.every((p) => !p.dense && p.count === 1)).toBe(true);
    expect(out[3]).toMatchObject({ left: 66, right: 88 });
    // The same at the old narrowest.
    expect(thinCels(cels, 5)).toHaveLength(10);
  });

  it('joins runs of tiny drawings into one band', () => {
    const cels = Array.from({ length: 419 }, (_, i) => cel(i));
    const out = thinCels(cels, 2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ left: 0, right: 838, count: 419, dense: true });
  });

  it('keeps a wide drawing apart from the tiny ones around it', () => {
    // frames 0-4 are one-frame drawings, 5-24 is one long hold, 25-29 tiny again
    const cels = [...[0, 1, 2, 3, 4].map((s) => cel(s)), cel(5, 20), ...[25, 26, 27, 28, 29].map((s) => cel(s))];
    const out = thinCels(cels, 1);
    expect(out.map((p) => [p.dense, p.count])).toEqual([[true, 5], [false, 1], [true, 5]]);
    // the hold is 20 px wide at this zoom, so it is drawn whole
    expect(out[1]).toMatchObject({ left: 5, right: 25 });
  });

  it('does not join drawings with a gap between them', () => {
    const out = thinCels([cel(0), cel(1), cel(10), cel(11)], 1);
    expect(out.map((p) => p.count)).toEqual([2, 2]);
  });

  it('never makes a block thinner than a pixel', () => {
    const out = thinCels([cel(0), cel(100)], 0.2);
    for (const p of out) expect(p.right - p.left).toBeGreaterThanOrEqual(1);
  });

  it('what counts as tiny is a few pixels wide', () => {
    expect(thinCels([cel(0, 2)], 2)[0].dense).toBe(false); // 4 px wide: drawn by itself
    expect(2 * 1.9).toBeLessThan(TINY_CEL);
    expect(thinCels([cel(0, 2), cel(2, 2)], 1.9)[0].count).toBe(2);
  });
});
