import { describe, expect, it } from 'vitest';
import { drawingAt } from '../../src/core/doc';
import { TILE_FLIP_D, TILE_FLIP_X, TILE_FLIP_Y, type Doc, type Layer, type PixelDrawing, type TilemapDrawing } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { flattenTilemap } from '../../src/tiles/model';
import { asepriteDoc, asepritePieces, blendFor, mergePieces, planTiming, scaleRgba, tagPlay } from '../../src/aseprite/convert';
import { clipOrder } from '../../src/core/clipPlay';
import { AsepriteProblem, parseAseprite } from '../../src/aseprite/parse';
import { aseFile, celChunk, celExtraChunk, layerChunk, oldPaletteChunk, paletteChunk, profileChunk, rgbaImage, sliceChunk, tagsChunk, tilesetChunk, userChunk } from './writer';

const open = (bytes: Uint8Array, name = 'test') => asepriteDoc(parseAseprite(bytes), name);
const px = (d: PixelDrawing | undefined, x: number, y: number): number[] => (d ? [...d.pixels.slice((y * d.width + x) * 4, (y * d.width + x) * 4 + 4)] : []);
const pixelAt = (doc: Doc, layer: Layer, frame: number) => drawingAt(doc, layer, frame) as PixelDrawing | undefined;
type RGBA = [number, number, number, number];
const solid = (w: number, h: number, c: RGBA) => rgbaImage(w, h, () => c);

/** Every pixel of a canvas-sized drawing equals the expected image placed at (ox, oy), and is clear elsewhere. */
function expectPlaced(d: PixelDrawing | undefined, img: number[], iw: number, ox: number, oy: number, opacity = 255) {
  expect(d).toBeDefined();
  const ih = img.length / 4 / iw;
  const want = new Uint8ClampedArray(d!.width * d!.height * 4);
  for (let y = 0; y < ih; y++)
    for (let x = 0; x < iw; x++) {
      const tx = x + ox;
      const ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= d!.width || ty >= d!.height) continue;
      const s = (y * iw + x) * 4;
      if (!img[s + 3]) continue;
      want.set([img[s], img[s + 1], img[s + 2], Math.round((img[s + 3] * opacity) / 255)], (ty * d!.width + tx) * 4);
    }
  expect([...d!.pixels]).toEqual([...want]);
}

const pal: [number, number, number, number?][] = [
  [0, 0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
];

describe('RGBA files', () => {
  const a = rgbaImage(3, 2, (x, y) => [x * 80, y * 100, 10, 255]);
  const b = rgbaImage(2, 2, (x, y) => [200, x * 50, y * 50, x === 0 && y === 0 ? 0 : 255]);
  const bytes = aseFile({
    width: 6,
    height: 5,
    depth: 32,
    flags: 1,
    frames: [
      {
        duration: 100,
        chunks: [
          profileChunk(),
          paletteChunk(pal),
          layerChunk({ name: 'Back', opacity: 128 }),
          layerChunk({ name: 'Front', blend: 1, opacity: 255 }),
          layerChunk({ name: 'Hidden', flags: 2 }),
          celChunk({ layer: 0, kind: 'image', x: 1, y: 2, width: 3, height: 2, data: a }),
          celChunk({ layer: 1, kind: 'raw', x: -1, y: 0, width: 2, height: 2, data: b, opacity: 100 }),
          celChunk({ layer: 2, kind: 'image', width: 1, height: 1, data: [9, 9, 9, 255] }),
        ],
      },
      { duration: 100, chunks: [celChunk({ layer: 0, kind: 'linked', link: 0 }), celChunk({ layer: 1, kind: 'image', x: 3, y: 3, width: 2, height: 2, data: b })] },
      { duration: 200, chunks: [celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1, 2, 3, 255] })] },
    ],
  });
  const { doc, notes } = open(bytes, 'sprite');

  it('makes layers in order with their settings', () => {
    expect(doc.width).toBe(6);
    expect(doc.height).toBe(5);
    expect(doc.background).toBeNull();
    expect(doc.layers.map((l) => l.name)).toEqual(['Back', 'Front', 'Hidden']);
    expect(doc.layers.map((l) => l.kind)).toEqual(['pixel', 'pixel', 'pixel']);
    expect(doc.layers[0].opacity).toBeCloseTo(128 / 255);
    expect(doc.layers[1].blend).toBe('multiply');
    expect(doc.layers.map((l) => l.visible)).toEqual([true, true, false]);
  });

  it('keeps each cel pixel for pixel, with position, cropping and cel opacity', () => {
    const [back, front] = doc.layers;
    expectPlaced(pixelAt(doc, back, 0), a, 3, 1, 2);
    expectPlaced(pixelAt(doc, front, 0), b, 2, -1, 0, 100);
    expectPlaced(pixelAt(doc, front, 1), b, 2, 3, 3);
    expectPlaced(pixelAt(doc, back, 2), [1, 2, 3, 255], 1, 0, 0);
  });

  it('holds frames to match the durations (100 ms, 100 ms, 200 ms is 10 fps and 1, 1, 2 frames)', () => {
    expect(doc.fps).toBe(10);
    expect(doc.length).toBe(4);
    expect(notes.filter((n) => n.startsWith('Frame timing'))).toEqual([]);
    const back = doc.layers[0];
    // Frame 2 is a linked cel: the same drawing as frame 1, so the two merge into one two-frame cel.
    expect(back.cels.map((c) => [c.start, c.length])).toEqual([
      [0, 2],
      [2, 2],
    ]);
    expect(back.cels[0].drawingId).toBe(drawingAt(doc, back, 1)?.id);
    expect(doc.layers[1].cels.map((c) => [c.start, c.length])).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('keeps the palette and notes in the drawing', () => {
    expect(doc.palette?.colors).toEqual(['#00000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00']);
    const ext = doc.ext!.aseprite as Record<string, unknown>;
    expect(ext.colorDepth).toBe(32);
    expect(ext.frameDurations).toEqual([100, 100, 200]);
  });

  it('survives saving and opening the file again', () => {
    const again = loadFile(saveFile(doc, 'test')).doc;
    expect(again.layers.length).toBe(3);
    expect((again.ext!.aseprite as { frameDurations: number[] }).frameDurations).toEqual([100, 100, 200]);
    expect([...(pixelAt(again, again.layers[0], 0)!.pixels)]).toEqual([...pixelAt(doc, doc.layers[0], 0)!.pixels]);
  });
});

describe('colour depths', () => {
  it('reads grayscale (value, alpha)', () => {
    const data = [10, 255, 200, 255, 50, 0, 90, 128];
    const { doc } = open(aseFile({ width: 2, height: 2, depth: 16, frames: [{ duration: 100, chunks: [layerChunk({ name: 'g' }), celChunk({ layer: 0, kind: 'image', width: 2, height: 2, data })] }] }));
    const d = pixelAt(doc, doc.layers[0], 0)!;
    expect(px(d, 0, 0)).toEqual([10, 10, 10, 255]);
    expect(px(d, 1, 0)).toEqual([200, 200, 200, 255]);
    expect(px(d, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(px(d, 1, 1)).toEqual([90, 90, 90, 128]);
    expect(doc.palette).toBeUndefined();
  });

  it('reads indexed colour: palette lookup, transparent index, palette alpha', () => {
    const colours: [number, number, number, number?][] = [...pal, [9, 9, 9, 128]];
    const data = [0, 1, 2, 3, 4, 5, 6, 1, 0];
    const bytes = aseFile({ width: 3, height: 3, depth: 8, transparentIndex: 0, frames: [{ duration: 100, chunks: [paletteChunk(colours), layerChunk({ name: 'i' }), celChunk({ layer: 0, kind: 'image', width: 3, height: 3, data })] }] });
    const { doc } = open(bytes);
    const d = pixelAt(doc, doc.layers[0], 0)!;
    const want = [[0, 0, 0, 0], [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255], [9, 9, 9, 128], [0, 0, 0, 0], [255, 0, 0, 255], [0, 0, 0, 0]];
    want.forEach((c, i) => expect(px(d, i % 3, Math.floor(i / 3))).toEqual(c));
    const ext = doc.ext!.aseprite as Record<string, unknown>;
    expect(ext.indexed).toBe(true);
    expect(ext.transparentIndex).toBe(0);
    expect(doc.palette!.colors[5]).toBe('#09090980');
  });

  it('a background layer keeps its transparent index colour; another transparent index is honoured', () => {
    const bytes = aseFile({
      width: 2,
      height: 1,
      depth: 8,
      transparentIndex: 2,
      frames: [{ duration: 100, chunks: [paletteChunk(pal), layerChunk({ name: 'bg', flags: 11 }), layerChunk({ name: 'top' }), celChunk({ layer: 0, kind: 'image', width: 2, height: 1, data: [2, 1] }), celChunk({ layer: 1, kind: 'image', width: 2, height: 1, data: [2, 1] })] }],
    });
    const { doc } = open(bytes);
    expect(px(pixelAt(doc, doc.layers[0], 0), 0, 0)).toEqual([0, 255, 0, 255]);
    expect(px(pixelAt(doc, doc.layers[1], 0), 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(pixelAt(doc, doc.layers[1], 0), 1, 0)).toEqual([255, 0, 0, 255]);
  });

  it('reads the old palette chunks (0 to 255 and 0 to 63), and the new chunk wins when both are there', () => {
    const one = (chunks: ReturnType<typeof oldPaletteChunk>[]) =>
      open(aseFile({ width: 1, height: 1, depth: 8, frames: [{ duration: 100, chunks: [...chunks, layerChunk({ name: 'i' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1] })] }] })).doc;
    const a = one([oldPaletteChunk([[0, 0, 0], [200, 100, 50]])]);
    expect(px(pixelAt(a, a.layers[0], 0), 0, 0)).toEqual([200, 100, 50, 255]);
    const b = one([oldPaletteChunk([[0, 0, 0], [63, 32, 0]], 0x0011)]);
    expect(px(pixelAt(b, b.layers[0], 0), 0, 0)).toEqual([252, 128, 0, 255]);
    const both = open(aseFile({ width: 1, height: 1, depth: 8, frames: [{ duration: 100, chunks: [oldPaletteChunk([[0, 0, 0], [1, 2, 3]]), paletteChunk([[0, 0, 0], [7, 8, 9]]), layerChunk({ name: 'i' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1] })] }] })).doc;
    expect(px(pixelAt(both, both.layers[0], 0), 0, 0)).toEqual([7, 8, 9, 255]);
  });

  it('uses the palette in force at each frame when it changes', () => {
    const bytes = aseFile({
      width: 1,
      height: 1,
      depth: 8,
      frames: [
        { duration: 100, chunks: [paletteChunk([[0, 0, 0], [1, 1, 1]]), layerChunk({ name: 'i' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1] })] },
        { duration: 100, chunks: [paletteChunk([[0, 0, 0], [2, 2, 2]]), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1] })] },
      ],
    });
    const { doc, notes } = open(bytes);
    expect(px(pixelAt(doc, doc.layers[0], 0), 0, 0)).toEqual([1, 1, 1, 255]);
    expect(px(pixelAt(doc, doc.layers[0], 1), 0, 0)).toEqual([2, 2, 2, 255]);
    expect(notes.join(' ')).toContain('palette changes');
  });
});

describe('layers and groups', () => {
  const img = solid(2, 2, [10, 20, 30, 255]);
  const cel = (layer: number) => celChunk({ layer, kind: 'image', width: 2, height: 2, data: img });
  const bytes = aseFile({
    width: 2,
    height: 2,
    depth: 32,
    flags: 3,
    frames: [
      {
        duration: 100,
        chunks: [
          layerChunk({ name: 'Solo' }),
          layerChunk({ name: 'Outer', type: 1, opacity: 128, blend: 1 }),
          layerChunk({ name: 'A', level: 1, opacity: 200 }),
          layerChunk({ name: 'Inner', type: 1, level: 1, opacity: 128, flags: 2 }),
          layerChunk({ name: 'B', level: 2 }),
          layerChunk({ name: 'Ref', flags: 3 | 64 }),
          layerChunk({ name: 'Locked', flags: 1 }),
          layerChunk({ name: 'Sub', blend: 17 }),
          layerChunk({ name: 'Div', blend: 18 }),
          cel(0),
          cel(2),
          cel(4),
          cel(5),
          cel(6),
          cel(7),
          cel(8),
        ],
      },
    ],
  });
  const { doc, notes } = open(bytes);
  const byName = (n: string) => doc.layers.find((l) => l.name.endsWith(n))!;

  it('turns a group into a folder with its opacity and blend', () => {
    const f = Object.values(doc.folders!);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ name: 'Outer', visible: true, blend: 'multiply' });
    expect(f[0].opacity).toBeCloseTo(128 / 255);
    expect(byName('A').folder).toBe(f[0].id);
    expect(byName('B').folder).toBe(f[0].id);
    expect(byName('Solo').folder).toBeUndefined();
  });

  it('folds a group inside a group into the outer one, keeping hiding and fading', () => {
    expect(byName('B').name).toBe('Inner / B');
    expect(byName('B').visible).toBe(false);
    expect(byName('B').opacity).toBeCloseTo(128 / 255);
    expect(notes.join(' ')).toContain('one level deep');
  });

  it('keeps reference, locked and layer order', () => {
    expect(byName('Ref').reference).toBe(true);
    expect(byName('Locked').locked).toBe(true);
    expect(byName('Solo').locked).toBe(false);
    expect(doc.layers.map((l) => l.name)).toEqual(['Solo', 'A', 'Inner / B', 'Ref', 'Locked', 'Sub', 'Div']);
  });

  it('maps every blend mode with an equal and says which have none', () => {
    const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'add'];
    modes.forEach((m, i) => expect(blendFor(i)).toBe(m));
    expect(blendFor(17)).toBeNull();
    expect(blendFor(18)).toBeNull();
    expect(byName('Sub').blend).toBeUndefined();
    expect(notes.join(' ')).toContain('no "Subtract" blend mode');
    expect(notes.join(' ')).toContain('no "Divide" blend mode');
  });

  it('ignores layer opacity when the file says it is not valid', () => {
    const d = open(aseFile({ width: 1, height: 1, depth: 32, flags: 0, frames: [{ duration: 100, chunks: [layerChunk({ name: 'x', opacity: 10 }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1, 1, 1, 255] })] }] })).doc;
    expect(d.layers[0].opacity).toBe(1);
  });
});

describe('frame timing', () => {
  it('finds the rate that fits every duration', () => {
    const t = planTiming([100, 150, 100, 50]);
    expect(t.fps).toBe(20);
    expect(t.holds).toEqual([2, 3, 2, 1]);
    expect(t.off).toBe(0);
  });
  it('uses the common rate for ordinary files', () => {
    expect(planTiming([83, 83, 83]).fps).toBe(12);
    expect(planTiming([33, 33, 34]).fps).toBe(30);
    expect(planTiming([100, 100]).holds).toEqual([1, 1]);
  });
  it('says so when durations cannot fit', () => {
    const t = planTiming([100, 37, 100, 100, 41]);
    expect(t.off).toBeGreaterThan(0);
    const bytes = aseFile({ width: 1, height: 1, depth: 32, frames: [100, 37, 100, 100, 41].map((duration, i) => ({ duration, chunks: i ? [] : [layerChunk({ name: 'x' })] })) });
    expect(open(bytes).notes.join(' ')).toContain('Frame timing');
  });
  it('keeps the document rate when adding', () => {
    const t = planTiming([100, 200], 24);
    expect(t.fps).toBe(24);
    expect(t.holds).toEqual([2, 5]);
    expect(t.starts).toEqual([0, 2]);
  });
  it('never makes a frame shorter than one', () => {
    const t = planTiming([10, 10, 10, 10], 5);
    expect(t.holds.every((h) => h >= 1)).toBe(true);
    expect(t.starts).toEqual([0, 1, 2, 3]);
  });
  it('uses the header speed for frames with no duration', () => {
    const bytes = aseFile({ width: 1, height: 1, depth: 32, speed: 80, frames: [{ duration: 0, chunks: [layerChunk({ name: 'x' })] }] });
    expect(parseAseprite(bytes).frames[0].duration).toBe(80);
  });
});

describe('tags, slices and user data', () => {
  const bytes = aseFile({
    width: 1,
    height: 1,
    depth: 32,
    frames: [
      {
        duration: 100,
        chunks: [
          layerChunk({ name: 'x' }),
          userChunk({ text: 'layer note', props: { solid: true, weight: 7, kind: 'wall' } }),
          celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1, 1, 1, 255] }),
          userChunk({ text: 'cel note' }),
          tagsChunk([
            { from: 0, to: 1, name: 'idle' },
            { from: 1, to: 3, direction: 1, name: 'back', color: [1, 2, 3] },
            { from: 2, to: 3, direction: 2, repeat: 3, name: 'bounce' },
            { from: 0, to: 3, direction: 3, repeat: 1, name: 'both' },
          ]),
          userChunk({ text: 'tag one', color: [10, 20, 30, 255] }),
          userChunk({}),
          userChunk({ text: 'tag three' }),
          sliceChunk({ name: 'hitbox', keys: [{ frame: 0, x: 1, y: 2, w: 3, h: 4 }] }),
          sliceChunk({ name: 'panel', nine: true, pivot: true, keys: [{ frame: 0, x: 0, y: 0, w: 8, h: 8, center: [2, 2, 4, 4], pivot: [1, 1] }] }),
        ],
      },
      { duration: 100, chunks: [] },
      { duration: 100, chunks: [] },
      { duration: 100, chunks: [] },
    ],
  });
  const file = parseAseprite(bytes);
  const { doc, notes } = asepriteDoc(file, 'tags');

  it('makes named clips over the right frames', () => {
    expect(doc.clips.map((c) => [c.name, c.start, c.end, c.loop])).toEqual([
      ['idle', 0, 1, true],
      ['back', 1, 3, true],
      ['bounce', 2, 3, false],
      ['both', 0, 3, false],
    ]);
  });

  it('maps tag direction and repeat count to the clips, with nothing left to approximate', () => {
    expect(doc.clips.map((c) => [c.name, c.direction, c.repeat])).toEqual([
      ['idle', undefined, undefined],
      ['back', 'reverse', undefined],
      ['bounce', 'pingpong', 2],
      ['both', 'reverse', undefined],
    ]);
    expect(notes.join(' ')).not.toMatch(/play forward in Frameling|direction is kept|repeat a set number/);
  });

  it('says when an odd ping-pong repeat count had to be rounded to whole trips', () => {
    expect(notes.filter((n) => /bounce/.test(n))).toHaveLength(1);
    expect(notes.join(' ')).toMatch(/Tag "bounce" repeats 3 times going one way and then the other.*plays 2 times/);
    expect(notes.filter((n) => /Tag "both"|Tag "back"/.test(n))).toHaveLength(0);
  });

  it('keeps direction, repeat, colours and user data in the notes', () => {
    const ext = doc.ext!.aseprite as { tags: Record<string, unknown>[]; slices: Record<string, any>[] };
    expect(ext.tags.map((t) => t.direction)).toEqual(['forward', 'reverse', 'ping-pong', 'ping-pong reverse']);
    expect(ext.tags[2].repeat).toBe(3);
    expect(ext.tags[0].userData).toEqual({ text: 'tag one', color: [10, 20, 30, 255] });
    expect(ext.tags[1].userData).toBeUndefined();
    expect(ext.tags[2].userData).toEqual({ text: 'tag three' });
    expect(ext.slices.map((s) => s.name)).toEqual(['hitbox', 'panel']);
    expect(ext.slices[1].keys[0].center).toEqual({ x: 2, y: 2, width: 4, height: 4 });
    expect(ext.slices[1].keys[0].pivot).toEqual({ x: 1, y: 1 });
    expect(ext.slices[1].nineSlice).toBe(true);
    expect(notes.join(' ')).toContain('2 slices');
    expect(file.layers[0].userData).toEqual({ text: 'layer note', props: { solid: true, weight: 7, kind: 'wall' } });
    expect(file.frames[0].cels[0].userData).toEqual({ text: 'cel note' });
    expect((doc.layers[0].ext!.aseprite as Record<string, unknown>).userData).toBeDefined();
  });

  it('keeps the notes through saving', () => {
    const again = loadFile(saveFile(doc, 'x')).doc;
    expect((again.ext!.aseprite as { slices: unknown[] }).slices).toHaveLength(2);
  });
});

describe('tilemaps', () => {
  const tw = 2;
  const tile = (c: RGBA) => solid(tw, tw, c);
  const tiles = [...tile([0, 0, 0, 0]), ...tile([255, 0, 0, 255]), ...rgbaImage(2, 2, (x, y) => [0, x * 255, y * 255, 255])];
  const ts = tilesetChunk({ tileWidth: 2, tileHeight: 2, count: 3, data: tiles, name: 'Ground' });
  const mk = (tilesData: number[], x = 0, y = 0, opacity = 255, w = 2, h = 2, grid?: [number, number, number, number]) =>
    aseFile({
      ...(grid ? { grid } : {}),
      width: 6,
      height: 4,
      depth: 32,
      frames: [{ duration: 100, chunks: [ts, layerChunk({ name: 'Map', type: 2, tileset: 0 }), celChunk({ layer: 0, kind: 'tilemap', width: w, height: h, tiles: tilesData, x, y, opacity })] }],
    });

  it('keeps tiles as tiles with flips', () => {
    const { doc, notes } = open(mk([0, 1, 2 | 0x20000000, 2 | 0x40000000 | 0x80000000]));
    const layer = doc.layers[0];
    expect(layer.kind).toBe('tilemap');
    expect(notes.filter((n) => n.includes('flat'))).toEqual([]);
    expect(doc.tileset).toMatchObject({ tileWidth: 2, tileHeight: 2 });
    expect(doc.tileset!.tiles.map((t) => t.key)).toEqual([1, 2]);
    const map = drawingAt(doc, layer, 0) as TilemapDrawing;
    expect(map.columns).toBe(3);
    expect(map.rows).toBe(2);
    const key = (x: number, y: number) => map.cells[y * map.columns + x];
    expect(key(0, 0)).toBe(0);
    expect(key(1, 0)).toBe(1);
    expect(key(0, 1)).toBe(((2 | TILE_FLIP_X) >>> 0) as number);
    expect(key(1, 1)).toBe(((2 | TILE_FLIP_Y | TILE_FLIP_D) >>> 0) as number);
    // The tile pixels came across.
    const red = doc.drawings[doc.tileset!.tiles[0].frames[0].drawingId] as PixelDrawing;
    expect(px(red, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it('places a map by its position on the grid', () => {
    const { doc } = open(mk([1, 1], 2, 2, 255, 2, 1));
    const map = drawingAt(doc, doc.layers[0], 0) as TilemapDrawing;
    expect(map.cells[1 * 3 + 1]).toBe(1);
    expect(map.cells[1 * 3 + 2]).toBe(1);
    expect(map.cells.filter(Boolean)).toHaveLength(2);
  });

  it('keeps tiles that sit on a tile grid starting off the corner, in the right place', () => {
    // Grid starts at (1,1): the cel at (3,1) is one tile in, and the map's first slot starts at (-1,-1).
    const { doc, notes } = open(mk([1, 2, 0, 1], 3, 1, 255, 2, 2, [1, 1, 2, 2]));
    expect(doc.layers[0].kind).toBe('tilemap');
    expect(notes.filter((n) => n.includes('flat'))).toEqual([]);
    expect([doc.tileset!.gridX, doc.tileset!.gridY]).toEqual([1, 1]);
    const map = drawingAt(doc, doc.layers[0], 0) as TilemapDrawing;
    expect([map.columns, map.rows]).toEqual([4, 3]);
    // Slot (x, y) starts at (-1 + 2x, -1 + 2y), so the cel's tiles are slots (2,1), (3,1), (2,2), (3,2).
    expect(map.cells[1 * 4 + 2]).toBe(1);
    expect(map.cells[1 * 4 + 3]).toBe(2);
    expect(map.cells[2 * 4 + 3]).toBe(1);
    expect(map.cells.filter(Boolean)).toHaveLength(3);
    // Flattened, it matches where Aseprite draws them: tile 1 is red at (3,1).
    const flat = flattenTilemap(doc, map, 0);
    expect([flat.width, flat.height]).toEqual([7, 5]);
    expect(px(flat, 3, 1)).toEqual([255, 0, 0, 255]);
    expect(px(flat, 4, 2)).toEqual([255, 0, 0, 255]);
    expect(px(flat, 5, 1)[3]).toBe(255);
    expect(px(flat, 2, 1)[3]).toBe(0);
  });

  it('still flattens a map that fits neither the corner nor the header grid', () => {
    const { doc } = open(mk([1, 1], 1, 0, 255, 2, 1, [1, 1, 2, 2]));
    expect(doc.layers[0].kind).toBe('pixel');
    expect(doc.tileset?.gridX).toBeUndefined();
  });

  it('keeps the corner grid when the map fits it, whatever the header grid says', () => {
    const { doc } = open(mk([1, 1], 2, 2, 255, 2, 1, [1, 1, 2, 2]));
    expect(doc.layers[0].kind).toBe('tilemap');
    expect(doc.tileset?.gridX).toBeUndefined();
  });

  it('draws the layer flat when its tiles are off the grid, with the flips applied', () => {
    const { doc, notes } = open(mk([2, 0, 0, 2 | 0x20000000], 1, 0));
    const layer = doc.layers[0];
    expect(layer.kind).toBe('pixel');
    expect(notes.join(' ')).toContain("don't line up");
    const d = pixelAt(doc, layer, 0)!;
    // Tile 2 at (1,0): its pixel (1,0) is [0,255,0].
    expect(px(d, 2, 0)).toEqual([0, 255, 0, 255]);
    expect(px(d, 1, 1)).toEqual([0, 0, 255, 255]);
    // The other one sits at (3,2), flipped on X: its source pixel (0,0) is black and lands at x=4.
    expect(px(d, 4, 2)).toEqual([0, 0, 0, 255]);
    expect(px(d, 3, 2)).toEqual([0, 255, 0, 255]);
  });

  it('draws the layer flat when the cel is partly see-through, with the opacity in the pixels', () => {
    const { doc, notes } = open(mk([1, 0, 0, 0], 0, 0, 128));
    expect(doc.layers[0].kind).toBe('pixel');
    expect(notes.join(' ')).toContain('partly see-through');
    expect(px(pixelAt(doc, doc.layers[0], 0), 0, 0)).toEqual([255, 0, 0, 128]);
  });

  it('flattens a tileset whose tiles are another size, and merges one of the same size', () => {
    const big = tilesetChunk({ id: 1, tileWidth: 4, tileHeight: 4, count: 2, data: [...solid(4, 4, [0, 0, 0, 0]), ...solid(4, 4, [1, 2, 3, 255])] });
    const same = tilesetChunk({ id: 2, tileWidth: 2, tileHeight: 2, count: 2, data: [...tile([0, 0, 0, 0]), ...tile([9, 9, 9, 255])], name: 'Other' });
    const bytes = aseFile({
      width: 8,
      height: 8,
      depth: 32,
      frames: [
        {
          duration: 100,
          chunks: [
            ts,
            big,
            same,
            layerChunk({ name: 'A', type: 2, tileset: 0 }),
            layerChunk({ name: 'B', type: 2, tileset: 1 }),
            layerChunk({ name: 'C', type: 2, tileset: 2 }),
            celChunk({ layer: 0, kind: 'tilemap', width: 1, height: 1, tiles: [1] }),
            celChunk({ layer: 1, kind: 'tilemap', width: 1, height: 1, tiles: [1] }),
            celChunk({ layer: 2, kind: 'tilemap', width: 1, height: 1, tiles: [1] }),
          ],
        },
      ],
    });
    const { doc, notes } = open(bytes);
    expect(doc.layers.map((l) => l.kind)).toEqual(['tilemap', 'pixel', 'tilemap']);
    expect(notes.join(' ')).toContain('4 x 4');
    expect(doc.tileset!.tiles).toHaveLength(3);
    const cOther = drawingAt(doc, doc.layers[2], 0) as TilemapDrawing;
    expect(cOther.cells[0]).toBe(doc.tileset!.tiles[2].key);
    expect(px(pixelAt(doc, doc.layers[1], 0), 3, 3)).toEqual([1, 2, 3, 255]);
  });

  it('reads 8 and 16 bit tiles and the old empty tile marker', () => {
    const bytes = aseFile({
      width: 2,
      height: 2,
      depth: 32,
      frames: [
        {
          duration: 100,
          chunks: [tilesetChunk({ tileWidth: 2, tileHeight: 2, count: 2, data: [...tile([5, 5, 5, 255]), ...tile([6, 6, 6, 255])], zeroEmpty: false }), layerChunk({ name: 'M', type: 2 }), celChunk({ layer: 0, kind: 'tilemap', width: 1, height: 1, tiles: [0], bits: 16 })],
        },
      ],
    });
    // Without the new flag, tile 0 is a real tile.
    const { doc } = open(bytes);
    expect((drawingAt(doc, doc.layers[0], 0) as TilemapDrawing).cells[0]).toBe(1);
    expect(doc.tileset!.tiles).toHaveLength(2);
  });
});

describe('details', () => {
  it('reads files with the chunk count only in the old field', () => {
    const bytes = aseFile({ width: 1, height: 1, depth: 32, frames: [{ duration: 50, oldCountOnly: true, chunks: [layerChunk({ name: 'x' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [4, 5, 6, 255] })] }] });
    const { doc } = open(bytes);
    expect(px(pixelAt(doc, doc.layers[0], 0), 0, 0)).toEqual([4, 5, 6, 255]);
  });

  it('scales a reference picture to its precise bounds', () => {
    const bytes = aseFile({
      width: 4,
      height: 4,
      depth: 32,
      frames: [{ duration: 100, chunks: [layerChunk({ name: 'ref', flags: 3 | 64 }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [50, 60, 70, 255] }), celExtraChunk(1, 1, 2, 2)] }],
    });
    const { doc, notes } = open(bytes);
    const d = pixelAt(doc, doc.layers[0], 0)!;
    expect(px(d, 0, 0)).toEqual([0, 0, 0, 0]);
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) expect(px(d, x, y)).toEqual([50, 60, 70, 255]);
    expect(notes.join(' ')).toContain('scaled reference');
  });

  it('scaleRgba keeps a flat colour flat', () => {
    const out = scaleRgba(Uint8ClampedArray.from([9, 8, 7, 255, 9, 8, 7, 255]), 2, 1, 5, 3);
    for (let i = 0; i < 15; i++) expect([...out.slice(i * 4, i * 4 + 4)]).toEqual([9, 8, 7, 255]);
  });

  it('adds a cel that has a negative position and goes past the canvas, noting the crop', () => {
    const bytes = aseFile({ width: 2, height: 2, depth: 32, frames: [{ duration: 100, chunks: [layerChunk({ name: 'x' }), celChunk({ layer: 0, kind: 'image', x: 1, y: 1, width: 3, height: 3, data: solid(3, 3, [1, 1, 1, 255]) })] }] });
    const { doc, notes } = open(bytes);
    expect(pixelAt(doc, doc.layers[0], 0)!.pixels.filter((_, i) => i % 4 === 3 && _ === 255)).toHaveLength(1);
    expect(notes.join(' ')).toContain('cropped');
  });

  it('keeps cels on the frame time grid when a layer has gaps', () => {
    const one = [1, 2, 3, 255];
    const bytes = aseFile({
      width: 1,
      height: 1,
      depth: 32,
      frames: [
        { duration: 100, chunks: [layerChunk({ name: 'x' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: one })] },
        { duration: 100, chunks: [] },
        { duration: 100, chunks: [celChunk({ layer: 0, kind: 'linked', link: 0 })] },
      ],
    });
    const { doc } = open(bytes);
    expect(doc.layers[0].cels.map((c) => [c.start, c.length])).toEqual([
      [0, 1],
      [2, 1],
    ]);
    expect(doc.layers[0].cels[0].drawingId).toBe(doc.layers[0].cels[1].drawingId);
    expect(drawingAt(doc, doc.layers[0], 1)).toBeUndefined();
  });

  it('refuses things that are not Aseprite files, in plain words', () => {
    expect(() => parseAseprite(new Uint8Array(10))).toThrow(AsepriteProblem);
    expect(() => parseAseprite(new Uint8Array(200))).toThrow(/doesn't look like an Aseprite file/);
    const good = aseFile({ width: 1, height: 1, depth: 32, frames: [{ duration: 100, chunks: [layerChunk({ name: 'x' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: [1, 1, 1, 1] })] }] });
    expect(() => parseAseprite(good.subarray(0, good.length - 6))).not.toThrow();
    const bad = good.slice();
    bad[128 + 4] = 0;
    expect(() => parseAseprite(bad)).toThrow(/damaged/);
    const deep = good.slice();
    new DataView(deep.buffer).setUint16(12, 24, true);
    expect(() => parseAseprite(deep)).toThrow(/colour depth/);
  });
});

describe('adding to an open drawing', () => {
  it('keeps the drawing rate, joins the tiles and palette, puts layers on top and grows the length', () => {
    const tile = solid(2, 2, [7, 7, 7, 255]);
    const bytes = aseFile({
      width: 2,
      height: 2,
      depth: 32,
      frames: [
        { duration: 100, chunks: [paletteChunk([[1, 2, 3], [4, 5, 6]]), tilesetChunk({ tileWidth: 2, tileHeight: 2, count: 2, data: [...solid(2, 2, [0, 0, 0, 0]), ...tile] }), layerChunk({ name: 'Map', type: 2 }), layerChunk({ name: 'Pic' }), celChunk({ layer: 0, kind: 'tilemap', width: 1, height: 1, tiles: [1] }), celChunk({ layer: 1, kind: 'image', width: 2, height: 2, data: tile })] },
        { duration: 100, chunks: [tagsChunk([{ from: 0, to: 1, name: 'go' }])] },
      ],
    });
    const file = parseAseprite(bytes);
    const target = asepriteDoc(parseAseprite(bytes), 'base').doc;
    const host: Doc = { ...target, layers: [target.layers[1]], fps: 24, length: 2, clips: [], palette: { name: 'mine', colors: ['#010203', '#aaaaaa'] }, ext: {} };
    host.tileset = { tileWidth: 2, tileHeight: 2, tiles: [{ key: 1, name: 'x', frames: [] }, { key: 5, name: 'y', frames: [] }], nextKey: 6 };
    const p = asepritePieces(file, 'add', { width: 4, height: 4, fps: 24, tileset: host.tileset });
    mergePieces(host, p, 'add.aseprite');
    expect(host.fps).toBe(24);
    expect(p.fps).toBe(24);
    expect(host.layers).toHaveLength(3);
    expect(host.layers[1].name).toBe('Map');
    expect(host.length).toBe(5);
    expect(host.tileset!.tiles.map((t) => t.key)).toEqual([1, 5, 6]);
    expect(host.tileset!.nextKey).toBe(7);
    expect(host.palette!.colors).toEqual(['#010203', '#aaaaaa', '#040506']);
    expect(host.clips[0]).toMatchObject({ name: 'go', start: 0, end: 4 });
    expect(Object.keys(host.ext!)).toEqual(['aseprite:add.aseprite']);
    const map = host.drawings[host.layers[1].cels[0].drawingId] as TilemapDrawing;
    expect(map.cells[0]).toBe(6);
    expect(p.notes.join(' ')).toContain('top left');
    const pic = host.drawings[host.layers[2].cels[0].drawingId] as PixelDrawing;
    expect(pic.width).toBe(4);
    expect(px(pic, 1, 1)).toEqual([7, 7, 7, 255]);
    expect(px(pic, 2, 2)).toEqual([0, 0, 0, 0]);
  });
});

/**
 * How Aseprite counts repeats on ping-pong tags. Aseprite 1.3.18 (/aseprite/src/doc/playback.cpp) drives its own
 * playback, and these frame orders come from running doc::Playback in PlayAll mode over a 6 frame sprite (frames 0 to
 * 5) with one tag on frames 1 to 4, linked against the installed build's libdoc. The rule in the source: a ping-pong
 * tag calls decrementRepeat() at every turn, so each direction counts as one repeat (a repeat of 2 is one trip there
 * and back, 1 is one way), the turn frames show once, and 0 repeats is forever. Forward and reverse count whole passes.
 */
describe('Aseprite ping-pong repeat counting (checked against its own playback)', () => {
  // [direction, repeat, tag frames in the order Aseprite plays them]
  const seen: [number, number, number[]][] = [
    [2, 1, [1, 2, 3, 4]],
    [2, 2, [1, 2, 3, 4, 3, 2, 1]],
    [2, 3, [1, 2, 3, 4, 3, 2, 1, 2, 3, 4]],
    [2, 4, [1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1]],
    [2, 5, [1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4]],
    [3, 1, [4, 3, 2, 1]],
    [3, 2, [4, 3, 2, 1, 2, 3, 4]],
    [3, 3, [4, 3, 2, 1, 2, 3, 4, 3, 2, 1]],
    [3, 4, [4, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4]],
    [1, 2, [4, 3, 2, 1, 4, 3, 2, 1]],
    [0, 3, [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]],
  ];
  const played = (dir: number, rep: number) => {
    const p = tagPlay(dir, rep);
    return clipOrder({ start: 1, end: 4, loop: p.loop, direction: p.direction, repeat: p.repeat > 1 ? p.repeat : undefined });
  };

  it('plays what Aseprite plays when the repeat count is a whole number of trips or a single way', () => {
    for (const [dir, rep, frames] of seen) {
      if (dir >= 2 && rep > 1 && rep % 2 === 1) continue;
      expect(played(dir, rep), `direction ${dir}, repeat ${rep}`).toEqual(frames);
    }
  });

  it('rounds an odd count up to the next whole trip, so Aseprite\'s frames are the start of the clip', () => {
    for (const [dir, rep, frames] of seen) {
      if (!(dir >= 2 && rep > 1 && rep % 2 === 1)) continue;
      const got = played(dir, rep);
      expect(tagPlay(dir, rep).roundedUp).toBe(true);
      expect(got.slice(0, frames.length), `direction ${dir}, repeat ${rep}`).toEqual(frames);
      expect(got.length).toBeGreaterThan(frames.length);
    }
  });

  it('keeps 0 repeats as forever, and other directions count whole passes', () => {
    expect(tagPlay(2, 0)).toMatchObject({ loop: true, direction: 'pingpong' });
    expect(tagPlay(0, 3)).toMatchObject({ loop: false, repeat: 3 });
    expect(tagPlay(1, 2)).toMatchObject({ direction: 'reverse', repeat: 2 });
  });
});
