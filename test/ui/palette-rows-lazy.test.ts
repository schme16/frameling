// @vitest-environment jsdom
// The index of Preferences rows (prefsIndex.ts) is its own download. Until it has arrived the palette just has no
// settings to offer, and once it has, a word that names a setting finds it, as before.
import { describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { loadSettingRows, settingRows, settingRowsReady, withSettings, type PaletteHit } from '../../src/ui/palette';

const hits: PaletteHit[] = Array.from({ length: 8 }, (_, i) => ({ item: { kind: 'help', id: `h${i}`, label: `h${i}`, category: 'Help', description: '', topic: {} as never }, score: 100 - i }));

describe('the palette and the rows of Preferences', () => {
  it('offers no settings before the rows have loaded, and does not fail', () => {
    expect(settingRowsReady()).toBe(false);
    expect(settingRows()).toEqual([]);
    expect(withSettings(hits, 'smoothing').every((h) => h.item.kind === 'help')).toBe(true);
  });

  it('offers them once loaded', async () => {
    await loadSettingRows();
    expect(settingRowsReady()).toBe(true);
    expect(settingRows().length).toBeGreaterThan(50);
    expect(withSettings(hits, 'smoothing').some((h) => h.item.kind === 'setting')).toBe(true);
  });
});
