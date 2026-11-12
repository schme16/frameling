// The camera and a layer with depth in real Godot at a window that is NOT the stage size times the export scale: with the
// included fit-window script attached they still land where Frameling puts them (scaled to the window), without it they
// don't. Skipped unless GODOT_BIN is set (see godot-bones-e2e).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cameraMatrix, cameraViewAt, parallaxFactor } from '../../src/core/camera';
import type { Doc } from '../../src/core/format';
import { buildAnimations } from '../../src/export/sheet';
import { bonesStage, fitWindowScript, godotBonesScene, godotBonesShaders } from '../../src/export/godot-bones';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { cards } from './bones-helpers';

const GODOT = process.env.GODOT_BIN;
const K = 2;
const WIN = { w: 1000, h: 700 };

const m6 = (m: readonly number[]) => [m[0], m[1], m[2], m[3], m[4] * K, m[5] * K];
const mulM = (a: readonly number[], b: readonly number[]) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

describe.skipIf(!GODOT)('Godot camera and parallax at another window size', () => {
  const doc: Doc = bonesExtrasDoc({ camera: { a: { x: 180, y: 135, zoom: 1, rotation: 0 }, b: { x: 230, y: 150, zoom: 1.6, rotation: 8 } } });
  const range = { start: 0, end: doc.length - 1 };
  const top = bonesStage(doc, range);
  const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-window-'));
  mkdirSync(path.join(dir, 'parts'));
  cards(top, dir);
  const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: doc.length - 1, fps: doc.fps, whole: true });
  const input = { doc, range, parts: top.parts, textures: top.textures!, scale: K, animations, rootName: 'Extras', nested: top.nested };
  writeFileSync(path.join(dir, 'extras.tscn'), godotBonesScene(input));
  for (const sh of godotBonesShaders(input)) writeFileSync(path.join(dir, sh.name), sh.text);
  writeFileSync(path.join(dir, 'extras-fit-window.gd'), fitWindowScript(doc.width * K, doc.height * K));
  writeFileSync(path.join(dir, 'project.godot'), `config_version=5\n\n[application]\nconfig/name="window"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n\n[display]\nwindow/size/viewport_width=${WIN.w}\nwindow/size/viewport_height=${WIN.h}\n`);
  const frames = [0, 5, 8, 11];

  const run = (fit: boolean) => {
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func m(t: Transform2D):
	return [t.x.x, t.x.y, t.y.x, t.y.y, t.origin.x, t.origin.y]
func _init():
	var s = load("res://extras.tscn").instantiate()
	${fit ? 'var fit = load("res://extras-fit-window.gd")\n\ts.set_script(fit)' : ''}
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
		row["final"] = m(root.get_final_transform())
		row["skyscreen"] = m(root.get_final_transform() * root.get_canvas_transform() * s.find_child("Sky", true, false).global_transform)
		out[str(f)] = row
	print("RESULT " + JSON.stringify(out))
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const args = ['--path', dir, '--rendering-driver', 'opengl3', '--script', 'check.gd'];
    const out = process.env.DISPLAY ? execFileSync(GODOT!, args, { encoding: 'utf8', timeout: 120000 }) : execFileSync('xvfb-run', ['-a', GODOT!, ...args], { encoding: 'utf8', timeout: 120000 });
    const line = out.split('\n').find((l) => l.startsWith('RESULT '));
    expect(line, out).toBeTruthy();
    return JSON.parse(line!.slice(7)) as Record<string, Record<string, number[]>>;
  };

  // Frameling's place for the far layer's picture, in the stage-times-scale design space, then stretched to the window.
  const expected = (f: number) => {
    const sky = doc.layers.find((l) => l.name === 'Sky')!;
    const far = m6(cameraMatrix(doc, cameraViewAt(doc, f)!, parallaxFactor(sky.depth)));
    return mulM(far, [1, 0, 0, 1, top.textures![0][0].x, top.textures![0][0].y]);
  };
  const diff = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]) * (i < 4 ? 100 : 1)));

  it('lines up with the script, stretched to the window with the stage kept in shape', () => {
    const got = run(true);
    const dw = doc.width * K;
    const dh = doc.height * K;
    const s = Math.min(WIN.w / dw, WIN.h / dh);
    const stretch = [s, 0, 0, s, (WIN.w - dw * s) / 2, (WIN.h - dh * s) / 2];
    // Godot rounds the stretched picture to whole pixels, so its own stretch is a hair off the ideal one.
    const fin = got['0'].final;
    expect(Math.abs(fin[0] - s)).toBeLessThan(0.01);
    expect(Math.abs(fin[3] - s)).toBeLessThan(0.01);
    expect(Math.abs(fin[4] - stretch[4])).toBeLessThan(1.5);
    expect(Math.abs(fin[5] - stretch[5])).toBeLessThan(1.5);
    let worst = 0;
    for (const f of frames) worst = Math.max(worst, diff(got[String(f)].skyscreen, mulM(got[String(f)].final, expected(f))));
    console.log(`window ${WIN.w}x${WIN.h} with the fit script: worst difference ${worst.toFixed(4)}`);
    expect(worst).toBeLessThan(0.1);
  }, 240000);

  it('does not line up without it (that is what the script is for)', () => {
    const got = run(false);
    let worst = 0;
    for (const f of frames) worst = Math.max(worst, diff(got[String(f)].skyscreen, expected(f)));
    expect(worst).toBeGreaterThan(1);
  }, 240000);
});
