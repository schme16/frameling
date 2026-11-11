// The Godot importer add-on (godot/addons/frameling_importer) in a real Godot 4, headless. Skipped unless GODOT_BIN
// points at a Godot 4 editor:
//   GODOT_BIN=/path/to/godot npx vitest run test/export/godot-addon-e2e
// A .flplay goes into a project with the add-on switched on, `--import` turns it into a scene (and, picked in its
// .import file, bare SpriteFrames), and changing the package imports it again.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { playablePackage } from '../../src/export/playable';
import { makeHeroSprite } from '../../src/templates/hero-sprite';
import { newDoc } from '../../src/core/doc';
import { artFrames } from './helpers';

const GODOT = process.env.GODOT_BIN;
const addon = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../godot/addons/frameling_importer');

const CHECK = `extends SceneTree
func describe(sf: SpriteFrames) -> String:
	var out := []
	for a in sf.get_animation_names():
		var total := 0.0
		for i in sf.get_frame_count(a):
			total += sf.get_frame_duration(a, i)
		out.append("%s:%d:%s:%s:%s" % [a, sf.get_frame_count(a), total, sf.get_animation_speed(a), sf.get_animation_loop(a)])
	out.sort()
	return ",".join(out)
func _init():
	var scene: PackedScene = load("res://hero.flplay")
	var node: AnimatedSprite2D = scene.instantiate()
	print("SCENE %s:%s:%s:%s" % [node.get_class(), node.animation, node.autoplay, node.texture_filter])
	print("CLIPS " + describe(node.sprite_frames))
	var tex: AtlasTexture = node.sprite_frames.get_frame_texture(node.animation, 0)
	print("TEX %d:%d" % [tex.get_width(), tex.get_height()])
	print("MARKERS %s" % [node.sprite_frames.get_meta("frameling_markers", []).size()])
	var sf = load("res://bare.flplay")
	print("BARE %s:%s" % [sf.get_class(), describe(sf)])
	quit()
`;

function heroPackage(): { bytes: Uint8Array; clips: { name: string; loop: boolean }[]; fps: number; width: number; height: number } {
  const doc = makeHeroSprite();
  const { bytes, manifest } = playablePackage({ doc, frames: artFrames(doc), range: { start: 0, end: doc.length - 1 }, scale: 1, pixelArt: true, background: null, maxSide: 4096 });
  return { bytes, clips: manifest.clips, fps: manifest.fps, width: doc.width, height: doc.height };
}

function run(dir: string, args: string[]): string {
  return execFileSync(GODOT!, ['--headless', '--path', dir, ...args], { encoding: 'utf8', timeout: 180000, stdio: 'pipe' });
}

describe.skipIf(!GODOT)('the Godot importer add-on', () => {
  it('imports a .flplay as a scene and as SpriteFrames, and again when it changes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-addon-'));
    cpSync(addon, path.join(dir, 'addons/frameling_importer'), { recursive: true });
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="addon"\n\n[editor_plugins]\nenabled=PackedStringArray("res://addons/frameling_importer/plugin.cfg")\n');
    const hero = heroPackage();
    writeFileSync(path.join(dir, 'hero.flplay'), hero.bytes);
    writeFileSync(path.join(dir, 'bare.flplay'), hero.bytes);
    // Picking the other importer is a line in the .import file, same as choosing it in the Import dock.
    writeFileSync(path.join(dir, 'bare.flplay.import'), '[remap]\n\nimporter="frameling.spriteframes"\ntype="SpriteFrames"\n');
    writeFileSync(path.join(dir, 'check.gd'), CHECK);

    run(dir, ['--import']);
    const out = run(dir, ['--script', 'check.gd']);
    const line = (tag: string) => out.split('\n').find((l) => l.startsWith(tag + ' '))?.slice(tag.length + 1) ?? `(no ${tag} in) ${out}`;

    const first = hero.clips[0].name;
    // Nearest filter (1), since the package is pixel art.
    expect(line('SCENE')).toBe(`AnimatedSprite2D:${first}:${first}:1`);
    const clips = line('CLIPS');
    for (const c of hero.clips) {
      const m = clips.split(',').find((x) => x.startsWith(c.name + ':'));
      expect(m, c.name).toBeTruthy();
      const [, , total, speed, loop] = m!.split(':');
      const want = hero.clips.find((x) => x.name === c.name) as unknown as { start: number; end: number };
      expect(Number(total), c.name).toBe(want.end - want.start + 1);
      expect(Number(speed)).toBe(hero.fps);
      expect(loop).toBe(String(c.loop));
    }
    // Every frame is the whole stage again, trimmed or not.
    expect(line('TEX')).toBe(`${hero.width}:${hero.height}`);
    expect(line('BARE').startsWith('SpriteFrames:')).toBe(true);
    expect(line('BARE').slice('SpriteFrames:'.length)).toBe(clips);

    // Change the package (now one clip, "wave"): importing again picks it up.
    const doc = newDoc({ name: 'Wave', width: 16, height: 16, fps: 8, length: 3 });
    doc.clips = [{ id: 'w', name: 'wave', start: 0, end: 2, loop: false }];
    const frames = [0, 1, 2].map((i) => {
      const p = new Uint8ClampedArray(16 * 16 * 4);
      p.set([255, i * 100, 0, 255], (i * 16 + i) * 4);
      return { width: 16, height: 16, pixels: p };
    });
    writeFileSync(path.join(dir, 'hero.flplay'), playablePackage({ doc, frames, range: { start: 0, end: 2 }, scale: 1, pixelArt: false, background: null, maxSide: 256 }).bytes);
    run(dir, ['--import']);
    const again = run(dir, ['--script', 'check.gd']);
    expect(again).toContain('SCENE AnimatedSprite2D:wave:wave:0');
    expect(again).toContain('CLIPS wave:3:3.0:8.0:false');
    expect(again).toContain('TEX 16:16');
    expect(readFileSync(path.join(dir, 'hero.flplay.import'), 'utf8')).toContain('importer="frameling.scene"');
  }, 600000);
});
