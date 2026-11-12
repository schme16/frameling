// Loads the slices scene from a sprite sheet export in a real Godot 4, headless. Skipped unless GODOT_BIN points at a
// Godot 4 editor:  GODOT_BIN=/path/to/godot npx vitest run test/export/slices-godot-e2e
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSheetFiles } from '../../src/export/engines';
import { DEFAULT_SHEET } from '../../src/export/types';
import type { RawImage } from '../../src/io/png';
import { slicesForExport } from '../../src/pixel/slices/model';
import { newPixelLayer } from '../../src/core/doc';

const GODOT = process.env.GODOT_BIN;

describe.skipIf(!GODOT)('Godot loads the slices of a sprite sheet export', () => {
  it('a 9-patch becomes a NinePatchRect with its borders, a plain slice a Sprite2D on the right region with the pivot as origin', () => {
    // A 40 x 24 frame: a red panel at 8..32 x 4..20, a green 6 x 6 block at 2..8 x 2..8.
    const w = 40;
    const h = 24;
    const px = new Uint8ClampedArray(w * h * 4);
    const fill = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set(c, (y * w + x) * 4);
    };
    fill(8, 4, 32, 20, [255, 0, 0, 255]);
    fill(2, 2, 8, 8, [0, 255, 0, 255]);
    const frame: RawImage = { width: w, height: h, pixels: px };
    const layer = newPixelLayer('Sprite', 1);
    layer.slices = [
      { id: 'a', name: 'Panel', x: 8, y: 4, w: 24, h: 16, center: { x: 12, y: 8, w: 16, h: 8 } },
      { id: 'b', name: 'Block', x: 2, y: 2, w: 6, h: 6, pivot: { x: 5, y: 8 } },
    ];
    const out = buildSheetFiles({
      doc: { name: 'Hero', clips: [], markers: [], fps: 12 },
      sheet: { ...DEFAULT_SHEET, engine: 'godot', trim: true, json: false, godotPath: 'res://sprites/hero.png' },
      frames: [frame],
      range: { start: 0, end: 0 },
      whole: true,
      clipId: null,
      scale: 1,
      name: 'Hero',
      pixelArt: true,
      maxSide: 4096,
      slices: slicesForExport([layer], 1),
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-slices-'));
    mkdirSync(path.join(dir, 'sprites'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="slices"\n');
    for (const f of out.files) writeFileSync(path.join(dir, 'sprites', f.name), f.bytes);
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func _init():
	var scene: PackedScene = load("res://sprites/hero-slices.tscn")
	var root = scene.instantiate()
	var out := []
	for n in root.get_children():
		if n is NinePatchRect:
			var c: Color = n.texture.get_image().get_pixel(int(n.region_rect.position.x) + 12, int(n.region_rect.position.y) + 6)
			out.append("%s:nine:%s:%d,%d,%d,%d:%s:%s" % [n.name, n.region_rect, n.patch_margin_left, n.patch_margin_top, n.patch_margin_right, n.patch_margin_bottom, n.size, c.to_html(false)])
		elif n is Sprite2D:
			var img: Image = n.texture.get_image()
			out.append("%s:sprite:%s:%s:%s:%s" % [n.name, n.texture.region, n.offset, n.centered, img.get_pixel(0, 0).to_html(false)])
	out.sort()
	print("RESULT " + "|".join(out))
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const res = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'check.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = res.split('\n').find((l) => l.startsWith('RESULT ')) ?? res;
    // The panel: its region on the sheet, borders 4 4 4 4, a solid red middle. The block: region, pivot (3, 6) from its corner as the origin.
    expect(line).toContain('Panel:nine:');
    expect(line).toContain('[P: (8.0, 4.0), S: (24.0, 16.0)]');
    expect(line).toContain(':4,4,4,4:');
    expect(line).toContain(':ff0000');
    expect(line).toContain('Block:sprite:');
    expect(line).toContain('[P: (2.0, 2.0), S: (6.0, 6.0)]');
    expect(line).toContain('(-3.0, -6.0)');
    expect(line).toContain('false');
    expect(line).toContain(':00ff00');
  }, 240000);

  it('a slice that moves is played by an AnimationPlayer: the region, pivot and borders at each key are what that frame drew', () => {
    // Six 32 x 20 frames, each with a 6 x 6 block of its own colour that moves right and down.
    const W = 32;
    const H = 20;
    const COLORS = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]];
    const frames: RawImage[] = COLORS.map((c, f) => {
      const px = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) px.set([...c, 255], ((3 + f + y) * W + 2 + 4 * f + x) * 4);
      px.set([9, 9, 9, 255], (H - 1) * W * 4 + (W - 1) * 4);
      return { width: W, height: H, pixels: px };
    });
    const layer = newPixelLayer('Sprite', 1);
    layer.slices = [
      { id: 'h', name: 'hand', x: 2, y: 3, w: 6, h: 6, pivot: { x: 4, y: 9 }, keys: [
        { frame: 0, x: 2, y: 3, w: 6, h: 6, pivot: { x: 4, y: 9 } },
        { frame: 2, x: 10, y: 5, w: 6, h: 6, pivot: { x: 13, y: 8 } },
        { frame: 4, x: 18, y: 7, w: 6, h: 6 },
      ] },
      { id: 'p', name: 'panel', x: 2, y: 3, w: 6, h: 6, center: { x: 3, y: 4, w: 4, h: 4 }, keys: [
        { frame: 0, x: 2, y: 3, w: 6, h: 6, center: { x: 3, y: 4, w: 4, h: 4 } },
        { frame: 3, x: 14, y: 6, w: 6, h: 6, center: { x: 15, y: 8, w: 3, h: 2 } },
      ] },
      // No middle on the first key, one on the second: still a NinePatchRect, with borders of 0 until the key that has a middle.
      { id: 'b', name: 'badge', x: 2, y: 3, w: 6, h: 6, keys: [
        { frame: 0, x: 2, y: 3, w: 6, h: 6 },
        { frame: 3, x: 14, y: 6, w: 6, h: 6, center: { x: 15, y: 8, w: 3, h: 2 } },
      ] },
    ];
    const out = buildSheetFiles({
      // Two clips: "run" through every frame, and "drop" backward from frame 5 to 1 (it holds the last picture).
      doc: { name: 'Hero', clips: [{ id: 'c1', name: 'run', start: 0, end: 5, loop: true }, { id: 'c2', name: 'drop', start: 1, end: 5, loop: false, direction: 'reverse' }], markers: [], fps: 10 },
      sheet: { ...DEFAULT_SHEET, engine: 'godot', trim: true, dedupe: false, json: false, godotPath: 'res://sprites/hero.png' },
      frames,
      range: { start: 0, end: 5 },
      whole: true,
      clipId: null,
      scale: 1,
      name: 'Hero',
      pixelArt: true,
      maxSide: 4096,
      slices: slicesForExport([layer], 1, { start: 0, end: 5 }),
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-moving-'));
    mkdirSync(path.join(dir, 'sprites'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="slices"\n');
    for (const f of out.files) writeFileSync(path.join(dir, 'sprites', f.name), f.bytes);
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func _initialize():
	var root_node = load("res://sprites/hero-slices.tscn").instantiate()
	root.add_child(root_node)
	await process_frame
	await process_frame
	var p: AnimationPlayer = root_node.get_node("SlicePlayer")
	var res := ["anim:%s:%s:%s" % [p.current_animation, p.get_animation("run").length, p.get_animation("run").loop_mode]]
	var b = root_node.get_node("badge")
	for t in [0.0, 0.25, 0.3, 0.5]:
		p.play("run")
		p.seek(t, true)
		res.append("b=%s|%s|%d,%d,%d,%d|%s" % [t, b.get_class(), b.patch_margin_left, b.patch_margin_top, b.patch_margin_right, b.patch_margin_bottom, b.size])
	res.append("drop:%s:%s" % [p.get_animation("drop").length, p.get_animation("drop").loop_mode])
	for t in [0.0, 0.1, 0.2, 0.35, 0.4, 0.5]:
		p.seek(t, true)
		var h: Sprite2D = root_node.get_node("hand")
		var n: NinePatchRect = root_node.get_node("panel")
		var hc: Color = h.texture.get_image().get_pixel(int(h.region_rect.position.x) + 3, int(h.region_rect.position.y) + 3)
		var nc: Color = n.texture.get_image().get_pixel(int(n.region_rect.position.x) + 3, int(n.region_rect.position.y) + 3)
		res.append("t=%s|hand %s %s %s|panel %s %s %d,%d,%d,%d %s" % [t, h.region_rect, h.offset, hc.to_html(false), n.region_rect, n.size, n.patch_margin_left, n.patch_margin_top, n.patch_margin_right, n.patch_margin_bottom, nc.to_html(false)])
	# The clip that plays backward: frames 5, 4, 3, 2, 1 at 0.1 s each.
	p.play("drop")
	for t in [0.0, 0.1, 0.2, 0.3, 0.4]:
		p.seek(t, true)
		var h2: Sprite2D = root_node.get_node("hand")
		var n2: NinePatchRect = root_node.get_node("panel")
		var hc2: Color = h2.texture.get_image().get_pixel(int(h2.region_rect.position.x) + 3, int(h2.region_rect.position.y) + 3)
		var nc2: Color = n2.texture.get_image().get_pixel(int(n2.region_rect.position.x) + 3, int(n2.region_rect.position.y) + 3)
		res.append("d=%s|%s|%s" % [t, hc2.to_html(false), nc2.to_html(false)])
	print("RESULT " + "#".join(res))
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const res = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'check.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = res.split('\n').find((l) => l.startsWith('RESULT ')) ?? res;
    const rows = line.slice(7).split('#');
    // The first clip plays on its own; each clip is an animation of its own name.
    expect(rows[0]).toBe('anim:run:0.6:1');
    expect(rows.find((r) => r.startsWith('drop:'))).toBe('drop:0.5:0');
    // The badge is a NinePatchRect, its borders 0 until the key that has a middle.
    const bd = (t: string) => rows.find((r) => r.startsWith(`b=${t}|`))!;
    expect(bd('0.0')).toBe('b=0.0|NinePatchRect|0,0,0,0|(6.0, 6.0)');
    expect(bd('0.25')).toBe('b=0.25|NinePatchRect|0,0,0,0|(6.0, 6.0)');
    expect(bd('0.3')).toBe('b=0.3|NinePatchRect|1,2,2,2|(6.0, 6.0)');
    expect(bd('0.5')).toBe('b=0.5|NinePatchRect|1,2,2,2|(6.0, 6.0)');
    // Backward over frames 5 to 1: the hand and panel keys in force are cyan/yellow, cyan/yellow, blue/yellow, blue/red, red/red.
    const d = (t: string) => rows.find((r) => r.startsWith(`d=${t}|`))!;
    for (const [t, hand, panel] of [['0.0', '00ffff', 'ffff00'], ['0.1', '00ffff', 'ffff00'], ['0.2', '0000ff', 'ffff00'], ['0.3', '0000ff', 'ff0000'], ['0.4', 'ff0000', 'ff0000']]) expect(d(t), t).toBe(`d=${t}|${hand}|${panel}`);
    const at = (t: string) => rows.find((r) => r.startsWith(`t=${t}|`))!;
    // The key in force at each time: hand keys at 0, 0.2, 0.4 s (frames 0, 2, 4: red, blue, cyan); panel keys at 0 and 0.3 s (frames 0, 3: red, yellow).
    for (const [t, hand, panel] of [['0.0', 'ff0000', 'ff0000'], ['0.1', 'ff0000', 'ff0000'], ['0.2', '0000ff', 'ff0000'], ['0.35', '0000ff', 'ffff00'], ['0.4', '00ffff', 'ffff00'], ['0.5', '00ffff', 'ffff00']]) {
      const r = at(t);
      expect(r, t).toContain(`${hand}|panel`);
      expect(r.endsWith(panel), `${t}: ${r}`).toBe(true);
    }
    // The pivot is the node's offset: (2, 6) from the corner, then (3, 3), then none.
    expect(at('0.0')).toContain('(-2.0, -6.0)');
    expect(at('0.2')).toContain('(-3.0, -3.0)');
    expect(at('0.4')).toContain('(0.0, 0.0)');
    // The 9-patch's borders and size change with its key.
    expect(at('0.0')).toContain(' 1,1,1,1 ');
    expect(at('0.35')).toContain(' 1,2,2,2 ');
  }, 240000);
});
