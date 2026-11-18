// @vitest-environment jsdom
// The pixel brush in use as one thing: reading it from whichever tool you are on, and putting a saved one back.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { getDry, resetDry, setPaper } from '../../src/dry/settings';
import { getSoft, resetSoft } from '../../src/soft/settings';
import { applySpec, currentSpec, isApplying, isPixelBrushTool, putSpec, subscribeSpecs } from '../../src/dab/live';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { cleanSpec } from '../../src/dab/spec';
import { getDab, resetDab, setDab } from '../../src/dab/settings';
import { DEFAULT_TOOL_SETTINGS, getToolSettings } from '../../src/tools/settings';
import { PAPER_SAVED_CHOICE } from '../../src/dry/choices';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import '../../src/dab';

beforeEach(() => {
  resetStore(newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } }));
  resetDab();
  resetSoft();
  resetDry();
});

describe('which tools hold a pixel brush', () => {
  it('are the pixel brush, the five soft paint tools and chalk and charcoal, and nothing else', () => {
    for (const t of ['pixel-brush', 'charcoal', 'airbrush', 'soft-brush', 'soft-eraser', 'highlighter', 'smudge']) expect(isPixelBrushTool(t), t).toBe(true);
    for (const t of ['brush', 'pencil', 'eraser', 'fill', 'spray']) expect(isPixelBrushTool(t), t).toBe(false);
    expect(currentSpec('pencil')).toBeNull();
  });
});

describe('reading the brush in use', () => {
  it('gives the dab brush, a soft tool with its settings, or the dry medium with its paper', () => {
    expect(currentSpec('pixel-brush')).toEqual({ kind: 'dab', dab: DEFAULT_DAB });
    expect(currentSpec('airbrush')).toMatchObject({ kind: 'soft', tool: 'airbrush', size: getSoft().tools.airbrush.size });
    expect(currentSpec('charcoal')).toMatchObject({ kind: 'dry', medium: getDry().medium, paper: getDry().paper });
  });
});

describe('putting a saved brush back', () => {
  it('writes a dab brush, picks its tool, and leaves the others as they were', () => {
    const was = getSoft();
    store().setUi({ tool: 'select' });
    applySpec({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 22, spacing: 1 } });
    expect(getDab()).toMatchObject({ size: 22, spacing: 1 });
    expect(store().get().ui.tool).toBe('pixel-brush');
    expect(getSoft()).toBe(was);
  });

  it('keeps the plain Brush on a pixel layer for a pixel brush, and still picks a soft tool or chalk', () => {
    store().setUi({ tool: 'brush' });
    applySpec({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 5 } });
    expect(getDab().size).toBe(5);
    expect(store().get().ui.tool).toBe('brush');
    applySpec({ kind: 'soft', tool: 'airbrush', size: 12, hardness: 0.5, flow: 0.5 });
    expect(store().get().ui.tool).toBe('airbrush');
  });

  it('puts a soft tool\'s size, hardness and flow back on that tool and picks it', () => {
    applySpec({ kind: 'soft', tool: 'highlighter', size: 33, hardness: 0.2, flow: 0.5 });
    expect(getSoft().tools.highlighter).toEqual({ size: 33, hardness: 0.2, flow: 0.5 });
    expect(store().get().ui.tool).toBe('highlighter');
  });

  it('puts a dry medium back with its paper, and only that medium\'s settings', () => {
    const before = getDry().tools.chalk;
    applySpec({ kind: 'dry', medium: 'crayon', paper: 'laid', size: 40, hardness: 0.1, press: 0.4 });
    expect(getDry()).toMatchObject({ medium: 'crayon', paper: 'laid' });
    expect(getDry().tools.crayon).toEqual({ size: 40, hardness: 0.1, press: 0.4 });
    expect(getDry().tools.chalk).toEqual(before);
    expect(store().get().ui.tool).toBe('charcoal');
  });

  it('a brush saved on another paper moves the sheet to it by default, and leaves the sheet when the answer is to keep it', () => {
    applySpec({ kind: 'dry', medium: 'chalk', paper: 'rough', size: 10, hardness: 0.3, press: 0.5 });
    expect(getDry().paper).toBe('rough');
    setChoice(PAPER_SAVED_CHOICE, 'keep');
    applySpec({ kind: 'dry', medium: 'chalk', paper: 'fine', size: 10, hardness: 0.3, press: 0.5 });
    expect(getDry().paper).toBe('rough');
    _resetChoicesForTests();
  });

  it('a dry brush saved with no paper never moves the sheet', () => {
    setPaper('laid');
    applySpec({ kind: 'dry', medium: 'chalk', size: 10, hardness: 0.3, press: 0.5 });
    expect(getDry().paper).toBe('laid');
  });

  it('says it is putting one back while it does, so a half-written brush is not mistaken for a change', () => {
    const seen: boolean[] = [];
    const off = subscribeSpecs(() => seen.push(isApplying()));
    applySpec({ kind: 'dry', medium: 'chalk', paper: 'fine', size: 10, hardness: 0.3, press: 0.5 });
    putSpec({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 4 } });
    off();
    expect(seen.length).toBeGreaterThan(2);
    expect(seen.slice(0, -1).every(Boolean)).toBe(true);
    expect(seen.at(-1)).toBe(false);
    expect(isApplying()).toBe(false);
  });

  it('can change the size alone without picking a tool', () => {
    store().setUi({ tool: 'pencil' });
    putSpec({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 50 } });
    expect(getDab().size).toBe(50);
    expect(store().get().ui.tool).toBe('pencil');
  });
});

describe('the pixel brush settings', () => {
  it('keep every number in range and fall back to round when a picture tip has no picture', () => {
    setDab({ size: 5000, spacing: 0, tip: 'picture', hardness: 0.5 });
    expect(getDab()).toMatchObject({ size: 300, spacing: 0.01, tip: 'round' });
  });

  it('let a plain hard brush be as wide as a big canvas, as the plain Brush always could be', () => {
    setDab({ size: 5000, spacing: 0.25, tip: 'square', hardness: 1 });
    expect(getDab()).toMatchObject({ size: 5000, tip: 'square' });
    // Soften it and it is held to the usual limit.
    setDab({ hardness: 0.5 });
    expect(getDab().size).toBe(300);
  });

  it('are remembered as the brush was left', () => {
    setDab({ size: 11, aliased: false, scatter: 0.5 });
    const saved = JSON.parse(localStorage.getItem('frameling.pixelBrush.v1') ?? 'null');
    expect(cleanSpec({ kind: 'dab', dab: saved })).toMatchObject({ dab: { size: 11, aliased: false, scatter: 0.5 } });
  });

  it('are what the plain Brush on a pixel layer draws with, and leave the pencil and Shade sizes alone', () => {
    setDab({ size: 9 });
    expect(getToolSettings().pixelBrushSize).toBe(DEFAULT_TOOL_SETTINGS.pixelBrushSize);
    expect(DEFAULT_TOOL_SETTINGS.pixelStamp).toBeNull();
  });
});
