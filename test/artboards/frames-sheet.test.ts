// @vitest-environment jsdom
// Boards as frames of one sprite, as a sprite sheet: every artboard is a frame, in order, and every engine's data
// plays them as ONE animation. Each engine format is read back and followed from the animation to the picture.
import { strFromU8 } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, PixelLayer } from '../../src/core/format';
import { addArtboard, artboardsOf } from '../../src/artboards/model';
import { artboardExport, artboardSummary, filmOf, modeOff, planArtboards, setArtboardExport } from '../../src/artboards/export';
import { resetStore, store } from '../../src/core/store';
import { buildSheetFiles } from '../../src/export/engines';
import { defaultSettings } from '../../src/export/plan';
import { DEFAULT_SHEET, type ExportSettings, type SheetSettings } from '../../src/export/types';
import { decodePng } from '../../src/io/png';
import { artFrames } from '../export/helpers';

const N = 4;
/** The colour of board i: a different red each, so a wrong order shows. */
const colour = (i: number): [number, number, number] => [40 * (i + 1), 10, 255 - 40 * i];

/** A pixel sprite of `n` boards (Frame 1 to n), each one frame holding one solid colour. */
function boards(n = N, name = 'Hero'): Doc {
  const doc = newDoc({ name, width: 32, height: 32, length: 1, pixel: { pixelSize: 8 } });
  const fill = (layer: PixelLayer, i: number) => {
    const d = newPixelDrawing(4, 4);
    for (let p = 0; p < 16; p++) d.pixels.set([...colour(i), 255], p * 4);
    doc.drawings[d.id] = d;
    layer.cels.push({ id: `c${i}`, start: 0, length: 1, drawingId: d.id });
  };
  fill(doc.layers[0] as PixelLayer, 0);
  for (let i = 1; i < n; i++) {
    const id = addArtboard(doc, { name: `Frame ${i + 1}`, width: 32, height: 32, length: 1 });
    fill(artboardsOf(doc).find((a) => a.id === id)!.content!.layers[0] as PixelLayer, i);
  }
  artboardsOf(doc)[0].name = 'Frame 1';
  return doc;
}

const sheetSettings = (doc: Doc, over: Partial<ExportSettings> = {}): ExportSettings => ({ ...defaultSettings(doc), format: 'sheet', ...over });

beforeEach(() => {
  artboardExport.set({ mode: 'one', ids: null, docId: '' });
});

describe('the way is on for a sprite sheet', () => {
  it('"All in order, as one" is allowed for a sheet, still not for a single picture', () => {
    const doc = boards();
    expect(modeOff('joined', sheetSettings(doc))).toBeNull();
    expect(modeOff('joined', { ...sheetSettings(doc), format: 'gif' })).toBeNull();
    expect(modeOff('joined', { ...sheetSettings(doc), format: 'png' })).toMatch(/sprite sheet/);
    expect(modeOff('atlas', sheetSettings(doc))).toBeNull();
  });

  it('plans one sheet of every frame, with the first board size', () => {
    const doc = boards();
    resetStore(doc);
    setArtboardExport({ mode: 'joined' });
    const s = sheetSettings(doc);
    const a = planArtboards(store().rootDoc(), s, 0)!;
    expect(a.mode).toBe('joined');
    expect(a.frames).toBe(N);
    expect(a.problem).toBeNull();
    expect(a.size).toEqual({ width: 32 * s.scale, height: 32 * s.scale });
    expect(artboardSummary(a)).toContain('4 frames in all');
  });

  it('a clip range left over from another export does not get in the way', () => {
    const doc = boards();
    resetStore(doc);
    setArtboardExport({ mode: 'joined' });
    const a = planArtboards(store().rootDoc(), sheetSettings(doc, { range: 'clip', clipId: 'gone' }), 0)!;
    expect(a.problem).toBeNull();
    expect(a.frames).toBe(N);
  });

  it('a board with several frames adds all of them, in order', () => {
    const doc = boards(3);
    const second = artboardsOf(doc)[1];
    second.content!.length = 2;
    resetStore(doc);
    setArtboardExport({ mode: 'joined' });
    expect(planArtboards(store().rootDoc(), sheetSettings(doc), 0)!.frames).toBe(4);
  });
});

describe('one sprite, not a clip per board', () => {
  it('a sheet film has no clips and is always the whole range', () => {
    const doc = boards();
    const ids = artboardsOf(doc).map((a) => a.id);
    const f = filmOf(doc, ids, sheetSettings(doc, { range: 'clip', clipId: 'x' }));
    if ('problem' in f) throw new Error(f.problem);
    expect(f.doc.clips).toEqual([]);
    expect(f.doc.length).toBe(N);
    expect(f.settings).toMatchObject({ format: 'sheet', range: 'all', clipId: null });
  });

  it('other formats keep a clip per board, as before', () => {
    const doc = boards();
    const f = filmOf(doc, artboardsOf(doc).map((a) => a.id), { ...sheetSettings(doc), format: 'gif' });
    if ('problem' in f) throw new Error(f.problem);
    expect(f.doc.clips.map((c) => c.name)).toEqual(['Frame 1', 'Frame 2', 'Frame 3', 'Frame 4']);
  });

  it('an empty choice is a problem, not a blank sheet', () => {
    const doc = boards();
    expect('problem' in filmOf(doc, [], sheetSettings(doc))).toBe(true);
  });
});

// ---------------------------------------------------------------- every engine, read back

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** What an engine's own files say about each animation: its name and, frame by frame in play order, where on the sheet. */
type Played = Record<string, Rect[]>;

const text = (files: { name: string; bytes: Uint8Array }[], name: string) => strFromU8(files.find((f) => f.name === name)!.bytes);
const rectOf = (f: { x: number; y: number; w: number; h: number }): Rect => ({ x: f.x, y: f.y, w: f.w, h: f.h });

/** Reads the animations back out of an engine's files, the way that engine's loader would. */
function readBack(engine: SheetSettings['engine'], files: { name: string; bytes: Uint8Array }[], sheetH: number): Played {
  const out: Played = {};
  if (engine === 'json') {
    const j = JSON.parse(text(files, 'hero.json'));
    for (const [name, a] of Object.entries(j.animations as Record<string, { frames: number[] }>)) out[name] = a.frames.map((i) => rectOf(j.frames[i].frame));
  } else if (engine === 'phaser') {
    const atlas = JSON.parse(text(files, 'hero.json')).frames as Record<string, { frame: Rect }>;
    for (const a of JSON.parse(text(files, 'hero-anims.json')).anims as { key: string; frames: { frame: string }[] }[]) out[a.key] = a.frames.map((f) => rectOf(atlas[f.frame].frame));
  } else if (engine === 'pixi') {
    const j = JSON.parse(text(files, 'hero.json'));
    for (const [name, list] of Object.entries(j.animations as Record<string, string[]>)) out[name] = list.map((n) => rectOf(j.frames[n].frame));
  } else if (engine === 'unity') {
    const j = JSON.parse(text(files, 'hero.json'));
    const byName = new Map((j.frames as { name: string; x: number; y: number; w: number; h: number }[]).map((f) => [f.name, f]));
    // Unity counts y up from the bottom of the picture.
    for (const a of j.animations as { name: string; frames: string[] }[]) out[a.name] = a.frames.map((n) => rectOf({ ...byName.get(n)!, y: sheetH - byName.get(n)!.y - byName.get(n)!.h }));
  } else if (engine === 'godot') {
    const t = text(files, 'hero.tres');
    const regions = new Map([...t.matchAll(/\[sub_resource type="AtlasTexture" id="([^"]+)"\]\s+atlas = [^\n]+\s+region = Rect2\((\d+), (\d+), (\d+), (\d+)\)/g)].map((m) => [m[1], { x: +m[2], y: +m[3], w: +m[4], h: +m[5] }]));
    for (const m of t.matchAll(/"frames": \[(.*?)\],\s+"loop": (true|false),\s+"name": &"([^"]+)"/gs)) out[m[3]] = [...m[1].matchAll(/SubResource\("([^"]+)"\)/g)].map((r) => regions.get(r[1])!);
  } else if (engine === 'css') {
    const css = text(files, 'hero.css');
    const w = +/width: (\d+)px/.exec(css)![1];
    const h = +/height: (\d+)px/.exec(css)![1];
    const pos = (s: string): Rect => {
      const [x, y] = s.trim().split(/\s+/).map((v) => Math.abs(parseInt(v, 10)));
      return { x, y, w, h };
    };
    const frames = [...css.matchAll(/@keyframes ([\w-]+) \{(.*?)\n\}/gs)];
    for (const k of frames) {
      // One step per frame; the last 100% line only holds the end.
      const steps = [...k[2].matchAll(/(\d+)% \{ background-position: ([^;]+); \}/g)].filter((m) => m[1] !== '100');
      out[k[1].replace(/^hero-/, '')] = steps.map((m) => pos(m[2]));
    }
  }
  return out;
}

const ENGINES: SheetSettings['engine'][] = ['json', 'godot', 'phaser', 'pixi', 'unity', 'css'];

describe.each(ENGINES)('%s reads the boards as one animation', (engine) => {
  const doc = boards();
  const ids = artboardsOf(doc).map((a) => a.id);
  const s = sheetSettings(doc);
  const film = filmOf(doc, ids, s);
  if ('problem' in film) throw new Error(film.problem);
  const frames = artFrames(film.doc);
  const sheet: SheetSettings = { ...DEFAULT_SHEET, engine, layout: 'grid', columns: 2, padding: 0, trim: false, dedupe: true };
  const r = buildSheetFiles({
    doc: { name: film.doc.name, clips: film.doc.clips, markers: film.doc.markers, fps: film.doc.fps },
    sheet,
    frames,
    range: { start: 0, end: frames.length - 1 },
    whole: film.settings.range === 'all',
    clipId: film.settings.clipId,
    scale: 1,
    name: film.doc.name,
    pixelArt: true,
    maxSide: 8192,
  });
  const png = decodePng(r.files.find((f) => f.name === 'hero.png')!.bytes);
  const played = readBack(engine, r.files, png.height);

  it('has exactly one animation, with every board as a frame', () => {
    expect(Object.keys(played)).toEqual(['default']);
    expect(played.default).toHaveLength(N);
  });

  it('plays the boards in order: each frame points at that board on the picture', () => {
    played.default.forEach((rect, i) => {
      const at = (rect.y * png.width + rect.x) * 4;
      expect([...png.pixels.slice(at, at + 3)], `frame ${i + 1}`).toEqual(colour(i));
      // And the whole rect is that one colour.
      const far = ((rect.y + rect.h - 1) * png.width + rect.x + rect.w - 1) * 4;
      expect([...png.pixels.slice(far, far + 3)], `frame ${i + 1} corner`).toEqual(colour(i));
    });
  });

  it('is one animation on a loop at the file frame rate', () => {
    if (engine === 'godot') expect(text(r.files, 'hero.tres')).toMatch(/"loop": true,\s+"name": &"default",\s+"speed": 12\.0/);
    if (engine === 'json') expect(JSON.parse(text(r.files, 'hero.json')).animations.default).toMatchObject({ fps: 12, loop: true });
    if (engine === 'phaser') expect(JSON.parse(text(r.files, 'hero-anims.json')).anims[0]).toMatchObject({ key: 'default', frameRate: 12, repeat: -1 });
    if (engine === 'pixi') expect(JSON.parse(text(r.files, 'hero.json')).meta.frameling.animations.default).toMatchObject({ fps: 12, loop: true });
    if (engine === 'unity') expect(JSON.parse(text(r.files, 'hero.json')).animations[0]).toMatchObject({ name: 'default', fps: 12, loop: true });
    if (engine === 'css') expect(text(r.files, 'hero.css')).toMatch(/\.hero-default \{[^}]*infinite/);
  });
});

describe('the Godot scene starts on that animation', () => {
  it('names default', () => {
    const doc = boards();
    const film = filmOf(doc, artboardsOf(doc).map((a) => a.id), sheetSettings(doc));
    if ('problem' in film) throw new Error(film.problem);
    const frames = artFrames(film.doc);
    const r = buildSheetFiles({
      doc: { name: film.doc.name, clips: film.doc.clips, markers: film.doc.markers, fps: film.doc.fps },
      sheet: { ...DEFAULT_SHEET, engine: 'godot', godotScene: true },
      frames,
      range: { start: 0, end: frames.length - 1 },
      whole: true,
      clipId: null,
      scale: 1,
      name: film.doc.name,
      pixelArt: true,
      maxSide: 8192,
    });
    expect(text(r.files, 'hero.tscn')).toContain('animation = &"default"');
  });
});
