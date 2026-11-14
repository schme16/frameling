// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetChoicesForTests, allChoices, currentChoice, rememberedChoice, setChoice, setChoiceAsker, setGentleTeller } from '../../src/core/choices';

import { builtinWorkspaces } from '../../src/ui/dock';
import { clampSize, ZONES } from '../../src/ui/dockModel';
import { setPrefs } from '../../src/ui/prefs';
import { shownZone } from '../../src/ui/roomFolds';
import {
  _resetFitForTests,
  COMPACT_ACROSS,
  compactRailWidth,
  considerFit,
  fitRailSaved,
  fitToolSize,
  fitWords,
  fitZoneSize,
  interfaceUnits,
  isCompact,
  isSmallScreen,
  SMALL_BELOW,
  STARTING_SIZES,
  toggleFit,
} from '../../src/ui/screenFit';
import { screenKey, type DisplayInfo } from '../../src/ui/screenSize';
import { acrossFor, railSizes } from '../../src/ui/toolRailWidth';

const screen = (w: number, h: number, o: Partial<DisplayInfo> = {}): DisplayInfo => ({ id: 1, width: w, height: h, scaleFactor: 1, workWidth: w, workHeight: h - 40, windowWidth: w, windowHeight: h, ...o });

describe('isSmallScreen', () => {
  it('is small for the laptop screens the roomy layout squeezes', () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1280, 800], [1024, 600]]) expect(isSmallScreen({ width: w, height: h }), `${w}x${h}`).toBe(true);
  });
  it('is not small for a roomy screen', () => {
    for (const [w, h] of [[1920, 1080], [2560, 1440], [1680, 1050], [1920, 1200], [3840, 2160]]) expect(isSmallScreen({ width: w, height: h }), `${w}x${h}`).toBe(false);
  });
  it('is decided by either side, at the limits', () => {
    expect(isSmallScreen({ width: SMALL_BELOW.width, height: SMALL_BELOW.height })).toBe(false);
    expect(isSmallScreen({ width: SMALL_BELOW.width - 1, height: 2000 })).toBe(true);
    expect(isSmallScreen({ width: 3000, height: SMALL_BELOW.height - 1 })).toBe(true);
  });
  it('does not guess when it knows nothing', () => {
    expect(isSmallScreen({ width: 0, height: 0 })).toBe(false);
    expect(isSmallScreen({ width: NaN, height: 1080 })).toBe(false);
  });
});

describe('interfaceUnits', () => {
  it('counts a 4k laptop panel at 250% as the 1536 x 864 it feels like', () => {
    // The computer reports 3840 x 2160 pixels / 2.5 = 1536 x 864 units.
    expect(interfaceUnits({ width: 1536, height: 864 }, 1)).toEqual({ width: 1536, height: 864 });
    expect(isSmallScreen(interfaceUnits({ width: 1536, height: 864 }, 1))).toBe(true);
  });
  it('a bigger interface size makes a screen smaller in its own units', () => {
    expect(interfaceUnits({ width: 1920, height: 1080 }, 1.5)).toEqual({ width: 1280, height: 720 });
    expect(isSmallScreen(interfaceUnits({ width: 1920, height: 1080 }, 1))).toBe(false);
    expect(isSmallScreen(interfaceUnits({ width: 1920, height: 1080 }, 1.5))).toBe(true);
  });
  it('treats a bad size as 100%', () => {
    expect(interfaceUnits({ width: 1000, height: 500 }, 0)).toEqual({ width: 1000, height: 500 });
  });
});

describe('what tightens', () => {
  it('only the usual tool size gives way', () => {
    expect(fitToolSize('medium', true)).toBe('small');
    expect(fitToolSize('large', true)).toBe('large');
    expect(fitToolSize('small', true)).toBe('small');
    for (const s of ['small', 'medium', 'large'] as const) expect(fitToolSize(s, false)).toBe(s);
  });
  it('the rail starts four across on a small screen, and a width you pulled is kept', () => {
    for (const look of ['cosy', 'crisp'] as const) {
      const sizes = railSizes(look, 'small');
      expect(acrossFor(compactRailWidth(sizes), sizes, 'two')).toBe(COMPACT_ACROSS);
      expect(fitRailSaved(undefined, sizes, true)).toBe(compactRailWidth(sizes));
      expect(fitRailSaved(undefined, sizes, false)).toBeUndefined();
      expect(fitRailSaved(222, sizes, true)).toBe(222);
    }
  });
  it('panels that start at a workspace size shrink, and a size you dragged to is kept', () => {
    expect(fitZoneSize('right', 316, true)).toBeLessThan(316);
    expect(fitZoneSize('bottom', 260, true)).toBeLessThan(260);
    expect(fitZoneSize('right', 316, false)).toBe(316);
    expect(fitZoneSize('right', 301, true)).toBe(301);
    expect(fitZoneSize('bottom', 400, true)).toBe(400);
  });
  it('never goes under a zone\'s own least', () => {
    for (const z of ZONES) for (const n of STARTING_SIZES[z]) expect(fitZoneSize(z, n, true)).toBe(clampSize(z, fitZoneSize(z, n, true)));
  });
  it('knows every size the built-in workspaces start their panels at', () => {
    for (const w of builtinWorkspaces()) for (const z of ZONES) expect(STARTING_SIZES[z], `${w.id} ${z}`).toContain(w.layout.zones[z].size);
  });
  it('shows a smaller zone without touching the saved one', () => {
    const saved = { collapsed: false, size: 316 };
    const shown = shownZone(saved, false, 'right', true);
    expect(shown.size).toBeLessThan(316);
    expect(saved.size).toBe(316);
    expect(shownZone(saved, false, 'right', false)).toBe(saved);
    expect(shownZone(saved, true, 'right', false)).toEqual({ collapsed: true, size: 316 });
  });
});

describe('fitWords', () => {
  it('says the screen and has no em dashes', () => {
    const w = fitWords({ width: 1280, height: 720 });
    expect(w.title).toContain('1280 x 720');
    expect(w.question).toContain('1280 x 720');
    for (const v of Object.values(w)) expect(v).not.toContain('—');
  });
});

describe('considerFit', () => {
  beforeEach(() => {
    _resetChoicesForTests();
    _resetFitForTests();
    localStorage.clear();
    setPrefs({ uiScale: 1 });
    delete document.documentElement.dataset.fit;
  });

  it('tightens on a small screen and sets the page marker', () => {
    considerFit(screen(1280, 720), { quiet: true });
    expect(isCompact()).toBe(true);
    expect(document.documentElement.dataset.fit).toBe('compact');
  });

  it('leaves a roomy screen alone and clears the marker when the window moves to one', () => {
    considerFit(screen(1280, 720), { quiet: true });
    considerFit(screen(2560, 1440, { id: 2 }), { quiet: true });
    expect(isCompact()).toBe(false);
    expect(document.documentElement.dataset.fit).toBeUndefined();
  });

  it('registers a choice for the screen, listed with the others, tightening by default', () => {
    const d = screen(1366, 768);
    considerFit(d, { quiet: true });
    const def = allChoices().find((c) => c.id === `ui.screenFit.${screenKey(d)}`);
    expect(def?.default).toBe('tight');
    expect(def?.quill).toBe(true);
    expect(def?.help).toBe('small-screens');
  });

  it('says so once, in a toast with a Change button, and remembers it', () => {
    const tell = vi.fn();
    setChoiceAsker(async () => null);
    setGentleTeller(tell);
    const d = screen(1366, 768);
    considerFit(d);
    expect(tell).toHaveBeenCalledTimes(1);
    expect(rememberedChoice(`ui.screenFit.${screenKey(d)}`)).toBe('tight');
    considerFit(d);
    expect(tell).toHaveBeenCalledTimes(1);
  });

  it('keeps the roomy layout when that is the answer for the screen, and answers change it live', () => {
    const d = screen(1366, 768);
    considerFit(d, { quiet: true });
    expect(isCompact()).toBe(true);
    setChoice(`ui.screenFit.${screenKey(d)}`, 'roomy');
    considerFit(d, { quiet: true });
    expect(isCompact()).toBe(false);
    expect(currentChoice(`ui.screenFit.${screenKey(d)}`)).toBe('roomy');
  });

  it('a first guess tightens at once with no choice of its own yet', () => {
    const before = allChoices().length;
    considerFit(screen(1280, 720), { provisional: true });
    expect(isCompact()).toBe(true);
    expect(allChoices().length).toBe(before);
  });

  it('the palette command flips it for this screen', () => {
    considerFit(screen(1280, 720), { quiet: true });
    toggleFit();
    expect(isCompact()).toBe(false);
    toggleFit();
    expect(isCompact()).toBe(true);
  });

  it('a bigger interface size can make a roomy screen small', () => {
    const d = screen(1920, 1080);
    considerFit(d, { quiet: true });
    expect(isCompact()).toBe(false);
    setPrefs({ uiScale: 1.5 });
    considerFit(d, { quiet: true });
    expect(isCompact()).toBe(true);
  });
});
