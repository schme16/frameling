// Brush tips: reading saved ones back, defaults, sameness, and the small helpers.
import { describe, expect, it } from 'vitest';
import type { BrushSettings } from '../../src/core/format';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { brushForLine, defaultTip, isGrainy, MAX_CUSTOM_POINTS, plainBrush, readCustom, readTip, resolveTip, sameTip, STAMPS, tipName, tipReach, TIPS } from '../../src/geometry/tip';
import { brushFrom } from '../../src/core/uiMemory';

describe('defaults', () => {
  it('every tip has a plain-words label and hint, and a default that reads back as itself', () => {
    for (const t of TIPS) {
      expect(t.label).toMatch(/^[A-Z]/);
      expect(t.hint.length).toBeGreaterThan(10);
      expect(t.hint).not.toContain('—');
      expect(readTip(defaultTip(t.id))).toEqual(defaultTip(t.id));
    }
  });
  it('fills every missing field from the kind', () => {
    const r = resolveTip({ kind: 'stamp' });
    expect(r.shape).toBe('leaf');
    expect(r.spacing).toBeGreaterThan(0);
    expect(r.custom).toEqual([]);
    expect(resolveTip({ kind: 'chalk' }).amount).toBeGreaterThan(0);
  });
  it('turns each built-in stamp the way it usually goes', () => {
    expect(STAMPS.find((s) => s.id === 'leaf')?.angle).toBe('follow');
    expect(STAMPS.find((s) => s.id === 'star')?.angle).toBe('random');
  });
});

describe('reading a tip back', () => {
  it('gives nothing for what is not a tip', () => {
    for (const bad of [null, undefined, 4, 'chalk', [], {}, { kind: 'neon' }, { kind: 3 }]) expect(readTip(bad)).toBeUndefined();
  });
  it('holds numbers to their range and drops fields of the wrong kind', () => {
    const t = readTip({ kind: 'chalk', amount: 7, grain: -4, shape: 'leaf', spacing: 'wide', extra: 1 });
    expect(t).toEqual({ kind: 'chalk', amount: 1, grain: 0.5 });
  });
  it('keeps the stamp fields only on a stamp', () => {
    expect(readTip({ kind: 'stamp', shape: 'star', spacing: 9, jitter: 0.5, angle: 'random', scatter: 5, seed: 12.4 })).toEqual({ kind: 'stamp', shape: 'star', spacing: 4, jitter: 0.5, angle: 'random', scatter: 2, seed: 12 });
    expect(readTip({ kind: 'watercolour', shape: 'star', spacing: 2 })).toEqual({ kind: 'watercolour' });
  });
  it('drops a custom shape that is not a list of outlines, and falls back from "custom" with none', () => {
    const t = readTip({ kind: 'stamp', shape: 'custom', custom: 'no' });
    expect(t).toEqual({ kind: 'stamp' });
    expect(readTip({ kind: 'stamp', shape: 'custom', custom: [[0, 0, 1, 0, 1, 1]] })).toMatchObject({ shape: 'custom', custom: [[0, 0, 1, 0, 1, 1]] });
  });
  it('limits custom outlines: points, rings, odd lengths, numbers', () => {
    expect(readCustom([[0, 0, 1]])).toBeUndefined();
    expect(readCustom([[0, 0, 1, 0]])).toBeUndefined();
    expect(readCustom([[0, 0, 1, 0, NaN, 1]])).toBeUndefined();
    const ring = (n: number) => Array.from({ length: n * 2 }, (_, i) => (i % 7) / 10);
    const many = readCustom([ring(60), ring(60)]);
    expect(many?.length).toBe(1);
    const total = (readCustom([ring(30), ring(30), ring(30), ring(30)]) ?? []).reduce((n, r) => n + r.length / 2, 0);
    expect(total).toBeLessThanOrEqual(MAX_CUSTOM_POINTS);
    expect(readCustom(Array.from({ length: 20 }, () => ring(3)))?.length).toBeLessThanOrEqual(8);
    expect(readCustom([[0.123456, 0, 1, 0, 1, 1]])?.[0][0]).toBe(0.123);
  });
});

describe('a brush with a tip', () => {
  const chalk: BrushSettings = { ...DEFAULT_BRUSH, tip: defaultTip('chalk') };
  it('is read back by brushFrom, and a brush without one stays plain', () => {
    expect(brushFrom({ ...DEFAULT_BRUSH, tip: { kind: 'charcoal', amount: 0.2 } }, DEFAULT_BRUSH)?.tip).toEqual({ kind: 'charcoal', amount: 0.2 });
    expect(brushFrom({ size: 5 }, DEFAULT_BRUSH)?.tip).toBeUndefined();
    expect('tip' in (brushFrom({ size: 5 }, DEFAULT_BRUSH) ?? {})).toBe(false);
  });
  it('keeps the brush in use tip when an older saved brush has no tip field, but a bad tip makes it plain', () => {
    expect(brushFrom({ size: 5 }, chalk)?.tip).toEqual(chalk.tip);
    expect(brushFrom({ size: 5, tip: 'garbage' }, chalk)?.tip).toBeUndefined();
  });
  it('compares by tip, ignoring the seed and fields left at their default', () => {
    expect(sameTip(undefined, undefined)).toBe(true);
    expect(sameTip(undefined, defaultTip('chalk'))).toBe(false);
    expect(sameTip({ kind: 'chalk' }, { kind: 'chalk', amount: 0.6, grain: 1 })).toBe(true);
    expect(sameTip({ kind: 'chalk' }, { kind: 'charcoal' })).toBe(false);
    expect(sameTip({ kind: 'stamp', seed: 1 }, { kind: 'stamp', seed: 99 })).toBe(true);
    expect(sameTip({ kind: 'stamp', shape: 'star' }, { kind: 'stamp', shape: 'dot' })).toBe(false);
    expect(sameTip({ kind: 'stamp', shape: 'custom', custom: [[0, 0, 1, 0, 1, 1]] }, { kind: 'stamp', shape: 'custom', custom: [[0, 0, 1, 0, 1, 2]] })).toBe(false);
  });
  it('gets a seed on a drawn line only when it is a stamp without one', () => {
    expect(brushForLine(chalk, 5)).toBe(chalk);
    const st: BrushSettings = { ...DEFAULT_BRUSH, tip: defaultTip('stamp') };
    expect(brushForLine(st, 5).tip?.seed).toBe(5);
    expect(brushForLine(brushForLine(st, 5), 9).tip?.seed).toBe(5);
    expect(brushForLine(DEFAULT_BRUSH, 5)).toBe(DEFAULT_BRUSH);
  });
  it('can be made plain, and says what is grainy', () => {
    expect('tip' in plainBrush(chalk)).toBe(false);
    expect(plainBrush(DEFAULT_BRUSH)).toBe(DEFAULT_BRUSH);
    expect(isGrainy(chalk)).toBe(true);
    expect(isGrainy({ ...chalk, tip: defaultTip('watercolour') })).toBe(false);
    expect(isGrainy({ ...chalk, tip: defaultTip('stamp') })).toBe(false);
    expect(isGrainy(DEFAULT_BRUSH)).toBe(false);
  });
  it('reaches past the outline for stamps that wander, not at all for a plain line', () => {
    expect(tipReach(DEFAULT_BRUSH)).toBe(0);
    expect(tipReach({ ...DEFAULT_BRUSH, tip: { kind: 'stamp', scatter: 1 } })).toBeGreaterThan(tipReach({ ...DEFAULT_BRUSH, tip: { kind: 'stamp', scatter: 0 } }));
  });
  it('has a plain name', () => {
    expect(tipName(undefined)).toBe('Plain');
    expect(tipName(defaultTip('watercolour'))).toBe('Watercolour');
    expect(tipName({ kind: 'stamp', shape: 'star' })).toBe('Star stamp');
    expect(tipName({ kind: 'stamp', shape: 'paw' })).toBe('Paw print stamp');
    expect(readTip({ kind: 'stamp', shape: 'paw' })).toMatchObject({ shape: 'paw' });
    expect(tipName({ kind: 'stamp', shape: 'custom', custom: [[0, 0, 1, 0, 1, 1]] })).toBe('Your stamp');
  });
});
