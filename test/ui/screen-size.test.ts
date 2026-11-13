// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetChoicesForTests, allChoices, rememberedChoice, setChoiceAsker } from '../../src/core/choices';
import { DEFAULT_PREFS, getPrefs, setPrefs, UI_SCALE_RANGE } from '../../src/ui/prefs';
import { considerScreen, offerWords, screenAction, screenKey, screenPixels, suggestUiScale, type DisplayInfo } from '../../src/ui/screenSize';

const screen = (o: Partial<DisplayInfo> = {}): DisplayInfo => ({ id: 1, width: 1920, height: 1080, scaleFactor: 1, workWidth: 1920, workHeight: 1040, windowWidth: 1400, windowHeight: 900, ...o });
const fourK = screen({ id: 2, width: 3840, height: 2160, workWidth: 3840, workHeight: 2100 });

describe('suggestUiScale', () => {
  it('leaves ordinary screens alone', () => {
    expect(suggestUiScale(screen())).toBe(1);
    expect(suggestUiScale(screen({ width: 2560, height: 1440, workWidth: 2560, workHeight: 1400 }))).toBe(1);
    expect(suggestUiScale(screen({ width: 1440, height: 900, workWidth: 1440, workHeight: 860 }))).toBe(1);
    expect(suggestUiScale(screen({ width: 0, height: 0 }))).toBe(1);
  });
  it('suggests a bigger size for a 4k panel shown at 100%', () => {
    expect(suggestUiScale(fourK)).toBe(1.75);
  });
  it('stays quiet for a 4k panel the computer already scales to 200%', () => {
    expect(suggestUiScale(screen({ width: 1920, height: 1080, scaleFactor: 2 }))).toBe(1);
  });
  it('steps up with the screen and stays on the slider', () => {
    const tablet = suggestUiScale(screen({ width: 3000, height: 2000, workWidth: 3000, workHeight: 1960 }));
    expect(tablet).toBe(1.5);
    for (const [w, h] of [[2880, 1800], [3440, 1800], [5120, 2880], [7680, 4320]]) {
      const n = suggestUiScale(screen({ width: w, height: h, workWidth: w, workHeight: h - 40 }));
      expect(n).toBeGreaterThanOrEqual(UI_SCALE_RANGE.min);
      expect(n).toBeLessThanOrEqual(UI_SCALE_RANGE.max);
      expect(n * 4 % 1).toBe(0);
    }
  });
  it('never leaves the window too small for a layout', () => {
    // A dense but short usable area: 2000 x 1800 holds the layout at 1.5 only if 700 * 1.5 fits.
    const n = suggestUiScale(screen({ width: 3840, height: 1800, workWidth: 3840, workHeight: 800 }));
    expect(800 / n).toBeGreaterThanOrEqual(700 - 1e-9);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});

describe('screenKey', () => {
  it('is the same for the same screen and different for another', () => {
    expect(screenKey(fourK)).toBe(screenKey({ ...fourK, windowWidth: 10 } as DisplayInfo));
    expect(screenKey(fourK)).not.toBe(screenKey({ ...fourK, scaleFactor: 2 }));
    expect(screenKey(fourK)).not.toBe(screenKey({ ...fourK, id: 3 }));
    expect(screenKey(fourK)).not.toBe(screenKey({ ...fourK, width: 3000 }));
  });
  it('reports real pixels', () => {
    expect(screenPixels({ width: 1920, height: 1080, scaleFactor: 2 })).toEqual({ width: 3840, height: 2160 });
  });
});

describe('screenAction', () => {
  it('asks the first time a screen wants something different', () => {
    expect(screenAction({ wanted: 1.75, current: 1, atStart: true })).toEqual({ kind: 'ask', wanted: 1.75 });
    expect(screenAction({ wanted: 1, current: 1.75, atStart: false })).toEqual({ kind: 'ask', wanted: 1 });
  });
  it('does nothing when the size already fits', () => {
    expect(screenAction({ wanted: 1.75, current: 1.75, atStart: false })).toEqual({ kind: 'none' });
    expect(screenAction({ wanted: 1.75, current: 1.7, atStart: false })).toEqual({ kind: 'none' });
  });
  it('does not ask again once answered', () => {
    expect(screenAction({ wanted: 1.75, current: 1, remembered: 'no', atStart: false })).toEqual({ kind: 'none' });
    expect(screenAction({ wanted: 1.75, current: 1, remembered: 'yes', atStart: true })).toEqual({ kind: 'none' });
  });
  it('puts back a size they said yes to when they return to the screen', () => {
    expect(screenAction({ wanted: 1.75, current: 1, remembered: 'yes', atStart: false })).toEqual({ kind: 'apply', wanted: 1.75 });
  });
});

describe('offerWords', () => {
  it('says the numbers and has no em dashes', () => {
    const up = offerWords(fourK, 1.75, 1);
    expect(up.title).toContain('3840 x 2160');
    expect(up.question).toContain('175%');
    expect(up.yes).toBe('Yes, use 175%');
    expect(up.no).toBe('No thanks');
    const down = offerWords(fourK, 1, 1.75);
    expect(down.question).toContain('100%');
    for (const w of [...Object.values(up), ...Object.values(down)]) expect(w).not.toContain('—');
  });
});

describe('considerScreen', () => {
  beforeEach(() => {
    _resetChoicesForTests();
    localStorage.clear();
    setPrefs({ uiScale: 1 });
  });

  it('applies the size on Yes, and remembers it per screen', async () => {
    const asker = vi.fn(async () => ({ value: 'yes', remember: true }));
    setChoiceAsker(asker);
    await considerScreen(fourK, { atStart: true });
    expect(asker).toHaveBeenCalledTimes(1);
    expect(getPrefs().uiScale).toBe(1.75);
    expect(rememberedChoice(`ui.screenSize.${screenKey(fourK)}`)).toBe('yes');
  });

  it('leaves the size alone on No thanks, and never asks that screen again', async () => {
    const asker = vi.fn(async () => ({ value: 'no', remember: true }));
    setChoiceAsker(asker);
    await considerScreen(fourK, { atStart: true });
    expect(getPrefs().uiScale).toBe(1);
    await considerScreen(fourK);
    await considerScreen(fourK);
    expect(asker).toHaveBeenCalledTimes(1);
  });

  it('asks once per screen when moving back and forth, and brings back a size they said yes to', async () => {
    const asker = vi.fn(async (def: { id: string }) => ({ value: def.id.includes(screenKey(fourK)) ? 'yes' : 'yes', remember: true }));
    setChoiceAsker(asker as never);
    const laptop = screen();
    await considerScreen(fourK, { atStart: true }); // 4k: asked, now 175%
    await considerScreen(laptop); // laptop: asked (back to 100%), now 100%
    expect(getPrefs().uiScale).toBe(1);
    await considerScreen(fourK); // remembered yes: applied without asking
    expect(getPrefs().uiScale).toBe(1.75);
    await considerScreen(laptop);
    await considerScreen(fourK);
    expect(asker).toHaveBeenCalledTimes(2);
    expect(getPrefs().uiScale).toBe(1.75);
  });

  it('never asks or changes anything when nobody can be asked', async () => {
    setChoiceAsker(null);
    await considerScreen(fourK, { atStart: true });
    expect(getPrefs().uiScale).toBe(1);
  });

  it('treats a size set by hand before the first look as an answer', async () => {
    const asker = vi.fn(async () => ({ value: 'yes', remember: true }));
    setChoiceAsker(asker);
    setPrefs({ uiScale: 1.25 });
    await considerScreen(fourK, { atStart: true });
    expect(asker).not.toHaveBeenCalled();
    expect(getPrefs().uiScale).toBe(1.25);
    expect(rememberedChoice(`ui.screenSize.${screenKey(fourK)}`)).toBe('no');
  });

  it('lists the offer in Preferences, Behaviour while it is registered', async () => {
    setChoiceAsker(async () => ({ value: 'no', remember: true }));
    await considerScreen(fourK, { atStart: true });
    expect(allChoices().some((c) => c.category === 'Interface size')).toBe(true);
  });

  it('the palette command asks again whatever was said before', async () => {
    const asker = vi.fn(async () => ({ value: 'no', remember: true }));
    setChoiceAsker(asker);
    await considerScreen(fourK, { atStart: true });
    await considerScreen(fourK, { force: true });
    expect(asker).toHaveBeenCalledTimes(2);
  });

  it('default prefs start at the usual size', () => {
    expect(DEFAULT_PREFS.uiScale).toBe(1);
  });
});
