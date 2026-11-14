// A small tile document shared by the tile tests: three 8x8 tiles (water animated) and an 8x6 map with flips.
import { newDoc, newTilemapDrawing, newTilemapLayer } from '../../src/core/doc';
import { TILE_FLIP_X, TILE_FLIP_Y, type PixelDrawing } from '../../src/core/format';
import { addTile, ensureTileset, makeCell, rotateFlags } from '../../src/tiles/model';
import { addDataLayer, setTileData } from '../../src/tiles/data';
import { wholeTileBox } from '../../src/tiles/shapes';
import { addEdgeSet, addTerrain } from '../../src/tiles/terrain';
import type { Doc } from '../../src/core/format';

export function sampleTileDoc() {
  const doc = newDoc({ width: 64, height: 48, pixel: { pixelSize: 1 } });
  ensureTileset(doc, 8, 8);
  const colours: [number, number, number][] = [
    [80, 180, 60],
    [140, 100, 60],
    [60, 120, 230],
  ];
  const keys = colours.map(([r, g, b], i) => {
    const t = addTile(doc, { name: ['Grass', 'Dirt', 'Water'][i] });
    const d = doc.drawings[t.frames[0].drawingId] as PixelDrawing;
    for (let p = 0; p < 64; p++) d.pixels.set([r, g, b, 255], p * 4);
    return t.key;
  });
  // Water gets a second frame.
  const water = doc.tileset!.tiles[2];
  const extra = addTile(doc, { name: 'tmp' });
  water.frames.push({ drawingId: extra.frames[0].drawingId, duration: 3 });
  water.frames[0].duration = 3;
  doc.tileset!.tiles.pop();
  const layer = newTilemapLayer('Ground', 1);
  const map = newTilemapDrawing(8, 6);
  for (let x = 0; x < 8; x++) map.cells[5 * 8 + x] = makeCell(keys[0]);
  map.cells[4 * 8 + 2] = makeCell(keys[1], TILE_FLIP_X);
  map.cells[4 * 8 + 3] = makeCell(keys[1], TILE_FLIP_Y);
  map.cells[4 * 8 + 4] = makeCell(keys[1], rotateFlags(0));
  map.cells[3 * 8 + 6] = makeCell(keys[2]);
  doc.drawings[map.id] = map;
  layer.cels.push({ id: 'c', start: 0, length: 1, drawingId: map.id });
  doc.layers.push(layer);
  return { doc, keys };
}


/** A tileset with a wall, a one-way ledge, a spike with a value, and grass edges. */
export function propsDoc(): Doc {
  const { doc } = sampleTileDoc();
  const ts = doc.tileset!;
  ts.tiles[0].collision = { shapes: [wholeTileBox(8, 8)] };
  ts.tiles[1].collision = { shapes: [{ kind: 'box', x: 0, y: 0, w: 8, h: 3 }], oneWay: true };
  addDataLayer(ts, 'damage', 'int');
  addDataLayer(ts, 'name of sound', 'string');
  addDataLayer(ts, 'slippery', 'bool');
  setTileData(ts, ts.tiles[0], 'damage', 4);
  setTileData(ts, ts.tiles[0], 'name of sound', 'thud "hard"');
  setTileData(ts, ts.tiles[0], 'slippery', true);
  const g = addTerrain(ts, { name: 'Grass', color: '#5fbf5f' });
  addTerrain(ts, { name: 'Dirt', color: '#e0a84a' });
  addEdgeSet(doc, g.id);
  return doc;
}

