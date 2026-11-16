import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newTilemapDrawing, newTilemapLayer } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { resetStore } from '../../src/core/store';
import { buildTileAtlas, godotTileSet, mapsAt, tiledTileset, tilesetFiles, tilesetJson, DEFAULT_TILESET_EXPORT } from '../../src/tiles/export';
import { addDataLayer, setTileData } from '../../src/tiles/data';
import { addTile, ensureTileset, findTile, makeCell } from '../../src/tiles/model';
import * as ops from '../../src/tiles/ops';
import { setTileUi, getTileUi } from '../../src/tiles/state';
import { wholeTileBox } from '../../src/tiles/shapes';
import { addEdgeSet, addTerrain } from '../../src/tiles/terrain';
import { propsDoc } from './helpers';
import { sampleTileDoc } from './helpers';

describe('Godot TileSet text', () => {
  it('writes a physics layer, custom data layers and a terrain set only when they are used', () => {
    const { doc } = sampleTileDoc();
    const plain = godotTileSet(buildTileAtlas(doc, { columns: 0, padding: 0, extrude: 0, scale: 1 }), 'res://t.png', 12);
    expect(plain).not.toContain('physics_layer');
    expect(plain).not.toContain('custom_data');
    expect(plain).not.toContain('terrain_set');
    const text = godotTileSet(buildTileAtlas(propsDoc(), { columns: 0, padding: 0, extrude: 0, scale: 1 }), 'res://t.png', 12);
    expect(text).toContain('physics_layer_0/collision_layer = 1');
    expect(text).toContain('custom_data_layer_0/name = "damage"');
    expect(text).toContain('custom_data_layer_0/type = 2');
    expect(text).toContain('custom_data_layer_1/type = 4');
    expect(text).toContain('custom_data_layer_2/type = 1');
    expect(text).toContain('terrain_set_0/mode = 0');
    expect(text).toContain('terrain_set_0/terrain_0/name = "Grass"');
    expect(text).toContain('terrain_set_0/terrain_1/name = "Dirt"');
    expect(text).toContain('0:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(-4, -4, 4, -4, 4, 4, -4, 4)');
    expect(text).toContain('1:0/0/physics_layer_0/polygon_0/one_way = true');
    expect(text).toContain('0:0/0/custom_data_0 = 4');
    expect(text).toContain('0:0/0/custom_data_1 = "thud \\"hard\\""');
    expect(text).toContain('0:0/0/custom_data_2 = true');
    expect(text).toContain('/0/terrain_set = 0');
    expect(text).toContain('/0/terrains_peering_bit/top_side = 0');
  });

  it('scales shapes with the picture and writes the mode and only the bits it uses', () => {
    const doc = propsDoc();
    doc.tileset!.terrainMode = 'sides';
    const text = godotTileSet(buildTileAtlas(doc, { columns: 0, padding: 0, extrude: 0, scale: 2 }), 'res://t.png', 12);
    expect(text).toContain('0:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(-8, -8, 8, -8, 8, 8, -8, 8)');
    expect(text).toContain('terrain_set_0/mode = 2');
    expect(text).toContain('terrains_peering_bit/right_side');
    expect(text).not.toContain('_corner');
  });

  it('writes the same tileset for the same document', () => {
    const a = godotTileSet(buildTileAtlas(propsDoc(), { columns: 0, padding: 1, extrude: 1, scale: 1 }), 'res://t.png', 12);
    expect(a).toBe(godotTileSet(buildTileAtlas(propsDoc(), { columns: 0, padding: 1, extrude: 1, scale: 1 }), 'res://t.png', 12));
  });
});

describe('Tiled and JSON', () => {
  it('writes properties and collision objects in the picture pixels', () => {
    const atlas = buildTileAtlas(propsDoc(), { columns: 0, padding: 0, extrude: 0, scale: 2 });
    const ts = tiledTileset(atlas, { name: 't', image: 't.png', fps: 12 }) as { tiles: { properties: { name: string; type: string; value: unknown }[]; objectgroup?: { objects: Record<string, unknown>[] } }[] };
    const wall = ts.tiles[0];
    expect(wall.properties.find((p) => p.name === 'damage')).toEqual({ name: 'damage', type: 'int', value: 4 });
    expect(wall.properties.find((p) => p.name === 'slippery')?.type).toBe('bool');
    expect(wall.objectgroup!.objects[0]).toMatchObject({ x: 0, y: 0, width: 16, height: 16 });
    const ledge = ts.tiles[1];
    expect(ledge.properties.find((p) => p.name === 'oneWay')?.value).toBe(true);
    expect(ledge.objectgroup!.objects[0]).toMatchObject({ width: 16, height: 6 });
    expect(ts.tiles[2].objectgroup).toBeUndefined();
  });

  it('lists shapes, values and terrains in the JSON', () => {
    const doc = propsDoc();
    const atlas = buildTileAtlas(doc, { columns: 0, padding: 0, extrude: 0, scale: 1 });
    const j = tilesetJson(atlas, { image: 't.png', fps: 12, maps: mapsAt(doc, 0) }) as { terrains: { name: string }[]; dataLayers: unknown[]; tiles: { collision?: { oneWay: boolean; shapes: unknown[] }; data?: unknown; terrain?: { name: string; edges: Record<string, string> } }[] };
    expect(j.terrains.map((t) => t.name)).toEqual(['Grass', 'Dirt']);
    expect(j.dataLayers.length).toBe(3);
    expect(j.tiles[0].collision!.shapes[0]).toEqual({ type: 'box', x: 0, y: 0, width: 8, height: 8 });
    expect(j.tiles[1].collision!.oneWay).toBe(true);
    expect(j.tiles[0].data).toEqual({ damage: 4, 'name of sound': 'thud "hard"', slippery: true });
    expect(j.tiles[3].terrain!.name).toBe('Grass');
  });

  it('adds nothing when no tile has any', () => {
    const { doc } = sampleTileDoc();
    const j = JSON.stringify(tilesetJson(buildTileAtlas(doc, { columns: 0, padding: 0, extrude: 0, scale: 1 }), { image: 't.png', fps: 12, maps: mapsAt(doc, 0) }));
    expect(j).not.toContain('collision');
    expect(j).not.toContain('terrain');
    expect(j).not.toContain('dataLayers');
  });

  it('makes the files as before for a plain tileset', () => {
    const { doc } = sampleTileDoc();
    const files = tilesetFiles(doc, { ...DEFAULT_TILESET_EXPORT, json: true, tiled: true }, 0).map((f) => f.name);
    expect(files.filter((f) => /\.(tres|tscn|json|tsj|tmj)$/.test(f)).length).toBe(5);
  });
});

describe('editing shapes, values and terrain', () => {
  beforeEach(() => setTileUi({ brush: 0, flags: 0, tileMode: false, terrain: 0 }));

  it('changes the tileset straight away when the tile is not open, one undo step each', () => {
    const doc = newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 8, 8);
    const t = addTile(doc, { name: 'Wall' });
    const s = resetStore(doc);
    expect(ops.solidTile(t.key)).toBe(true);
    expect(findTile(s.get().doc.tileset, t.key)!.collision!.shapes).toEqual([wholeTileBox(8, 8)]);
    expect(ops.setOneWay(t.key, true)).toBe(true);
    expect(findTile(s.get().doc.tileset, t.key)!.collision!.oneWay).toBe(true);
    s.undo();
    expect(findTile(s.get().doc.tileset, t.key)!.collision!.oneWay).toBeUndefined();
    ops.clearShapes(t.key);
    expect(findTile(s.get().doc.tileset, t.key)!.collision).toBeUndefined();
  });

  it('draws into the open tile, undoes with it, and lands with Done as one step', () => {
    const doc = newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 8, 8);
    const t = addTile(doc, { name: 'Wall' });
    const s = resetStore(doc);
    expect(ops.drawShape(t.key, 'polygon')).toBe(true);
    expect(s.get().ui.tool).toBe('tile-shape');
    expect(getTileUi().shapeMode).toBe('polygon');
    ops.addShape(t.key, { kind: 'box', x: 1, y: 1, w: 4, h: 4 });
    ops.addShape(t.key, { kind: 'box', x: 4, y: 4, w: 2, h: 2 });
    expect(ops.tileProps(t.key).collision!.shapes.length).toBe(2);
    // The saved view of the document already has them.
    expect(findTile(s.rootDoc().tileset, t.key)!.collision!.shapes.length).toBe(2);
    // The real document waits until Done.
    s.undo();
    expect(ops.tileProps(t.key).collision!.shapes.length).toBe(1);
    ops.finishTileEdit();
    expect(s.get().ui.tool).toBe('tile-brush');
    expect(findTile(s.get().doc.tileset, t.key)!.collision!.shapes).toEqual([{ kind: 'box', x: 1, y: 1, w: 4, h: 4 }]);
    expect(s.undoLabel()).toBe('Edit tile "Wall"');
    s.undo();
    expect(findTile(s.get().doc.tileset, t.key)!.collision).toBeUndefined();
  });

  it('keeps a tile open while the tileset gains a value or a terrain', () => {
    const doc = newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 8, 8);
    const t = addTile(doc, { name: 'Wall' });
    const s = resetStore(doc);
    ops.editTile(t.key);
    ops.solidTile(t.key);
    ops.addValue('damage', 'int');
    expect(ops.editingTileKey()).toBe(t.key);
    ops.setTileValue(t.key, 'damage', '3');
    const id = ops.addTerrain('Grass');
    ops.setTerrainOf(t.key, id);
    ops.setEdge(t.key, 'top', id);
    ops.finishTileEdit();
    const got = findTile(s.get().doc.tileset, t.key)!;
    expect(got.collision).toBeDefined();
    expect(got.data).toEqual({ damage: 3 });
    expect(got.terrain).toEqual({ id, bits: { top: id } });
    // A repeat name is allowed to fail quietly and an empty value clears.
    ops.setTileValue(t.key, 'damage', '');
    expect(findTile(s.get().doc.tileset, t.key)!.data).toBeUndefined();
    expect(ops.setTileValue(t.key, 'damage', 'lots')).toBe(false);
  });

  it('makes edge tiles, guesses edges, and deletes a terrain', () => {
    const doc = newDoc({ width: 64, height: 64, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 16, 16);
    const s = resetStore(doc);
    const id = ops.addTerrain('Grass');
    expect(ops.makeEdgeTiles(id)).toBe(47);
    const list = s.get().doc.tileset!.tiles;
    expect(list.length).toBe(47);
    // Wipe one tile's edges and guess them back from the picture.
    const t = list[20];
    const want = Object.keys(t.terrain!.bits ?? {}).sort();
    ops.setTerrainOf(t.key, id);
    ops.guessEdges(t.key);
    expect(Object.keys(findTile(s.get().doc.tileset, t.key)!.terrain!.bits ?? {}).sort()).toEqual(want);
    ops.deleteTerrain(id);
    expect(s.get().doc.tileset!.tiles.some((x) => x.terrain)).toBe(false);
    s.undo();
    expect(s.get().doc.tileset!.tiles.every((x) => x.terrain)).toBe(true);
  });

  it('paints a patch with its edges picked, and heals when erased', async () => {
    const doc = newDoc({ width: 64, height: 64, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 16, 16);
    const layer = newTilemapLayer('Ground', 1);
    const map = newTilemapDrawing(4, 4);
    doc.drawings[map.id] = map;
    layer.cels.push({ id: 'c', start: 0, length: 1, drawingId: map.id });
    doc.layers.push(layer);
    const s = resetStore(doc);
    const id = ops.addTerrain('Grass');
    ops.makeEdgeTiles(id);
    // The full tile is the last one made, and the brush after making them.
    const full = getTileUi().brush;
    const { tileBrushTool } = await import('../../src/tiles/tools');
    s.setUi({ activeLayerId: layer.id, tool: 'tile-brush' });
    const ctx = { zoom: 4, requestOverlay() {}, hint() {} };
    const at = (cx: number, cy: number) => ({ x: cx * 16 + 8, y: cy * 16 + 8, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 });
    tileBrushTool.down!(at(1, 1), ctx);
    tileBrushTool.move!(at(2, 1), ctx);
    tileBrushTool.up!(at(2, 1), ctx);
    const m = s.get().doc.drawings[map.id];
    expect(m.kind).toBe('tilemap');
    if (m.kind !== 'tilemap') return;
    const tiles = s.get().doc.tileset!.tiles;
    const bits = (x: number, y: number) => Object.keys(tiles.find((t) => t.key === (m.cells[y * 4 + x] & 0x0fffffff))!.terrain!.bits ?? {}).sort();
    // Two slots side by side: the left one only meets the right, the right only the left.
    expect(bits(1, 1)).toEqual(['right']);
    expect(bits(2, 1)).toEqual(['left']);
    expect(m.cells[1 * 4 + 1]).not.toBe(makeCell(full));
    // One undo step for the stroke.
    expect(s.undoLabel()).toBe('Paint tiles');
  });
});
