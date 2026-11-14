// @vitest-environment jsdom
// Export follows the way: frames on boards start as one sprite, sprites on a sheet start packed together, and the
// footer says it in the words of the sheet.
import { beforeEach, describe, expect, it } from 'vitest';
import { artboardExport, currentArtboardExport, effectiveMode, planArtboards, setArtboardExport } from '../../src/artboards/export';
import { resetStore, store } from '../../src/core/store';
import { defaultSettings } from '../../src/export/plan';
import type { ExportSettings } from '../../src/export/types';
import { newSpriteDoc } from '../../src/pixel/way';
import { followWay, modeForWay, sheetFooter } from '../../src/pixel/sheetMode';
import { sheetSentence } from '../../src/pixel/way';

const sheet = (d: Parameters<typeof defaultSettings>[0]): ExportSettings => ({ ...defaultSettings(d), format: 'sheet' });

beforeEach(() => artboardExport.set({ mode: 'one', ids: null, docId: '' }));

describe('Export starts the way the sprite is built', () => {
  it('frames on boards: all in order, as one; a cast: packed on one sheet; the rest: nothing to change', () => {
    expect(modeForWay(newSpriteDoc({ way: 'boards', width: 16, height: 16 }))).toBe('joined');
    expect(modeForWay(newSpriteDoc({ way: 'sheet', width: 16, height: 16 }))).toBe('atlas');
    expect(modeForWay(newSpriteDoc({ way: 'animation', width: 16, height: 16 }))).toBeNull();
    expect(modeForWay(newSpriteDoc({ way: 'picture', width: 16, height: 16 }))).toBeNull();
  });
  it('is set once for a document, so a choice in the dialog sticks', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    resetStore(doc);
    followWay(store().rootDoc());
    expect(currentArtboardExport(store().rootDoc()).mode).toBe('atlas');
    setArtboardExport({ mode: 'each' });
    followWay(store().rootDoc());
    expect(currentArtboardExport(store().rootDoc()).mode).toBe('each');
  });
});

describe('the sentence and the footer agree', () => {
  it('a cast on a sheet', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    resetStore(doc);
    followWay(store().rootDoc());
    const root = store().rootDoc();
    const s = sheet(root);
    const mode = effectiveMode(root, s);
    expect(mode).toBe('atlas');
    expect(sheetSentence(root, mode)).toBe('This sheet has 3 sprites (wow!), one per board, 12 frames in all.');
    const ab = planArtboards(root, s, 0)!;
    expect(sheetFooter(root, mode, ab, { count: 4, width: 16, height: 16 })).toBe('12 frames on 3 sprites, one sheet, 512 × 512 px each');
  });
  it('frames on boards', () => {
    const doc = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    resetStore(doc);
    followWay(store().rootDoc());
    const root = store().rootDoc();
    const s = sheet(root);
    const mode = effectiveMode(root, s);
    const ab = planArtboards(root, s, 0)!;
    expect(sheetSentence(root, mode)).toBe('This sheet is 4 boards played as frames of a single sprite, 4 frames in all.');
    expect(sheetFooter(root, mode, ab, { count: 4, width: 16, height: 16 })).toMatch(/^4 frames, one sprite, \d+ × \d+ px each$/);
  });
  it('one file each: the whole export, not the open board', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    resetStore(doc);
    setArtboardExport({ mode: 'each' });
    const root = store().rootDoc();
    const s = sheet(root);
    expect(effectiveMode(root, s)).toBe('each');
    const ab = planArtboards(root, s, 0)!;
    expect(sheetFooter(root, 'each', ab, { count: 4, width: 16, height: 16 })).toBe('3 files, 12 frames in all, 512 × 512 px each');
  });
  it('an animation', () => {
    const doc = newSpriteDoc({ way: 'animation', width: 16, height: 16 });
    resetStore(doc);
    const root = store().rootDoc();
    expect(sheetSentence(root, effectiveMode(root, sheet(root)))).toBe('This sheet has 1 sprite with 4 frames.');
    expect(sheetFooter(root, 'one', null, { count: 4, width: 512, height: 512 })).toBe('4 frames, one sprite, 512 × 512 px each');
  });
  it('only some boards ticked: both count only those', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    resetStore(doc);
    followWay(store().rootDoc());
    const root = store().rootDoc();
    const ids = root.artboards!.slice(0, 2).map((a) => a.id);
    setArtboardExport({ ids });
    const s = sheet(root);
    const mode = effectiveMode(root, s);
    expect(sheetSentence(root, mode, ids)).toBe('This sheet has 2 sprites (wow!), one per board, 8 frames in all.');
    expect(sheetFooter(root, mode, planArtboards(root, s, 0), { count: 4, width: 16, height: 16 })).toBe('8 frames on 2 sprites, one sheet, 512 × 512 px each');
  });
});
