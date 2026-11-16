// @vitest-environment jsdom
// The pixel brush in use as one thing: reading it from whichever tool you are on, and putting a saved one back.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { getDry, resetDry } from '../../src/dry/settings';
import { getSoft, resetSoft } from '../../src/soft/settings';
import { applySpec, currentSpec, isApplying, isPixelBrushTool, putSpec, subscribeSpecs } from '../../src/dab/live';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { cleanSpec } from '../../src/dab/spec';
import { getDab, resetDab, setDab } from '../../src/dab/settings';
import { DEFAULT_TOOL_SETTINGS } from '../../src/tools/settings';
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
    applySpec({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 22, spacing: 1 } });
    expect(getDab()).toMatchObject({ size: 22, spacing: 1 });
    expect(store().get().ui.tool).toBe('pixel-brush');
    expect(getSoft()).toBe(was);
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
    setDab({ size: 5000, spacing: 0, tip: 'picture' });
    expect(getDab()).toMatchObject({ size: 300, spacing: 0.05, tip: 'round' });
  });

  it('are remembered as the brush was left', () => {
    setDab({ size: 11, aliased: false, scatter: 0.5 });
    const saved = JSON.parse(localStorage.getItem('frameling.pixelBrush.v1') ?? 'null');
    expect(cleanSpec({ kind: 'dab', dab: saved })).toMatchObject({ dab: { size: 11, aliased: false, scatter: 0.5 } });
  });

  it('are untouched by the Brush tool\'s own pixel brush settings', () => {
    expect(DEFAULT_TOOL_SETTINGS.pixelStamp).toBeNull();
    setDab({ size: 9 });
    expect(DEFAULT_TOOL_SETTINGS.pixelStamp).toBeNull();
  });
});
