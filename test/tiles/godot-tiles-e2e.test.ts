// Loads an exported TileSet and tilemap scene in a real Godot 4, headless. Skipped unless GODOT_BIN points at Godot 4.3+:
//   GODOT_BIN=/path/to/godot npx vitest run test/tiles/godot-tiles-e2e
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newDoc, newTilemapDrawing, newTilemapLayer } from '../../src/core/doc';
import { TILE_FLIP_X, TILE_FLIP_Y, type PixelDrawing } from '../../src/core/format';
import { encodePng } from '../../src/io/png';
import { buildTileAtlas, godotTileScene, godotTileSet, mapsAt } from '../../src/tiles/export';
import { addTile, ensureTileset, makeCell, rotateFlags } from '../../src/tiles/model';

const GODOT = process.env.GODOT_BIN;

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

describe.skipIf(!GODOT)('Godot loads the tileset export', () => {
  it('reads the TileSet, its animated tile and the TileMapLayer cells', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-tiles-'));
    mkdirSync(path.join(dir, 'tiles'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="check"\n');
    const { doc } = sampleTileDoc();
    const atlas = buildTileAtlas(doc, { columns: 0, padding: 1, extrude: 1, scale: 1 });
    writeFileSync(path.join(dir, 'tiles/level.png'), encodePng(atlas.image));
    writeFileSync(path.join(dir, 'tiles/level.tres'), godotTileSet(atlas, 'res://tiles/level.png', doc.fps));
    writeFileSync(path.join(dir, 'tiles/level.tscn'), godotTileScene({ tileSetPath: 'res://tiles/level.tres', rootName: 'Level', maps: mapsAt(doc, 0), atlas }));
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func _init():
	var ts: TileSet = load("res://tiles/level.tres")
	var src: TileSetAtlasSource = ts.get_source(0)
	var out := []
	out.append("size:%s" % ts.tile_size)
	out.append("tiles:%d" % src.get_tiles_count())
	for i in src.get_tiles_count():
		var c := src.get_tile_id(i)
		out.append("t%s:%d:%s" % [c, src.get_tile_animation_frames_count(c), src.get_tile_texture_region(c).position])
	var scene: PackedScene = load("res://tiles/level.tscn")
	var root = scene.instantiate()
	var layer: TileMapLayer = root.get_child(0)
	out.append("layer:%s:%d" % [layer.name, layer.get_used_cells().size()])
	out.append("flipx:%d" % layer.get_cell_alternative_tile(Vector2i(2, 4)))
	out.append("flipy:%d" % layer.get_cell_alternative_tile(Vector2i(3, 4)))
	out.append("turn:%d" % layer.get_cell_alternative_tile(Vector2i(4, 4)))
	out.append("water:%s" % layer.get_cell_atlas_coords(Vector2i(6, 3)))
	out.append("anim:%s" % src.get_tile_animation_frame_duration(layer.get_cell_atlas_coords(Vector2i(6, 3)), 1))
	print("RESULT " + ",".join(out))
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const out = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'check.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = out.split('\n').find((l) => l.startsWith('RESULT ')) ?? out;
    expect(line).toContain('size:(8, 8)');
    expect(line).toContain('tiles:3');
    expect(line).toContain('layer:Ground:12');
    expect(line).toContain('flipx:4096');
    expect(line).toContain('flipy:8192');
    // A quarter turn clockwise: transpose plus left-right.
    expect(line).toContain('turn:20480');
    expect(line).toContain('water:(0, 1)');
    // 3 frames at 12 fps.
    expect(line).toContain('anim:0.25');
    // Two frames for water, one for the others; padding 1 and extrude 1 put slot 1 at 1 + 1 * (8 + 3).
    expect(line).toMatch(/t\(1, 0\):1:\(12(\.0)?, 1(\.0)?\)/);
    expect(line).toMatch(/t\(0, 1\):2:/);
  }, 240000);
});
