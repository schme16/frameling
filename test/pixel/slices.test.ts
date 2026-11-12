// Slices: the maths, the file, what Aseprite brings, and what the sprite sheet export writes for engines.
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelLayer, Slice } from '../../src/core/format';
import { buildSheetFiles } from '../../src/export/engines';
import { cssNineFile, godotSlicesScene, nineBorders, sliceFrames, sliceMeta, sliceNames, unitySlices } from '../../src/export/slices';
import { loadFile, saveFile } from '../../src/io/file';
import { decodePng, type RawImage } from '../../src/io/png';
import { readSheetJson } from '../../src/pixel/import/sheetJson';
import { addSlice, borders, defaultBorders, dragSlice, freshSliceName, hitSlice, moveSlice, rectBetween, removeSlice, setBorders, sliceColor, slicesForExport, tidy } from '../../src/pixel/slices/model';
import { sliceFrom } from '../../src/aseprite/convert';
import { DEFAULT_SHEET } from '../../src/export/types';

const layer = (): PixelLayer => newPixelLayer('Sprite', 1);
const slice = (o: Partial<Slice> = {}): Slice => ({ id: 's1', name: 'btn', x: 10, y: 10, w: 20, h: 12, ...o });

describe('slice maths', () => {
  it('makes a rectangle from two corners either way round, at least 1 x 1', () => {
    expect(rectBetween({ x: 5, y: 9 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 3, w: 3, h: 6 });
    expect(rectBetween({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({ x: 4, y: 4, w: 1, h: 1 });
  });
  it('adds, names and removes', () => {
    const l = layer();
    const a = addSlice(l, { x: 0, y: 0, w: 4, h: 4 });
    const b = addSlice(l, { x: 4, y: 0, w: 4, h: 4 });
    expect([a.name, b.name]).toEqual(['Slice 1', 'Slice 2']);
    expect(freshSliceName(l.slices)).toBe('Slice 3');
    expect(removeSlice(l, a.id)).toBe(true);
    expect(removeSlice(l, b.id)).toBe(true);
    expect(l.slices).toBeUndefined();
    expect(removeSlice(l, 'nope')).toBe(false);
  });
  it('9-patch borders: set, read, default, kept inside the slice', () => {
    const s = slice();
    setBorders(s, { left: 4, top: 3, right: 5, bottom: 2 });
    expect(s.center).toEqual({ x: 14, y: 13, w: 11, h: 7 });
    expect(borders(s)).toEqual({ left: 4, top: 3, right: 5, bottom: 2 });
    setBorders(s, { left: 99, top: 99, right: 99, bottom: 99 });
    expect(s.center!.w).toBeGreaterThanOrEqual(1);
    expect(s.center!.h).toBeGreaterThanOrEqual(1);
    expect(defaultBorders({ w: 21, h: 3 })).toEqual({ left: 7, right: 7, top: 1, bottom: 1 });
    expect(defaultBorders({ w: 1, h: 1 })).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
  it('tidy keeps numbers whole and the middle inside', () => {
    const s = slice({ x: 1.4, y: 2.6, w: 0, h: 5, center: { x: -5, y: 0, w: 99, h: 99 }, pivot: { x: 1.5, y: 2.2 } });
    tidy(s);
    expect([s.x, s.y, s.w, s.h]).toEqual([1, 3, 1, 5]);
    expect(s.center!.x).toBeGreaterThanOrEqual(s.x);
    expect(s.center!.x + s.center!.w).toBeLessThanOrEqual(s.x + s.w);
    expect(s.center!.y + s.center!.h).toBeLessThanOrEqual(s.y + s.h);
    expect(s.pivot).toEqual({ x: 2, y: 2 });
  });
  it('moving a slice moves its middle and pivot with it', () => {
    const s = slice({ center: { x: 12, y: 12, w: 10, h: 4 }, pivot: { x: 20, y: 22 } });
    moveSlice(s, 3, -2);
    expect([s.x, s.y, s.center, s.pivot]).toEqual([13, 8, { x: 15, y: 10, w: 10, h: 4 }, { x: 23, y: 20 }]);
  });
  it('picks what is under the pointer: pivot, then 9-patch lines, then edges, then the body', () => {
    const s = slice({ center: { x: 14, y: 13, w: 12, h: 6 }, pivot: { x: 20, y: 22 } });
    expect(hitSlice([s], 20.2, 21.8, 0.5)?.grab).toBe('pivot');
    expect(hitSlice([s], 14.1, 16, 0.5)?.grab).toBe('cl');
    expect(hitSlice([s], 26.1, 16, 0.5)?.grab).toBe('cr');
    expect(hitSlice([s], 20, 13.1, 0.5)?.grab).toBe('ct');
    expect(hitSlice([s], 10, 10, 0.5)?.grab).toBe('nw');
    expect(hitSlice([s], 30, 16, 0.5)?.grab).toBe('e');
    expect(hitSlice([s], 11, 11, 0.5)?.grab).toBe('body');
    expect(hitSlice([s], 50, 50, 0.5)).toBeNull();
  });
  it('the slice on top wins where two overlap', () => {
    const a = slice({ id: 'a' });
    const b = slice({ id: 'b', x: 15 });
    expect(hitSlice([a, b], 20, 16, 0.2)?.slice.id).toBe('b');
  });
  it('dragging an edge, the body, the pivot and a 9-patch line', () => {
    const s = slice({ center: { x: 14, y: 13, w: 12, h: 6 }, pivot: { x: 20, y: 22 } });
    expect(dragSlice(s, 'body', 2, 3)).toMatchObject({ x: 12, y: 13, center: { x: 16, y: 16 }, pivot: { x: 22, y: 25 } });
    expect(dragSlice(s, 'e', 4, 0)).toMatchObject({ x: 10, w: 24 });
    expect(dragSlice(s, 'w', 50, 0)).toMatchObject({ x: 29, w: 1 });
    expect(dragSlice(s, 'se', -3, -2)).toMatchObject({ w: 17, h: 10 });
    expect(dragSlice(s, 'pivot', 1, -1).pivot).toEqual({ x: 21, y: 21 });
    expect(borders(dragSlice(s, 'cl', 2, 0))).toMatchObject({ left: 6 });
    expect(borders(dragSlice(s, 'cb', 0, -1))).toMatchObject({ bottom: 4 });
    // The original is not touched.
    expect(s.x).toBe(10);
  });
  it('colours by name unless the slice has its own', () => {
    expect(sliceColor({ name: 'a' })).toBe(sliceColor({ name: 'a' }));
    expect(sliceColor({ name: 'a', color: '#123456ff' })).toBe('#123456');
  });
});

describe('slices in the file', () => {
  const docWith = (): Doc => {
    const d = newDoc({ name: 'S', width: 32, height: 32, pixel: { pixelSize: 1 } });
    (d.layers[0] as PixelLayer).slices = [slice({ center: { x: 14, y: 13, w: 12, h: 6 }, pivot: { x: 20, y: 22 }, color: '#ff0000' }), slice({ id: 's2', name: 'hit', x: 0, y: 0, w: 3, h: 3 })];
    return d;
  };
  it('survive saving and opening', () => {
    const d = docWith();
    expect((loadFile(saveFile(d, 'x')).doc.layers[0] as PixelLayer).slices).toEqual((d.layers[0] as PixelLayer).slices);
  });
  it('a document with no slices writes none', () => {
    const d = newDoc({ pixel: { pixelSize: 1 } });
    expect(JSON.stringify(Array.from(saveFile(d, 'x'))).length).toBeGreaterThan(0);
    expect((loadFile(saveFile(d, 'x')).doc.layers[0] as PixelLayer).slices).toBeUndefined();
  });
  it('slices follow a board and a copied layer (they are on the layer)', () => {
    const d = docWith();
    const copy = structuredClone(d.layers[0]) as PixelLayer;
    expect(copy.slices!.length).toBe(2);
  });
});

describe('slices for export', () => {
  it('uses shown pixel layers, scales by pixel size and export scale, and renames a name two layers share', () => {
    const a = layer();
    a.pixelSize = 2;
    a.slices = [slice({ pivot: { x: 12, y: 20 }, center: { x: 12, y: 12, w: 10, h: 6 } })];
    const b = layer();
    b.slices = [slice({ id: 'z' })];
    const hidden = layer();
    hidden.visible = false;
    hidden.slices = [slice({ id: 'h', name: 'nope' })];
    const out = slicesForExport([a, b, hidden], 2);
    expect(out.map((s) => s.name)).toEqual(['btn', 'btn 2']);
    expect(out[0]).toMatchObject({ x: 40, y: 40, w: 80, h: 48, pivot: { x: 48, y: 80 }, center: { x: 48, y: 48, w: 40, h: 24 } });
    expect(out[1]).toMatchObject({ x: 20, y: 20, w: 40, h: 24 });
  });
});

describe('Aseprite slices', () => {
  it('make the middle and pivot absolute, take the first key and say when a slice moves', () => {
    const { slice: s, moves } = sliceFrom({ name: 'panel', nine: true, hasPivot: true, keys: [{ frame: 0, x: 4, y: 6, width: 10, height: 8, center: { x: 2, y: 2, width: 6, height: 4 }, pivot: { x: 5, y: 8 } }, { frame: 2, x: 5, y: 6, width: 10, height: 8 }] });
    expect(s).toMatchObject({ name: 'panel', x: 4, y: 6, w: 10, h: 8, center: { x: 6, y: 8, w: 6, h: 4 }, pivot: { x: 9, y: 14 } });
    expect(moves).toBe(true);
    expect(sliceFrom({ name: 'a', nine: false, hasPivot: false, keys: [{ frame: 0, x: 0, y: 0, width: 2, height: 2 }] }).moves).toBe(false);
  });
});

describe('what the export writes', () => {
  const s9: Slice & { layerName: string } = { ...slice({ name: 'Button', x: 8, y: 4, w: 24, h: 16, center: { x: 12, y: 8, w: 16, h: 8 }, pivot: { x: 20, y: 20 } }), layerName: 'Sprite' };
  const sp: Slice & { layerName: string } = { ...slice({ id: 'p', name: 'Hit Box', x: 2, y: 2, w: 6, h: 6 }), layerName: 'Sprite' };
  const names = sliceNames([s9, sp], ['frame_1'], (n) => n.replace(/\s+/g, '_'));

  it('names never clash with frames or each other', () => {
    expect(names).toEqual(['Button', 'Hit_Box']);
    expect(sliceNames([s9, s9], ['Button'])).toEqual(['Button_2', 'Button_3']);
  });
  it('9-patch borders', () => {
    expect(nineBorders(s9)).toEqual({ left: 4, top: 4, right: 4, bottom: 4 });
    expect(nineBorders(sp)).toBeNull();
  });
  it('JSON meta is in the shape Frameling reads back', () => {
    const back = readSheetJson(JSON.stringify({ frames: [{ filename: 'a', frame: { x: 0, y: 0, w: 40, h: 24 } }], meta: { slices: sliceMeta([s9, sp], names) } }))!;
    expect(back.slices[0]).toMatchObject({ name: 'Button', x: 8, y: 4, w: 24, h: 16, center: { x: 12, y: 8, w: 16, h: 8 }, pivot: { x: 20, y: 20 } });
    expect(back.slices[1]).toMatchObject({ name: 'Hit_Box', x: 2, y: 2, w: 6, h: 6 });
  });
  it('Phaser and Pixi frames: the region on the sheet, a pivot or an anchor from 0 to 1', () => {
    const f = sliceFrames([s9], ['Button'], { x: 100, y: 50 }, 'pivot');
    expect(f.Button.frame).toEqual({ x: 108, y: 54, w: 24, h: 16 });
    expect((f.Button as unknown as { pivot: unknown }).pivot).toEqual({ x: 0.5, y: 1 });
    expect((sliceFrames([s9], ['Button'], { x: 0, y: 0 }, 'anchor').Button as unknown as { anchor: unknown }).anchor).toEqual({ x: 0.5, y: 1 });
  });
  it('Unity: rects from the bottom, normalised pivot from the bottom, borders left bottom right top', () => {
    const [u, h] = unitySlices([s9, sp], names, { x: 0, y: 0 }, 64);
    expect(u).toMatchObject({ name: 'Button', x: 8, y: 64 - 4 - 16, w: 24, h: 16, pivotX: 0.5, pivotY: 0, borderL: 4, borderB: 4, borderR: 4, borderT: 4 });
    expect(h).toMatchObject({ pivotX: 0.5, pivotY: 0.5 });
    expect('borderL' in h).toBe(false);
  });
  it('Godot scene: a NinePatchRect with margins and a Sprite2D on an AtlasTexture with the pivot as its origin', () => {
    const t = godotSlicesScene('res://a/hero.png', [s9, sp], names, { x: 10, y: 0 }, true);
    expect(t).toContain('[node name="Button" type="NinePatchRect" parent="."]');
    expect(t).toContain('patch_margin_left = 4');
    expect(t).toContain('region_rect = Rect2(18, 4, 24, 16)');
    expect(t).toContain('[sub_resource type="AtlasTexture" id="Atlas_1"]');
    expect(t).toContain('region = Rect2(12, 2, 6, 6)');
    expect(t).toContain('texture_filter = 1');
    expect(t).toContain('load_steps=3');
  });
  it('CSS 9-patch file names', () => {
    expect(cssNineFile('hero', 'Big Panel!')).toBe('hero-big-panel.png');
  });

  // The whole job, with real frames.
  const frame = (v: number): RawImage => {
    const px = new Uint8ClampedArray(48 * 32 * 4);
    for (let y = 8; y < 24; y++) for (let x = 12; x < 36; x++) px.set([v, 0, 0, 255], (y * 48 + x) * 4);
    return { width: 48, height: 32, pixels: px };
  };
  const job = (engine: string, over: Record<string, unknown> = {}) =>
    buildSheetFiles({
      doc: { name: 'Hero', clips: [{ id: 'c', name: 'idle', start: 0, end: 1, loop: true }], markers: [], fps: 12 },
      sheet: { ...DEFAULT_SHEET, engine, trim: true, ...over } as never,
      frames: [frame(100), frame(200)],
      range: { start: 0, end: 1 },
      whole: true,
      clipId: null,
      scale: 1,
      name: 'Hero',
      pixelArt: true,
      maxSide: 4096,
      slices: [s9, sp],
    });
  const file = (r: ReturnType<typeof job>, name: string) => r.files.find((f) => f.name === name);
  const text = (r: ReturnType<typeof job>, name: string) => new TextDecoder().decode(file(r, name)!.bytes);

  it('keeps the first frame whole even when trimming, so slices line up', () => {
    const r = job('json');
    const atlas = JSON.parse(text(r, 'hero.json'));
    expect(atlas.frames[0].spriteSourceSize).toEqual({ x: 0, y: 0, w: 48, h: 32 });
    expect(atlas.frames[1].trimmed).toBe(true);
    expect(atlas.meta.slices.map((s: { name: string }) => s.name)).toEqual(['Button', 'Hit_Box']);
  });
  it('writes engine data for each engine', () => {
    expect(text(job('godot'), 'hero-slices.tscn')).toContain('NinePatchRect');
    const phaser = JSON.parse(text(job('phaser'), 'hero.json'));
    expect(phaser.frames.Button.pivot).toEqual({ x: 0.5, y: 1 });
    const pixi = JSON.parse(text(job('pixi'), 'hero.json'));
    expect(pixi.frames.Button.anchor).toEqual({ x: 0.5, y: 1 });
    const unity = JSON.parse(text(job('unity'), 'hero.json'));
    expect(unity.frames.filter((f: { borderL?: number }) => f.borderL !== undefined).length).toBe(1);
    expect(unity.animations.length).toBe(1);
  });
  it('CSS: a rule for each slice and a cut-out picture for a 9-patch, exactly the slice pixels', () => {
    const r = job('css');
    const css = text(r, 'hero.css');
    expect(css).toContain('border-image: url("hero-button.png") 4 4 4 4 fill / 4px 4px 4px 4px stretch;');
    expect(css).toMatch(/\.hero-slice-hit-box \{[^}]*background: url\("hero\.png"\) -2px -2px/);
    const png = decodePng(file(r, 'hero-button.png')!.bytes);
    expect([png.width, png.height]).toEqual([24, 16]);
    // Slice 8..32 x 4..20 of the frame: solid from x 12 and y 8 on.
    expect([...png.pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...png.pixels.slice((4 * 24 + 4) * 4, (4 * 24 + 4) * 4 + 4)]).toEqual([100, 0, 0, 255]);
  });
  it('without slices nothing changes', () => {
    const plain = buildSheetFiles({ doc: { name: 'Hero', clips: [], markers: [], fps: 12 }, sheet: { ...DEFAULT_SHEET, engine: 'godot' } as never, frames: [frame(1)], range: { start: 0, end: 0 }, whole: true, clipId: null, scale: 1, name: 'Hero', pixelArt: true, maxSide: 4096 });
    expect(plain.files.some((f) => f.name.endsWith('-slices.tscn'))).toBe(false);
  });
});
