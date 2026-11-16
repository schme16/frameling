import { describe, expect, it } from 'vitest';
import { buildUp, crispen, dabStep, eachDabPixel, edgeFor, eraseOut, falloff, holdAt, mirrorCentres, mixPixels, multiplyOver, paintOver, pickPixel, softColor, threshold } from '../../src/soft/maths';

const px = (r: number, g: number, b: number, a: number): [number, number, number, number] => [r, g, b, a];

describe('falloff', () => {
  it('is full in the middle and nothing at the edge', () => {
    expect(falloff(0, 10, 0)).toBe(1);
    expect(falloff(10, 10, 0)).toBe(0);
    expect(falloff(12, 10, 0)).toBe(0);
  });

  it('never rises as you move away, at any hardness', () => {
    for (const h of [0, 0.25, 0.5, 0.75, 1]) {
      let last = 1;
      for (let d = 0; d <= 10; d += 0.25) {
        const v = falloff(d, 10, h);
        expect(v).toBeLessThanOrEqual(last + 1e-12);
        last = v;
      }
    }
  });

  it('is exactly half way between the solid middle and the edge', () => {
    // hardness 0.5: solid to 5, fading to 10. Half way along the fade is distance 7.5.
    expect(falloff(5, 10, 0.5)).toBe(1);
    expect(falloff(7.5, 10, 0.5)).toBeCloseTo(0.5, 10);
  });

  it('a harder brush is stronger at the same distance', () => {
    expect(falloff(6, 10, 0.8)).toBeGreaterThan(falloff(6, 10, 0.4));
    expect(falloff(6, 10, 0.4)).toBeGreaterThan(falloff(6, 10, 0));
  });

  it('is a plain disc at hardness 1', () => {
    expect(falloff(9.99, 10, 1)).toBe(1);
    expect(falloff(10, 10, 1)).toBe(0);
  });

  it('keeps a narrow fade even at hardness 1 when asked to (so a smooth edge is not jagged)', () => {
    const mid = falloff(9.6, 10, 1, 0.75);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('gives nothing for a brush with no size', () => {
    expect(falloff(0, 0, 0.5)).toBe(0);
  });
});

describe('dabs along a stroke', () => {
  it('lays dabs a tenth of the width apart, and never closer than half a pixel', () => {
    expect(dabStep(40)).toBeCloseTo(4, 10);
    expect(dabStep(2)).toBe(0.5);
    expect(dabStep(0)).toBe(0.5);
  });

  it('covers a round patch, strongest in the middle', () => {
    const seen = new Map<string, number>();
    eachDabPixel(10.5, 10.5, 9, 0, 0, (x, y, c) => seen.set(`${x},${y}`, c));
    expect(seen.get('10,10')).toBeGreaterThan(0.9);
    expect(seen.get('10,10')).toBeGreaterThan(seen.get('13,10')!);
    expect(seen.has('20,20')).toBe(false);
    // symmetrical
    expect(seen.get('13,10')).toBeCloseTo(seen.get('7,10')!, 10);
    expect(seen.get('10,13')).toBeCloseTo(seen.get('13,10')!, 10);
  });
});

describe('building up', () => {
  it('buildUp adds on top of what is there and never passes 1', () => {
    expect(buildUp(0, 0.5)).toBe(0.5);
    expect(buildUp(0.5, 0.5)).toBe(0.75);
    let v = 0;
    for (let i = 0; i < 50; i++) v = buildUp(v, 0.3);
    expect(v).toBeLessThanOrEqual(1);
    expect(v).toBeGreaterThan(0.99);
  });

  it('holdAt keeps the strongest, so crossing yourself does not darken', () => {
    expect(holdAt(0.4, 0.2)).toBe(0.4);
    expect(holdAt(0.4, 0.7)).toBe(0.7);
  });
});

describe('dithering a soft edge', () => {
  it('thresholds are inside 0 to 1 and use every one of sixteen steps once', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) seen.add(threshold(x, y));
    expect(seen.size).toBe(16);
    for (const t of seen) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
    }
  });

  it('the pattern repeats every four pixels, including to the left and above', () => {
    expect(threshold(-1, -2)).toBe(threshold(3, 2));
    expect(threshold(5, 9)).toBe(threshold(1, 1));
  });

  it('full coverage is always on and none is always off', () => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        expect(crispen(1, x, y)).toBe(1);
        expect(crispen(0, x, y)).toBe(0);
      }
  });

  it('half coverage turns about half the pixels on, and more coverage never turns one off', () => {
    let on = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) on += crispen(0.5, x, y);
    expect(on).toBe(8);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        let was = 0;
        for (let c = 0; c <= 1.0001; c += 0.05) {
          const now = crispen(Math.min(c, 1), x, y);
          expect(now).toBeGreaterThanOrEqual(was);
          was = now;
        }
      }
  });

  it('a crisp mix only ever gives back one of the two colours it was given', () => {
    const a = px(10, 20, 30, 255);
    const b = px(200, 100, 50, 255);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        for (const t of [0, 0.2, 0.5, 0.8, 1]) {
          const out = [0, 0, 0, 0];
          pickPixel(a, b, t, x, y, out);
          expect([JSON.stringify(a), JSON.stringify(b)]).toContain(JSON.stringify(out));
        }
  });
});

describe('what a pixel becomes', () => {
  it('paint over nothing is the colour with the stroke strength as its see-through', () => {
    const out = [0, 0, 0, 0];
    paintOver(px(0, 0, 0, 0), 0, px(200, 40, 40, 255), 0.5, out);
    expect(out).toEqual([200, 40, 40, 128]);
  });

  it('paint over a colour mixes by strength', () => {
    const out = [0, 0, 0, 0];
    paintOver(px(0, 0, 0, 255), 0, px(255, 255, 255, 255), 0.5, out);
    expect(out[3]).toBe(255);
    expect(out[0]).toBe(128);
  });

  it('full strength paint replaces the pixel, none leaves it', () => {
    const out = [0, 0, 0, 0];
    paintOver(px(9, 9, 9, 255), 0, px(1, 2, 3, 255), 1, out);
    expect(out).toEqual([1, 2, 3, 255]);
    paintOver(px(9, 8, 7, 255), 0, px(1, 2, 3, 255), 0, out);
    expect(out).toEqual([9, 8, 7, 255]);
  });

  it('the soft eraser takes away a share of the opacity, and a pixel nearly gone is gone', () => {
    const out = [0, 0, 0, 0];
    eraseOut(px(10, 20, 30, 200), 0, 0.5, out);
    expect(out).toEqual([10, 20, 30, 100]);
    eraseOut(px(10, 20, 30, 200), 0, 1, out);
    expect(out).toEqual([0, 0, 0, 0]);
    eraseOut(px(10, 20, 30, 1), 0, 0.6, out);
    expect(out).toEqual([0, 0, 0, 0]);
  });

  it('the highlighter keeps a dark line dark, tints a light one, and lays colour on nothing', () => {
    const yellow = px(255, 235, 0, 255);
    const out = [0, 0, 0, 0];
    multiplyOver(px(0, 0, 0, 255), 0, yellow, 1, out);
    expect(out).toEqual([0, 0, 0, 255]);
    multiplyOver(px(255, 255, 255, 255), 0, yellow, 1, out);
    expect(out).toEqual([255, 235, 0, 255]);
    multiplyOver(px(0, 0, 0, 0), 0, yellow, 1, out);
    expect(out).toEqual([255, 235, 0, 255]);
  });

  it('the highlighter never lets the line underneath get lighter', () => {
    const out = [0, 0, 0, 0];
    for (const c of [px(30, 30, 80, 255), px(120, 60, 20, 255), px(200, 200, 200, 255)])
      for (const cov of [0.2, 0.5, 1]) {
        multiplyOver(c, 0, px(255, 220, 40, 255), cov, out);
        expect(out[0]).toBeLessThanOrEqual(c[0]);
        expect(out[1]).toBeLessThanOrEqual(c[1]);
        expect(out[2]).toBeLessThanOrEqual(c[2]);
      }
  });

  it('softColor says nothing changes with no coverage, and nothing to erase on an empty pixel', () => {
    const out = [0, 0, 0, 0];
    expect(softColor('soft-brush', px(1, 2, 3, 255), 0, px(9, 9, 9, 255), 0, out)).toBe(false);
    expect(softColor('soft-eraser', px(0, 0, 0, 0), 0, px(9, 9, 9, 255), 1, out)).toBe(false);
    expect(softColor('airbrush', px(1, 2, 3, 255), 0, px(9, 9, 9, 255), 1, out)).toBe(true);
    expect(out).toEqual([9, 9, 9, 255]);
  });

  it('smudge mixes by how much of each pixel counts, see-through ones counting for less', () => {
    const out = [0, 0, 0, 0];
    mixPixels(px(0, 0, 0, 255), px(255, 255, 255, 255), 0.5, out);
    expect(out).toEqual([128, 128, 128, 255]);
    mixPixels(px(0, 0, 0, 255), px(255, 0, 0, 0), 1, out);
    expect(out[3]).toBe(0);
  });
});

describe('how the edge is made', () => {
  it('a locked palette always dithers, whatever was answered', () => {
    expect(edgeFor({ locked: true, pixelPerfect: false, crispAnswer: 'smooth' })).toEqual({ mode: 'crisp', why: 'locked' });
    expect(edgeFor({ locked: true, pixelPerfect: true, crispAnswer: 'smooth' })).toEqual({ mode: 'crisp', why: 'locked' });
  });

  it('Pixel perfect dithers unless the answer is smooth', () => {
    expect(edgeFor({ locked: false, pixelPerfect: true, crispAnswer: 'crisp' })).toEqual({ mode: 'crisp', why: 'perfect' });
    expect(edgeFor({ locked: false, pixelPerfect: true, crispAnswer: 'smooth' })).toEqual({ mode: 'smooth', why: null });
  });

  it('with nothing against it the edge is smooth', () => {
    expect(edgeFor({ locked: false, pixelPerfect: false, crispAnswer: 'crisp' })).toEqual({ mode: 'smooth', why: null });
  });
});

describe('mirror drawing', () => {
  it('lays the dab at its images across each line', () => {
    // A mirror line down the middle of a 16 wide picture: twice the position is 16.
    expect(mirrorCentres('off', 16, 16, 3.5, 4.5)).toEqual([{ x: 3.5, y: 4.5 }]);
    expect(mirrorCentres('h', 16, 16, 3.5, 4.5)).toEqual([
      { x: 3.5, y: 4.5 },
      { x: 12.5, y: 4.5 },
    ]);
    expect(mirrorCentres('both', 16, 16, 3.5, 4.5)).toHaveLength(4);
  });
});
