// @vitest-environment jsdom
// Opening or starting a drawing leaves the last one's timeline and other drawing-bound state behind no longer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { soundUi } from '../../src/audio/state';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { collapsedFolders, toggleFolderCollapsed } from '../../src/effects/rows';
import { installDrawingReset } from '../../src/io/fresh';
import { loadBytes } from '../../src/io/document';
import { saveFile } from '../../src/io/file';
import { rigUi, setRigUi } from '../../src/rig/state';
import { getTileUi, setTileUi } from '../../src/tiles/state';
import { DEFAULT_CW, setTl, tl } from '../../src/timeline/state';

let off = () => {};

/** Everything the last drawing could have left, set to something that is not the default. */
function dirtyUp() {
  setTl({ cw: 50, clipId: 'clip1', editing: { kind: 'clip', id: 'clip1' }, open: new Set(['layerA']), keys: new Set(['k1']) });
  setRigUi({ selected: 'bone1' });
  soundUi.set({ picked: 'sound1' });
  toggleFolderCollapsed('folder1', true);
  setTileUi({ brush: 7, flags: 2, sizeForm: true });
}

/** The state outside the store, as one value to compare. */
const outside = () => ({ tl: tl(), bone: rigUi().selected, sound: soundUi.get().picked, folders: [...collapsedFolders()], tiles: { ...getTileUi() } });

beforeEach(() => {
  resetStore(newDoc({ name: 'First', length: 8 }));
  off = installDrawingReset();
  // Start from what a new window has.
  store().load(newDoc());
});

afterEach(() => off());

describe('a different drawing arriving', () => {
  it('starts the timeline and the rest as a new window has them, after Open', async () => {
    const fresh = outside();
    expect(fresh.tl.cw).toBe(DEFAULT_CW);
    dirtyUp();
    expect(outside()).not.toEqual(fresh);
    const bytes = saveFile(newDoc({ name: 'Second', length: 12 }), 't');
    expect(await loadBytes(bytes, '/art/second.frameling', { confirm: false })).toBe(true);
    expect(store().get().doc.name).toBe('Second');
    expect(outside()).toEqual(fresh);
  });

  it('does the same for New (a fresh drawing loaded straight in)', () => {
    const fresh = outside();
    dirtyUp();
    store().load(newDoc({ name: 'Brand new' }));
    expect(outside()).toEqual(fresh);
  });

  it('keeps the choices made on purpose, such as tile mode and the bone look', () => {
    setTileUi({ tileMode: true });
    setRigUi({ look: 'capsule' });
    store().load(newDoc());
    expect(getTileUi().tileMode).toBe(true);
    expect(rigUi().look).toBe('capsule');
    setTileUi({ tileMode: false });
    setRigUi({ look: 'kite' });
  });
});
