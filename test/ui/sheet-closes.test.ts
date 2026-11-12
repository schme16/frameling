// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { closeSheet, installSheetCloser, openSheet, overlays } from '../../src/ui/overlays';

afterEach(() => closeSheet());

describe('the Welcome sheet and a file that opens under it', () => {
  it('closes the sheet when a document is loaded', () => {
    resetStore(newDoc());
    const off = installSheetCloser();
    openSheet('welcome');
    store().load(newDoc(), '/tmp/a.frameling');
    expect(overlays.get().sheet).toBeNull();
    off();
  });
  it('also closes the New sheet, and leaves it alone for edits', () => {
    resetStore(newDoc());
    const off = installSheetCloser();
    openSheet('new');
    store().update('Edit', (d) => void (d.name = 'Renamed'));
    expect(overlays.get().sheet).toBe('new');
    store().load(newDoc());
    expect(overlays.get().sheet).toBeNull();
    off();
  });
  it('does nothing once taken away', () => {
    resetStore(newDoc());
    installSheetCloser()();
    openSheet('welcome');
    store().load(newDoc());
    expect(overlays.get().sheet).toBe('welcome');
  });
});
