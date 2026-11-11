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

// The phase 2 success test: a game sprite set made entirely in pixel mode (the hero template, with idle, run, jump,
// hurt and die) runs in Godot with no manual setup. Exported exactly as the app does at art size, dropped into
// res://sprites, then played in a running scene tree.
describe.skipIf(!GODOT)('the hero template plays in Godot with no setup', () => {
  it('every clip plays with the right loop, speed and held frames', async () => {
    const { makeHeroSprite } = await import('../../src/templates/hero-sprite');
    const { buildSheetFiles } = await import('../../src/export/engines');
    const { artScale } = await import('../../src/export/plan');
    const { DEFAULT_SHEET } = await import('../../src/export/types');
    const { artFrames } = await import('./helpers');
    const doc = makeHeroSprite();
    const out = buildSheetFiles({
      doc,
      sheet: { ...DEFAULT_SHEET, engine: 'godot', godotScene: true, json: false, trim: true, layout: 'packed', padding: 1, extrude: 1 },
      frames: artFrames(doc) as unknown as RawImage[],
      range: { start: 0, end: doc.length - 1 },
      whole: true,
      clipId: null,
      scale: artScale(doc)!,
      name: doc.name,
      pixelArt: true,
      maxSide: 8192,
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-hero-'));
    mkdirSync(path.join(dir, 'sprites'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="hero"\n');
    for (const f of out.files) writeFileSync(path.join(dir, 'sprites', f.name), f.bytes);
    const scene = out.files.find((f) => f.name.endsWith('.tscn'))!.name;
    writeFileSync(
      path.join(dir, 'play.gd'),
      `extends SceneTree
var node: AnimatedSprite2D
var clips := ["idle", "run", "jump", "hurt", "die"]
var at := 0
var t := 0.0
var finished := false
var out := []

func _init():
	node = (load("res://sprites/${scene}") as PackedScene).instantiate()
	root.add_child(node)
	var sf := node.sprite_frames
	out.append("filter:%d" % node.texture_filter)
	out.append("autoplay:%s" % node.autoplay)
	for a in clips:
		var total := 0.0
		for i in sf.get_frame_count(a):
			total += sf.get_frame_duration(a, i)
		out.append("%s:%d:%s:%s:%s" % [a, sf.get_frame_count(a), total, sf.get_animation_speed(a), sf.get_animation_loop(a)])
	node.animation_finished.connect(func(): finished = true)
	_start()

func _start():
	t = 0.0
	finished = false
	node.play(clips[at])

func _process(delta):
	t += delta
	# Each clip gets a little over twice its length: loops must still be going, the others must have finished.
	var sf := node.sprite_frames
	var a: String = clips[at]
	var total := 0.0
	for i in sf.get_frame_count(a):
		total += sf.get_frame_duration(a, i)
	if t < total / sf.get_animation_speed(a) * 2.2:
		return false
	out.append("ran:%s:playing=%s:finished=%s:frame=%d" % [a, node.is_playing(), finished, node.frame])
	at += 1
	if at >= clips.size():
		print("RESULT " + ",".join(out))
		return true
	_start()
	return false
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const res = execFileSync(GODOT!, ['--headless', '--path', dir, '--fixed-fps', '60', '--script', 'play.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = res.split('\n').find((l) => l.startsWith('RESULT ')) ?? res;
    expect(line).toContain('filter:1');
    expect(line).toContain('autoplay:idle');
    expect(line).toContain('idle:4:4.0:12.0:true');
    expect(line).toContain('run:6:6.0:12.0:true');
    expect(line).toContain('jump:3:3.0:12.0:false');
    expect(line).toContain('hurt:3:3.0:12.0:false');
    // The last die pose is one drawing held for 4 frames.
    expect(line).toContain('die:4:7.0:12.0:false');
    expect(line).toContain('ran:idle:playing=true:finished=false');
    expect(line).toContain('ran:run:playing=true:finished=false');
    expect(line).toContain('ran:jump:playing=false:finished=true:frame=2');
    expect(line).toContain('ran:hurt:playing=false:finished=true:frame=2');
    expect(line).toContain('ran:die:playing=false:finished=true:frame=3');
  }, 240000);
});

// The clip flow script runs in a real Godot: it starts on the first clip, follows a trigger, and moves on by itself
// when a one-shot clip ends.
describe.skipIf(!GODOT)('the clip flow script plays in Godot', () => {
  it('starts on idle, jumps on a trigger, and lands back on idle when the jump ends', async () => {
    const { makeHeroSprite } = await import('../../src/templates/hero-sprite');
    const { buildSheetFiles } = await import('../../src/export/engines');
    const { artScale } = await import('../../src/export/plan');
    const { DEFAULT_SHEET } = await import('../../src/export/types');
    const { artFrames } = await import('./helpers');
    const doc = makeHeroSprite();
    const out = buildSheetFiles({
      doc,
      sheet: { ...DEFAULT_SHEET, engine: 'godot', godotScene: true, json: false },
      frames: artFrames(doc) as unknown as RawImage[],
      range: { start: 0, end: doc.length - 1 },
      whole: true,
      clipId: null,
      scale: artScale(doc)!,
      name: doc.name,
      pixelArt: true,
      maxSide: 8192,
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-flow-'));
    mkdirSync(path.join(dir, 'sprites'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="flow"\n');
    for (const f of out.files) writeFileSync(path.join(dir, 'sprites', f.name), f.bytes);
    const tres = out.files.find((f) => f.name.endsWith('.tres'))!.name;
    const gd = out.files.find((f) => f.name.endsWith('_flow.gd'))!.name;
    writeFileSync(
      path.join(dir, 'play.gd'),
      `extends SceneTree
var node: AnimatedSprite2D
var t := 0.0
var step := 0
var out := []

func _init():
	node = AnimatedSprite2D.new()
	node.sprite_frames = load("res://sprites/${tres}")
	node.set_script(load("res://sprites/${gd}"))
	root.add_child(node)

func _process(delta):
	t += delta
	if step == 0 and t > 0.1:
		out.append("start:%s" % node.animation)
		out.append("nowhere:%s" % node.fire("nothing"))
		out.append("fire:%s:%s" % [node.fire("jump"), node.animation])
		step = 1
		t = 0.0
	elif step == 1 and t > 1.5:
		out.append("after:%s" % node.animation)
		print("RESULT " + ",".join(out))
		return true
	return false
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const res = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'play.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = res.split('\n').find((l) => l.startsWith('RESULT ')) ?? res;
    expect(line).toBe('RESULT start:idle,nowhere:false,fire:true:jump,after:idle');
  }, 240000);
});
