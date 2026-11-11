import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { TILE_FLIP_X, type PixelDrawing } from '../../src/core/format';
import { resetStore } from '../../src/core/store';
import { buildTileAtlas, DEFAULT_TILESET_EXPORT, godotTileMapData, layoutTiles, mapsAt, tiledMap, tiledTileset, tilesetFiles, tilesetJson } from '../../src/tiles/export';
import { addTile, ensureTileset, findTile, makeCell } from '../../src/tiles/model';
import { editingTileKey, editTile, finishTileEdit } from '../../src/tiles/tileEdit';
import { getTileUi, setTileUi } from '../../src/tiles/state';
import { makeTileset } from '../../src/templates/tileset';
import { sampleTileDoc } from './helpers';

describe('tileset export', () => {
  it('keeps an animated tile on one row', () => {
    const { doc } = sampleTileDoc();
    const lay = layoutTiles(doc, 3);
    // Grass and Dirt fill two slots; Water needs two, so it wraps to the next row.
    expect(lay.tiles.map((t) => t.frames.map((f) => [f.col, f.row]))).toEqual([[[0, 0]], [[1, 0]], [[0, 1], [1, 1]]]);
  });

  it('extrudes edge pixels and spaces tiles by padding', () => {
    const { doc } = sampleTileDoc();
    const a = buildTileAtlas(doc, { columns: 3, padding: 2, extrude: 1, scale: 2 });
    expect(a.tileWidth).toBe(16);
    expect(a.margin).toBe(1);
    expect(a.spacing).toBe(4);
    expect(a.image.width).toBe(3 * 18 + 2 * 2);
    // The extruded corner copies grass's corner colour.
    expect([...a.image.pixels.slice(0, 4)]).toEqual([80, 180, 60, 255]);
    // The padding between the first two tiles stays empty.
    const x = 18;
    expect(a.image.pixels[(1 * a.image.width + x) * 4 + 3]).toBe(0);
  });

  it('writes Tiled gids with Tiled flip bits, and the plain JSON', () => {
    const { doc, keys } = sampleTileDoc();
    const atlas = buildTileAtlas(doc, DEFAULT_TILESET_EXPORT);
    const map = tiledMap(atlas, { tilesetSource: 'x.tsj', maps: mapsAt(doc, 0) }) as { layers: { data: number[] }[] };
    const data = map.layers[0].data;
    expect(data[5 * 8]).toBe(1);
    expect(data[4 * 8 + 2]).toBe((2 | TILE_FLIP_X) >>> 0);
    const ts = tiledTileset(atlas, { name: 'x', image: 'x.png', fps: 12 }) as { tiles: { animation?: { duration: number }[] }[] };
    expect(ts.tiles.find((t) => t.animation)!.animation![0].duration).toBe(250);
    const json = tilesetJson(atlas, { image: 'x.png', fps: 12, maps: mapsAt(doc, 0) }) as { maps: { cells: number[] }[] };
    expect(json.maps[0].cells[5 * 8]).toBe(1);
    expect(keys).toHaveLength(3);
  });

  it('packs Godot tile_map_data as 12 bytes per used cell', () => {
    const { doc } = sampleTileDoc();
    const atlas = buildTileAtlas(doc, DEFAULT_TILESET_EXPORT);
    const bytes = godotTileMapData(mapsAt(doc, 0)[0].map!, atlas);
    expect(bytes.length).toBe(2 + 12 * 12);
  });

  it('makes the files the dialog asks for', () => {
    const doc = makeTileset();
    const names = tilesetFiles(doc, { ...DEFAULT_TILESET_EXPORT, json: true, tiled: true }, 0).map((f) => f.name);
    expect(names).toEqual(['tileset.png', 'tileset.tres', 'tileset.tscn', 'tileset.json', 'tileset.tsj', 'tileset.tmj']);
  });
});

describe('editing a tile', () => {
  it('opens the tile as its own document and puts it back as one undo step', () => {
    const doc = newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 4, 4);
    const t = addTile(doc, { name: 'A' });
    const s = resetStore(doc);
    setTileUi({ tileMode: false });
    expect(editTile(t.key)).toBe(true);
    expect(editingTileKey()).toBe(t.key);
    expect(s.get().doc.width).toBe(4);
    expect(getTileUi().tileMode).toBe(true);
    // Draw a pixel in the tile document.
    s.update('dot', (d) => {
      const px = d.drawings[d.layers[0].cels[0].drawingId] as PixelDrawing;
      const next = new Uint8ClampedArray(px.pixels);
      next.set([255, 0, 0, 255], 0);
      px.pixels = next;
    });
    // Saving now would carry the change.
    const root = s.rootDoc();
    expect((root.drawings[findTile(root.tileset, t.key)!.frames[0].drawingId] as PixelDrawing).pixels[0]).toBe(255);
    finishTileEdit();
    expect(editingTileKey()).toBe(0);
    expect(getTileUi().tileMode).toBe(false);
    const back = s.get().doc;
    expect(back.width).toBe(32);
    expect((back.drawings[findTile(back.tileset, t.key)!.frames[0].drawingId] as PixelDrawing).pixels[0]).toBe(255);
    expect(s.undoLabel()).toBe('Edit tile "A"');
    s.undo();
    expect((s.get().doc.drawings[t.frames[0].drawingId] as PixelDrawing).pixels[0]).toBe(0);
  });

  it('turns extra keys on the timeline into animation frames', () => {
    const doc = newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 4, 4);
    const t = addTile(doc, { name: 'W' });
    const s = resetStore(doc);
    editTile(t.key);
    s.update('key', (d) => {
      const l = d.layers[0];
      const first = d.drawings[l.cels[0].drawingId] as PixelDrawing;
      const copy = { ...first, id: 'second', pixels: new Uint8ClampedArray(first.pixels) };
      d.drawings.second = copy;
      l.cels[0].length = 2;
      l.cels.push({ id: 'c2', start: 2, length: 3, drawingId: 'second' });
      d.length = 5;
    });
    finishTileEdit();
    expect(findTile(s.get().doc.tileset, t.key)!.frames.map((f) => f.duration)).toEqual([2, 3]);
  });

  it('a map uses the edited tile by key', () => {
    const doc = makeTileset();
    const ground = doc.layers[0];
    const map = doc.drawings[ground.cels[0].drawingId];
    expect(map.kind === 'tilemap' && map.cells[8 * 20]).toBe(makeCell(1));
  });
});
