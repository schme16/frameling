import { describe, expect, it } from 'vitest';
import { CURVE_PRESETS, cleanCurve, cleanRange, curveAt, mapPressure, presetOf } from '../../src/tablet/curve';
import { altitudeOf, azimuthOf, leanOf } from '../../src/tablet/tilt';
import { CATCH_UP_STEPS, Stabilizer, ropeLength, windowSize } from '../../src/tablet/stabilizer';
import { meaningOfPress, penPress, type PenButtonSettings } from '../../src/tablet/buttons';
import { penFields } from '../../src/tablet/input';
import { cleanPen, DEFAULT_PEN } from '../../src/tablet/settings';
import { pinchView, PenTracker, PALM_GRACE_MS } from '../../src/tablet/touch';
import { curveWithHandle, handleSpots } from '../../src/tablet/CurveEditor';

describe('pressure curve', () => {
  it('normal is a straight line, soft is above it and firm is below it', () => {
    for (const t of [0.1, 0.3, 0.5, 0.8]) expect(curveAt(CURVE_PRESETS.normal, t)).toBeCloseTo(t, 2);
    expect(curveAt(CURVE_PRESETS.soft, 0.3)).toBeGreaterThan(0.4);
    expect(curveAt(CURVE_PRESETS.firm, 0.5)).toBeLessThan(0.4);
    for (const p of Object.values(CURVE_PRESETS)) {
      expect(curveAt(p, 0)).toBe(0);
      expect(curveAt(p, 1)).toBe(1);
      let prev = 0;
      for (let i = 0; i <= 20; i++) {
        const v = curveAt(p, i / 20);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });
  it('minimum and maximum make a dead zone and a full zone', () => {
    const shape = { curve: CURVE_PRESETS.normal, min: 0.2, max: 0.8 };
    expect(mapPressure(0.1, shape)).toBe(0);
    expect(mapPressure(0.2, shape)).toBe(0);
    expect(mapPressure(0.5, shape)).toBeCloseTo(0.5, 2);
    expect(mapPressure(0.8, shape)).toBe(1);
    expect(mapPressure(0.95, shape)).toBe(1);
  });
  it('cleans odd input and names presets', () => {
    expect(cleanCurve({ x1: 5, y1: -1, x2: NaN })).toEqual({ x1: 1, y1: 0, x2: CURVE_PRESETS.normal.x2, y2: CURVE_PRESETS.normal.y2 });
    const r = cleanRange(0.9, 0.1);
    expect(r.max - r.min).toBeGreaterThanOrEqual(0.0999);
    expect(presetOf(CURVE_PRESETS.soft)).toBe('soft');
    expect(presetOf({ x1: 0, y1: 1, x2: 1, y2: 0 })).toBe('custom');
  });
  it('handles sit on the graph and drag back into curve space', () => {
    const c = CURVE_PRESETS.normal;
    const spots = handleSpots(c, 0.2, 0.8);
    expect(spots[0].x).toBeCloseTo(0.2 + 0.6 / 3, 5);
    const moved = curveWithHandle(c, 0, spots[0].x, 0.9, 0.2, 0.8);
    expect(moved.x1).toBeCloseTo(c.x1, 5);
    expect(moved.y1).toBeCloseTo(0.9, 5);
  });
});

describe('tilt', () => {
  it('upright is straight up, flat is zero, and lean grows', () => {
    expect(altitudeOf(0, 0)).toBeCloseTo(Math.PI / 2);
    expect(altitudeOf(80, 0)).toBeLessThan(0.3);
    expect(leanOf(0, 0)).toBe(0);
    expect(leanOf(60, 0)).toBeGreaterThan(leanOf(20, 0));
    expect(leanOf(89, 89)).toBeGreaterThan(0.9);
  });
  it('azimuth points where the pen leans', () => {
    expect(azimuthOf(40, 0)).toBeCloseTo(0);
    expect(azimuthOf(0, 40)).toBeCloseTo(Math.PI / 2);
    expect(azimuthOf(-40, 0)).toBeCloseTo(Math.PI);
  });
});

describe('stabilizer', () => {
  it('pull string leaves the brush put while the pointer wanders inside the rope', () => {
    const s = new Stabilizer('string', 50, 1);
    s.start({ x: 0, y: 0, pressure: 0.5 });
    const rope = ropeLength(50, 1);
    const a = s.push({ x: rope / 2, y: 0, pressure: 0.5 });
    expect(a.x).toBe(0);
    const b = s.push({ x: rope * 3, y: 0, pressure: 0.5 });
    expect(b.x).toBeCloseTo(rope * 2, 5);
  });
  it('the rope is the same on screen at any zoom', () => {
    expect(ropeLength(100, 2) * 2).toBeCloseTo(ropeLength(100, 1), 5);
  });
  it('average lags behind, more with a higher amount', () => {
    const run = (amount: number) => {
      const s = new Stabilizer('average', amount, 1);
      s.start({ x: 0, y: 0, pressure: 1 });
      let last = { x: 0, y: 0, pressure: 1 };
      for (let i = 1; i <= 20; i++) last = s.push({ x: i * 10, y: 0, pressure: 1 });
      return last.x;
    };
    expect(run(10)).toBeGreaterThan(run(90));
    expect(run(90)).toBeGreaterThan(0);
    expect(windowSize(0)).toBe(1);
  });
  it('catches up to where the pen lifted, in steps ending exactly there', () => {
    const s = new Stabilizer('string', 80, 1);
    s.start({ x: 0, y: 0, pressure: 0.5 });
    s.push({ x: 100, y: 0, pressure: 0.5 });
    const end = s.finish({ x: 100, y: 0, pressure: 0.5 });
    expect(end).toHaveLength(CATCH_UP_STEPS);
    expect(end[end.length - 1]).toEqual({ x: 100, y: 0, pressure: 0.5 });
  });
  it('off does nothing', () => {
    const s = new Stabilizer('string', 0, 1);
    s.start({ x: 1, y: 1, pressure: 0.5 });
    expect(s.push({ x: 7, y: 9, pressure: 0.2 })).toEqual({ x: 7, y: 9, pressure: 0.2 });
  });
});

describe('pen presses', () => {
  const settings: PenButtonSettings = { eraserEnd: true, barrel1: 'eyedropper', barrel2: 'pan' };
  const down = (o: { button?: number; buttons?: number }) => ({ pointerType: 'pen', button: 0, buttons: 1, ...o });
  it('reads the eraser end and both barrel buttons, by button or by what is held', () => {
    expect(penPress(down({ button: 5, buttons: 32 })).eraser).toBe(true);
    expect(penPress(down({ buttons: 33 })).eraser).toBe(true);
    expect(penPress(down({ button: 2, buttons: 2 })).barrel1).toBe(true);
    expect(penPress(down({ buttons: 3 })).barrel1).toBe(true);
    expect(penPress(down({ button: 1, buttons: 4 })).barrel2).toBe(true);
    expect(penPress({ pointerType: 'mouse', button: 2, buttons: 2 })).toEqual({ eraser: false, barrel1: false, barrel2: false });
  });
  it('the defaults: tip draws, eraser end erases, button 1 picks, button 2 pans', () => {
    expect(meaningOfPress(down({}), settings)).toEqual({ button: 0, eraser: false, pick: false });
    expect(meaningOfPress(down({ button: 5, buttons: 32 }), settings).eraser).toBe(true);
    expect(meaningOfPress(down({ buttons: 3 }), settings).pick).toBe(true);
    expect(meaningOfPress(down({ button: 1, buttons: 4 }), settings).button).toBe(1);
  });
  it('can be remapped or switched off', () => {
    expect(meaningOfPress(down({ buttons: 3 }), { ...settings, barrel1: 'back' }).button).toBe(2);
    expect(meaningOfPress(down({ buttons: 3 }), { ...settings, barrel1: 'eraser' }).eraser).toBe(true);
    expect(meaningOfPress(down({ buttons: 3 }), { ...settings, barrel1: 'none' })).toEqual({ button: 0, eraser: false, pick: false });
    expect(meaningOfPress(down({ button: 5, buttons: 32 }), { ...settings, eraserEnd: false }).eraser).toBe(false);
  });
});

describe('pointer fields', () => {
  it('a mouse and a finger have no pressure', () => {
    expect(penFields({ pointerType: 'mouse', pressure: 0.5, buttons: 1 }, DEFAULT_PEN.pen)).toEqual({ pressure: 0.5, hasPressure: false });
    expect(penFields({ pointerType: 'touch', pressure: 1, buttons: 1 }, DEFAULT_PEN.pen).hasPressure).toBe(false);
  });
  it('a pen runs through the curve and brings tilt and twist', () => {
    const f = penFields({ pointerType: 'pen', pressure: 0.25, buttons: 1, tiltX: 20, tiltY: -10, twist: 90 }, { ...DEFAULT_PEN.pen, curve: CURVE_PRESETS.soft });
    expect(f.hasPressure).toBe(true);
    expect(f.pressure).toBeGreaterThan(0.25);
    expect([f.tiltX, f.tiltY, f.twist]).toEqual([20, -10, 90]);
  });
  it('a zero first sample while pressed counts as a medium touch, hovering stays zero', () => {
    expect(penFields({ pointerType: 'pen', pressure: 0, buttons: 1 }, DEFAULT_PEN.pen).pressure).toBeCloseTo(0.5, 1);
    expect(penFields({ pointerType: 'pen', pressure: 0, buttons: 0 }, DEFAULT_PEN.pen).pressure).toBe(0);
  });
});

describe('saved settings', () => {
  it('fall back to the defaults when missing or broken', () => {
    expect(cleanPen(null)).toEqual(DEFAULT_PEN);
    const p = cleanPen({ pen: { barrel1: 'dance', min: 9, tiltAmount: -5 }, touch: { oneFinger: 'kick' }, tools: { brush: { stabilizer: 400, stabMode: 'nope' } } });
    expect(p.pen.barrel1).toBe(DEFAULT_PEN.pen.barrel1);
    expect(p.pen.min).toBeLessThanOrEqual(0.5);
    expect(p.pen.tiltAmount).toBe(0);
    expect(p.touch.oneFinger).toBe('draw');
    expect(p.tools.brush.stabilizer).toBe(100);
    expect(p.tools.brush.stabMode).toBe('string');
  });
  it('keeps what is valid', () => {
    const p = cleanPen({ pen: { barrel2: 'eraser', eraserEnd: false }, touch: { oneFinger: 'pan', palmRejection: false }, tools: { pencil: { size: true, stabilizer: 30, stabMode: 'average' } }, seen: true });
    expect(p.pen.barrel2).toBe('eraser');
    expect(p.pen.eraserEnd).toBe(false);
    expect(p.touch.oneFinger).toBe('pan');
    expect(p.touch.palmRejection).toBe(false);
    expect(p.tools.pencil).toMatchObject({ size: true, stabilizer: 30, stabMode: 'average' });
    expect(p.seen).toBe(true);
  });
});

describe('touch', () => {
  it('a pen near the screen makes fingers count as palms, until a moment after it leaves', () => {
    const t = new PenTracker();
    expect(t.rejectsTouch(0)).toBe(false);
    t.seen(1000);
    expect(t.rejectsTouch(1500)).toBe(true);
    t.left(2000);
    expect(t.rejectsTouch(2000 + PALM_GRACE_MS - 1)).toBe(true);
    expect(t.rejectsTouch(2000 + PALM_GRACE_MS + 1)).toBe(false);
    t.down(5000);
    expect(t.rejectsTouch(9000)).toBe(true);
  });
  it('two fingers pan with their middle and zoom with their spread, keeping the point between them still', () => {
    const view = { zoom: 1, panX: 0, panY: 0 };
    const start = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, view };
    const same = pinchView(start, start.a, start.b);
    expect(same).toEqual(view);
    const panned = pinchView(start, { x: 130, y: 120 }, { x: 230, y: 120 });
    expect(panned).toMatchObject({ zoom: 1, panX: 30, panY: 20 });
    const zoomed = pinchView(start, { x: 50, y: 100 }, { x: 250, y: 100 });
    expect(zoomed.zoom).toBeCloseTo(2);
    // The document point that was under the middle (150, 100) is still under the middle.
    expect(zoomed.panX + 150 * 2).toBeCloseTo(150 + 0, 5);
  });
});
