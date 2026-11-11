import { describe, expect, it } from 'vitest';
import { autoColumns, buildAnimations, buildAtlas, buildCells, composeSheet, cropImage, godotResourcePath, godotScene, godotSpriteFrames, godotTexturePath, layoutCells, layoutGrid, nextPow2, trimBounds } from '../../src/export/sheet';
import { rgba } from './helpers';

const img = (w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]) => ({ width: w, height: h, pixels: rgba(w, h, fn) });
const clear: [number, number, number, number] = [0, 0, 0, 0];

describe('sprite sheet maths', () => {
  it('picks a roughly square layout', () => {
    expect(autoColumns(1, 32, 32)).toBe(1);
    expect(autoColumns(4, 32, 32)).toBe(2);
    expect(autoColumns(9, 32, 32)).toBe(3);
    expect(autoColumns(10, 32, 32)).toBe(4);
    expect(autoColumns(8, 64, 16)).toBe(2);
  });

  it('lays frames out on a grid with padding on every side', () => {
    const l = layoutGrid({ count: 5, cellW: 10, cellH: 20, columns: 3, padding: 2 });
    expect(l.columns).toBe(3);
    expect(l.rows).toBe(2);
    expect(l.width).toBe(3 * 10 + 4 * 2);
    expect(l.height).toBe(2 * 20 + 3 * 2);
    expect(l.positions).toEqual([
      { x: 2, y: 2 },
      { x: 14, y: 2 },
      { x: 26, y: 2 },
      { x: 2, y: 24 },
      { x: 14, y: 24 },
    ]);
  });

  it('rounds up to powers of two when asked', () => {
    expect([1, 3, 64, 65, 300].map(nextPow2)).toEqual([1, 4, 64, 128, 512]);
    const l = layoutGrid({ count: 3, cellW: 40, cellH: 40, columns: 3, pot: true });
    expect([l.width, l.height]).toEqual([128, 64]);
    expect(layoutGrid({ count: 2, cellW: 5, cellH: 5, columns: 9 }).columns).toBe(2);
  });

  it('finds the drawn part of a frame and crops to it', () => {
    const f = img(6, 5, (x, y) => (x >= 2 && x <= 3 && y === 1 ? [9, 9, 9, 255] : clear));
    expect(trimBounds(f)).toEqual({ x: 2, y: 1, w: 2, h: 1 });
    expect(trimBounds(img(3, 3, () => clear))).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const c = cropImage(f, trimBounds(f));
    expect([c.width, c.height, [...c.pixels]]).toEqual([2, 1, [9, 9, 9, 255, 9, 9, 9, 255]]);
  });

  it('stores a repeated frame once, but never across a clip boundary', () => {
    const a = img(2, 2, () => [1, 1, 1, 255]);
    const b = img(2, 2, () => [2, 2, 2, 255]);
    const frames = [a, a, b, b, b];
    expect(buildCells(frames, { trim: false, dedupe: true })).toMatchObject({ cellOfFrame: [0, 0, 1, 1, 1], cells: [{ held: 2 }, { held: 3 }] });
    expect(buildCells(frames, { trim: false, dedupe: true, cuts: new Set([1]) }).cellOfFrame).toEqual([0, 1, 2, 2, 2]);
    expect(buildCells(frames, { trim: false, dedupe: false }).cells.length).toBe(5);
  });

  it('paints cells at their positions', () => {
    const red = img(1, 1, () => [255, 0, 0, 255]);
    const cells = buildCells([red, img(1, 1, () => [0, 0, 255, 255])], { trim: false, dedupe: false }).cells;
    const layout = layoutCells(cells, { columns: 2, padding: 1 });
    const sheet = composeSheet(cells, layout);
    expect([sheet.width, sheet.height]).toEqual([5, 3]);
    expect([...sheet.pixels.subarray((1 * 5 + 1) * 4, (1 * 5 + 1) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    expect([...sheet.pixels.subarray((1 * 5 + 3) * 4, (1 * 5 + 3) * 4 + 4)]).toEqual([0, 0, 255, 255]);
  });
});

describe('animations and atlas', () => {
  const clips = [
    { id: 'a', name: 'idle', start: 0, end: 1, loop: true },
    { id: 'b', name: 'run', start: 2, end: 3, loop: false },
  ];

  it('makes an animation per clip, or one default for the whole timeline', () => {
    const per = buildAnimations({ clips, rangeStart: 0, rangeEnd: 3, fps: 12, whole: true });
    expect(per).toEqual([
      { name: 'idle', fps: 12, loop: true, frames: [0, 1] },
      { name: 'run', fps: 12, loop: false, frames: [2, 3] },
    ]);
    expect(buildAnimations({ clips: [], rangeStart: 0, rangeEnd: 2, fps: 8, whole: true })).toEqual([{ name: 'default', fps: 8, loop: true, frames: [0, 1, 2] }]);
    expect(buildAnimations({ clips, rangeStart: 2, rangeEnd: 3, fps: 12, whole: false, onlyClipId: 'b' })).toEqual([{ name: 'run', fps: 12, loop: false, frames: [0, 1] }]);
  });

  it('writes a JSON atlas with frames, source sizes and an animations map', () => {
    const a = img(4, 4, (x, y) => (x < 2 && y < 2 ? [1, 1, 1, 255] : clear));
    const b = img(4, 4, () => [2, 2, 2, 255]);
    const { cells, cellOfFrame } = buildCells([a, a, b, b], { trim: true, dedupe: true, cuts: new Set([2]) });
    const layout = layoutCells(cells, { columns: 2, padding: 1 });
    const animations = buildAnimations({ clips, rangeStart: 0, rangeEnd: 3, fps: 10, whole: true });
    const atlas = buildAtlas({ image: 'hero.png', layout, cells, cellOfFrame, animations, fps: 10, scale: 1, frameCount: 4 });
    expect(atlas).toEqual({
      meta: { app: 'Frameling', format: 'frameling-atlas', version: 1, image: 'hero.png', size: { w: 11, h: 6 }, scale: 1, fps: 10, frameCount: 4 },
      frames: [
        { index: 0, frame: { x: 1, y: 1, w: 2, h: 2 }, rotated: false, trimmed: true, spriteSourceSize: { x: 0, y: 0, w: 2, h: 2 }, sourceSize: { w: 4, h: 4 }, duration: 200 },
        { index: 1, frame: { x: 6, y: 1, w: 4, h: 4 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 }, sourceSize: { w: 4, h: 4 }, duration: 200 },
      ],
      animations: { idle: { fps: 10, loop: true, frames: [0, 0] }, run: { fps: 10, loop: false, frames: [1, 1] } },
    });
  });
});

describe('godot', () => {
  it('builds res:// paths', () => {
    expect(godotTexturePath('', 'Hero Run!')).toBe('res://sprites/hero-run.png');
    expect(godotTexturePath('art/x.png', 'a')).toBe('res://art/x.png');
    expect(godotTexturePath('res://a/b.png', 'a')).toBe('res://a/b.png');
    expect(godotResourcePath('res://a/b.png')).toBe('res://a/b.tres');
  });

  const a = img(8, 8, () => [1, 1, 1, 255]);
  const b = img(8, 8, () => [2, 2, 2, 255]);
  const { cells, cellOfFrame } = buildCells([a, a, b, b], { trim: false, dedupe: true, cuts: new Set([2]) });
  const layout = layoutCells(cells, { columns: 2 });
  const clips = [
    { id: 'a', name: 'idle', start: 0, end: 1, loop: true },
    { id: 'b', name: 'run', start: 2, end: 3, loop: false },
  ];

  it('writes SpriteFrames with one animation per clip (golden text)', () => {
    const animations = buildAnimations({ clips, rangeStart: 0, rangeEnd: 3, fps: 12, whole: true });
    const tres = godotSpriteFrames({ texturePath: 'res://sprites/hero.png', layout, cells, cellOfFrame, animations });
    expect(tres).toBe(`[gd_resource type="SpriteFrames" load_steps=4 format=3]

[ext_resource type="Texture2D" path="res://sprites/hero.png" id="1_sheet"]

[sub_resource type="AtlasTexture" id="AtlasTexture_0"]
atlas = ExtResource("1_sheet")
region = Rect2(0, 0, 8, 8)
filter_clip = true

[sub_resource type="AtlasTexture" id="AtlasTexture_1"]
atlas = ExtResource("1_sheet")
region = Rect2(8, 0, 8, 8)
filter_clip = true

[resource]
animations = [{
"frames": [{
"duration": 2.0,
"texture": SubResource("AtlasTexture_0")
}],
"loop": true,
"name": &"idle",
"speed": 12.0
}, {
"frames": [{
"duration": 2.0,
"texture": SubResource("AtlasTexture_1")
}],
"loop": false,
"name": &"run",
"speed": 12.0
}]
`);
  });

  it('uses the whole timeline as "default" when there are no clips, and keeps a trim margin', () => {
    const f = img(4, 4, (x, y) => (x === 1 && y === 2 ? [5, 5, 5, 255] : clear));
    const built = buildCells([f], { trim: true, dedupe: false });
    const l = layoutCells(built.cells, {});
    const animations = buildAnimations({ clips: [], rangeStart: 0, rangeEnd: 0, fps: 8.5, whole: true });
    const tres = godotSpriteFrames({ texturePath: 'res://s.png', layout: l, cells: built.cells, cellOfFrame: built.cellOfFrame, animations });
    expect(tres).toContain('region = Rect2(0, 0, 1, 1)\nmargin = Rect2(1, 2, 3, 3)\nfilter_clip = true');
    expect(tres).toContain('"name": &"default",\n"speed": 8.5');
  });

  it('writes a scene with an AnimatedSprite2D (golden text)', () => {
    expect(godotScene({ resourcePath: 'res://sprites/hero.tres', nodeName: 'Hero', animation: 'idle' })).toBe(`[gd_scene load_steps=2 format=3]

[ext_resource type="SpriteFrames" path="res://sprites/hero.tres" id="1_frames"]

[node name="Hero" type="AnimatedSprite2D"]
sprite_frames = ExtResource("1_frames")
animation = &"idle"
autoplay = "idle"
`);
  });
});
