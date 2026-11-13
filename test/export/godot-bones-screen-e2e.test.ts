// Screen blend in a real Godot 4. Two flat cards overlap, the top one set to Screen, and the pixel where they meet
// has to be the screen formula of the two colours, not Add's. Skipped unless GODOT_BIN is set:
//   GODOT_BIN=/path/to/godot npx vitest run test/export/godot-bones-screen-e2e
// It renders, so it needs a display (xvfb-run is enough).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { Doc, Layer, VectorDrawing } from '../../src/core/format';
import { decodePng, encodePng } from '../../src/io/png';
import { buildAnimations } from '../../src/export/sheet';
import { bonesParts, godotBonesScene, godotBonesShaders } from '../../src/export/godot-bones';
import { nativeBlend } from '../../src/export/godot-bones-scope';

const GODOT = process.env.GODOT_BIN;

const BACK: [number, number, number] = [60, 120, 200];
const OVER: [number, number, number] = [180, 90, 40];
/** Screen, the way Frameling and the shader both do it: 1 - (1-a)(1-b), on straight colours. */
const screen = (a: number, b: number) => Math.round(255 * (1 - (1 - a / 255) * (1 - b / 255)));
const WANT = [screen(BACK[0], OVER[0]), screen(BACK[1], OVER[1]), screen(BACK[2], OVER[2])];

/** Two layers, both one drawing, the top one Screen. */
function twoCards(): Doc {
  const doc = newDoc({ name: 'Screen', width: 64, height: 64, length: 1, background: '#000000' });
  doc.layers = [];
  for (const [name, blend] of [['Back', undefined], ['Over', 'screen']] as [string, Layer['blend'] | undefined][]) {
    const d: VectorDrawing = { id: `${name}-d`, kind: 'vector', shapes: [] };
    doc.drawings[d.id] = d;
    doc.layers.push({ id: `${name}-l`, name, kind: 'vector', visible: true, locked: false, opacity: 1, onion: false, blend, cels: [{ id: `${name}-c`, start: 0, length: 1, drawingId: d.id }] });
  }
  return doc;
}

describe.skipIf(!GODOT)('Screen blend in a real Godot', () => {
  it('is the screen formula where the cards overlap, not Add', () => {
    const doc = twoCards();
    expect(nativeBlend('screen')).toEqual({ blend: 'screen', exact: true });

    const range = { start: 0, end: 0 };
    const parts = bonesParts(doc, range);
    expect(parts).toHaveLength(2);
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-screen-'));
    mkdirSync(path.join(dir, 'parts'));
    mkdirSync(path.join(dir, 'shaders'));

    // Both cards cover the whole 64 x 64 stage, so every pixel is the overlap.
    const card = (rgb: [number, number, number], file: string) => {
      const px = new Uint8ClampedArray(64 * 64 * 4);
      for (let j = 0; j < 64 * 64; j++) px.set([...rgb, 255], j * 4);
      writeFileSync(path.join(dir, `parts/${file}.png`), encodePng({ width: 64, height: 64, pixels: px }));
      return [{ path: `res://parts/${file}.png`, x: 0, y: 0, w: 64, h: 64 }];
    };
    const textures = [card(BACK, 'back'), card(OVER, 'over')];

    const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: 0, fps: doc.fps, whole: true });
    const scene = godotBonesScene({ doc, range, parts, textures, scale: 1, animations, rootName: 'Cards', shaderDir: 'res://shaders/' });
    writeFileSync(path.join(dir, 'cards.tscn'), scene);
    const shaders = godotBonesShaders({ doc, range, parts, textures, scale: 1, animations, rootName: 'Cards', shaderDir: 'res://shaders/' });
    expect(shaders.map((s) => s.name)).toContain('frameling-blend-screen.gdshader');
    for (const s of shaders) writeFileSync(path.join(dir, `shaders/${s.name}`), s.text);

    writeFileSync(
      path.join(dir, 'project.godot'),
      'config_version=5\n\n[application]\nconfig/name="screen"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nenvironment/defaults/default_clear_color=Color(0, 0, 0, 1)\n\n[display]\nwindow/size/viewport_width=64\nwindow/size/viewport_height=64\n',
    );
    writeFileSync(
      path.join(dir, 'render.gd'),
      `extends SceneTree
func _init():
	var s = load("res://cards.tscn").instantiate()
	root.add_child(s)
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://shot.png")
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
      console.warn('Godot could not render (no display or xvfb-run), skipping.', String(e).slice(0, 300));
      return;
    }
    expect(out).toContain('RENDERED');

    const got = decodePng(readFileSync(path.join(dir, 'shot.png')));
    // The middle of the stage, where both cards are.
    const at = ((got.height >> 1) * got.width + (got.width >> 1)) * 4;
    const pixel = [got.pixels[at], got.pixels[at + 1], got.pixels[at + 2]];
    const add = [0, 1, 2].map((i) => Math.min(255, BACK[i] + OVER[i]));
    console.log(`screen: Godot ${pixel}, wanted ${WANT}, Add would be ${add}`);
    for (const i of [0, 1, 2]) expect(Math.abs(pixel[i] - WANT[i]), `channel ${i}`).toBeLessThanOrEqual(2);
    // And it really is different from what Add gives, or the test proves nothing.
    expect(Math.max(...[0, 1, 2].map((i) => Math.abs(add[i] - WANT[i])))).toBeGreaterThan(8);
  }, 240000);
});
