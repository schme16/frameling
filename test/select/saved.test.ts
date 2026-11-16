// @vitest-environment jsdom
// Saved selections: the file form, reading it back safely, and the commands that keep, bring back, rename and delete them.
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, SavedSelection } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { resetStore, store } from '../../src/core/store';
import { newSpriteDoc } from '../../src/pixel/way';
import { coverOf, featherMask, maskCount, rectMask } from '../../src/select/mask';
import { pixelSelection, setPixelSelection } from '../../src/select/pixel-state';
import { cleanName, decodeCover, describeSaved, encodeCover, freeName, maskOf, MAX_SAVED, readSavedSelections, savePixels, saveShapes } from '../../src/select/saved';
import { deleteSelection, loadSelection, renameSelection, saveSelection } from '../../src/select/saved-commands';

describe('the cover as runs', () => {
  it('round trips plain, soft and busy cover', () => {
    const cases = [new Uint8Array(1), new Uint8Array(5000).fill(255), coverOf(featherMask(rectMask(30, 30, 5, 5, 20, 20), 4)), Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 255)];
    for (const c of cases) expect([...decodeCover(encodeCover(c), c.length)!]).toEqual([...c]);
  });

  it('a big plain selection stays small, whatever its length', () => {
    const c = new Uint8Array(256 * 256).fill(255);
    expect(encodeCover(c).length).toBeLessThan(12);
  });

  it('refuses a text that is the wrong length, cut short, or not runs at all', () => {
    const t = encodeCover(new Uint8Array(100).fill(1));
    expect(decodeCover(t, 99)).toBeNull();
    expect(decodeCover(t, 101)).toBeNull();
    expect(decodeCover(t.slice(0, 2), 100)).toBeNull();
    expect(decodeCover('!!not base64!!', 4)).toBeNull();
    expect(decodeCover('', 4)).toBeNull();
  });
});

describe('what a saved pixel selection holds', () => {
  it('comes back the same, soft edge and all', () => {
    const m = featherMask(rectMask(30, 20, 5, 4, 24, 15), 3);
    const s = savePixels('s1', 'Hair', m);
    const back = maskOf(s)!;
    expect(back.width).toBe(30);
    expect(back.height).toBe(20);
    expect([...back.bits]).toEqual([...m.bits]);
    expect([...back.soft!]).toEqual([...m.soft!]);
  });

  it('a hard one comes back hard', () => {
    const m = rectMask(10, 10, 2, 2, 5, 5);
    expect(maskOf(savePixels('s1', 'Box', m))!.soft).toBeUndefined();
    expect(maskCount(maskOf(savePixels('s1', 'Box', m))!)).toBe(16);
  });

  it('says what it holds in plain words', () => {
    expect(describeSaved(savePixels('a', 'x', rectMask(10, 10, 0, 0, 0, 0)))).toBe('1 pixel');
    expect(describeSaved(savePixels('a', 'x', featherMask(rectMask(20, 20, 5, 5, 14, 14), 3)))).toMatch(/pixels, soft edge$/);
    expect(describeSaved(saveShapes('b', 'x', 'l1', ['a', 'b']))).toBe('2 shapes');
  });
});

describe('names', () => {
  it('are tidied and cut to length', () => {
    expect(cleanName('  Sky   and  sea ')).toBe('Sky and sea');
    expect(cleanName('x'.repeat(200)).length).toBe(60);
  });
  it('take the next free number', () => {
    expect(freeName([])).toBe('Selection 1');
    expect(freeName(['Selection 1', 'selection 2'])).toBe('Selection 3');
    expect(freeName(['Hair'], 'Eyes')).toBe('Eyes');
    expect(freeName(['Hair'], 'hair')).toBe('hair 2');
  });
});

describe('reading them from a file', () => {
  const good = savePixels('p1', 'One', rectMask(4, 4, 0, 0, 1, 1));
  it('keeps good ones and says nothing when there are none', () => {
    expect(readSavedSelections([good, saveShapes('s1', 'Two', null, ['x'])])).toHaveLength(2);
    expect(readSavedSelections(undefined)).toBeUndefined();
    expect(readSavedSelections([])).toBeUndefined();
    expect(readSavedSelections('nope')).toBeUndefined();
  });
  it('drops what is malformed, repeated or the wrong size', () => {
    const out = readSavedSelections([
      good,
      { ...good, id: 'p1' },
      { ...good, id: 'p2', cover: 'AAAA' },
      { ...good, id: 'p3', width: 0 },
      { ...good, id: 'p4', width: 5 },
      { id: 'x', name: 'x', kind: 'sparkles' },
      null,
      7,
      { id: 's1', name: 'Shapes', kind: 'shapes', ids: ['a', 3, 'b'] },
      { id: 's2', name: 'Bad', kind: 'shapes', ids: 'a' },
    ])!;
    expect(out.map((x) => x.id)).toEqual(['p1', 's1']);
    expect((out[1] as Extract<SavedSelection, { kind: 'shapes' }>).ids).toEqual(['a', 'b']);
  });
  it('keeps at most 60', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...good, id: `p${i}` }));
    expect(readSavedSelections(many)).toHaveLength(MAX_SAVED);
  });
});

describe('in a saved file', () => {
  const withSaved = (): Doc => {
    const d = newDoc({ name: 'Sel', width: 16, height: 16, length: 1 });
    d.selections = [savePixels('p1', 'Hair', featherMask(rectMask(16, 16, 2, 2, 9, 9), 2)), saveShapes('s1', 'Pair', d.layers[0].id, ['a', 'b'])];
    return d;
  };
  it('goes into the file and comes back out', () => {
    const back = loadFile(saveFile(withSaved(), '1.2.3')).doc;
    expect(back.selections).toHaveLength(2);
    expect(back.selections![0]).toEqual(withSaved().selections![0]);
  });
  it('an older file without the field still opens, and gains nothing', () => {
    const d = newDoc({ name: 'Old', width: 16, height: 16, length: 1 });
    const back = loadFile(saveFile(d, '1.2.3')).doc;
    expect(back.selections).toBeUndefined();
    expect('selections' in back).toBe(false);
  });
});

describe('the commands', () => {
  const pixelDoc = () => resetStore(newSpriteDoc({ way: 'picture', width: 32, height: 32, name: 'T' }));

  it('saves what is selected, brings it back, renames and deletes, each an undo step', () => {
    pixelDoc();
    setPixelSelection(featherMask(rectMask(32, 32, 4, 4, 19, 19), 3));
    const made = saveSelection('Face')!;
    expect(made.name).toBe('Face');
    expect(store().get().doc.selections).toHaveLength(1);
    setPixelSelection(null);
    expect(loadSelection(made.id)).toMatchObject({ ok: true });
    expect(pixelSelection()!.soft).toBeDefined();
    renameSelection(made.id, '  Face two ');
    expect(store().get().doc.selections![0].name).toBe('Face two');
    deleteSelection(made.id);
    expect(store().get().doc.selections).toBeUndefined();
    store().undo();
    expect(store().get().doc.selections).toHaveLength(1);
    store().undo();
    expect(store().get().doc.selections![0].name).toBe('Face');
  });

  it('adds to and takes away from what is selected now', () => {
    pixelDoc();
    setPixelSelection(rectMask(32, 32, 0, 0, 9, 9));
    const a = saveSelection('A')!;
    setPixelSelection(rectMask(32, 32, 5, 5, 14, 14));
    expect(loadSelection(a.id, 'add')).toMatchObject({ ok: true });
    expect(maskCount(pixelSelection()!)).toBe(100 + 100 - 25);
    expect(loadSelection(a.id, 'subtract')).toMatchObject({ ok: true });
    expect(maskCount(pixelSelection()!)).toBe(75);
  });

  it('a second one with the same name gets a number, and nothing selected saves nothing', () => {
    pixelDoc();
    expect(saveSelection('x')).toBeNull();
    setPixelSelection(rectMask(32, 32, 0, 0, 3, 3));
    saveSelection('Same');
    expect(saveSelection('Same')!.name).toBe('Same 2');
  });

  it('on a drawing of another size it fits at the top left and says so', () => {
    pixelDoc();
    setPixelSelection(rectMask(32, 32, 0, 0, 7, 7));
    const a = saveSelection('Small')!;
    resetStore(newSpriteDoc({ way: 'picture', width: 48, height: 48, name: 'Big' }));
    store().update('copy', (d) => void (d.selections = [a]));
    const r = loadSelection(a.id);
    expect(r).toMatchObject({ ok: true });
    expect((r as { note?: string }).note).toMatch(/32 x 32/);
    expect(pixelSelection()!.width).toBe(48);
    expect(maskCount(pixelSelection()!)).toBe(64);
  });

  it('says why when it cannot', () => {
    pixelDoc();
    expect(loadSelection('nope')).toMatchObject({ ok: false });
  });

  it('shapes: keeps which were picked, and brings back the ones still there', () => {
    const doc = newDoc({ name: 'V', width: 100, height: 100, length: 1, animated: false });
    const d = newVectorDrawing();
    const rect = (id: string, x: number) => ({ id, type: 'path' as const, paths: [{ closed: true, points: [{ x, y: 0 }, { x: x + 5, y: 0 }, { x: x + 5, y: 5 }] }], fill: '#f00', stroke: null, opacity: 1 });
    d.shapes.push(rect('a', 0), rect('b', 10), rect('c', 20));
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c1', start: 0, length: 1, drawingId: d.id });
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, selection: ['a', 'b'] });
    const made = saveSelection('Pair')!;
    expect(made).toMatchObject({ kind: 'shapes', ids: ['a', 'b'] });
    store().setUi({ selection: [] });
    expect(loadSelection(made.id)).toMatchObject({ ok: true });
    expect(store().get().ui.selection).toEqual(['a', 'b']);
    store().update('drop b', (x) => void (x.drawings[d.id] as typeof d).shapes.splice(1, 1));
    store().setUi({ selection: ['c'] });
    const r = loadSelection(made.id, 'add');
    expect(r).toMatchObject({ ok: true });
    expect((r as { note?: string }).note).toMatch(/1 of the shapes/);
    expect(store().get().ui.selection.sort()).toEqual(['a', 'c']);
  });
});
