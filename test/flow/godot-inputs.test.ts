// The clip flow script with inputs runs in a real Godot 4, headless. Skipped unless GODOT_BIN points at a Godot 4 editor:
//   GODOT_BIN=/path/to/godot npx vitest run test/flow/godot-inputs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RawImage } from '../../src/io/png';

const GODOT = process.env.GODOT_BIN;

describe.skipIf(!GODOT)('the clip flow script with inputs plays in Godot', () => {
  it('runs on speed, jumps only when grounded, gets hurt from any clip, and fades', async () => {
    const { makeHeroSprite } = await import('../../src/templates/hero-sprite');
    const { buildSheetFiles } = await import('../../src/export/engines');
    const { artScale } = await import('../../src/export/plan');
    const { DEFAULT_SHEET } = await import('../../src/export/types');
    const { artFrames } = await import('../export/helpers');
    const { addCondition, addInput, addTransition, editCondition, updateTransition } = await import('../../src/core/flow');
    const { FLOW_ANY } = await import('../../src/core/format');
    const doc = makeHeroSprite();
    const id = (n: string) => doc.clips.find((c) => c.name === n)!.id;
    doc.flow = { start: id('idle'), transitions: [] };
    addInput(doc, 'number', 'speed');
    addInput(doc, 'toggle', 'grounded');
    addInput(doc, 'number', 'health');
    const check = (t: string, input: string, op: '>' | '<=' | '==', value: boolean | number) => {
      addCondition(doc, t);
      editCondition(doc, t, 0, { input, op, value });
    };
    const run = addTransition(doc, id('idle'), id('run'), 'now')!;
    check(run, 'speed', '>', 0.5);
    updateTransition(doc, run, { blend: 0.3 });
    const stop = addTransition(doc, id('run'), id('idle'), 'now')!;
    check(stop, 'speed', '<=', 0.5);
    const jump = addTransition(doc, id('run'), id('jump'), 'trigger', 'jump')!;
    check(jump, 'grounded', '==', true);
    const hurt = addTransition(doc, FLOW_ANY, id('hurt'), 'now')!;
    check(hurt, 'health', '<=', 0);
    addTransition(doc, id('jump'), id('idle'), 'end');
    addTransition(doc, id('hurt'), id('idle'), 'end');

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
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-inputs-'));
    mkdirSync(path.join(dir, 'sprites'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="inputs"\n');
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
	out.append("start:%s" % node.animation)
	node.set_flow_input("speed", 0.8)
	out.append("fast:%s" % node.animation)
	out.append("fading:%d" % node.get_child_count())
	node.set_flow_input("speed", 0.2)
	out.append("slow:%s" % node.animation)
	node.set_flow_input("speed", 0.8)
	out.append("jump-in-the-air:%s" % node.fire("jump"))
	node.set_flow_input("grounded", true)
	out.append("jump-on-the-ground:%s:%s" % [node.fire("jump"), node.animation])
	node.set_flow_input("health", 0)
	out.append("hurt:%s" % node.animation)
	out.append("value:%s" % node.get_flow_input("health"))

func _process(delta):
	t += delta
	if t > 0.6:
		out.append("faded:%d" % node.get_child_count())
		print("RESULT " + ",".join(out))
		return true
	return false
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const res = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'play.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = res.split('\n').find((l) => l.startsWith('RESULT ')) ?? res;
    expect(line).toBe('RESULT start:idle,fast:run,fading:1,slow:idle,jump-in-the-air:false,jump-on-the-ground:true:jump,hurt:hurt,value:0,faded:0');
  }, 240000);
});
