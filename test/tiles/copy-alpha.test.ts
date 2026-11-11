import { afterEach, describe, expect, it } from 'vitest';
import { FADED_TILE_COPIES, setTileCopyAlpha, tileCopyAlpha } from '../../src/tiles/look';
import { DEFAULT_PREFS, migratePrefs, setPrefs } from '../../src/ui/prefs';

describe('tile mode copies', () => {
  afterEach(() => {
    setTileCopyAlpha(null);
    setPrefs({ fadeTileCopies: false });
  });
  it('show at full strength by default', () => {
    expect(DEFAULT_PREFS.fadeTileCopies).toBe(false);
    expect(migratePrefs({}).fadeTileCopies).toBe(false);
    expect(tileCopyAlpha()).toBe(1);
  });
  it('fade when the preference is on', () => {
    setPrefs({ fadeTileCopies: true });
    expect(tileCopyAlpha()).toBe(FADED_TILE_COPIES);
  });
  it('can be overridden for screenshots', () => {
    setTileCopyAlpha(0.2);
    expect(tileCopyAlpha()).toBe(0.2);
  });
});
