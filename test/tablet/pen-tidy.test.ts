// @vitest-environment jsdom
// The stabilizer's start reaching tools whose saved settings predate it, without touching anyone's own number; and the
// pressure curve's Reset.
import { beforeEach, describe, expect, it } from 'vitest';
import { CURVE_PRESETS, isPlainCurve, presetOf } from '../../src/tablet/curve';
import { cleanPen, DEFAULT_PEN, DEFAULT_STABILIZER, getPen, PEN_TOOLS, resetPen, setPenDevice, setToolPen, stabilizerFor } from '../../src/tablet/settings';

/** What every save wrote before the flag existed: all six tools in full, at the old start of 0. */
const legacy = (over: Record<string, Record<string, unknown>> = {}) => ({
  pen: { curve: CURVE_PRESETS.normal, min: 0, max: 1, tiltAmount: 60, eraserEnd: true, barrel1: 'eyedropper', barrel2: 'pan', swapButtons: false },
  tools: Object.fromEntries(PEN_TOOLS.map((id) => [id, { size: false, opacity: false, flow: false, tilt: false, stabilizer: 0, stabMode: 'string', ...(over[id] ?? {}) }])),
  seen: true,
});

beforeEach(() => resetPen());

describe('stabilizerFor', () => {
  it('keeps a number the person set, including a 0 they chose', () => {
    expect(stabilizerFor(40, true)).toEqual({ stabilizer: 40, stabSet: true });
    expect(stabilizerFor(0, true)).toEqual({ stabilizer: 0, stabSet: true });
  });
  it('gives the start to a tool that was never touched, so a change to the start reaches it', () => {
    expect(stabilizerFor(0, false)).toEqual({ stabilizer: DEFAULT_STABILIZER, stabSet: false });
    expect(stabilizerFor(33, false)).toEqual({ stabilizer: DEFAULT_STABILIZER, stabSet: false });
  });
  it('settings saved before the flag: a 0 was only the old start, any other number was chosen', () => {
    expect(stabilizerFor(0, undefined)).toEqual({ stabilizer: DEFAULT_STABILIZER, stabSet: false });
    expect(stabilizerFor(35, undefined)).toEqual({ stabilizer: 35, stabSet: true });
    expect(stabilizerFor(250, undefined)).toEqual({ stabilizer: 100, stabSet: true });
  });
  it('anything missing or odd takes the start', () => {
    expect(stabilizerFor(undefined, undefined).stabilizer).toBe(DEFAULT_STABILIZER);
    expect(stabilizerFor('lots', true).stabilizer).toBe(DEFAULT_STABILIZER);
    expect(stabilizerFor(NaN, undefined).stabilizer).toBe(DEFAULT_STABILIZER);
  });
});

describe('saved settings from before the new start', () => {
  it('untouched tools (all at the old 0) come up at 12%, on', () => {
    const p = cleanPen(legacy());
    for (const id of PEN_TOOLS) expect(p.tools[id]).toMatchObject({ stabilizer: 12, stabSet: false });
  });
  it('a tool the person had already set keeps its number, and the others still take the start', () => {
    const p = cleanPen(legacy({ pencil: { stabilizer: 55 }, eraser: { stabilizer: 8 } }));
    expect(p.tools.pencil).toMatchObject({ stabilizer: 55, stabSet: true });
    expect(p.tools.eraser).toMatchObject({ stabilizer: 8, stabSet: true });
    expect(p.tools.brush.stabilizer).toBe(12);
    expect(p.tools.spray.stabilizer).toBe(12);
  });
  it('their other pen settings come through untouched', () => {
    const p = cleanPen(legacy({ brush: { size: true, tilt: true, stabMode: 'average' } }));
    expect(p.tools.brush).toMatchObject({ size: true, tilt: true, stabMode: 'average' });
    expect(p.pen.barrel1).toBe('eyedropper');
    expect(p.seen).toBe(true);
  });
  it('once saved again, a tool left alone stays at the start and a chosen 0 stays 0', () => {
    const first = cleanPen(legacy());
    const again = cleanPen(JSON.parse(JSON.stringify({ ...first, tools: { ...first.tools, dither: { ...first.tools.dither, stabilizer: 0, stabSet: true } } })));
    expect(again.tools.brush).toMatchObject({ stabilizer: 12, stabSet: false });
    expect(again.tools.dither).toMatchObject({ stabilizer: 0, stabSet: true });
  });
  it('a fresh start is still exactly the defaults', () => {
    expect(cleanPen(null)).toEqual(DEFAULT_PEN);
  });
});

describe('choosing a stabilizer', () => {
  it('the slider (or the command) makes the number theirs, even 0', () => {
    setToolPen('brush', { stabilizer: 0 });
    expect(getPen().tools.brush).toMatchObject({ stabilizer: 0, stabSet: true });
    setToolPen('pencil', { stabilizer: 30 });
    expect(getPen().tools.pencil).toMatchObject({ stabilizer: 30, stabSet: true });
  });
  it('changing something else on a tool leaves it unset', () => {
    setToolPen('shade', { size: true });
    expect(getPen().tools.shade).toMatchObject({ size: true, stabilizer: 12, stabSet: false });
  });
  it('Put the pen settings back puts every tool back to 12% on, not off', () => {
    for (const id of PEN_TOOLS) setToolPen(id, { stabilizer: 0 });
    resetPen();
    for (const id of PEN_TOOLS) expect(getPen().tools[id]).toMatchObject({ stabilizer: 12, stabSet: false });
  });
});

describe('Reset under the pressure curve', () => {
  it('only the straight line is plain', () => {
    expect(isPlainCurve(CURVE_PRESETS.normal)).toBe(true);
    expect(isPlainCurve(CURVE_PRESETS.soft)).toBe(false);
    expect(isPlainCurve(CURVE_PRESETS.firm)).toBe(false);
    expect(isPlainCurve({ x1: 0.75, y1: 0.08, x2: 0.2, y2: 0.9 })).toBe(false);
  });
  it('a nudge you could not see still counts as plain', () => {
    expect(isPlainCurve({ x1: 1 / 3 + 0.004, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 - 0.004 })).toBe(true);
    expect(isPlainCurve({ x1: 1 / 3 + 0.05, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 })).toBe(false);
  });
  it('puts the curve back and leaves the other pen settings alone', () => {
    setPenDevice({ curve: { x1: 0.75, y1: 0.08, x2: 0.2, y2: 0.9 }, min: 0.1, max: 0.8, tiltAmount: 30 });
    expect(isPlainCurve(getPen().pen.curve)).toBe(false);
    setPenDevice({ curve: CURVE_PRESETS.normal });
    const d = getPen().pen;
    expect(isPlainCurve(d.curve)).toBe(true);
    expect(presetOf(d.curve)).toBe('normal');
    expect(d).toMatchObject({ min: 0.1, max: 0.8, tiltAmount: 30 });
  });
});
