// @vitest-environment jsdom
// Drawing the whole interface bigger or smaller.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUiScale, DEFAULT_PREFS, migratePrefs, UI_SCALE_RANGE } from '../../src/ui/prefs';

const root = () => document.documentElement;

beforeEach(() => root().style.removeProperty('zoom'));
afterEach(() => {
  delete (window as { frameling?: unknown }).frameling;
  vi.restoreAllMocks();
});

describe('the interface size', () => {
  it('starts at the usual size and stays inside its limits when read back', () => {
    expect(DEFAULT_PREFS.uiScale).toBe(1);
    expect(migratePrefs({ uiScale: 9 }).uiScale).toBe(UI_SCALE_RANGE.max);
    expect(migratePrefs({ uiScale: 0.1 }).uiScale).toBe(UI_SCALE_RANGE.min);
    expect(migratePrefs({ uiScale: 'big' }).uiScale).toBe(1);
  });

  it('asks the desktop app to zoom the page, which keeps everything sharp', () => {
    const setUiScale = vi.fn();
    (window as { frameling?: unknown }).frameling = { app: { setUiScale } };
    applyUiScale(1.4);
    expect(setUiScale).toHaveBeenCalledWith(1.4);
    expect(root().style.zoom).toBe('');
  });

  it('in a browser tab it zooms the page itself, and the usual size leaves no mark', () => {
    applyUiScale(1.25);
    expect(root().style.zoom).toBe('1.25');
    applyUiScale(1);
    expect(root().style.zoom).toBe('');
  });
});
