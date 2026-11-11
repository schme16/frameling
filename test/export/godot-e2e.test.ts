// Loads an exported sprite sheet in a real Godot 4, headless. Skipped unless GODOT_BIN points at a Godot 4 editor:
//   GODOT_BIN=/path/to/godot npx vitest run test/export/godot-e2e
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodePng, type RawImage } from '../../src/io/png';
import { buildAnimations, buildCells, composeSheet, godotScene, godotSpriteFrames, layoutCells } from '../../src/export/sheet';

const GODOT = process.env.GODOT_BIN;

function img(w: number, h: number, rgba: [number, number, number, number]): RawImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, pixels: data } as unknown as RawImage;
}

describe.skipIf(!GODOT)('Godot loads the export', () => {
  it('reads SpriteFrames, its animations and the AnimatedSprite2D scene', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-'));
    mkdirSync(path.join(dir, 'sprites'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="check"\n');

    const frames = [img(8, 8, [255, 0, 0, 255]), img(8, 8, [255, 0, 0, 255]), img(8, 8, [0, 255, 0, 255]), img(8, 8, [0, 0, 255, 255])];
    const { cells, cellOfFrame } = buildCells(frames, { trim: false, dedupe: true, cuts: new Set([2]) });
    const layout = layoutCells(cells, { columns: 2, padding: 1 });
    writeFileSync(path.join(dir, 'sprites/hero.png'), encodePng(composeSheet(cells, layout)));
    const animations = buildAnimations({
      clips: [
        { id: 'a', name: 'idle', start: 0, end: 1, loop: true },
        { id: 'b', name: 'run', start: 2, end: 3, loop: false },
      ],
      rangeStart: 0,
      rangeEnd: 3,
      fps: 12,
      whole: true,
    });
    writeFileSync(path.join(dir, 'sprites/hero.tres'), godotSpriteFrames({ texturePath: 'res://sprites/hero.png', layout, cells, cellOfFrame, animations }));
    writeFileSync(path.join(dir, 'sprites/hero.tscn'), godotScene({ resourcePath: 'res://sprites/hero.tres', nodeName: 'Hero', animation: 'idle' }));
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func _init():
	var sf: SpriteFrames = load("res://sprites/hero.tres")
	var out := []
	for a in sf.get_animation_names():
		var total := 0.0
		for i in sf.get_frame_count(a):
			total += sf.get_frame_duration(a, i)
		out.append("%s:%d:%s:%s:%s" % [a, sf.get_frame_count(a), total, sf.get_animation_speed(a), sf.get_animation_loop(a)])
	out.sort()
	var scene: PackedScene = load("res://sprites/hero.tscn")
	var node = scene.instantiate()
	out.append("node:%s:%s" % [node.get_class(), node.animation])
	var tex: AtlasTexture = sf.get_frame_texture("run", 0)
	out.append("tex:%s:%s" % [tex.region.size.x, tex.region.size.y])
	print("RESULT " + ",".join(out))
	quit()
`,
    );
    // The first run imports the PNG (builds .godot/imported), the second loads it.
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const out = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'check.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = out.split('\n').find((l) => l.startsWith('RESULT ')) ?? out;
    // Frames 0 and 1 are the same drawing, so idle is one frame held for 2.
    expect(line).toContain('idle:1:2.0:12.0:true');
    expect(line).toContain('run:2:2.0:12.0:false');
    expect(line).toContain('node:AnimatedSprite2D:idle');
    expect(line).toContain('tex:8.0:8.0');
  }, 240000);
});
