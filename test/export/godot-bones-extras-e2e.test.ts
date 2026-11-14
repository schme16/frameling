// Loads a Godot "bones" export that has a symbol with its own skeleton, a camera, a layer with depth and a layer with
// an Add blend in a real Godot 4, plays it and checks the nested bones, the instance, the camera and the parallax land
// where Frameling puts them. Skipped unless GODOT_BIN is set (see godot-bones-e2e).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cameraMatrix, cameraViewAt, parallaxFactor } from '../../src/core/camera';
import type { Doc } from '../../src/core/format';
import { buildAnimations } from '../../src/export/sheet';
import { bonesStage, godotBonesScene, godotBonesShaders } from '../../src/export/godot-bones';
import { rigState } from '../../src/rig/math';
import { rigPoseAt } from '../../src/rig/pose';
import { bonesExtrasDoc as extrasDoc } from '../../src/export/bonesExtrasDoc';
import { cards } from './bones-helpers';

const GODOT = process.env.GODOT_BIN;
const K = 2;

const m6 = (m: readonly number[], k = K) => [m[0], m[1], m[2], m[3], m[4] * k, m[5] * k];
const mulM = (a: readonly number[], b: readonly number[]) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

describe.skipIf(!GODOT)('Godot plays nested bones, the camera and parallax', () => {
  const doc: Doc = extrasDoc({ camera: { a: { x: 180, y: 135, zoom: 1, rotation: 0 }, b: { x: 230, y: 150, zoom: 1.6, rotation: 8 } } });
  const range = { start: 0, end: doc.length - 1 };
  const top = bonesStage(doc, range);
  const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-extras-'));
  mkdirSync(path.join(dir, 'parts'));
  cards(top, dir);
  const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: doc.length - 1, fps: doc.fps, whole: true });
  const input = { doc, range, parts: top.parts, textures: top.textures!, scale: K, animations, rootName: 'Extras', nested: top.nested };
  writeFileSync(path.join(dir, 'extras.tscn'), godotBonesScene(input));
  for (const sh of godotBonesShaders(input)) writeFileSync(path.join(dir, sh.name), sh.text);
  writeFileSync(path.join(dir, 'project.godot'), `config_version=5\n\n[application]\nconfig/name="extras"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n\n[display]\nwindow/size/viewport_width=${doc.width * K}\nwindow/size/viewport_height=${doc.height * K}\n`);
  const frames = [0, 2, 5, 6, 8, 11];

  it('has the nested rigs, the camera and the parallax layer in the scene', () => {
    expect(top.nested.length).toBe(2);
    expect(top.parts.map((p) => p.layer.name)).toEqual(['Sky', 'Glow']);
  });

  it('puts the nested bones, the camera and the far layer where Frameling does', () => {
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func m(t: Transform2D):
	return [t.x.x, t.x.y, t.y.x, t.y.y, t.origin.x, t.origin.y]
func _init():
	var s = load("res://extras.tscn").instantiate()
	root.add_child(s)
	var ap: AnimationPlayer = s.get_node("AnimationPlayer")
	await process_frame
	var out = {}
	for f in [${frames.join(', ')}]:
		ap.play("default")
		ap.seek(f / ${doc.fps}.0, true)
		ap.pause()
		await process_frame
		await process_frame
		var row = {}
		row["canvas"] = m(root.get_canvas_transform())
		row["lower"] = m(s.get_node("Arm/Arm bones/Upper/Lower").global_transform)
		row["lower2"] = m(s.get_node("Arm 2/Arm bones/Upper/Lower").global_transform)
		row["sky"] = m(s.find_child("Sky", true, false).global_transform)
		row["skyscreen"] = m(root.get_canvas_transform() * s.find_child("Sky", true, false).global_transform)
		row["camrot"] = [s.get_node("Camera").rotation, s.get_node("Camera").ignore_rotation, s.get_node("Camera").global_position.x, s.get_node("Camera").zoom.x]
		row["blend"] = s.get_node("Glow").material.blend_mode
		row["armvis"] = s.get_node("Arm").visible
		row["armalpha"] = s.get_node("Arm").modulate.a
		row["tint"] = s.get_node("Arm/Arm bones/Upper/Upper arm").material.get_shader_parameter("tint_amount")
		out[str(f)] = row
	print("RESULT " + JSON.stringify(out))
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    // A real window (xvfb), because Camera2D and Parallax2D work from the viewport's size.
    const args = ['--path', dir, '--rendering-driver', 'opengl3', '--script', 'check.gd'];
    const run = process.env.DISPLAY ? execFileSync(GODOT!, args, { encoding: 'utf8', timeout: 120000 }) : execFileSync('xvfb-run', ['-a', GODOT!, ...args], { encoding: 'utf8', timeout: 120000 });
    const line = run.split('\n').find((l) => l.startsWith('RESULT '));
    expect(line, run).toBeTruthy();
    const got = JSON.parse(line!.slice(7)) as Record<string, Record<string, number[] & number & boolean>>;
    const sky = doc.layers.find((l) => l.name === 'Sky')!;
    const diff = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]) * (i < 4 ? 100 : 1)));
    let worst = 0;
    let where = '';
    const note = (what: string, e: number) => {
      if (e > worst) {
        worst = e;
        where = what;
      }
    };
    const sym = Object.values(doc.symbols!)[0];
    const rig = sym.layers[0] as typeof sym.layers[0] & { rig: NonNullable<Extract<typeof sym.layers[0], { kind: 'vector' }>['rig']> };
    for (const f of frames) {
      const row = got[String(f)];
      // The symbol restarts at each key, so frame f shows symbol frame f % 6 for the first key and f - 6 for the second.
      const local = f < 6 ? f : f - 6;
      const view = cameraViewAt(doc, f)!;
      const cam = m6(cameraMatrix(doc, view, 1));
      note(`camera at ${f}`, diff(row.canvas, cam));
      const lowerId = rig.rig.bones[1].id;
      const posed = rigState(rig.rig, rigPoseAt(doc, rig, local)).get(lowerId)!.posed;
      const instM = (top.nested[0].at[f]!.matrix as number[]);
      const inst2 = (top.nested[1].at[f]!.matrix as number[]);
      note(`lower at ${f}`, diff(row.lower, mulM(m6(instM), m6(posed))));
      note(`lower 2 at ${f}`, diff(row.lower2, mulM(m6(inst2), m6(posed))));
      const far = m6(cameraMatrix(doc, view, parallaxFactor(sky.depth)));
      note(`far layer at ${f}`, diff(row.skyscreen, mulM(far, [1, 0, 0, 1, top.textures![0][0].x, top.textures![0][0].y])));
      expect(row.armvis).toBe(true);
      // Add blend, and the tint going from none to half as the instance's key changes.
      expect(row.blend).toBe(1);
    }
    console.log(`extras: worst difference ${worst.toFixed(4)} (${where})`);
    expect(worst, where).toBeLessThan(0.05);
  }, 240000);
});
