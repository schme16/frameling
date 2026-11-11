import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { RawImage } from '../../src/io/png';
import { decodePng } from '../../src/io/png';
import { packInto, packSheet } from '../../src/export/pack';
import { buildAnimations, buildCells, composeSheet, layoutCells, layoutPacked } from '../../src/export/sheet';
import {
  animationCellNames, buildSheetFiles, cssSprites, hashAtlas, phaserAnimations, pixiSheet, separateSpriteNames, unitySheet,
  UNITY_SCRIPT, UNITY_SCRIPT_NAME, type SheetData,
} from '../../src/export/engines';
import { artScale } from '../../src/export/plan';
import { DEFAULT_SHEET, normalizeSheet, type SheetSettings } from '../../src/export/types';
import { makeHeroSprite } from '../../src/templates/hero-sprite';
import { artFrames } from './helpers';

const clear: [number, number, number, number] = [0, 0, 0, 0];
function img(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): RawImage {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, pixels: p };
}
const solid = (w: number, h: number, v: number) => img(w, h, () => [v, v, v, 255]);
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('packing', () => {
  it('places every rectangle inside the bin without overlaps', () => {
    const sizes = [
      { w: 10, h: 30 }, { w: 30, h: 10 }, { w: 12, h: 12 }, { w: 5, h: 7 }, { w: 20, h: 20 }, { w: 3, h: 3 }, { w: 9, h: 14 }, { w: 14, h: 9 },
    ];
    const p = packSheet(sizes, { maxSide: 256 })!;
    const rects = p.positions.map((q, i) => ({ ...q, ...sizes[i] }));
    rects.forEach((r, i) => {
      expect(r.x + r.w).toBeLessThanOrEqual(p.width);
      expect(r.y + r.h).toBeLessThanOrEqual(p.height);
      rects.slice(i + 1).forEach((o) => expect(overlaps(r, o)).toBe(false));
    });
    // Tighter than a grid of 30 x 30 slots would be (3 x 3 slots = 8100).
    expect(p.width * p.height).toBeLessThan(8100 * 0.7);
  });

  it('keeps to powers of two when asked, and says when it cannot fit', () => {
    const p = packSheet([{ w: 33, h: 20 }, { w: 20, h: 33 }], { maxSide: 512, pot: true })!;
    expect([p.width & (p.width - 1), p.height & (p.height - 1)]).toEqual([0, 0]);
    expect(packSheet([{ w: 600, h: 10 }], { maxSide: 512 })).toBeNull();
    expect(packInto([{ w: 10, h: 10 }, { w: 10, h: 10 }], 15, 15)).toBeNull();
  });

  it('packs trimmed cells with padding and extrude kept clear between them', () => {
    const frames = [img(16, 16, (x, y) => (x < 4 && y < 12 ? [9, 9, 9, 255] : clear)), solid(16, 16, 5), img(16, 16, (x, y) => (x > 8 && y > 10 ? [7, 7, 7, 255] : clear))];
    const { cells } = buildCells(frames, { trim: true, dedupe: false });
    const L = layoutPacked(cells, { padding: 2, extrude: 1, maxSide: 1024 })!;
    expect(L.packed).toBe(true);
    // Each frame plus its extrude ring, grown by the padding, must not touch another.
    const boxes = cells.map((c, i) => ({ x: L.positions[i].x - 1, y: L.positions[i].y - 1, w: c.image.width + 2 + 2, h: c.image.height + 2 + 2 }));
    boxes.forEach((b, i) => boxes.slice(i + 1).forEach((o) => expect(overlaps(b, o)).toBe(false)));
    cells.forEach((c, i) => {
      expect(L.positions[i].x).toBeGreaterThanOrEqual(3);
      expect(L.positions[i].x + c.image.width + 1 + 2).toBeLessThanOrEqual(L.width);
    });
  });

  it('extrudes: the ring around a frame repeats its edge pixels', () => {
    const frame = img(2, 2, (x, y) => [x * 100 + 10, y * 100 + 10, 0, 255]);
    const { cells } = buildCells([frame], { trim: false, dedupe: false });
    const L = layoutCells(cells, { padding: 1, extrude: 2 });
    expect(L.positions[0]).toEqual({ x: 3, y: 3 });
    expect([L.width, L.height]).toEqual([8, 8]);
    const sheet = composeSheet(cells, L);
    const at = (x: number, y: number) => [...sheet.pixels.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 2)];
    expect(at(1, 1)).toEqual([10, 10]); // top-left corner copies the top-left pixel
    expect(at(6, 3)).toEqual([110, 10]); // right side copies the right column
    expect(at(4, 6)).toEqual([110, 110]);
    expect(sheet.pixels[(0 * 8 + 0) * 4 + 3]).toBe(0); // padding stays empty
  });
});

// Two clips: idle (frames 0-1, the same drawing) and run (2-3), plus a frame no clip uses.
const clips = [
  { id: 'a', name: 'idle', start: 0, end: 1, loop: true },
  { id: 'b', name: 'run', start: 2, end: 3, loop: false },
];
function sampleData(trim = false): SheetData {
  const frames = [solid(8, 8, 1), solid(8, 8, 1), img(8, 8, (x) => (x < 4 ? [2, 2, 2, 255] : clear)), solid(8, 8, 3)];
  const { cells, cellOfFrame } = buildCells(frames, { trim, dedupe: true, cuts: new Set([2]) });
  const layout = layoutCells(cells, { columns: 3 });
  const animations = buildAnimations({ clips, rangeStart: 0, rangeEnd: 3, fps: 10, whole: true });
  return { image: 'hero.png', layout, cells, cellOfFrame, animations, names: animationCellNames(animations, cellOfFrame, cells.length) };
}

describe('frame names', () => {
  it('names cells after the animation that shows them, and keeps names unique', () => {
    const d = sampleData();
    expect(d.names).toEqual(['idle_0', 'run_0', 'run_1']);
    expect(animationCellNames([{ name: 'a b', fps: 1, loop: true, frames: [0] }, { name: 'a b', fps: 1, loop: true, frames: [1] }], [0, 1, 2], 3)).toEqual(['a_b_0', 'a_b_0_2', 'frame_2']);
  });

  it('names separate sprites by marker, then clip, then frame number', () => {
    const names = separateSpriteNames({ start: 0, end: 4, clips: [{ id: 'c', name: 'coin', start: 1, end: 2, loop: true }], markers: [{ id: 'm', name: 'heart', frame: 0 }, { id: 'n', name: 'heart', frame: 4 }] });
    expect(names).toEqual(['heart', 'coin_0', 'coin_1', 'frame_4', 'heart_2']);
  });
});

describe('engine data files', () => {
  it('Phaser: a JSON hash atlas plus animations that point at real frames', () => {
    const d = sampleData(true);
    const atlas = hashAtlas(d);
    // The documented JSON hash shape: frames keyed by name, each with frame, rotated, trimmed, spriteSourceSize, sourceSize.
    for (const [, f] of Object.entries(atlas.frames)) {
      expect(Object.keys(f).sort()).toEqual(['frame', 'rotated', 'sourceSize', 'spriteSourceSize', 'trimmed']);
      expect(Object.keys(f.frame).sort()).toEqual(['h', 'w', 'x', 'y']);
    }
    expect(atlas.meta).toMatchObject({ image: 'hero.png', size: { w: d.layout.width, h: d.layout.height }, scale: '1' });
    expect(atlas.frames.run_0).toMatchObject({ trimmed: true, spriteSourceSize: { x: 0, y: 0, w: 4, h: 8 }, sourceSize: { w: 8, h: 8 } });
    const anims = phaserAnimations(d, 'hero');
    expect(anims.anims.map((a) => [a.key, a.type, a.frameRate, a.repeat])).toEqual([
      ['idle', 'frame', 10, -1],
      ['run', 'frame', 10, 0],
    ]);
    // A held frame is listed once per document frame, so it plays for the right time.
    expect(anims.anims[0].frames).toEqual([{ key: 'hero', frame: 'idle_0' }, { key: 'hero', frame: 'idle_0' }]);
    for (const a of anims.anims) for (const f of a.frames) expect(atlas.frames).toHaveProperty([f.frame]);
  });

  it('PixiJS: frames, an animations map of frame names, and meta', () => {
    const d = sampleData();
    const s = pixiSheet(d);
    expect(Object.keys(s).sort()).toEqual(['animations', 'frames', 'meta']);
    expect(s.animations).toEqual({ idle: ['idle_0', 'idle_0'], run: ['run_0', 'run_1'] });
    for (const list of Object.values(s.animations)) for (const n of list) expect(s.frames).toHaveProperty([n]);
    expect(s.meta).toMatchObject({ image: 'hero.png', format: 'RGBA8888', scale: '1' });
    expect((s.meta as unknown as { frameling: { animations: Record<string, unknown> } }).frameling.animations.idle).toEqual({ fps: 10, loop: true, animationSpeed: 0.1667 });
  });

  it('Unity: rects counted from the bottom, pivots that keep trimmed frames in place, holds per frame', () => {
    const d = sampleData(true);
    const u = unitySheet(d, { pixelArt: true });
    expect(u).toMatchObject({ format: 'frameling-unity', image: 'hero.png', width: d.layout.width, height: d.layout.height, pixelsPerUnit: 8, pixelArt: true });
    u.frames.forEach((f, i) => {
      expect(f.y).toBe(d.layout.height - d.layout.positions[i].y - f.h);
      expect(f.x).toBe(d.layout.positions[i].x);
    });
    expect(u.frames[0]).toMatchObject({ pivotX: 0.5, pivotY: 0.5 });
    // run_0 is the left half of the frame, so the frame's middle is on its right edge.
    expect(u.frames[1]).toMatchObject({ name: 'run_0', w: 4, h: 8, pivotX: 1, pivotY: 0.5 });
    expect(u.animations).toEqual([
      { name: 'idle', fps: 10, loop: true, frames: ['idle_0'], holds: [2] },
      { name: 'run', fps: 10, loop: false, frames: ['run_0', 'run_1'], holds: [1, 1] },
    ]);
    // The script reads exactly these field names.
    for (const k of ['pixelsPerUnit', 'pixelArt', 'pivotX', 'pivotY', 'holds', 'frameling-unity', 'UNITY_EDITOR', 'class FramelingSheetImporter']) expect(UNITY_SCRIPT).toContain(k);
    expect(UNITY_SCRIPT_NAME).toBe('FramelingSheetImporter.cs');
  });

  it('CSS: a class per frame and keyframes where held frames last their full time', () => {
    const d = sampleData();
    const css = cssSprites(d, { prefix: 'Hero Run', pixelArt: true, separate: false });
    expect(css).toContain('.hero-run {');
    expect(css).toContain('background: url("hero.png") no-repeat;');
    expect(css).toContain('image-rendering: pixelated;');
    expect(css).toContain('width: 8px;');
    expect(css).toMatch(/\.hero-run-frame-run-1 \{ background-position: -16px 0; \}/);
    const idle = css.slice(css.indexOf('@keyframes hero-run-idle'));
    // idle is one cell for 2 frames: 0% and 100% only. run: 0%, 50%, 100%.
    expect(idle.slice(0, idle.indexOf('}\n}') + 3).match(/\d+(\.\d+)?%/g)).toEqual(['0%', '100%']);
    expect(css).toContain('animation: hero-run-idle 0.2s step-end infinite;');
    expect(css).toContain('animation: hero-run-run 0.2s step-end 1 forwards;');
    const run = css.slice(css.indexOf('@keyframes hero-run-run'));
    expect(run.match(/\d+(\.\d+)?%/g)).toEqual(['0%', '50%', '100%']);
    expect(run).toContain('50% { background-position: -16px 0; }');
  });
});

const job = (sheet: Partial<SheetSettings>, frames: RawImage[], over: Partial<Parameters<typeof buildSheetFiles>[0]> = {}) =>
  buildSheetFiles({
    doc: { name: 'Hero Run', clips, markers: [], fps: 10 },
    sheet: { ...DEFAULT_SHEET, ...sheet },
    frames,
    range: { start: 0, end: frames.length - 1 },
    whole: true,
    clipId: null,
    scale: 1,
    name: 'Hero Run',
    pixelArt: true,
    maxSide: 8192,
    ...over,
  });
const four = () => [solid(8, 8, 1), solid(8, 8, 1), solid(8, 8, 2), solid(8, 8, 3)];
const names = (r: ReturnType<typeof buildSheetFiles>) => r.files.map((f) => f.name).sort();
const fileText = (r: ReturnType<typeof buildSheetFiles>, n: string) => strFromU8(r.files.find((f) => f.name === n)!.bytes);

describe('the files each engine gets', () => {
  it('writes the right set of files per engine', () => {
    expect(names(job({ engine: 'none' }, four()))).toEqual(['hero-run.png']);
    expect(names(job({ engine: 'json' }, four()))).toEqual(['hero-run.json', 'hero-run.png']);
    expect(names(job({ engine: 'godot', godotScene: true, json: false }, four()))).toEqual(['hero-run.png', 'hero-run.tres', 'hero-run.tscn']);
    expect(names(job({ engine: 'godot', godotScene: false, json: true }, four()))).toEqual(['hero-run.json', 'hero-run.png', 'hero-run.tres']);
    expect(names(job({ engine: 'phaser' }, four()))).toEqual(['hero-run-anims.json', 'hero-run.json', 'hero-run.png']);
    expect(names(job({ engine: 'pixi' }, four()))).toEqual(['hero-run.json', 'hero-run.png']);
    expect(names(job({ engine: 'unity' }, four()))).toEqual(['FramelingSheetImporter.cs', 'hero-run.json', 'hero-run.png']);
    expect(names(job({ engine: 'unity', unityScript: false }, four()))).toEqual(['hero-run.json', 'hero-run.png']);
    expect(names(job({ engine: 'css', json: false }, four()))).toEqual(['hero-run.css', 'hero-run.html', 'hero-run.png']);
  });

  it('the PNG is the size the data says, and every frame rect is inside it', () => {
    for (const engine of ['json', 'phaser', 'pixi'] as const) {
      for (const layout of ['grid', 'packed'] as const) {
        const r = job({ engine, layout, trim: true, padding: 1, extrude: 1, jsonStyle: 'hash' }, four());
        const png = decodePng(r.files.find((f) => f.name === 'hero-run.png')!.bytes);
        const data = JSON.parse(fileText(r, 'hero-run.json'));
        expect([png.width, png.height]).toEqual([data.meta.size.w, data.meta.size.h]);
        for (const f of Object.values(data.frames) as { frame: { x: number; y: number; w: number; h: number } }[]) {
          expect(f.frame.x).toBeGreaterThanOrEqual(2);
          expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(png.width - 2);
          expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(png.height - 2);
        }
      }
    }
  });

  it('generic JSON comes as a list or keyed by name', () => {
    const arr = JSON.parse(fileText(job({ engine: 'json', jsonStyle: 'array' }, four()), 'hero-run.json'));
    expect(arr.frames.map((f: { filename: string }) => f.filename)).toEqual(['idle_0', 'run_0', 'run_1']);
    expect(arr.animations.idle.frames).toEqual([0, 0]);
    const hash = JSON.parse(fileText(job({ engine: 'json', jsonStyle: 'hash' }, four()), 'hero-run.json'));
    expect(Object.keys(hash.frames)).toEqual(['idle_0', 'run_0', 'run_1']);
    expect(hash.animations.idle.frames).toEqual(['idle_0', 'idle_0']);
    expect(hash.frames.idle_0.duration).toBe(200);
  });

  it('separate sprites: one atlas with a name per frame and no animations, or one PNG each', () => {
    const icons = [solid(8, 8, 1), solid(8, 8, 1), img(8, 8, (x) => (x < 2 ? [5, 5, 5, 255] : clear))];
    const doc = { name: 'Icons', clips: [], markers: [{ id: 'm', name: 'heart', frame: 0 }], fps: 10 };
    const r = job({ engine: 'pixi', content: 'separate', trim: true }, icons, { doc, name: 'Icons' });
    const s = JSON.parse(fileText(r, 'icons.json'));
    // Repeats are kept: each frame is its own sprite.
    expect(Object.keys(s.frames)).toEqual(['heart', 'frame_2', 'frame_3']);
    expect(s.animations).toEqual({});
    expect(s.frames.frame_3.frame).toMatchObject({ w: 2, h: 8 });
    const each = job({ engine: 'pixi', content: 'separate', separateFiles: true, trim: true }, icons, { doc, name: 'Icons' });
    expect(names(each)).toEqual(['frame_2.png', 'frame_3.png', 'heart.png']);
    expect(decodePng(each.files.find((f) => f.name === 'frame_3.png')!.bytes).width).toBe(2);
    const godot = job({ engine: 'godot', content: 'separate', json: false }, icons, { doc, name: 'Icons' });
    expect(names(godot)).toEqual(['icons-frame-2.tres', 'icons-frame-3.tres', 'icons-heart.tres', 'icons.png']);
    expect(fileText(godot, 'icons-heart.tres')).toContain('[gd_resource type="AtlasTexture" load_steps=2 format=3]');
    const css = fileText(job({ engine: 'css', content: 'separate', json: false }, icons, { doc, name: 'Icons' }), 'icons.css');
    expect(css).toMatch(/\.icons-heart \{ background-position: 0 0; width: 8px; height: 8px; \}/);
    expect(css).not.toContain('@keyframes');
  });

  it('CSS animations keep frames whole even with trimming on', () => {
    const frames = [img(8, 8, (x) => (x < 2 ? [1, 1, 1, 255] : clear)), solid(8, 8, 2)];
    const css = fileText(job({ engine: 'css', trim: true }, frames, { doc: { name: 'A', clips: [], markers: [], fps: 10 }, name: 'A' }), 'a.css');
    expect(css).toContain('width: 8px;');
  });

  it('says in plain words when the sheet would be too big', () => {
    expect(() => job({ engine: 'json' }, four(), { maxSide: 12 })).toThrow(/bigger than 12 pixels/);
  });
});

describe('older settings', () => {
  it('work out the engine from the old ticks', () => {
    expect(normalizeSheet({ ...DEFAULT_SHEET }).engine).toBe('json');
    expect(normalizeSheet({ ...DEFAULT_SHEET, godot: true }).engine).toBe('godot');
    expect(normalizeSheet({ ...DEFAULT_SHEET, json: false }).engine).toBe('none');
    expect(normalizeSheet({ ...DEFAULT_SHEET, engine: 'unity', godot: true }).engine).toBe('unity');
    expect(normalizeSheet({ ...DEFAULT_SHEET, engine: 'nope' as never }).engine).toBe('json');
    expect(normalizeSheet({ ...DEFAULT_SHEET, extrude: 99 }).extrude).toBe(8);
  });
});

describe('the game hero template, exported for Godot', () => {
  const doc = makeHeroSprite();
  const frames = artFrames(doc);
  const r = buildSheetFiles({
    doc,
    sheet: { ...DEFAULT_SHEET, engine: 'godot', godotScene: true, json: false, trim: true, layout: 'packed', padding: 1 },
    frames,
    range: { start: 0, end: doc.length - 1 },
    whole: true,
    clipId: null,
    scale: artScale(doc)!,
    name: doc.name,
    pixelArt: true,
    maxSide: 8192,
  });

  it('exports at art size, with the ground left out', () => {
    expect(artScale(doc)).toBe(1 / 8);
    expect(frames[0].width).toBe(32);
    // The bottom row (earth) is empty: the ground is a reference layer.
    const bottom = frames[0].pixels.subarray(31 * 32 * 4);
    expect([...bottom].some((v, i) => i % 4 === 3 && v > 0)).toBe(false);
  });

  it('has the five clips with the right loops, and the held die pose lasts 4 frames', () => {
    const tres = fileText(r, 'game-hero-sprite-set.tres');
    const anim = (n: string) => tres.slice(tres.indexOf(`"name": &"${n}"`) - 2000 < 0 ? 0 : tres.lastIndexOf('"frames": [', tres.indexOf(`"name": &"${n}"`)), tres.indexOf(`"name": &"${n}"`) + 40);
    for (const [n, loop] of [['idle', true], ['run', true], ['jump', false], ['hurt', false], ['die', false]] as const) {
      expect(anim(n)).toContain(`"loop": ${loop}`);
    }
    const die = anim('die');
    const durations = [...die.matchAll(/"duration": ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(durations).toEqual([1, 1, 1, 4]);
    expect(fileText(r, 'game-hero-sprite-set.tscn')).toContain('texture_filter = 1');
  });
});
