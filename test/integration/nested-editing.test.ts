import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/toast', () => ({ toast: vi.fn() }));

import { newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc, PixelDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { newInstance, rootDoc } from '../../src/core/symbols';
import { saveFile, loadFile } from '../../src/io/file';
import { editSymbol, leaveSymbol } from '../../src/symbols/ops';
import { findTile } from '../../src/tiles/model';
import { editingTileKey, editTile, finishTileEdit } from '../../src/tiles/tileEdit';
import { sampleTileDoc } from '../tiles/helpers';

// The tile map lives inside a symbol, and the stage shows one instance of it.
function doc(): { doc: Doc; keys: number[] } {
  const { doc, keys } = sampleTileDoc();
  const tiles = doc.layers.pop()!;
  doc.symbols = { y1: { id: 'y1', name: 'Level', layers: [tiles], length: 1, origin: { x: 0, y: 0 } } };
  const d = newVectorDrawing();
  d.shapes.push(newInstance('y1', { x: 0, y: 0 }));
  doc.drawings[d.id] = d;
  const stage = newVectorLayer('Stage');
  stage.cels.push({ id: 'cs', start: 0, length: 1, drawingId: d.id });
  doc.layers = [stage];
  return { doc, keys };
}

const paint = (key: number) =>
  store().update('Paint', (d) => {
    const dr = d.drawings[d.layers[0].cels[0].drawingId] as PixelDrawing;
    const px = new Uint8ClampedArray(dr.pixels);
    px.set([1, 2, 3, 255], 0);
    dr.pixels = px;
  }) ?? key;

describe('tiles and symbols open at once', () => {
  let keys: number[];
  beforeEach(() => {
    const d = doc();
    keys = d.keys;
    resetStore(d.doc);
  });

  it('a tile opened inside a symbol goes back into the symbol, and the symbol stays open', () => {
    editSymbol('y1');
    expect(store().get().doc.editing?.length).toBe(1);
    expect(editTile(keys[0])).toBe(true);
    paint(keys[0]);
    finishTileEdit();
    const d = store().get().doc;
    expect(d.editing?.length).toBe(1);
    const t = findTile(d.tileset, keys[0])!;
    expect([...(d.drawings[t.frames[0].drawingId] as PixelDrawing).pixels.slice(0, 4)]).toEqual([1, 2, 3, 255]);
    // One undo takes the tile change back, the next leaves the symbol.
    store().undo();
    expect([...(store().get().doc.drawings[findTile(store().get().doc.tileset, keys[0])!.frames[0].drawingId] as PixelDrawing).pixels.slice(0, 4)]).toEqual([80, 180, 60, 255]);
    expect(store().get().doc.editing?.length).toBe(1);
  });

  it('saving with a tile open inside a symbol saves the whole document with the tile change', () => {
    editSymbol('y1');
    editTile(keys[0]);
    paint(keys[0]);
    const bytes = saveFile(store().rootDoc(), 'test');
    const back = loadFile(bytes).doc;
    expect(back.editing).toBeUndefined();
    expect(back.symbols?.y1.layers[0].kind).toBe('tilemap');
    const t = findTile(back.tileset, keys[0])!;
    expect([...(back.drawings[t.frames[0].drawingId] as PixelDrawing).pixels.slice(0, 4)]).toEqual([1, 2, 3, 255]);
  });

  it('opening a symbol while a tile is open finishes the tile first', () => {
    editTile(keys[0]);
    paint(keys[0]);
    editSymbol('y1');
    expect(editingTileKey()).toBe(0);
    const d = store().get().doc;
    expect(d.editing?.[0].symbolId).toBe('y1');
    const t = findTile(d.tileset, keys[0])!;
    expect((d.drawings[t.frames[0].drawingId] as PixelDrawing).pixels[0]).toBe(1);
  });

  it('going back out of a symbol while a tile is open finishes the tile and leaves the symbol', () => {
    editSymbol('y1');
    editTile(keys[0]);
    leaveSymbol();
    expect(editingTileKey()).toBe(0);
    expect(store().get().doc.editing).toBeUndefined();
    expect(rootDoc(store().get().doc).symbols?.y1.layers.length).toBe(1);
  });
});
