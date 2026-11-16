// Curves and Levels as pure functions: the curve through its points (no overshoot, ends held, endpoints kept), the levels table,
// the two together per colour, the histogram and the automatic points.
import { describe, expect, it } from 'vitest';
import {
  addPoint, applyLuts, autoPoints, cleanCurve, cleanLevels, curveLut, CURVE_PRESETS, evalCurve, gammaFromHandle, gammaHandleAt, histograms, isNeutralTone, isStraight, levelsLut, levelsOf,
  MAX_POINTS, movePoint, neutralLevels, neutralTone, pointNear, removePoint, straightCurve, toneLuts, whatChanged, withBlack, withGamma, withWhite, type Curve,
} from '../../src/tone/maths';

const curve = (...p: [number, number][]): Curve => p.map(([x, y]) => ({ x, y }));

describe('a curve', () => {
  it('through two points at the corners is the straight line, so it changes nothing', () => {
    const lut = curveLut(straightCurve());
    for (let i = 0; i < 256; i++) expect(lut[i]).toBe(i);
    expect(isStraight(straightCurve())).toBe(true);
  });

  it('goes through every point it was given', () => {
    const c = curve([0, 0], [64, 30], [128, 140], [200, 210], [255, 255]);
    for (const p of c) expect(evalCurve(c, p.x)).toBeCloseTo(p.y, 6);
  });

  it('never goes above its highest point or below its lowest between two of them', () => {
    // A sharp bend: a plain spline would overshoot past 100 here, a monotone one does not.
    const c = curve([0, 0], [100, 100], [110, 100], [255, 255]);
    for (let x = 0; x <= 255; x++) {
      const y = evalCurve(c, x);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(255 + 1e-9);
    }
    // Between two points at the same height it stays at that height.
    for (let x = 100; x <= 110; x++) expect(evalCurve(c, x)).toBeCloseTo(100, 6);
  });

  it('only rises where the points rise', () => {
    const c = curve([0, 0], [60, 20], [130, 150], [190, 200], [255, 255]);
    let last = -1;
    for (let x = 0; x <= 255; x++) {
      const y = evalCurve(c, x);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      last = y;
    }
  });

  it('makes a lighter picture from a point pulled up and a darker one from a point pushed down', () => {
    expect(curveLut(curve([0, 0], [128, 180], [255, 255]))[128]).toBe(180);
    expect(curveLut(curve([0, 0], [128, 70], [255, 255]))[128]).toBe(70);
    expect(curveLut(curve([0, 0], [128, 180], [255, 255]))[0]).toBe(0);
    expect(curveLut(curve([0, 0], [128, 180], [255, 255]))[255]).toBe(255);
  });

  it('can be flipped end to end, for a negative', () => {
    const lut = curveLut(curve([0, 255], [255, 0]));
    expect(lut[0]).toBe(255);
    expect(lut[255]).toBe(0);
    expect(lut[100]).toBe(155);
  });

  it('lifts the black end and pulls down the white end, for a faded look', () => {
    const lut = curveLut(curve([0, 40], [255, 215]));
    expect(lut[0]).toBe(40);
    expect(lut[255]).toBe(215);
  });

  it('every ready made one starts at the left edge and ends at the right and stays in range', () => {
    for (const p of CURVE_PRESETS) {
      expect(p.curve[0].x).toBe(0);
      expect(p.curve[p.curve.length - 1].x).toBe(255);
      const lut = curveLut(p.curve);
      expect(lut.length).toBe(256);
    }
  });

  it('the S shape makes the darks darker and the lights lighter', () => {
    const lut = curveLut(CURVE_PRESETS.find((p) => p.id === 'contrast')!.curve);
    expect(lut[64]).toBeLessThan(64);
    expect(lut[192]).toBeGreaterThan(192);
  });
});

describe('dragging points', () => {
  const c = curve([0, 0], [100, 120], [255, 255]);

  it('adds a point where you click, in order from left to right', () => {
    const r = addPoint(c, 50, 70);
    expect(r.curve.map((p) => p.x)).toEqual([0, 50, 100, 255]);
    expect(r.index).toBe(1);
    expect(r.curve[1].y).toBe(70);
  });

  it('picks up the point that is already there instead of putting one next to it', () => {
    const r = addPoint(c, 101, 10);
    expect(r.curve).toBe(c);
    expect(r.index).toBe(1);
  });

  it('keeps at most sixteen points', () => {
    let k = straightCurve();
    for (let i = 1; i <= 30; i++) k = addPoint(k, i * 8, i * 8).curve;
    expect(k.length).toBe(MAX_POINTS);
    expect(addPoint(k, 3, 3).index).toBe(-1);
  });

  it('keeps a point between its neighbours', () => {
    const k = movePoint(c, 1, 400, 120);
    expect(k[1].x).toBeLessThan(255);
    const j = movePoint(c, 1, -20, 120);
    expect(j[1].x).toBeGreaterThan(0);
  });

  it('keeps the two ends at the two edges, free only to go up and down', () => {
    const k = movePoint(c, 0, 80, 40);
    expect(k[0]).toEqual({ x: 0, y: 40 });
    const j = movePoint(c, 2, 10, 300);
    expect(j[2]).toEqual({ x: 255, y: 255 });
    expect(movePoint(c, 2, 255, -5)[2].y).toBe(0);
  });

  it('removes a middle point and never an end', () => {
    expect(removePoint(c, 1).length).toBe(2);
    expect(removePoint(c, 0)).toBe(c);
    expect(removePoint(c, 2)).toBe(c);
  });

  it('finds the point near a click, and nothing when the click is far from any', () => {
    expect(pointNear(c, 104, 118, 10)).toBe(1);
    expect(pointNear(c, 180, 20, 10)).toBe(-1);
  });
});

describe('a curve read from anywhere', () => {
  it('is the straight line for anything that is not a list of points', () => {
    expect(cleanCurve(undefined)).toEqual(straightCurve());
    expect(cleanCurve('nope')).toEqual(straightCurve());
    expect(cleanCurve([])).toEqual(straightCurve());
  });

  it('is sorted, held in range, and given its two ends', () => {
    const k = cleanCurve([{ x: 200, y: 300 }, { x: 50, y: -4 }, { x: 'a', y: 1 }, null]);
    expect(k[0]).toEqual({ x: 0, y: 0 });
    expect(k[k.length - 1]).toEqual({ x: 255, y: 255 });
    expect(k.map((p) => p.x)).toEqual([0, 50, 200, 255]);
    expect(k[1].y).toBe(0);
    expect(k[2].y).toBe(255);
  });

  it('drops points that sit on top of each other and caps the number', () => {
    const k = cleanCurve([{ x: 100, y: 100 }, { x: 101, y: 150 }, { x: 100, y: 90 }]);
    expect(k.length).toBe(3);
    const many = cleanCurve(Array.from({ length: 80 }, (_, i) => ({ x: i * 3, y: i })));
    expect(many.length).toBeLessThanOrEqual(MAX_POINTS);
  });
});

describe('levels', () => {
  it('with nothing changed leaves every brightness as it was', () => {
    const lut = levelsLut(neutralLevels());
    for (let i = 0; i < 256; i++) expect(lut[i]).toBe(i);
  });

  it('turns the darkest point and below to black and the lightest and above to white', () => {
    const lut = levelsLut({ black: 40, white: 200, gamma: 1 });
    expect(lut[0]).toBe(0);
    expect(lut[40]).toBe(0);
    expect(lut[200]).toBe(255);
    expect(lut[255]).toBe(255);
    expect(lut[120]).toBe(128);
  });

  it('brightens the middle for a gamma over 1 and darkens it for one under, leaving the ends alone', () => {
    const light = levelsLut({ black: 0, white: 255, gamma: 2 });
    const dark = levelsLut({ black: 0, white: 255, gamma: 0.5 });
    expect(light[128]).toBeGreaterThan(128);
    expect(dark[128]).toBeLessThan(128);
    expect(light[0]).toBe(0);
    expect(light[255]).toBe(255);
    expect(dark[255]).toBe(255);
  });

  it('puts half grey where the midtone handle says', () => {
    const l = { black: 20, white: 220, gamma: 1.8 };
    const x = gammaHandleAt(l);
    expect(levelsOf(l, x)).toBeCloseTo(127.5, 3);
    expect(gammaFromHandle(l, x)).toBeCloseTo(1.8, 3);
  });

  it('keeps the handles apart, so there is always a range to stretch', () => {
    const l = neutralLevels();
    const b = withBlack(l, 300);
    expect(b.white - b.black).toBeGreaterThanOrEqual(2);
    const w = withWhite(l, -5);
    expect(w.white - w.black).toBeGreaterThanOrEqual(2);
    expect(withGamma(l, 99).gamma).toBeLessThan(10);
    expect(withGamma(l, 0).gamma).toBeGreaterThanOrEqual(0.1);
    expect(cleanLevels({ black: 200, white: 100 }).white - cleanLevels({ black: 200, white: 100 }).black).toBeGreaterThanOrEqual(2);
  });
});

describe('the two together, colour by colour', () => {
  it('a neutral tone changes nothing', () => {
    const t = neutralTone();
    expect(isNeutralTone(t)).toBe(true);
    const px = new Uint8ClampedArray([10, 100, 250, 255, 0, 0, 0, 0]);
    expect(Array.from(applyLuts(px, toneLuts(t)))).toEqual(Array.from(px));
  });

  it('a change to all colours moves red, green and blue alike', () => {
    const t = neutralTone();
    t.levels.all = { black: 50, white: 255, gamma: 1 };
    const luts = toneLuts(t);
    expect(luts[0][50]).toBe(0);
    expect(luts[1][50]).toBe(0);
    expect(luts[2][50]).toBe(0);
    expect(luts[0][200]).toBe(luts[2][200]);
  });

  it('a change to one colour moves that colour alone, which is how a colour cast is fixed', () => {
    const t = neutralTone();
    t.curves.r = curve([0, 0], [128, 90], [255, 255]);
    const [r, g, b] = toneLuts(t);
    expect(r[128]).toBe(90);
    expect(g[128]).toBe(128);
    expect(b[128]).toBe(128);
  });

  it('levels come before the curve', () => {
    const t = neutralTone();
    t.levels.all = { black: 100, white: 255, gamma: 1 };
    t.curves.all = curve([0, 0], [128, 200], [255, 255]);
    const [r] = toneLuts(t);
    // 100 is black after the levels, and the curve keeps black at black.
    expect(r[100]).toBe(0);
    const lv = levelsLut(t.levels.all);
    const cv = curveLut(t.curves.all);
    for (const i of [0, 100, 150, 200, 255]) expect(r[i]).toBe(cv[lv[i]]);
  });

  it('leaves see-through pixels as they were and keeps every pixel its own see-through', () => {
    const t = neutralTone();
    t.curves.all = curve([0, 255], [255, 0]);
    const px = new Uint8ClampedArray([10, 20, 30, 0, 100, 100, 100, 128]);
    const out = applyLuts(px, toneLuts(t));
    expect(Array.from(out.slice(0, 4))).toEqual([10, 20, 30, 0]);
    expect(Array.from(out.slice(4, 8))).toEqual([155, 155, 155, 128]);
  });

  it('says which of the two were changed, for the name of the undo step', () => {
    const t = neutralTone();
    expect(whatChanged(t)).toEqual({ levels: false, curves: false });
    t.levels.g = { black: 10, white: 255, gamma: 1 };
    expect(whatChanged(t)).toEqual({ levels: true, curves: false });
    t.curves.all = curve([0, 0], [128, 160], [255, 255]);
    expect(whatChanged(t)).toEqual({ levels: true, curves: true });
  });
});

describe('the histogram and the automatic points', () => {
  const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 100, 100, 100, 255, 100, 100, 100, 0]);

  it('counts every pixel by its brightness and leaves out the empty ones', () => {
    const h = histograms(px);
    expect(h.all[0]).toBe(1);
    expect(h.all[255]).toBe(1);
    expect(h.all[100]).toBe(1);
    expect(h.r.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('counts only the selected pixels when there is a selection', () => {
    const h = histograms(px, [1, 0, 0, 0]);
    expect(h.all.reduce((a, b) => a + b, 0)).toBe(1);
    expect(h.all[0]).toBe(1);
  });

  it('weights green most for the light the eye sees', () => {
    const h = histograms(new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 255]));
    expect(h.all[Math.round(0.7152 * 255)]).toBe(1);
    expect(h.all[Math.round(0.0722 * 255)]).toBe(1);
  });

  it('finds the black and white points of a flat picture, so stretching it uses the whole range', () => {
    const hist = new Uint32Array(256);
    for (let i = 90; i <= 170; i++) hist[i] = 10;
    expect(autoPoints(hist)).toEqual({ black: 90, white: 170 });
  });

  it('ignores a few stray pixels, so one dust speck does not stop it', () => {
    const hist = new Uint32Array(256);
    for (let i = 90; i <= 170; i++) hist[i] = 1000;
    hist[0] = 2;
    hist[255] = 2;
    const p = autoPoints(hist)!;
    expect(p.black).toBe(90);
    expect(p.white).toBe(170);
  });

  it('has nothing to say for a picture with nothing in it or only one tone', () => {
    expect(autoPoints(new Uint32Array(256))).toBeNull();
    const one = new Uint32Array(256);
    one[100] = 500;
    expect(autoPoints(one)).toBeNull();
  });
});
