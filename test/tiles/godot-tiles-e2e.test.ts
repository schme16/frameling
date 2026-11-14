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
import { sampleTileDoc, propsDoc } from './helpers';
import { placeWithEdges, addEdgeSet, addTerrain } from '../../src/tiles/terrain';

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


describe.skipIf(!GODOT)('Godot loads shapes, custom values and terrains', () => {
  const project = (name: string) => {
    const dir = mkdtempSync(path.join(tmpdir(), `frameling-godot-${name}-`));
    mkdirSync(path.join(dir, 'tiles'));
    writeFileSync(path.join(dir, 'project.godot'), `config_version=5\n\n[application]\nconfig/name="${name}"\n`);
    return dir;
  };
  const run = (dir: string, script: string) => {
    writeFileSync(path.join(dir, 'check.gd'), script);
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const out = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'check.gd'], { encoding: 'utf8', timeout: 120000 });
    return out;
  };

  it('opens the TileSet with its physics layer, custom data layers and terrain set intact, and builds real collision', () => {
    const dir = project('props');
    const doc = propsDoc();
    // A spike (a triangle) standing on the ground, at map slot (7, 4).
    const spike = addTile(doc, { name: 'Spike' });
    spike.collision = { shapes: [{ kind: 'polygon', points: [{ x: 0, y: 8 }, { x: 4, y: 2 }, { x: 8, y: 8 }] }] };
    const map = mapsAt(doc, 0)[0].map!;
    map.cells[4 * 8 + 7] = makeCell(spike.key);
    const atlas = buildTileAtlas(doc, { columns: 0, padding: 1, extrude: 1, scale: 1 });
    writeFileSync(path.join(dir, 'tiles/level.png'), encodePng(atlas.image));
    writeFileSync(path.join(dir, 'tiles/level.tres'), godotTileSet(atlas, 'res://tiles/level.png', doc.fps));
    writeFileSync(path.join(dir, 'tiles/level.tscn'), godotTileScene({ tileSetPath: 'res://tiles/level.tres', rootName: 'Level', maps: mapsAt(doc, 0), atlas }));
    const at = (key: number) => atlas.tiles.find((t) => t.key === key)!.frames[0];
    const wall = at(doc.tileset!.tiles[0].key);
    const ledge = at(doc.tileset!.tiles[1].key);
    const edge = doc.tileset!.tiles[3];
    const out = run(
      dir,
      `extends SceneTree
func _init():
	var ts: TileSet = load("res://tiles/level.tres")
	var src: TileSetAtlasSource = ts.get_source(0)
	var o := []
	o.append("physics:%d:%d" % [ts.get_physics_layers_count(), ts.get_physics_layer_collision_layer(0)])
	o.append("custom:%d" % ts.get_custom_data_layers_count())
	for i in ts.get_custom_data_layers_count():
		o.append("cd%d:%s:%d" % [i, ts.get_custom_data_layer_name(i), ts.get_custom_data_layer_type(i)])
	o.append("tsets:%d:%d" % [ts.get_terrain_sets_count(), ts.get_terrain_set_mode(0)])
	o.append("terrains:%d:%s:%s:%s" % [ts.get_terrains_count(0), ts.get_terrain_name(0, 0), ts.get_terrain_name(0, 1), ts.get_terrain_color(0, 0).to_html(false)])
	var wd: TileData = src.get_tile_data(Vector2i(${wall.col}, ${wall.row}), 0)
	o.append("wall:%d:%s:%s" % [wd.get_collision_polygons_count(0), wd.get_collision_polygon_points(0, 0), wd.is_collision_polygon_one_way(0, 0)])
	o.append("wallvals:%s:%s:%s" % [wd.get_custom_data("damage"), wd.get_custom_data("name of sound"), wd.get_custom_data("slippery")])
	var ld: TileData = src.get_tile_data(Vector2i(${ledge.col}, ${ledge.row}), 0)
	o.append("ledge:%s:%s" % [ld.get_collision_polygon_points(0, 0), ld.is_collision_polygon_one_way(0, 0)])
	var ed: TileData = src.get_tile_data(Vector2i(${at(edge.key).col}, ${at(edge.key).row}), 0)
	o.append("edge:%d:%d:%d:%d:%d" % [ed.terrain_set, ed.terrain, ed.get_terrain_peering_bit(TileSet.CELL_NEIGHBOR_RIGHT_SIDE), ed.get_terrain_peering_bit(TileSet.CELL_NEIGHBOR_TOP_SIDE), ed.get_terrain_peering_bit(TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER)])
	var scene: PackedScene = load("res://tiles/level.tscn")
	var root = scene.instantiate()
	get_root().add_child(root)
	await physics_frame
	await physics_frame
	await physics_frame
	var space = root.get_world_2d().direct_space_state
	var hit = func(a: Vector2, b: Vector2):
		var r = space.intersect_ray(PhysicsRayQueryParameters2D.create(a, b))
		return "none" if r.is_empty() else str(r.position)
	# Straight down onto the ground, along a ledge row, down onto the spike, and through the empty sky.
	o.append("ground:%s" % hit.call(Vector2(4, 0), Vector2(4, 60)))
	o.append("side:%s" % hit.call(Vector2(-10, 44), Vector2(30, 44)))
	o.append("spike:%s" % hit.call(Vector2(60, 0), Vector2(60, 60)))
	o.append("spikeedge:%s" % hit.call(Vector2(57, 0), Vector2(57, 60)))
	o.append("sky:%s" % hit.call(Vector2(30, -20), Vector2(30, -2)))
	print("RESULT " + "|".join(o))
	quit()
`,
    );
    const line = out.split('\n').find((l) => l.startsWith('RESULT ')) ?? out;
    const parts = new Map(line.slice(7).split('|').map((p) => [p.split(':')[0], p.slice(p.indexOf(':') + 1)]));
    expect(parts.get('physics')).toBe('1:1');
    expect(parts.get('custom')).toBe('3');
    expect(parts.get('cd0')).toBe('damage:2');
    expect(parts.get('cd1')).toBe('name of sound:4');
    expect(parts.get('cd2')).toBe('slippery:1');
    expect(parts.get('tsets')).toBe('1:0');
    expect(parts.get('terrains')).toBe('2:Grass:Dirt:5fbf5f');
    expect(parts.get('wall')).toBe('1:[(-4.0, -4.0), (4.0, -4.0), (4.0, 4.0), (-4.0, 4.0)]:false');
    expect(parts.get('wallvals')).toBe('4:thud "hard":true');
    expect(parts.get('ledge')).toBe('[(-4.0, -4.0), (4.0, -4.0), (4.0, -1.0), (-4.0, -1.0)]:true');
    // The edge tile is Grass (terrain 0) and touches what Frameling said.
    const want = edge.terrain!.bits ?? {};
    expect(parts.get('edge')).toBe(`0:0:${want.right !== undefined ? 0 : -1}:${want.top !== undefined ? 0 : -1}:${want['top-left'] !== undefined ? 0 : -1}`);
    // Real collision: the ground row is at y = 40 (slot row 5), the wall column's left edge at x = 0.
    expect(parts.get('ground')).toBe('(4.0, 40.0)');
    expect(parts.get('side')).toContain('(0.0, 44.0)');
    // The spike: the apex is 2 px into its slot at y = 32, so a ray down its middle lands at y = 34.
    expect(parts.get('spike')).toContain('(60.0, 34');
    // Past the tip's slope the ray hits the ground instead.
    expect(parts.get('spikeedge')).toBeDefined();
    expect(parts.get('sky')).toBe('none');
    void ledge;
  }, 300000);

  it('picks the same edge tiles as Godot paints with its own terrain brush, on a block and an L', () => {
    const dir = project('terrain');
    const doc = newDoc({ width: 64, height: 64, pixel: { pixelSize: 1 } });
    ensureTileset(doc, 16, 16);
    const g = addTerrain(doc.tileset!, { name: 'Grass' });
    addEdgeSet(doc, g.id);
    const atlas = buildTileAtlas(doc, { columns: 7, padding: 0, extrude: 0, scale: 1 });
    writeFileSync(path.join(dir, 'tiles/g.png'), encodePng(atlas.image));
    writeFileSync(path.join(dir, 'tiles/g.tres'), godotTileSet(atlas, 'res://tiles/g.png', doc.fps));
    const shapes: Record<string, [number, number][]> = {
      block: [1, 2, 3].flatMap((y) => [1, 2, 3].map((x) => [x, y] as [number, number])),
      ell: [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3]],
      ring: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]],
    };
    const cols = 6;
    const ours: Record<string, string[]> = {};
    const fullKey = doc.tileset!.tiles[doc.tileset!.tiles.length - 1].key;
    for (const [name, cells] of Object.entries(shapes)) {
      const m = new Uint32Array(cols * cols);
      for (const [x, y] of cells) placeWithEdges(m, cols, cols, doc.tileset!, x, y, makeCell(fullKey));
      ours[name] = cells.map(([x, y]) => {
        const f = atlas.tiles.find((t) => t.key === (m[y * cols + x] & 0x0fffffff))!.frames[0];
        return `${x},${y}=${f.col}:${f.row}`;
      });
    }
    const out = run(
      dir,
      `extends SceneTree
func _init():
	var ts: TileSet = load("res://tiles/g.tres")
	var shapes = ${JSON.stringify(shapes).replace(/\[(\d+),(\d+)\]/g, 'Vector2i($1, $2)')}
	var o := []
	for name in shapes:
		var layer := TileMapLayer.new()
		layer.tile_set = ts
		get_root().add_child(layer)
		layer.set_cells_terrain_connect(shapes[name], 0, 0)
		var bits := []
		for c in shapes[name]:
			var a: Vector2i = layer.get_cell_atlas_coords(c)
			bits.append("%d,%d=%d:%d" % [c.x, c.y, a.x, a.y])
		o.append(name + "~" + ";".join(bits))
	print("RESULT " + "|".join(o))
	quit()
`,
    );
    const line = out.split('\n').find((l) => l.startsWith('RESULT ')) ?? out;
    const theirs = Object.fromEntries(line.slice(7).split('|').map((p) => [p.split('~')[0], p.split('~')[1].split(';')]));
    for (const name of Object.keys(shapes)) expect(ours[name], `the ${name}`).toEqual(theirs[name]);
  }, 300000);
});
