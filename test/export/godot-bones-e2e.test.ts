// Loads a Godot "bones" export of the paper doll puppet in a real Godot 4, headless, plays its walk and checks every
// bone lands where Frameling puts it. Then renders frames (parts as flat colour cards, one of them a bent mesh) and
// compares them with the same cards drawn through Frameling's own bone maths. Skipped unless GODOT_BIN is set:
//   GODOT_BIN=/path/to/godot npx vitest run test/export/godot-bones-e2e
// The render check also needs a display for Godot's OpenGL renderer (xvfb-run is enough).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core/format';
import { decodePng, encodePng } from '../../src/io/png';
import { buildAnimations } from '../../src/export/sheet';
import { bonesParts, bonesRigs, godotBonesScene, type BonesTexture } from '../../src/export/godot-bones';
import { deformMesh, mapply, minv, rigState } from '../../src/rig/math';
import { testPuppet } from './bones-helpers';
import { rigPoseAt } from '../../src/rig/pose';

const GODOT = process.env.GODOT_BIN;
const K = 0.5;

/** A card per part: its mesh box for the bent one, a box round the bone for cut-out parts. */
function cards(doc: Doc) {
  const range = { start: 0, end: doc.length - 1 };
  const parts = bonesParts(doc, range);
  const colours: [number, number, number][] = [];
  const textures: BonesTexture[][] = parts.map((p, i) => {
    colours.push([40 + ((i * 53) % 200), 60 + ((i * 97) % 190), 30 + ((i * 31) % 220)]);
    let box: { x: number; y: number; w: number; h: number };
    if (p.mesh) {
      box = { x: 320 * K, y: 178 * K, w: 80 * K + 1, h: 150 * K + 1 };
    } else if (p.rig && p.bone) {
      const s = rigState(p.rig.rig).get(p.bone)!;
      const x0 = Math.min(s.base.x, s.tip.x) - 12;
      const y0 = Math.min(s.base.y, s.tip.y) - 12;
      box = { x: Math.round(x0 * K), y: Math.round(y0 * K), w: Math.round((Math.abs(s.tip.x - s.base.x) + 24) * K), h: Math.round((Math.abs(s.tip.y - s.base.y) + 24) * K) };
    } else box = { x: 0, y: Math.round(440 * K), w: Math.round(720 * K), h: Math.round(100 * K) };
    return p.pictures.map(() => ({ path: `res://parts/p${i}.png`, ...box }));
  });
  return { range, parts, textures, colours };
}

/** Frameling's picture of the cards at a frame: each output pixel looked up through the bone maths, back to front. */
function reference(doc: Doc, frame: number, w: number, h: number, c: ReturnType<typeof cards>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const rig = bonesRigs(doc)[0];
  const st = rigState(rig.rig, rigPoseAt(doc, rig, frame));
  for (const i of c.parts.map((_, j) => j).sort((a, b) => c.parts[a].z - c.parts[b].z)) {
    const p = c.parts[i];
    const t = c.textures[i][0];
    const inside = (x: number, y: number) => x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h;
    const paint = (px: number, py: number) => out.set([...c.colours[i], 255], (py * w + px) * 4);
    if (p.mesh) {
      const dst = deformMesh(p.mesh, st).map((v) => v * K);
      const src = p.mesh.points.map((v) => v * K);
      const tr = p.mesh.triangles;
      for (let q = 0; q < tr.length; q += 3) {
        const [a, b, cc] = [tr[q] * 2, tr[q + 1] * 2, tr[q + 2] * 2];
        const xs = [dst[a], dst[b], dst[cc]];
        const ys = [dst[a + 1], dst[b + 1], dst[cc + 1]];
        for (let py = Math.max(0, Math.floor(Math.min(...ys))); py <= Math.min(h - 1, Math.ceil(Math.max(...ys))); py++)
          for (let px = Math.max(0, Math.floor(Math.min(...xs))); px <= Math.min(w - 1, Math.ceil(Math.max(...xs))); px++) {
            const X = px + 0.5, Y = py + 0.5;
            const det = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
            if (Math.abs(det) < 1e-9) continue;
            const l1 = ((ys[1] - ys[2]) * (X - xs[2]) + (xs[2] - xs[1]) * (Y - ys[2])) / det;
            const l2 = ((ys[2] - ys[0]) * (X - xs[2]) + (xs[0] - xs[2]) * (Y - ys[2])) / det;
            const l3 = 1 - l1 - l2;
            if (l1 < 0 || l2 < 0 || l3 < 0) continue;
            const sx = l1 * src[a] + l2 * src[b] + l3 * src[cc];
            const sy = l1 * src[a + 1] + l2 * src[b + 1] + l3 * src[cc + 1];
            if (inside(sx, sy)) paint(px, py);
          }
      }
      continue;
    }
    const skin = p.rig && p.bone ? st.get(p.bone)!.skin : ([1, 0, 0, 1, 0, 0] as const);
    const inv = minv([skin[0], skin[1], skin[2], skin[3], skin[4] * K, skin[5] * K]);
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const r = mapply(inv, px + 0.5, py + 0.5);
        if (inside(r.x, r.y)) paint(px, py);
      }
  }
  return out;
}

describe.skipIf(!GODOT)('Godot plays the bones export', () => {
  const doc = testPuppet();
  const c = cards(doc);
  const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: doc.length - 1, fps: doc.fps, whole: true });
  const scene = godotBonesScene({ doc, range: c.range, parts: c.parts, textures: c.textures, scale: K, animations, rootName: 'Puppet' });
  const rig = bonesRigs(doc)[0];
  const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-bones-'));
  mkdirSync(path.join(dir, 'parts'));
  writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="bones"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(0, 0, 0, 1)\n\n[display]\nwindow/size/viewport_width=360\nwindow/size/viewport_height=270\n');
  c.textures.forEach((list, i) => {
    const t = list[0];
    const px = new Uint8ClampedArray(t.w * t.h * 4);
    for (let j = 0; j < t.w * t.h; j++) px.set([...c.colours[i], 255], j * 4);
    writeFileSync(path.join(dir, `parts/p${i}.png`), encodePng({ width: t.w, height: t.h, pixels: px }));
  });
  writeFileSync(path.join(dir, 'puppet.tscn'), scene);
  const frames = [0, 2, 3, 5, 6, 7, 9, 12, 15, 20, 23];

  it('puts every bone where Frameling does, at every sampled frame of the walk', () => {
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func _init():
	var s = load("res://puppet.tscn").instantiate()
	root.add_child(s)
	var ap: AnimationPlayer = s.get_node("AnimationPlayer")
	var sk: Node2D = s.get_node("Bones")
	var out = {}
	for f in [${frames.join(', ')}]:
		ap.play("walk")
		ap.seek(f / ${doc.fps}.0, true)
		var row = {}
		for b in sk.find_children("*", "Bone2D", true, false):
			var m: Transform2D = sk.global_transform.affine_inverse() * b.global_transform
			row[b.name] = [m.x.x, m.x.y, m.y.x, m.y.y, m.origin.x, m.origin.y]
		out[str(f)] = row
	print("RESULT " + JSON.stringify(out))
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const run = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'check.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = run.split('\n').find((l) => l.startsWith('RESULT '));
    expect(line, run).toBeTruthy();
    const got = JSON.parse(line!.slice(7)) as Record<string, Record<string, number[]>>;
    let worst = 0;
    let where = '';
    for (const f of frames) {
      const st = rigState(rig.rig, rigPoseAt(doc, rig, f));
      for (const b of rig.rig.bones) {
        const g = got[String(f)][b.name];
        expect(g, `${b.name} at ${f}`).toBeTruthy();
        const want = st.get(b.id)!.posed;
        const w = [want[0], want[1], want[2], want[3], want[4] * K, want[5] * K];
        for (let q = 0; q < 6; q++) {
          const e = Math.abs(w[q] - g[q]) * (q < 4 ? 100 : 1);
          if (e > worst) {
            worst = e;
            where = `${b.name} at frame ${f}: Frameling ${w.map((v) => v.toFixed(3))} Godot ${g.map((v) => v.toFixed(3))}`;
          }
        }
      }
    }
    console.log(`bones: worst difference ${worst.toFixed(4)} (px, or 1/100 of the matrix)`);
    expect(worst, where).toBeLessThan(0.05);
  }, 240000);

  it('draws the parts, the squash and the bent body where Frameling does', () => {
    const shots = [0, 3, 7, 15];
    writeFileSync(
      path.join(dir, 'render.gd'),
      `extends SceneTree
func _init():
	var s = load("res://puppet.tscn").instantiate()
	root.add_child(s)
	var ap: AnimationPlayer = s.get_node("AnimationPlayer")
	for f in [${shots.join(', ')}]:
		ap.play("walk")
		ap.seek(f / ${doc.fps}.0, true)
		ap.pause()
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("res://shot-%d.png" % f)
	print("RENDERED")
	quit()
`,
    );
    let out = '';
    try {
      const args = ['--path', dir, '--rendering-driver', 'opengl3', '--script', 'render.gd'];
      out = process.env.DISPLAY ? execFileSync(GODOT!, args, { encoding: 'utf8', timeout: 120000, stdio: 'pipe' }) : execFileSync('xvfb-run', ['-a', GODOT!, ...args], { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
    } catch (e) {
      console.warn('Godot could not render (no display or xvfb-run), skipping the picture check.', String(e).slice(0, 300));
      return;
    }
    expect(out).toContain('RENDERED');
    for (const f of shots) {
      const got = decodePng(readFileSync(path.join(dir, `shot-${f}.png`)));
      const want = reference(doc, f, got.width, got.height, c);
      let wrong = 0;
      for (let i = 0; i < got.width * got.height; i++) {
        const d = Math.max(...[0, 1, 2].map((q) => Math.abs(want[i * 4 + q] - got.pixels[i * 4 + q])));
        if (d > 8) wrong++;
      }
      const share = wrong / (got.width * got.height);
      console.log(`frame ${f}: ${(share * 100).toFixed(2)}% of pixels differ`);
      // Edges round differently in a GPU; anything more is a part in the wrong place.
      expect(share, `frame ${f}`).toBeLessThan(0.01);
    }
  }, 240000);
});
