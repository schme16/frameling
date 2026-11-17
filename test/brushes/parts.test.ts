// @vitest-environment jsdom
// What is changed on a brush part by part, what flashes, and the commands that put a part back. The marker is true to its
// word: a changed tip says so, and says so for the stick that came along with it.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import type { BrushSettings } from '../../src/core/format';
import { defaultTip } from '../../src/geometry/tip';
import { STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { flashFor, NONE_CHANGED, partsOf, readPicked, withStickOf, withTipOf, type Moment } from '../../src/brushes/parts';
import { currentFlash, FLASH_MS, showFlash } from '../../src/brushes/flash';
import { backToHowItCame, partsNow, resetStick, resetTip } from '../../src/brushes/partsActions';
import { patchTip, pickStick, pickTip, setTipKind } from '../../src/brushes/tips';

const S = (n: string) => STARTERS.find((s) => s.id === `starter:${n}`)!;
const pencil = S('sketch-pencil').brush; // a charcoal tip on the sketch pencil stick
const moment = (brush: BrushSettings, over: Partial<Moment> = {}): Moment => ({ id: 'starter:sketch-pencil', name: 'Sketch pencil', brush, paper: 'rough', ...over });

describe('partsOf', () => {
  it('says nothing is changed for a brush as it came, and for a brush that was never saved', () => {
    expect(partsOf(pencil, { ...pencil })).toEqual(NONE_CHANGED);
    expect(partsOf(undefined, { ...pencil, size: 99 })).toEqual(NONE_CHANGED);
  });
  it('marks the tip when it is another kind, and the stick that came along with it', () => {
    const live = { ...pencil, tip: defaultTip('chalk') };
    expect(partsOf(pencil, live)).toEqual({ changed: true, tip: true, stick: true, other: false });
  });
  it('marks only the stick when only the stick changed', () => {
    const live = { ...pencil, tip: { ...pencil.tip!, dry: 'soft-pencil' as const } };
    expect(partsOf(pencil, live)).toEqual({ changed: true, tip: false, stick: true, other: false });
  });
  it('marks a tweaked tip (same kind, other grain) as a changed tip', () => {
    const live = { ...pencil, tip: { ...pencil.tip!, grain: 2 } };
    expect(partsOf(pencil, live)).toMatchObject({ changed: true, tip: true, stick: false });
  });
  it('marks the rest when the size moves, and leaves the parts alone', () => {
    expect(partsOf(pencil, { ...pencil, size: pencil.size + 4 })).toEqual({ changed: true, tip: false, stick: false, other: true });
  });
});

describe('putting parts back', () => {
  const changed: BrushSettings = { ...pencil, size: 20, tip: defaultTip('chalk') };
  it('puts the tip back with its stick, and leaves the size', () => {
    const b = withTipOf(changed, pencil);
    expect(b.tip).toEqual(pencil.tip);
    expect(b.size).toBe(20);
  });
  it('puts only the stick back, and leaves the tip and the size', () => {
    const b = withStickOf(changed, pencil);
    expect(b.tip).toMatchObject({ kind: 'chalk', dry: 'sketch-pencil' });
    expect(b.size).toBe(20);
  });
  it('leaves a tip with no stick to put back alone', () => {
    const plain: BrushSettings = { ...DEFAULT_BRUSH, tip: defaultTip('watercolour') };
    expect(withStickOf(plain, pencil)).toBe(plain);
  });
});

describe('flashFor', () => {
  it('names the brush when another brush is picked', () => {
    expect(flashFor(moment(pencil), moment(S('ink').brush, { id: 'starter:ink', name: 'Ink' }))).toEqual({ parts: ['brush'], text: 'Brush: Ink' });
  });
  it('names both the tip and the stick when a tip brings its own stick', () => {
    expect(flashFor(moment(pencil), moment({ ...pencil, tip: defaultTip('chalk') }))).toEqual({ parts: ['tip', 'stick'], text: 'Tip: Chalk, Stick: Chalk' });
  });
  it('names only the tip when there is no stick on either side to change', () => {
    expect(flashFor(moment(pencil), moment({ ...pencil, tip: defaultTip('watercolour') }))).toEqual({ parts: ['tip'], text: 'Tip: Watercolour' });
  });
  it('names the stick when only it changed, and the paper when the sheet changed', () => {
    expect(flashFor(moment(pencil), moment({ ...pencil, tip: { ...pencil.tip!, dry: 'crayon' } }))).toEqual({ parts: ['stick'], text: 'Stick: Crayon' });
    expect(flashFor(moment(pencil), moment(pencil, { paper: 'smooth' }))).toEqual({ parts: ['paper'], text: 'Paper: Smooth' });
  });
  it('says nothing for a slider', () => {
    expect(flashFor(moment(pencil), moment({ ...pencil, size: 30 }))).toBeNull();
  });
});

describe('readPicked', () => {
  it('keeps a picked brush that is still in the library, and drops anything else', () => {
    expect(readPicked('starter:ink', ['starter:ink'])).toBe('starter:ink');
    expect(readPicked('starter:gone', ['starter:ink'])).toBeNull();
    expect(readPicked({ x: 1 }, ['starter:ink'])).toBeNull();
    expect(readPicked(null, [])).toBeNull();
  });
});

describe('in use', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetChoicesForTests();
    resetStore(newDoc());
    store().setUi({ brush: { ...DEFAULT_BRUSH } });
    P.applyPreset('starter:sketch-pencil');
  });
  it('a tip change marks the tip and the stick, and the command puts the tip back with its stick', () => {
    expect(partsNow().changed).toBe(false);
    pickTip('tip:chalk');
    expect(partsNow()).toMatchObject({ tip: true, stick: true });
    expect(resetTip()).toBe(true);
    expect(partsNow().changed).toBe(false);
    expect(store().get().ui.brush.tip).toMatchObject({ kind: 'charcoal', dry: 'sketch-pencil' });
  });
  it('a stick change marks only the stick, and putting it back leaves a changed size alone', () => {
    pickStick('stick:crayon');
    store().setUi((u) => ({ brush: { ...u.brush, size: 41 } }));
    expect(partsNow()).toMatchObject({ tip: false, stick: true, other: true });
    expect(resetStick()).toBe(true);
    expect(partsNow()).toMatchObject({ stick: false, other: true });
    expect(store().get().ui.brush.size).toBe(41);
  });
  it('Back to how it came puts everything back', () => {
    pickTip('tip:chalk');
    store().setUi((u) => ({ brush: { ...u.brush, size: 41 } }));
    expect(backToHowItCame()).toBe(true);
    expect(partsNow().changed).toBe(false);
    expect(store().get().ui.brush.size).toBe(S('sketch-pencil').brush.size);
  });
  it('says so and does nothing when there is nothing to put back', () => {
    expect(resetTip()).toBe(false);
    expect(backToHowItCame()).toBe(false);
  });
  it('shows nothing as changed when the brush is a saved one that saves every change itself', () => {
    store().setUi({ brush: { ...DEFAULT_BRUSH, size: 9 } });
    const mine = P.saveCurrentAs('Mine')!;
    setChoice('brushes.edits', 'follow');
    const stop = P.startBrushPresets();
    store().setUi((u) => ({ brush: { ...u.brush, size: 30, tip: defaultTip('chalk') } }));
    stop();
    expect(partsNow().changed).toBe(false);
    expect(P.myBrushes().find((p) => p.id === mine.id)!.brush.size).toBe(30);
  });
  it('a picked brush is remembered, so a changed brush is still changed after a restart', () => {
    expect(JSON.parse(localStorage.getItem('frameling.brushPicked')!)).toBe('starter:sketch-pencil');
  });
  it('has a command for each, greyed with a reason while the brush is as it comes', () => {
    for (const id of ['brush.backToHowItCame', 'brush.resetTip', 'brush.resetStick']) {
      const c = getCommand(id)!;
      expect(c.enabled!(store().get() as never)).toBe(false);
      expect(c.reason!(store().get() as never)).toBeTruthy();
    }
    pickTip('tip:chalk');
    expect(getCommand('brush.resetTip')!.enabled!(store().get() as never)).toBe(true);
    patchTip({ grain: 2 });
    setTipKind(null);
    expect(getCommand('brush.backToHowItCame')!.enabled!(store().get() as never)).toBe(true);
  });
});

describe('the flash', () => {
  it('shows a tag for a moment and puts it away again', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    showFlash({ parts: ['tip'], text: 'Tip: Chalk' });
    expect(currentFlash()).toMatchObject({ parts: ['tip'], text: 'Tip: Chalk' });
    vi.advanceTimersByTime(FLASH_MS + 10);
    expect(currentFlash().parts).toEqual([]);
    vi.useRealTimers();
  });
});
