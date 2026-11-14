import { describe, expect, it } from 'vitest';
import type { Doc, Layer, LayerPicture, ReferencePicture } from '../../src/core/format';
import {
  cornersOf,
  dropShot,
  fillPlacement,
  fitPlacement,
  framesPicture,
  hits,
  nameFromFile,
  newLayerPicture,
  normaliseTurn,
  pictureAt,
  putShot,
  scaleByDrag,
  shotAt,
  sniffPicture,
  turnByDrag,
  usedPictures,
  withPlacement,
} from '../../src/reference/model';

const pic = (id: string, width = 400, height = 200): ReferencePicture => ({ id, name: id, data: new Uint8Array([1]), mime: 'image/png', width, height });
const lp = (extra: Partial<LayerPicture> = {}): LayerPicture => ({ x: 100, y: 50, scale: 1, shots: [{ picture: 'a', start: 0 }], ...extra });

describe('what kind of picture these bytes are', () => {
  it('reads PNG and JPEG by their first bytes, not their names', () => {
    expect(sniffPicture(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffPicture(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffPicture(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    expect(sniffPicture(new Uint8Array([]))).toBeNull();
  });
  it('names a layer from its file', () => {
    expect(nameFromFile('/home/me/model-sheet.final.png')).toBe('model-sheet.final');
    expect(nameFromFile('C:\\art\\pose.JPG')).toBe('pose');
    expect(nameFromFile('.png')).toBe('Reference');
  });
});

describe('which picture shows on a frame', () => {
  it('one shot from frame 0 shows everywhere', () => {
    const p = lp();
    expect([0, 5, 999].map((f) => shotAt(p, f)?.picture)).toEqual(['a', 'a', 'a']);
  });
  it('a shot holds until the next one starts', () => {
    const p = lp({ shots: [{ picture: 'a', start: 0 }, { picture: 'b', start: 4 }] });
    expect([0, 3, 4, 10].map((f) => shotAt(p, f)?.picture)).toEqual(['a', 'a', 'b', 'b']);
  });
  it('a shot with a length stops after it, and a frame before any shot shows nothing', () => {
    const p = lp({ shots: [{ picture: 'a', start: 2, length: 3 }] });
    expect([0, 1, 2, 4, 5, 6].map((f) => shotAt(p, f)?.picture)).toEqual([undefined, undefined, 'a', 'a', undefined, undefined]);
    expect(shotAt(undefined, 0)).toBeUndefined();
  });
  it('looks the picture up in the document', () => {
    const doc = { pictures: [pic('a'), pic('b')] } as Pick<Doc, 'pictures'>;
    const layer = { picture: lp({ shots: [{ picture: 'b', start: 0 }] }) } as Layer;
    expect(pictureAt(doc, layer, 3)?.id).toBe('b');
    expect(pictureAt({}, layer, 3)).toBeUndefined();
  });
});

describe('putting a picture on a frame', () => {
  it('adds in order and replaces one that starts on the same frame', () => {
    let s = putShot([{ picture: 'a', start: 0 }], 6, 'b');
    s = putShot(s, 3, 'c');
    expect(s.map((x) => [x.picture, x.start])).toEqual([['a', 0], ['c', 3], ['b', 6]]);
    s = putShot(s, 3, 'd');
    expect(s.map((x) => x.picture)).toEqual(['a', 'd', 'b']);
  });
  it('cuts short an earlier shot that was set to run past it', () => {
    const s = putShot([{ picture: 'a', start: 0, length: 10 }], 4, 'b');
    expect(s).toEqual([{ picture: 'a', start: 0, length: 4 }, { picture: 'b', start: 4 }]);
  });
  it('takes a shot away so the one before holds on', () => {
    expect(dropShot([{ picture: 'a', start: 0 }, { picture: 'b', start: 4 }], 4)).toEqual([{ picture: 'a', start: 0 }]);
  });
  it('lists every picture the layers use', () => {
    const layers = [{ picture: lp({ shots: [{ picture: 'a', start: 0 }, { picture: 'b', start: 2 }] }) }, {}, { picture: lp({ shots: [{ picture: 'c', start: 0 }] }) }] as Layer[];
    expect([...usedPictures(layers)].sort()).toEqual(['a', 'b', 'c']);
  });
  it('lays a clip out one picture per start, the last held for a while', () => {
    const p = framesPicture([pic('a'), pic('b'), pic('c')], [2, 4, 6], 2, { width: 100, height: 100 });
    expect(p.shots).toEqual([{ picture: 'a', start: 2 }, { picture: 'b', start: 4 }, { picture: 'c', start: 6, length: 2 }]);
    expect(p.scale).toBeCloseTo(0.25);
  });
});

describe('where it sits', () => {
  it('fits inside the page, or fills it, in the middle', () => {
    expect(fitPlacement({ width: 400, height: 200 }, { width: 200, height: 200 })).toEqual({ x: 100, y: 100, scale: 0.5 });
    expect(fillPlacement({ width: 400, height: 200 }, { width: 200, height: 200 })).toEqual({ x: 100, y: 100, scale: 1 });
    expect(newLayerPicture(pic('a'), { width: 800, height: 400 })).toMatchObject({ x: 400, y: 200, scale: 2, shots: [{ picture: 'a', start: 0 }] });
  });
  it('finds its corners, turned about the middle', () => {
    const c = cornersOf({ x: 0, y: 0, scale: 1, turn: 90 }, { width: 20, height: 10 });
    expect(c[0].x).toBeCloseTo(5);
    expect(c[0].y).toBeCloseTo(-10);
    const straight = cornersOf({ x: 10, y: 10, scale: 2 }, { width: 20, height: 10 });
    expect(straight[0]).toEqual({ x: -10, y: 0 });
    expect(straight[2]).toEqual({ x: 30, y: 20 });
  });
  it('says whether a point is on it, turned or not', () => {
    const p = { x: 0, y: 0, scale: 1, turn: 90 };
    expect(hits(p, { width: 20, height: 10 }, { x: 0, y: 9 })).toBe(true);
    expect(hits(p, { width: 20, height: 10 }, { x: 9, y: 0 })).toBe(false);
  });
  it('sizes by how far the pointer moved from the middle, turns by the angle it swept', () => {
    const p = lp({ x: 0, y: 0, scale: 2 });
    expect(scaleByDrag(p, { x: 10, y: 0 }, { x: 20, y: 0 })).toBeCloseTo(4);
    expect(scaleByDrag(p, { x: 10, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(1);
    expect(scaleByDrag(p, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(2);
    expect(turnByDrag(p, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
    expect(turnByDrag(p, { x: 10, y: 0 }, { x: 10, y: 1 }, true)).toBe(0);
  });
  it('keeps turns between -180 and 180', () => {
    expect(normaliseTurn(190)).toBe(-170);
    expect(normaliseTurn(-190)).toBe(170);
    expect(normaliseTurn(360)).toBe(0);
    expect(Object.is(normaliseTurn(-0), 0)).toBe(true);
  });
  it('refuses a size of nothing or a number that is not one', () => {
    const p = lp();
    expect(withPlacement(p, { scale: 0 }).scale).toBe(1);
    expect(withPlacement(p, { x: NaN, y: 5 })).toMatchObject({ x: 100, y: 5 });
    expect(withPlacement(p, { scale: 1000 }).scale).toBe(100);
    expect(withPlacement({ ...p, turn: 30 }, { turn: 0 }).turn).toBeUndefined();
  });
});
