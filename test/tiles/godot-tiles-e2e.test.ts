// Loads an exported TileSet and tilemap scene in a real Godot 4, headless. Skipped unless GODOT_BIN points at Godot 4.3+:
//   GODOT_BIN=/path/to/godot npx vitest run test/tiles/godot-tiles-e2e
// The render check also needs a display for Godot's OpenGL renderer (xvfb-run is enough); without one it is skipped.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newDoc, newTilemapDrawing, newTilemapLayer } from '../../src/core/doc';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, type PixelDrawing } from '../../src/core/format';
import { decodePng, encodePng } from '../../src/io/png';
import { buildTileAtlas, godotTileScene, godotTileSet, mapsAt } from '../../src/tiles/export';
import { addTile, ensureTileset, flattenTilemap, makeCell, rotateFlags } from '../../src/tiles/model';
import { sampleTileDoc } from './helpers';

const GODOT = process.env.GODOT_BIN;

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

  it('draws every turn and flip of a tile, at the layer pixel size, the same as Frameling', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-render-'));
    mkdirSync(path.join(dir, 'tiles'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="render"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(0, 0, 0, 1)\n');
    // One 8 x 8 tile with no symmetry at all, so any wrong turn or flip shows.
    const doc = newDoc({ width: 128, height: 64, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 8, 8);
    const t = addTile(doc, { name: 'Arrow' });
    const px = (doc.drawings[t.frames[0].drawingId] as PixelDrawing).pixels;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px.set([x * 32, y * 32, x === 0 && y < 3 ? 255 : 60, 255], (y * 8 + x) * 4);
    // Pixel size 2, so the layer has to be scaled to match.
    const layer = newTilemapLayer('Turns', 2);
    const map = newTilemapDrawing(4, 2);
    const orientations = [0, rotateFlags(0), rotateFlags(rotateFlags(0)), rotateFlags(0, -1), TILE_FLIP_X, TILE_FLIP_Y, TILE_FLIP_D, (TILE_FLIP_X | TILE_FLIP_D) >>> 0];
    orientations.forEach((f, i) => (map.cells[i] = makeCell(t.key, f)));
    doc.drawings[map.id] = map;
    layer.cels.push({ id: 'c', start: 0, length: 1, drawingId: map.id });
    doc.layers.push(layer);
    const atlas = buildTileAtlas(doc, { columns: 0, padding: 1, extrude: 1, scale: 1 });
    writeFileSync(path.join(dir, 'tiles/level.png'), encodePng(atlas.image));
    writeFileSync(path.join(dir, 'tiles/level.tres'), godotTileSet(atlas, 'res://tiles/level.png', doc.fps));
    writeFileSync(path.join(dir, 'tiles/level.tscn'), godotTileScene({ tileSetPath: 'res://tiles/level.tres', rootName: 'Level', maps: mapsAt(doc, 0), atlas }));
    writeFileSync(
      path.join(dir, 'render.gd'),
      `extends SceneTree
func _init():
	root.add_child(load("res://tiles/level.tscn").instantiate())
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://render.png")
	print("RENDERED")
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    let out = '';
    try {
      const args = ['--path', dir, '--rendering-driver', 'opengl3', '--script', 'render.gd'];
      out = process.env.DISPLAY ? execFileSync(GODOT!, args, { encoding: 'utf8', timeout: 120000, stdio: 'pipe' }) : execFileSync('xvfb-run', ['-a', GODOT!, ...args], { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    } catch (e) {
      console.warn('Godot could not render (no display or xvfb-run), skipping the picture check.', String(e).slice(0, 300));
      return;
    }
    expect(out).toContain('RENDERED');
    const got = decodePng(readFileSync(path.join(dir, 'render.png')));
    const want = flattenTilemap(doc, map, 0);
    const k = 2;
    let wrong = 0;
    let first = '';
    for (let y = 0; y < want.height * k; y++) {
      for (let x = 0; x < want.width * k; x++) {
        const w = (Math.floor(y / k) * want.width + Math.floor(x / k)) * 4;
        const g = (y * got.width + x) * 4;
        const diff = Math.max(...[0, 1, 2].map((c) => Math.abs(want.pixels[w + c] - got.pixels[g + c])));
        if (diff > 2) {
          wrong++;
          first ||= `at ${x},${y}: Frameling ${[...want.pixels.slice(w, w + 3)]} Godot ${[...got.pixels.slice(g, g + 3)]}`;
        }
      }
    }
    expect(wrong, first).toBe(0);
    // And the layer stops where the document says it does: black beyond it.
    const past = (2 * want.width * k + 1) * 4;
    expect([...got.pixels.slice(past, past + 3)]).toEqual([0, 0, 0]);
  }, 240000);
});
