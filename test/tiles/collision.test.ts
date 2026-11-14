import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { TileShape } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { addDataLayer, clearTileData, coerceData, removeDataLayer, renameDataLayer, retypeDataLayer, setTileData } from '../../src/tiles/data';
import { addTile, duplicateTile, ensureTileset, setTileSize } from '../../src/tiles/model';
import { propsOf, writeProps } from '../../src/tiles/props';
import { boxFromCorners, cleanCollision, fitShapes, godotPolygons, isWholeTile, moveShape, shapeHas, validShape, wholeTileBox } from '../../src/tiles/shapes';
import { slotPoints } from '../../src/tiles/collisionView';
import { addTerrain, setTileBit, setTileTerrain } from '../../src/tiles/terrain';
import { TILE_FLIP_X, TILE_FLIP_D } from '../../src/core/format';

describe('shapes', () => {
  it('makes a box from two corners in any order, at least a pixel, inside the tile', () => {
    expect(boxFromCorners(10, 12, 4, 6, 16, 16)).toEqual({ kind: 'box', x: 4, y: 6, w: 6, h: 6 });
    expect(boxFromCorners(3, 3, 3, 3, 16, 16)).toEqual({ kind: 'box', x: 3, y: 3, w: 1, h: 1 });
    expect(boxFromCorners(-5, -5, 40, 40, 16, 16)).toEqual({ kind: 'box', x: 0, y: 0, w: 16, h: 16 });
  });

  it('says what is a real shape and what is inside it', () => {
    const tri: TileShape = { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }] };
    expect(validShape(tri)).toBe(true);
    expect(validShape({ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 8, y: 8 }] })).toBe(false);
    expect(validShape({ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 4, y: 4 }] })).toBe(false);
    expect(validShape({ kind: 'box', x: 0, y: 0, w: 0, h: 4 })).toBe(false);
    expect(shapeHas(tri, 2, 2)).toBe(true);
    expect(shapeHas(tri, 6, 6)).toBe(false);
    expect(shapeHas(wholeTileBox(8, 8), 7, 7)).toBe(true);
  });

  it('keeps a whole-tile box whole when the size changes, and pulls the rest inside', () => {
    const shapes: TileShape[] = [wholeTileBox(16, 16), { kind: 'box', x: 8, y: 8, w: 8, h: 8 }, { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 16 }] }];
    const out = fitShapes(shapes, { w: 16, h: 16 }, { w: 8, h: 8 });
    expect(isWholeTile(out[0], 8, 8)).toBe(true);
    // The second box is squashed to a pixel at the edge, then dropped when it has no room.
    expect(out.length).toBe(3);
    expect(out[2]).toEqual({ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }] });
  });

  it('moves a shape but never out of the tile', () => {
    const b: TileShape = { kind: 'box', x: 2, y: 2, w: 4, h: 4 };
    expect(moveShape(b, 100, -100, 16, 16)).toEqual({ kind: 'box', x: 12, y: 0, w: 4, h: 4 });
  });

  it('drops empty collisions', () => {
    expect(cleanCollision({ shapes: [{ kind: 'box', x: 0, y: 0, w: 0, h: 3 }] })).toBeUndefined();
    expect(cleanCollision({ shapes: [wholeTileBox(4, 4)], oneWay: true })).toEqual({ shapes: [wholeTileBox(4, 4)], oneWay: true });
  });

  it('writes Godot polygons from the tile centre, scaled, one winding', () => {
    const [box] = godotPolygons({ shapes: [{ kind: 'box', x: 0, y: 0, w: 16, h: 8 }] }, 16, 16, 2);
    expect(box).toEqual([
      { x: -16, y: -16 },
      { x: 16, y: -16 },
      { x: 16, y: 0 },
      { x: -16, y: 0 },
    ]);
    const [back] = godotPolygons({ shapes: [{ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 0, y: 16 }, { x: 16, y: 0 }] }] }, 16, 16, 1);
    // Turned round to go clockwise like the others.
    expect(back.map((p) => [p.x, p.y])).toEqual([[8, -8], [-8, 8], [-8, -8]]);
  });

  it('turns a shape with the cell it sits in', () => {
    const c = { shapes: [{ kind: 'box' as const, x: 0, y: 0, w: 16, h: 8 }] };
    const flat = slotPoints(c, 0, 16, 16, 0, 0, 1)[0];
    expect(flat.map((p) => [p.x, p.y])).toEqual([[0, 0], [16, 0], [16, 8], [0, 8]]);
    const mirrored = slotPoints(c, TILE_FLIP_X, 16, 16, 0, 0, 1)[0];
    expect(new Set(mirrored.map((p) => p.x))).toEqual(new Set([0, 16]));
    // A quarter turn (flip x and swap) puts the strip that was on top at the right.
    const turned = slotPoints(c, (TILE_FLIP_X | TILE_FLIP_D) >>> 0, 16, 16, 0, 0, 1)[0];
    expect(Math.min(...turned.map((p) => p.x))).toBe(8);
    expect(Math.max(...turned.map((p) => p.x))).toBe(16);
  });
});

describe('custom values', () => {
  it('keeps names unique and converts what you type', () => {
    const doc = newDoc();
    const ts = ensureTileset(doc, 8, 8);
    const t = addTile(doc);
    expect(addDataLayer(ts, 'damage', 'int').name).toBe('damage');
    expect(addDataLayer(ts, 'damage', 'bool').name).toBe('damage 2');
    expect(setTileData(ts, t, 'damage', '3.7')).toBe(true);
    expect(t.data).toEqual({ damage: 4 });
    expect(setTileData(ts, t, 'damage', 'lots')).toBe(false);
    expect(setTileData(ts, t, 'damage 2', 'true')).toBe(true);
    expect(t.data).toEqual({ damage: 4, 'damage 2': true });
    expect(coerceData('float', '1.5')).toBe(1.5);
    expect(coerceData('string', 12)).toBe('12');
    expect(coerceData('bool', 'maybe')).toBeUndefined();
  });

  it('renames, retypes and removes a value on every tile', () => {
    const doc = newDoc();
    const ts = ensureTileset(doc, 8, 8);
    const a = addTile(doc);
    const b = addTile(doc);
    addDataLayer(ts, 'hp', 'int');
    setTileData(ts, a, 'hp', 5);
    setTileData(ts, b, 'hp', 2);
    expect(renameDataLayer(ts, 'hp', 'health')).toBe(true);
    expect(a.data).toEqual({ health: 5 });
    retypeDataLayer(ts, 'health', 'string');
    expect(a.data).toEqual({ health: '5' });
    retypeDataLayer(ts, 'health', 'bool');
    expect(a.data).toBeUndefined();
    clearTileData(b, 'health');
    expect(removeDataLayer(ts, 'health')).toBe(true);
    expect(ts.dataLayers).toBeUndefined();
  });
});

describe('copying and saving', () => {
  function sample() {
    const doc = newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } });
    const ts = ensureTileset(doc, 16, 16);
    const wall = addTile(doc, { name: 'Wall' });
    wall.collision = { shapes: [wholeTileBox(16, 16)] };
    const spike = addTile(doc, { name: 'Spike' });
    spike.collision = { shapes: [{ kind: 'polygon', points: [{ x: 0, y: 16 }, { x: 8, y: 6 }, { x: 16, y: 16 }] }], oneWay: true };
    addDataLayer(ts, 'damage', 'int');
    setTileData(ts, spike, 'damage', 2);
    const g = addTerrain(ts, { name: 'Grass' });
    setTileTerrain(wall, g.id);
    setTileBit(wall, 'top', g.id);
    ts.terrainMode = 'sides';
    return { doc, ts, wall, spike };
  }

  it('copies shapes, values and terrain with a tile', () => {
    const { doc, wall, spike } = sample();
    const w2 = duplicateTile(doc, wall.key)!;
    const s2 = duplicateTile(doc, spike.key)!;
    expect(w2.collision).toEqual(wall.collision);
    expect(w2.collision).not.toBe(wall.collision);
    expect(w2.terrain).toEqual(wall.terrain);
    expect(s2.data).toEqual({ damage: 2 });
  });

  it('round trips through a file, and an old file opens with none of it', () => {
    const { doc, wall, spike } = sample();
    const back = loadFile(saveFile(doc));
    expect(back.warnings).toEqual([]);
    const ts = back.doc.tileset!;
    expect(ts.tiles[0].collision).toEqual(wall.collision);
    expect(ts.tiles[1].collision).toEqual(spike.collision);
    expect(ts.tiles[1].data).toEqual({ damage: 2 });
    expect(ts.dataLayers).toEqual([{ name: 'damage', type: 'int' }]);
    expect(ts.terrains).toEqual([{ id: 1, name: 'Grass', color: '#5fbf5f' }]);
    expect(ts.terrainMode).toBe('sides');
    expect(ts.tiles[0].terrain).toEqual({ id: 1, bits: { top: 1 } });
    // Nothing set, nothing saved.
    const plain = newDoc();
    ensureTileset(plain, 8, 8);
    addTile(plain);
    const t = loadFile(saveFile(plain)).doc.tileset!;
    expect(Object.keys(t.tiles[0]).sort()).toEqual(['frames', 'key', 'name']);
    expect(t.dataLayers).toBeUndefined();
    expect(t.terrains).toBeUndefined();
  });

  it('drops what makes no sense in a hand-edited file instead of failing', () => {
    const { doc } = sample();
    const raw = loadFile(saveFile(doc)).doc;
    // Poke a mess into a copy that goes through the reader again.
    const messy = structuredClone(raw);
    const t = messy.tileset!.tiles[0] as unknown as Record<string, unknown>;
    t.collision = { shapes: [{ kind: 'box', x: 'a', y: 0, w: 4, h: 4 }, { kind: 'polygon', points: [{ x: 1, y: 1 }] }, { kind: 'box', x: -3, y: 2, w: 500, h: 4 }, 7], oneWay: 'yes' };
    t.data = { damage: 'x', ghost: 4 };
    t.terrain = { id: 99, bits: { top: 1 } };
    (messy.tileset!.tiles[1] as unknown as Record<string, unknown>).terrain = { id: 1, bits: { top: 7, left: 1, nonsense: 1 } };
    (messy.tileset as unknown as Record<string, unknown>).terrainMode = 'diagonal';
    const back = loadFile(saveFile(messy)).doc.tileset!;
    expect(back.tiles[0].collision).toEqual({ shapes: [{ kind: 'box', x: 0, y: 2, w: 16, h: 4 }] });
    expect(back.tiles[0].data).toBeUndefined();
    expect(back.tiles[0].terrain).toBeUndefined();
    expect(back.tiles[1].terrain).toEqual({ id: 1, bits: { left: 1 } });
    expect(back.terrainMode).toBeUndefined();
  });

  it('pulls shapes inside when the tile size changes', () => {
    const { doc, wall } = sample();
    setTileSize(doc, 8, 8);
    expect(wall.collision).toEqual({ shapes: [wholeTileBox(8, 8)] });
  });

  it('carries a bundle on and off a tile, leaving out what is empty', () => {
    const { wall } = sample();
    const p = propsOf(wall);
    p.collision = undefined;
    writeProps(wall, p);
    expect(wall.collision).toBeUndefined();
    expect(wall.terrain).toBeDefined();
  });
});
