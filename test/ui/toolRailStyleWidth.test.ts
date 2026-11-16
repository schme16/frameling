// @vitest-environment jsdom
// Changing the tool rail's style and what happens to its width. A rail nobody has pulled follows each style on its own,
// so a round trip through the styles leaves it where it began. One that was pulled to a width of its own is asked about,
// once: keep that width, or start the new style at its usual width.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getChoiceDef, rememberedChoice, setChoice } from '../../src/core/choices';
import { dock, resetDock } from '../../src/ui/dock';
import { DEFAULT_PREFS, getPrefs, setPrefs } from '../../src/ui/prefs';
import { naturalRailWidth, railSizes, widthDiffersFromStyle } from '../../src/ui/toolRailWidth';
import { isCustomWidth, railSizesNow, setToolRailStyle, setToolRailWidth, STYLE_WIDTH_CHOICE, toolRailWidth } from '../../src/ui/toolRail';

beforeAll(async () => {
  await import('../../src/renderer/features');
});
beforeEach(() => {
  localStorage.clear();
  resetDock();
  setPrefs({ toolRail: DEFAULT_PREFS.toolRail, toolNames: true, toolSize: 'medium' });
  setChoice(STYLE_WIDTH_CHOICE, undefined);
});

describe('whether a saved width is worth asking about', () => {
  const s = railSizes('cosy', 'medium');
  it('never, when no width was saved: the rail follows the style', () => {
    expect(widthDiffersFromStyle(undefined, s, 'two', true)).toBe(false);
    expect(widthDiffersFromStyle(undefined, s, 'stacked', true)).toBe(false);
  });
  it('when the saved width is not the width the style starts at', () => {
    expect(widthDiffersFromStyle(50, s, 'two', true)).toBe(true);
    expect(widthDiffersFromStyle(200, s, 'stacked', true)).toBe(true);
  });
  it('not when it is the same width the style starts at', () => {
    expect(widthDiffersFromStyle(naturalRailWidth(s, 'two', true), s, 'two', true)).toBe(false);
    expect(widthDiffersFromStyle(naturalRailWidth(s, 'stacked', true), s, 'stacked', true)).toBe(false);
  });
  it('holds a width past the limits to them before it compares', () => {
    expect(widthDiffersFromStyle(1, s, 'stacked', true)).toBe(false);
  });
});

describe('a rail nobody pulled', () => {
  it('is the same width after trying every style, with nothing saved', () => {
    const start = toolRailWidth();
    setToolRailStyle('stacked');
    expect(toolRailWidth()).toBe(naturalRailWidth(railSizesNow(), 'stacked', true));
    setToolRailStyle('two');
    expect(toolRailWidth()).toBe(start);
    expect(isCustomWidth()).toBe(false);
    expect(dock.get().railWidths).toBeUndefined();
    expect(rememberedChoice(STYLE_WIDTH_CHOICE)).toBeUndefined();
  });
});

describe('a rail pulled to a width of its own', () => {
  it('keeps the width by default, the way it always has', () => {
    setToolRailWidth(50);
    expect(toolRailWidth()).toBe(50);
    setToolRailStyle('stacked');
    setToolRailStyle('two');
    expect(getPrefs().toolRail).toBe('two');
    expect(toolRailWidth()).toBe(50);
  });

  it('goes back to the style\'s usual width when that is the remembered answer', () => {
    setChoice(STYLE_WIDTH_CHOICE, 'natural');
    setToolRailWidth(50);
    setToolRailStyle('stacked');
    setToolRailStyle('two');
    expect(toolRailWidth()).toBe(naturalRailWidth(railSizesNow(), 'two', true));
    expect(isCustomWidth()).toBe(false);
  });

  it('keeps it when "keep" is the remembered answer', () => {
    setChoice(STYLE_WIDTH_CHOICE, 'keep');
    setToolRailWidth(200);
    setToolRailStyle('stacked');
    expect(toolRailWidth()).toBe(200);
  });

  it('is left alone when the style is already the one asked for', () => {
    setChoice(STYLE_WIDTH_CHOICE, 'natural');
    setToolRailWidth(200);
    setToolRailStyle('two');
    expect(toolRailWidth()).toBe(200);
  });
});

describe('the choice', () => {
  it('is registered, keeps the width by default and says both answers in plain words', () => {
    const def = getChoiceDef(STYLE_WIDTH_CHOICE)!;
    expect(def.default).toBe('keep');
    expect(def.options.map((o) => o.value)).toEqual(['keep', 'natural']);
    for (const o of def.options) expect(o.label && o.detail && o.did).toBeTruthy();
  });
});
