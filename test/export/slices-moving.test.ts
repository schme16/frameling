// Slices that move between frames in the sprite sheet export: every engine file gives each key its own region (and pivot)
// cut from the sheet frame the key starts on, which is kept whole. The sheet picture is read back to prove each region
// holds the colour that frame drew there.
import { describe, expect, it } from 'vitest';
import { newPixelLayer } from '../../src/core/doc';
import { buildSheetFiles, type SheetJob } from '../../src/export/engines';
import { keyIndexPerFrame, sliceKeyNames, sliceRuns, sliceTrack } from '../../src/export/slices';
import { DEFAULT_SHEET } from '../../src/export/types';
import { decodePng, type RawImage } from '../../src/io/png';
import { slicesForExport } from '../../src/pixel/slices/model';

const W = 32;
const H = 20;
const COLORS = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]];

/** Six frames; frame f draws a 6 x 6 block of its own colour at (2 + 4f, 3 + f), a small speck elsewhere so trimming has something to cut. */
function frames(count = 6): RawImage[] {
  return Array.from({ length: count }, (_, f) => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) px.set([...COLORS[f], 255], ((3 + f + y) * W + 2 + 4 * f + x) * 4);
    px.set([9, 9, 9, 255], (H - 1) * W * 4 + (W - 1) * 4);
    return { width: W, height: H, pixels: px };
  });
}

function layer() {
  const l = newPixelLayer('Sprite', 1);
  // "hand" follows the block: keys on frames 0, 2 and 4 (the block's place then), pivots that differ; "panel" is a 9-patch that grows.
  l.slices = [
    { id: 'h', name: 'hand', x: 2, y: 3, w: 6, h: 6, pivot: { x: 4, y: 9 }, keys: [
      { frame: 0, x: 2, y: 3, w: 6, h: 6, pivot: { x: 4, y: 9 } },
      { frame: 2, x: 10, y: 5, w: 6, h: 6, pivot: { x: 13, y: 8 } },
      { frame: 4, x: 18, y: 7, w: 6, h: 6 },
    ] },
    { id: 'p', name: 'panel', x: 2, y: 3, w: 6, h: 6, center: { x: 3, y: 4, w: 4, h: 4 }, keys: [
      { frame: 0, x: 2, y: 3, w: 6, h: 6, center: { x: 3, y: 4, w: 4, h: 4 } },
      { frame: 3, x: 14, y: 6, w: 6, h: 6, center: { x: 15, y: 8, w: 3, h: 2 } },
    ] },
    { id: 's', name: 'still', x: 0, y: 0, w: 4, h: 4 },
  ];
  return l;
}

const job = (engine: string, extra: Partial<SheetJob> = {}, over: Record<string, unknown> = {}): SheetJob => ({
  doc: { name: 'Hero', clips: [], markers: [], fps: 10 },
  sheet: { ...DEFAULT_SHEET, engine: engine as never, trim: true, dedupe: false, json: false, godotPath: 'res://sprites/hero.png', ...over },
  frames: frames(),
  range: { start: 0, end: 5 },
  whole: true,
  clipId: null,
  scale: 1,
  name: 'Hero',
  pixelArt: true,
  maxSide: 4096,
  slices: slicesForExport([layer()], 1, { start: 0, end: 5 }),
  ...extra,
});

const file = (out: ReturnType<typeof buildSheetFiles>, name: string) => out.files.find((f) => f.name === name)!;
const jsonOf = (out: ReturnType<typeof buildSheetFiles>, name: string) => JSON.parse(new TextDecoder().decode(file(out, name).bytes));
const sheetPixel = (out: ReturnType<typeof buildSheetFiles>, x: number, y: number) => [...decodePng(file(out, out.main).bytes).pixels.slice((y * out.width + x) * 4, (y * out.width + x) * 4 + 3)];

describe('names and runs of a slice that moves', () => {
  const slices = slicesForExport([layer()], 1, { start: 0, end: 5 });
  it('the first key keeps the slice name, later keys say the frame they start on, and none clash', () => {
    const k = sliceKeyNames(slices, ['hand', 'panel', 'still'], ['hand_f3', 'frame_0']);
    expect(k[0]).toEqual(['hand', 'hand_f3_2', 'hand_f5']);
    expect(k[1]).toEqual(['panel', 'panel_f4']);
    expect(k[2]).toEqual(['still']);
  });
  it('says which key shows on each frame, as a track and as runs', () => {
    expect(keyIndexPerFrame(slices[0], 6)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(sliceTrack(slices[0], ['a', 'b', 'c'], 6)).toEqual(['a', 'a', 'b', 'b', 'c', 'c']);
    expect(sliceTrack(slices[2], ['still'], 6)).toEqual([]);
    expect(sliceRuns(slices[1], ['p', 'q'], 6)).toEqual({ frames: ['p', 'q'], holds: [3, 3] });
  });
});

describe('Phaser and PixiJS get a frame, pivot and anchor for each key', () => {
  for (const engine of ['phaser', 'pixi'] as const) {
    it(`${engine}: each key's region on the sheet holds the colour that frame drew there`, () => {
      const out = buildSheetFiles(job(engine));
      const atlas = jsonOf(out, 'hero.json');
      const f = atlas.frames;
      // Keys of "hand" start on frames 0, 2 and 4.
      for (const [name, frame] of [['hand', 0], ['hand_f3', 2], ['hand_f5', 4]] as const) {
        expect(f[name], name).toBeTruthy();
        const r = f[name].frame;
        expect(sheetPixel(out, r.x + 3, r.y + 3), name).toEqual(COLORS[frame]);
      }
      const pk = engine === 'phaser' ? 'pivot' : 'anchor';
      expect(f.hand[pk]).toEqual({ x: 0.3333, y: 1 });
      expect(f.hand_f3[pk]).toEqual({ x: 0.5, y: 0.5 });
      expect(f.hand_f5[pk]).toBeUndefined();
      // The 9-patch's later key has its own borders.
      expect(f.panel.frameling.nineSlice).toEqual({ left: 1, top: 1, right: 1, bottom: 1 });
      expect(f.panel_f4.frameling.nineSlice).toEqual({ left: 1, top: 2, right: 2, bottom: 2 });
      expect(sheetPixel(out, f.panel_f4.frame.x + 3, f.panel_f4.frame.y + 3)).toEqual(COLORS[3]);
      // Still slices have no extra frames.
      expect(Object.keys(f).filter((n) => n.startsWith('still'))).toEqual(['still']);
      // The first frame stays whole too.
      expect(f.frame_0 ?? Object.values(f).find((v) => (v as { sourceSize?: { w: number } }).sourceSize?.w === W)).toBeTruthy();
    });
  }

  it('Phaser lists a slice that moves as an animation of its own, a frame per exported frame', () => {
    const out = buildSheetFiles(job('phaser'));
    const anims = jsonOf(out, 'hero-anims.json').anims;
    const a = anims.find((x: { key: string }) => x.key === 'slice_hand');
    expect(a.frames.map((x: { frame: string }) => x.frame)).toEqual(['hand', 'hand', 'hand_f3', 'hand_f3', 'hand_f5', 'hand_f5']);
    expect(a.frameRate).toBe(10);
    expect(anims.find((x: { key: string }) => x.key === 'slice_still')).toBeUndefined();
  });

  it('PixiJS lists the same as an animation', () => {
    const out = buildSheetFiles(job('pixi'));
    const atlas = jsonOf(out, 'hero.json');
    expect(atlas.animations.slice_panel).toEqual(['panel', 'panel', 'panel', 'panel_f4', 'panel_f4', 'panel_f4']);
  });
});

describe('Unity gets a sprite for each key, and a clip that plays them', () => {
  it('rects counted from the bottom on the whole frame the key starts on, a pivot each, borders each', () => {
    const out = buildSheetFiles(job('unity'));
    const u = jsonOf(out, 'hero.json');
    const by = Object.fromEntries(u.frames.map((f: { name: string }) => [f.name, f]));
    for (const [name, frame] of [['hand', 0], ['hand_f3', 2], ['hand_f5', 4]] as const) {
      const f = by[name];
      // Unity's y counts from the sheet's bottom.
      expect(sheetPixel(out, f.x + 3, out.height - f.y - f.h + 3), name).toEqual(COLORS[frame]);
    }
    expect([by.hand.pivotX, by.hand.pivotY]).toEqual([0.3333, 0]);
    expect([by.hand_f3.pivotX, by.hand_f3.pivotY]).toEqual([0.5, 0.5]);
    expect([by.hand_f5.pivotX, by.hand_f5.pivotY]).toEqual([0.5, 0.5]);
    expect(by.panel_f4).toMatchObject({ borderL: 1, borderT: 2, borderR: 2, borderB: 2 });
    expect(by.panel).toMatchObject({ borderL: 1, borderT: 1, borderR: 1, borderB: 1 });
    const clip = u.animations.find((a: { name: string }) => a.name === 'slice_hand');
    expect(clip).toMatchObject({ fps: 10, loop: true, frames: ['hand', 'hand_f3', 'hand_f5'], holds: [2, 2, 2] });
  });
});

describe('Godot gets an AnimationPlayer that sets the region and offset at each key', () => {
  it('the scene has a moving Sprite2D and NinePatchRect with tracks for what changes', () => {
    const out = buildSheetFiles(job('godot'));
    const t = new TextDecoder().decode(file(out, 'hero-slices.tscn').bytes);
    expect(t).toContain('[node name="hand" type="Sprite2D" parent="."]');
    expect(t).toContain('region_enabled = true');
    expect(t).toContain('[node name="SlicePlayer" type="AnimationPlayer" parent="."]');
    expect(t).toContain('autoplay = "slices"');
    expect(t).toContain('loop_mode = 1');
    expect(t).toContain('length = 0.6');
    expect(t).toContain('tracks/0/path = NodePath("hand:region_rect")');
    // Keys at frames 0, 2 and 4 at 10 fps.
    expect(t).toContain('"times": PackedFloat32Array(0, 0.2, 0.4)');
    expect(t).toContain('NodePath("hand:offset")');
    expect(t).toContain('NodePath("panel:region_rect")');
    expect(t).toContain('"times": PackedFloat32Array(0, 0.3)');
    expect(t).toContain('NodePath("panel:patch_margin_top")');
    // A slice that stays put is the node it always was.
    expect(t).toContain('[node name="still" type="Sprite2D" parent="."]');
    expect(t).not.toContain('NodePath("still');
  });

  it('every region in the scene holds the colour of its key frame', () => {
    const out = buildSheetFiles(job('godot'));
    const t = new TextDecoder().decode(file(out, 'hero-slices.tscn').bytes);
    const rects = [...t.matchAll(/NodePath\("hand:region_rect"\)[\s\S]*?"values": \[(.*?)\]\n/g)][0][1];
    const r = [...rects.matchAll(/Rect2\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/g)].map((m) => m.slice(1).map(Number));
    expect(r).toHaveLength(3);
    [0, 2, 4].forEach((frame, i) => expect(sheetPixel(out, r[i][0] + 3, r[i][1] + 3)).toEqual(COLORS[frame]));
  });
});

describe('CSS and the JSON', () => {
  it('CSS shows a moving slice where it is on the first frame, and says so', () => {
    const out = buildSheetFiles(job('css'));
    const css = new TextDecoder().decode(file(out, 'hero.css').bytes);
    expect(css).toContain('/* "hand" moves between frames; CSS can only show where it is on the first one. */');
    expect(css).toContain('.hero-slice-hand {');
    expect(css).not.toContain('hand-f3');
    expect(css).not.toContain('"still" moves');
  });

  it('the JSON meta keeps every key, as before', () => {
    const out = buildSheetFiles(job('json'));
    const m = jsonOf(out, 'hero.json').meta.slices;
    expect(m[0].keys.map((k: { frame: number }) => k.frame)).toEqual([0, 2, 4]);
  });
});

describe('the sheet keeps the key frames whole, and only those', () => {
  it('trimmed frames stay trimmed unless a key starts on them', () => {
    const out = buildSheetFiles(job('phaser'));
    const f = jsonOf(out, 'hero.json').frames;
    const whole = Object.entries(f).filter(([, v]) => (v as { frame: { w: number; h: number } }).frame.w === W && (v as { frame: { h: number } }).frame.h === H).length;
    // Frames 0, 2, 3 and 4 hold a key start; 1 and 5 are cut down to the block and the speck.
    expect(whole).toBe(4);
  });

  it('with held frames merged, a key frame that shares a picture still gets one whole', () => {
    const same = frames(6).map((fr, i) => (i === 3 ? frames(6)[2] : fr));
    const out = buildSheetFiles(job('phaser', { frames: same }, { dedupe: true }));
    const f = jsonOf(out, 'hero.json').frames;
    // "hand" has a key on frame 2 at (10, 5) and "panel" one on frame 3 at (14, 6): the same picture, so the same origin on the sheet.
    expect([f.panel_f4.frame.x - 14, f.panel_f4.frame.y - 6]).toEqual([f.hand_f3.frame.x - 10, f.hand_f3.frame.y - 5]);
    expect(sheetPixel(out, f.hand_f3.frame.x + 3, f.hand_f3.frame.y + 3)).toEqual(COLORS[2]);
  });
});
