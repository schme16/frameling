// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSheetExtras, saveSheetExtras } from '../../src/export/exporter';
import { DEFAULT_SHEET } from '../../src/export/types';

describe('sprite sheet extras are remembered', () => {
  beforeEach(() => localStorage.clear());

  it('starts with JSON on, Godot off, repeated frames stored once', () => {
    expect(DEFAULT_SHEET.json).toBe(true);
    expect(DEFAULT_SHEET.godot).toBe(false);
    expect(DEFAULT_SHEET.godotScene).toBe(false);
    expect(DEFAULT_SHEET.dedupe).toBe(true);
    expect(loadSheetExtras()).toBeNull();
  });

  it('keeps whatever was last ticked', () => {
    saveSheetExtras({ ...DEFAULT_SHEET, json: false, godot: true, godotScene: true });
    expect(loadSheetExtras()).toEqual({ json: false, godot: true, godotScene: true });
    saveSheetExtras({ ...DEFAULT_SHEET, json: true, godot: false, godotScene: false });
    expect(loadSheetExtras()).toEqual({ json: true, godot: false, godotScene: false });
  });

  it('survives broken stored data', () => {
    localStorage.setItem('frameling.export.sheetExtras', '{nope');
    expect(loadSheetExtras()).toBeNull();
  });
});
