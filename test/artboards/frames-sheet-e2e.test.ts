// Loads the boards-as-frames sprite sheet in a real Godot 4, headless: one animation, a frame per board, in order, each
// frame showing that board's colour. Skipped unless GODOT_BIN points at a Godot 4 editor:
//   GODOT_BIN=/path/to/godot xvfb-run -a npx vitest run test/artboards/frames-sheet-e2e
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, PixelLayer } from '../../src/core/format';
import { addArtboard, artboardsOf } from '../../src/artboards/model';
import { filmOf } from '../../src/artboards/export';
import { buildSheetFiles } from '../../src/export/engines';
import { defaultSettings } from '../../src/export/plan';
import { DEFAULT_SHEET } from '../../src/export/types';
import { artFrames } from '../export/helpers';

const GODOT = process.env.GODOT_BIN;
const N = 4;
const colour = (i: number): [number, number, number] => [40 * (i + 1), 10, 255 - 40 * i];

function boards(): Doc {
  const doc = newDoc({ name: 'Hero', width: 32, height: 32, length: 1, pixel: { pixelSize: 8 } });
  const fill = (layer: PixelLayer, i: number) => {
    const d = newPixelDrawing(4, 4);
    for (let p = 0; p < 16; p++) d.pixels.set([...colour(i), 255], p * 4);
    doc.drawings[d.id] = d;
    layer.cels.push({ id: `c${i}`, start: 0, length: 1, drawingId: d.id });
  };
  fill(doc.layers[0] as PixelLayer, 0);
  for (let i = 1; i < N; i++) {
    const id = addArtboard(doc, { name: `Frame ${i + 1}`, width: 32, height: 32, length: 1 });
    fill(artboardsOf(doc).find((a) => a.id === id)!.content!.layers[0] as PixelLayer, i);
  }
  return doc;
}

describe.skipIf(!GODOT)('Godot plays the boards as one animation', () => {
  it('has one animation of four frames, in board order, in the scene', () => {
    const doc = boards();
    const film = filmOf(doc, artboardsOf(doc).map((a) => a.id), { ...defaultSettings(doc), format: 'sheet' });
    if ('problem' in film) throw new Error(film.problem);
    const frames = artFrames(film.doc);
    const out = buildSheetFiles({
      doc: { name: film.doc.name, clips: film.doc.clips, markers: film.doc.markers, fps: film.doc.fps },
      sheet: { ...DEFAULT_SHEET, engine: 'godot', godotScene: true, json: false, trim: false, layout: 'grid', columns: 2, padding: 0 },
      frames,
      range: { start: 0, end: frames.length - 1 },
      whole: true,
      clipId: null,
      scale: 1,
      name: film.doc.name,
      pixelArt: true,
      maxSide: 8192,
    });
    const dir = mkdtempSync(path.join(tmpdir(), 'frameling-godot-boards-'));
    mkdirSync(path.join(dir, 'sprites'));
    writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="boards"\n');
    for (const f of out.files) writeFileSync(path.join(dir, 'sprites', f.name), f.bytes);
    const base = out.main.replace(/\.png$/, '');
    writeFileSync(
      path.join(dir, 'check.gd'),
      `extends SceneTree
func _init():
	var node = (load("res://sprites/${base}.tscn") as PackedScene).instantiate()
	var sf: SpriteFrames = node.sprite_frames
	var out := ["names:%s" % ",".join(sf.get_animation_names()), "start:%s" % node.animation]
	for i in sf.get_frame_count("default"):
		var c: Color = sf.get_frame_texture("default", i).get_image().get_pixel(1, 1)
		out.append("f%d:%d,%d,%d" % [i, round(c.r * 255), round(c.g * 255), round(c.b * 255)])
	print("RESULT " + ";".join(out))
	quit()
`,
    );
    execFileSync(GODOT!, ['--headless', '--path', dir, '--import'], { stdio: 'pipe', timeout: 120000 });
    const run = execFileSync(GODOT!, ['--headless', '--path', dir, '--script', 'check.gd'], { encoding: 'utf8', timeout: 120000 });
    const line = run.split('\n').find((l) => l.startsWith('RESULT ')) ?? run;
    expect(line).toContain('names:default');
    expect(line).toContain('start:default');
    for (let i = 0; i < N; i++) expect(line, `frame ${i + 1}`).toContain(`f${i}:${colour(i).join(',')}`);
  }, 240000);
});
