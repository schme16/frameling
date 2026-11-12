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
});
