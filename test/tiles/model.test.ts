import { describe, expect, it } from 'vitest';
import { newDoc, newTilemapDrawing, newTilemapLayer, pruneDrawings } from '../../src/core/doc';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, type PixelDrawing } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import {
  addTile,
  blitTile,
  cellFlags,
  cellKey,
  cellLine,
  deleteTile,
  duplicateTile,
  ensureTileset,
  fillCellRect,
  flattenTilemap,
  floodCells,
  makeCell,
  mirrorFlags,
  moveTile,
  rotateFlags,
  setTileSize,
  tileFrameIndex,
  tileUsage,
} from '../../src/tiles/model';

function px(d: PixelDrawing, x: number, y: number): number[] {
  const i = (y * d.width + x) * 4;
  return [...d.pixels.slice(i, i + 4)];
}

function tileDoc() {
  const doc = newDoc({ width: 64, height: 32, pixel: { pixelSize: 1 } });
  ensureTileset(doc, 2, 2);
  const a = addTile(doc, { name: 'A' });
  const pa = doc.drawings[a.frames[0].drawingId] as PixelDrawing;
  // Top-left red, top-right green, bottom-left blue, bottom-right white.
  pa.pixels.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const b = addTile(doc, { name: 'B' });
  return { doc, a, b };
}

describe('cells', () => {
  it('packs a key with flags and reads them back', () => {
    const c = makeCell(5, TILE_FLIP_X | TILE_FLIP_D);
    expect(cellKey(c)).toBe(5);
    expect(cellFlags(c)).toBe((TILE_FLIP_X | TILE_FLIP_D) >>> 0);
    expect(makeCell(0, TILE_FLIP_X)).toBe(0);
  });

  it('turns four quarter turns back to the start, and mirrors twice back too', () => {
    let f = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      f = rotateFlags(f);
      seen.add(f);
    }
    expect(f).toBe(0);
    expect(seen.size).toBe(4);
    expect(mirrorFlags(mirrorFlags(TILE_FLIP_D, 'x'), 'x')).toBe(TILE_FLIP_D >>> 0);
    expect(rotateFlags(rotateFlags(0, 1), -1)).toBe(0);
  });

  it('a quarter turn clockwise is the diagonal plus a left-right mirror', () => {
    expect(rotateFlags(0)).toBe((TILE_FLIP_D | TILE_FLIP_X) >>> 0);
  });
});

describe('tiles', () => {
  it('adds, copies, reorders and deletes tiles with stable keys', () => {
    const { doc, a, b } = tileDoc();
    expect(a.key).toBe(1);
    expect(b.key).toBe(2);
    const c = duplicateTile(doc, a.key)!;
    expect(c.key).toBe(3);
    expect(c.name).toBe('A copy');
    expect(doc.tileset!.tiles.map((t) => t.key)).toEqual([1, 3, 2]);
    expect(c.frames[0].drawingId).not.toBe(a.frames[0].drawingId);
    expect(moveTile(doc, 2, 0)).toBe(true);
    expect(doc.tileset!.tiles.map((t) => t.key)).toEqual([2, 1, 3]);
    const map = newTilemapDrawing(3, 1);
    map.cells.set([makeCell(1), makeCell(3), makeCell(1, TILE_FLIP_Y)]);
    doc.drawings[map.id] = map;
    expect(tileUsage(doc, 1)).toBe(2);
    expect(deleteTile(doc, 1)).toBe(2);
    expect([...(doc.drawings[map.id] as typeof map).cells]).toEqual([0, makeCell(3), 0]);
    expect(doc.drawings[a.frames[0].drawingId]).toBeUndefined();
    // Keys are never reused.
    expect(addTile(doc).key).toBe(4);
  });

  it('keeps tile pictures when unused drawings are pruned', () => {
    const { doc, a } = tileDoc();
    pruneDrawings(doc);
    expect(doc.drawings[a.frames[0].drawingId]).toBeDefined();
  });

  it('picks the frame of an animated tile', () => {
    const tile = { key: 1, name: 'w', frames: [{ drawingId: 'x', duration: 2 }, { drawingId: 'y', duration: 1 }] };
    expect([0, 1, 2, 3, 4, 5].map((f) => tileFrameIndex(tile, f))).toEqual([0, 0, 1, 0, 0, 1]);
  });

  it('crops or pads tiles when the size changes', () => {
    const { doc, a } = tileDoc();
    setTileSize(doc, 3, 1);
    const d = doc.drawings[a.frames[0].drawingId] as PixelDrawing;
    expect([d.width, d.height]).toEqual([3, 1]);
    expect(px(d, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(d, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(px(d, 2, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('maps', () => {
  it('fills rectangles and floods connected cells', () => {
    const cells = new Uint32Array(16);
    expect(fillCellRect(cells, 4, 4, 2, 2, 0, 0, 7)).toBe(9);
    expect(floodCells(cells, 4, 4, 3, 3, 9)).toBe(7);
    expect([...cells]).toEqual([7, 7, 7, 9, 7, 7, 7, 9, 7, 7, 7, 9, 9, 9, 9, 9]);
    expect(cellLine(0, 0, 3, 1)).toHaveLength(4);
  });

  it('flattens a map into pixels, with flips', () => {
    const { doc, a } = tileDoc();
    const map = newTilemapDrawing(3, 1);
    map.cells.set([makeCell(a.key), makeCell(a.key, TILE_FLIP_X), makeCell(a.key, rotateFlags(0))]);
    const flat = flattenTilemap(doc, map);
    expect([flat.width, flat.height]).toEqual([6, 2]);
    // As drawn.
    expect(px(flat, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(flat, 1, 1)).toEqual([255, 255, 255, 255]);
    // Mirrored: red moves to the top right.
    expect(px(flat, 3, 0)).toEqual([255, 0, 0, 255]);
    expect(px(flat, 2, 0)).toEqual([0, 255, 0, 255]);
    // A quarter turn clockwise: blue (bottom left) comes to the top left, red to the top right.
    expect(px(flat, 4, 0)).toEqual([0, 0, 255, 255]);
    expect(px(flat, 5, 0)).toEqual([255, 0, 0, 255]);
    expect(px(flat, 5, 1)).toEqual([0, 255, 0, 255]);
  });

  it('blits with every orientation landing inside the slot', () => {
    const { doc, a } = tileDoc();
    const src = doc.drawings[a.frames[0].drawingId] as PixelDrawing;
    for (const f of [0, TILE_FLIP_X, TILE_FLIP_Y, TILE_FLIP_D, rotateFlags(0), rotateFlags(rotateFlags(0))]) {
      const out = new Uint8ClampedArray(2 * 2 * 4);
      blitTile(src, f, out, 2, 2, 0, 0);
      let opaque = 0;
      for (let i = 3; i < out.length; i += 4) if (out[i]) opaque++;
      expect(opaque).toBe(4);
    }
  });
});

describe('files', () => {
  it('saves and opens a tileset and a tilemap layer', () => {
    const { doc, a } = tileDoc();
    const layer = newTilemapLayer('Level', 2);
    const map = newTilemapDrawing(4, 2);
    map.cells[0] = makeCell(a.key, TILE_FLIP_X | TILE_FLIP_Y);
    map.cells[5] = makeCell(2);
    doc.drawings[map.id] = map;
    layer.cels.push({ id: 'c1', start: 0, length: 1, drawingId: map.id });
    doc.layers.push(layer);
    const { doc: back, warnings } = loadFile(saveFile(doc));
    expect(warnings).toEqual([]);
    expect(back.tileset!.tiles.map((t) => [t.key, t.name])).toEqual([
      [1, 'A'],
      [2, 'B'],
    ]);
    expect(back.tileset!.nextKey).toBe(3);
    const l = back.layers.find((x) => x.kind === 'tilemap')!;
    expect(l.kind === 'tilemap' && l.pixelSize).toBe(2);
    const m = back.drawings[map.id];
    expect(m.kind).toBe('tilemap');
    if (m.kind !== 'tilemap') return;
    expect(m.cells).toBeInstanceOf(Uint32Array);
    expect(m.cells[0]).toBe(makeCell(a.key, TILE_FLIP_X | TILE_FLIP_Y));
    expect(m.cells[5]).toBe(makeCell(2));
    expect(px(back.drawings[a.frames[0].drawingId] as PixelDrawing, 1, 0)).toEqual([0, 255, 0, 255]);
  });

  it('opens documents without tiles as before', () => {
    const doc = newDoc();
    const back = loadFile(saveFile(doc)).doc;
    expect(back.tileset).toBeUndefined();
  });
});
