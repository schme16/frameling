// A slice that changes between frames (Aseprite keys): the maths, the file, editing at a frame, the Aseprite and sprite
// sheet JSON import, and what the sprite sheet export writes.
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelLayer, Slice } from '../../src/core/format';
import { asepriteDoc, sliceFrom } from '../../src/aseprite/convert';
import { parseAseprite } from '../../src/aseprite/parse';
import { sliceMeta } from '../../src/export/slices';
import { loadFile, saveFile } from '../../src/io/file';
import { resetStore, store } from '../../src/core/store';
import { cutPicture, defaultCut, spriteDoc } from '../../src/pixel/import/build';
import { readSheetJson } from '../../src/pixel/import/sheetJson';
import { addKeyAt, keyAt, keysForRange, removeKeyAt, sliceAt, slicesForExport, stopMoving, tidy, writeSliceAt } from '../../src/pixel/slices/model';
import { editSlice, keySliceHere, stopSliceMoving, unkeySliceHere } from '../../src/pixel/slices/state';
import { aseFile, celChunk, layerChunk, rgbaImage, sliceChunk } from '../aseprite/writer';

const moving = (): Slice => ({
  id: 's',
  name: 'hand',
  x: 4,
  y: 6,
  w: 10,
  h: 8,
  pivot: { x: 9, y: 14 },
  keys: [
    { frame: 0, x: 4, y: 6, w: 10, h: 8, pivot: { x: 9, y: 14 } },
    { frame: 3, x: 20, y: 6, w: 12, h: 8, pivot: { x: 26, y: 14 } },
    { frame: 6, x: 30, y: 2, w: 12, h: 8 },
  ],
});

describe('slice keys: the maths', () => {
  it('a slice sits at the last key at or before the frame, and at the first key before all of them', () => {
    const s = moving();
    expect(keyAt(s, 0)!.frame).toBe(0);
    expect(keyAt(s, 2)!.frame).toBe(0);
    expect(keyAt(s, 3)!.frame).toBe(3);
    expect(keyAt(s, 99)!.frame).toBe(6);
    expect(sliceAt(s, 4)).toMatchObject({ x: 20, w: 12, pivot: { x: 26, y: 14 } });
    // The last key has no pivot, so the slice has none there.
    expect(sliceAt(s, 7).pivot).toBeUndefined();
    expect(sliceAt({ id: 'a', name: 'a', x: 1, y: 1, w: 1, h: 1 }, 5)).toMatchObject({ x: 1 });
  });

  it('writing at a frame changes only that frame\'s key and keeps the slice\'s own numbers on the first key', () => {
    const s = moving();
    writeSliceAt(s, 4, { x: 22, y: 6, w: 12, h: 8, pivot: { x: 26, y: 14 } });
    expect(s.keys!.map((k) => k.frame)).toEqual([0, 3, 4, 6]);
    expect(s.keys![2]).toMatchObject({ x: 22 });
    expect(keyAt(s, 3)).toMatchObject({ x: 20 });
    writeSliceAt(s, 0, { x: 5, y: 6, w: 10, h: 8, pivot: { x: 9, y: 14 } });
    expect(s).toMatchObject({ x: 5 });
    // Writing what is already there makes no new key.
    const n = s.keys!.length;
    writeSliceAt(s, 5, sliceAt(s, 5));
    expect(s.keys).toHaveLength(n);
  });

  it('a slice with no keys is written as before', () => {
    const s: Slice = { id: 'a', name: 'a', x: 1, y: 1, w: 2, h: 2, pivot: { x: 1, y: 1 } };
    writeSliceAt(s, 9, { x: 3, y: 3, w: 4, h: 4 });
    expect(s).toEqual({ id: 'a', name: 'a', x: 3, y: 3, w: 4, h: 4 });
  });

  it('adds a key (a still slice stays where it was until then), removes one, and stops moving', () => {
    const s: Slice = { id: 'a', name: 'a', x: 1, y: 1, w: 2, h: 2 };
    addKeyAt(s, 4);
    expect(s.keys).toEqual([{ frame: 0, x: 1, y: 1, w: 2, h: 2 }, { frame: 4, x: 1, y: 1, w: 2, h: 2 }]);
    writeSliceAt(s, 4, { x: 9, y: 9, w: 2, h: 2 });
    expect(sliceAt(s, 3).x).toBe(1);
    expect(sliceAt(s, 4).x).toBe(9);
    removeKeyAt(s, 4);
    expect(s.keys).toBeUndefined();
    expect(s.x).toBe(1);
    const m = moving();
    stopMoving(m, 4);
    expect(m.keys).toBeUndefined();
    expect(m).toMatchObject({ x: 20, w: 12, pivot: { x: 26, y: 14 } });
  });

  it('tidy repairs every key', () => {
    const s = moving();
    s.keys![1] = { frame: 3, x: 20.4, y: 6, w: 0, h: 8 };
    tidy(s);
    expect(s.keys![1]).toMatchObject({ x: 20, w: 1 });
  });

  it('keys for the frames an export covers, counted from its first frame', () => {
    const s = moving();
    expect(keysForRange(s, 2, 10).map((k) => [k.frame, k.x])).toEqual([[0, 4], [1, 20], [4, 30]]);
    expect(keysForRange(s, 4, 5).map((k) => [k.frame, k.x])).toEqual([[0, 20]]);
    expect(keysForRange({ id: 'a', name: 'a', x: 1, y: 1, w: 2, h: 2 }, 3, 9)).toHaveLength(1);
  });
});

describe('slice keys in the file', () => {
  it('are saved and opened, with the slice\'s own numbers matching the first key', () => {
    const d = newDoc({ name: 'k', width: 64, height: 48, pixel: { pixelSize: 1 } });
    (d.layers[0] as PixelLayer).slices = [moving()];
    const back = (loadFile(saveFile(d, 'x')).doc.layers[0] as PixelLayer).slices![0];
    expect(back.keys).toEqual(moving().keys);
    expect(back).toMatchObject({ x: 4, y: 6, w: 10, h: 8 });
  });

  it('a file that holds rubbish keys opens, and the slice keeps its own place', () => {
    const d = newDoc({ name: 'k', width: 64, height: 48, pixel: { pixelSize: 1 } });
    (d.layers[0] as PixelLayer).slices = [{ id: 's', name: 'a', x: 1, y: 2, w: 3, h: 4, keys: [{ frame: -1, x: 1, y: 2, w: 0, h: 0 }, 'x' as never] }];
    const back = (loadFile(saveFile(d, 'x')).doc.layers[0] as PixelLayer).slices![0];
    expect(back.keys).toBeUndefined();
    expect(back).toMatchObject({ x: 1, y: 2, w: 3, h: 4 });
  });
});

describe('editing a slice at a frame', () => {
  const setup = (): Doc => {
    const d = newDoc({ name: 'e', width: 64, height: 48, length: 10, pixel: { pixelSize: 1 } });
    (d.layers[0] as PixelLayer).slices = [moving()];
    resetStore(d);
    return d;
  };
  const slice = () => ((store().get().doc.layers[0] as PixelLayer).slices![0]);

  it('moving a keyed slice at a frame keys that frame; renaming does not', () => {
    setup();
    store().setUi({ frame: 4 });
    editSlice('Move slice', 's', (s) => void (s.x += 2));
    expect(slice().keys!.map((k) => k.frame)).toEqual([0, 3, 4, 6]);
    expect(sliceAt(slice(), 4).x).toBe(22);
    expect(sliceAt(slice(), 3).x).toBe(20);
    editSlice('Rename slice', 's', (s) => void (s.name = 'fist'));
    expect(slice().name).toBe('fist');
    expect(slice().keys).toHaveLength(4);
  });

  it('key, unkey and stop moving are undo steps', () => {
    const d = newDoc({ name: 'e', width: 64, height: 48, length: 10, pixel: { pixelSize: 1 } });
    (d.layers[0] as PixelLayer).slices = [{ id: 's', name: 'a', x: 1, y: 1, w: 2, h: 2 }];
    resetStore(d);
    store().setUi({ frame: 5 });
    keySliceHere('s');
    expect(slice().keys!.map((k) => k.frame)).toEqual([0, 5]);
    store().undo();
    expect(slice().keys).toBeUndefined();
    keySliceHere('s');
    unkeySliceHere('s');
    expect(slice().keys).toBeUndefined();
    keySliceHere('s');
    stopSliceMoving('s');
    expect(slice().keys).toBeUndefined();
  });
});

describe('Aseprite slices that move', () => {
  const bytes = aseFile({
    width: 40,
    height: 30,
    depth: 32,
    frames: [
      { duration: 100, chunks: [layerChunk({ name: 'A' }), celChunk({ layer: 0, kind: 'image', width: 1, height: 1, data: rgbaImage(1, 1, () => [1, 2, 3, 255]) }), sliceChunk({ name: 'hand', keys: [{ frame: 0, x: 1, y: 2, w: 5, h: 6 }, { frame: 2, x: 10, y: 12, w: 7, h: 8 }] })] },
      { duration: 100, chunks: [] },
      { duration: 200, chunks: [] },
      { duration: 100, chunks: [] },
    ],
  });

  it('keep a key at the timeline frame where each Aseprite frame starts', () => {
    // 100, 100, 200, 100 ms at 10 fps: frames start at 0, 1, 2 and 4.
    const { doc, notes } = asepriteDoc(parseAseprite(bytes), 'k');
    const s = (doc.layers[0] as PixelLayer).slices![0];
    expect(s.keys).toEqual([{ frame: 0, x: 1, y: 2, w: 5, h: 6 }, { frame: 2, x: 10, y: 12, w: 7, h: 8 }]);
    expect(s).toMatchObject({ x: 1, y: 2, w: 5, h: 6 });
    expect(sliceAt(s, 3)).toMatchObject({ x: 10, y: 12 });
    expect(notes.join(' ')).not.toMatch(/moves/);
  });

  it('a slice that does not change has no keys', () => {
    const r = sliceFrom({ name: 'a', nine: false, hasPivot: false, keys: [{ frame: 0, x: 0, y: 0, width: 2, height: 2 }, { frame: 3, x: 0, y: 0, width: 2, height: 2 }] });
    expect(r.moves).toBe(false);
    expect(r.slice.keys).toBeUndefined();
  });

  it('a change of only the pivot or the middle counts as moving', () => {
    const r = sliceFrom({ name: 'a', nine: false, hasPivot: true, keys: [{ frame: 0, x: 0, y: 0, width: 4, height: 4, pivot: { x: 1, y: 1 } }, { frame: 1, x: 0, y: 0, width: 4, height: 4, pivot: { x: 2, y: 2 } }] });
    expect(r.moves).toBe(true);
    expect(r.slice.keys![1]).toMatchObject({ frame: 1, pivot: { x: 2, y: 2 } });
  });
});

describe('sheet JSON keys', () => {
  const frames = [0, 1, 2].map((i) => ({ filename: `f${i}`, frame: { x: i * 8, y: 0, w: 8, h: 8 }, duration: 100 }));
  const json = JSON.stringify({ frames, meta: { size: { w: 24, h: 8 }, slices: [{ name: 'hit', color: '#ff0000ff', keys: [{ frame: 0, bounds: { x: 1, y: 1, w: 3, h: 3 } }, { frame: 2, bounds: { x: 4, y: 2, w: 3, h: 3 }, pivot: { x: 1, y: 1 } }] }] } });

  it('are read from meta.slices, and the slice goes to the timeline when the sprite is an animation', () => {
    const data = readSheetJson(json)!;
    expect(data.slices[0].keys!.map((k) => k.frame)).toEqual([0, 2]);
    expect(data.slices[0]).toMatchObject({ x: 1, y: 1, w: 3 });
  });

  it('a slice that never changes has no keys', () => {
    const still = readSheetJson(JSON.stringify({ frames, meta: { slices: [{ name: 'a', keys: [{ frame: 0, bounds: { x: 1, y: 1, w: 3, h: 3 } }, { frame: 1, bounds: { x: 1, y: 1, w: 3, h: 3 } }] }] } }))!;
    expect(still.slices[0].keys).toBeUndefined();
  });

  it('what the export writes is read back as the same keys', () => {
    const exported = slicesForExport(
      [{ ...newPixelLayer('S', 1), slices: [moving()] }],
      1,
      { start: 0, end: 9 },
    );
    expect(exported[0].keys!.map((k) => k.frame)).toEqual([0, 3, 6]);
    const meta = sliceMeta(exported, ['hand']);
    expect(meta[0].keys.map((k) => k.frame)).toEqual([0, 3, 6]);
    expect(meta[0].keys[1]).toMatchObject({ bounds: { x: 20, y: 6, w: 12, h: 8 }, pivot: { x: 6, y: 8 } });
    const back = readSheetJson(JSON.stringify({ frames: frames, meta: { slices: meta } }))!;
    expect(back.slices[0].keys).toHaveLength(3);
    expect(back.slices[0].keys![1]).toMatchObject({ frame: 3, x: 20, y: 6, pivot: { x: 26, y: 14 } });
  });

  it('an export of later frames measures the slice on its first frame', () => {
    const e = slicesForExport([{ ...newPixelLayer('S', 1), slices: [moving()] }], 2, { start: 4, end: 9 });
    expect(e[0]).toMatchObject({ x: 40, w: 24 });
    expect(e[0].keys!.map((k) => k.frame)).toEqual([0, 2]);
    expect(e[0].pivot).toEqual({ x: 52, y: 28 });
  });
});

it('building a sprite from a picture does not change slices without keys', () => {
  const pic = { width: 8, height: 8, frames: [{ pixels: new Uint8ClampedArray(8 * 8 * 4) }], kind: 'png' as const, notes: [] };
  const { doc } = spriteDoc(cutPicture(pic, defaultCut()), { way: 'picture', name: 'x', rowsAsSprites: true, palette: false });
  expect((doc.layers[0] as PixelLayer).slices).toBeUndefined();
});
