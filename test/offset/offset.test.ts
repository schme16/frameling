import { describe, expect, it } from 'vitest';
import { cleanOffset, canOffset, mixOffsets, offsetDrawing, snapOffset, usesCelOffsets, versionFor, OFFSET_LIMIT } from '../../src/core/offset';
import { FORMAT_VERSION, NEWEST_FORMAT_VERSION, OFFSET_FORMAT_VERSION } from '../../src/core/format';
import type { Doc, VectorDrawing } from '../../src/core/format';
import { isPosed, poseAt, celOffsetAt } from '../../src/core/symbols';
import { symbolBounds } from '../../src/canvas/geometry';
import { addCel, docWith } from '../timeline/helpers';
import { newPixelLayer } from '../../src/core/doc';
import { loadFile, saveFile } from '../../src/io/file';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import { placementAt, toLayerSpace } from '../../src/rig/pose';

const moved = (d: Doc, x: number, y: number, i = 0) => (d.layers[0].cels[i].offset = { x, y });

describe('a key\'s offset', () => {
  it('cleans what it is given: numbers in range, a zero move is no move', () => {
    expect(cleanOffset({ x: 3, y: -2 })).toEqual({ x: 3, y: -2 });
    expect(cleanOffset({ x: 0, y: 0 })).toBeUndefined();
    expect(cleanOffset({ x: NaN, y: 'a' })).toBeUndefined();
    expect(cleanOffset({ x: 1e9, y: -1e9 })).toEqual({ x: OFFSET_LIMIT, y: -OFFSET_LIMIT });
    expect(cleanOffset({ x: 1.23456, y: 0 })).toEqual({ x: 1.235, y: 0 });
    expect(cleanOffset(null)).toBeUndefined();
    expect(cleanOffset('x')).toBeUndefined();
  });

  it('snaps to whole art pixels on a pixel layer', () => {
    expect(snapOffset({ x: 7, y: -5 }, 4)).toEqual({ x: 8, y: -4 });
    expect(snapOffset({ x: 1, y: 1 }, 4)).toBeUndefined();
    expect(snapOffset({ x: 1.4, y: 0 }, 1)).toEqual({ x: 1.4, y: 0 });
  });

  it('mixes two offsets, a missing one meaning none', () => {
    expect(mixOffsets({ x: 10, y: 0 }, undefined, 0.5)).toEqual({ x: 5, y: 0 });
    expect(mixOffsets(undefined, { x: 0, y: 8 }, 0.25)).toEqual({ x: 0, y: 2 });
    expect(mixOffsets(undefined, undefined, 0.5)).toBeUndefined();
  });

  it('only drawing layers can be moved', () => {
    const d = docWith([[0, 2]]);
    expect(canOffset(d.layers[0])).toBe(true);
    expect(canOffset({ ...d.layers[0], rig: { bones: [] } } as never)).toBe(false);
    expect(canOffset({ ...d.layers[0], kind: 'camera' } as never)).toBe(false);
    expect(canOffset({ ...d.layers[0], kind: 'tilemap' } as never)).toBe(false);
  });
});

describe('showing it', () => {
  it('draws a moved drawing as one posed group, and the same one every time', () => {
    const d = docWith([[0, 4]]);
    moved(d, 3, -2);
    const a = poseAt(d, d.layers[0], 1)!;
    const b = poseAt(d, d.layers[0], 2)!;
    expect(a).toBe(b);
    const s = (a as VectorDrawing).shapes[0];
    expect(isPosed(s) && s.posed.matrix).toEqual([1, 0, 0, 1, 3, -2]);
    expect(isPosed(s) && s.posed.layers[0].drawing).toBe(d.drawings[d.layers[0].cels[0].drawingId]);
  });

  it('gives a drawing back untouched when it is not moved', () => {
    const d = docWith([[0, 4]]);
    expect(poseAt(d, d.layers[0], 1)).toBe(d.drawings[d.layers[0].cels[0].drawingId]);
    expect(offsetDrawing(d.drawings[d.layers[0].cels[0].drawingId], { x: 0, y: 0 }, 1)).toBe(d.drawings[d.layers[0].cels[0].drawingId]);
  });

  it('a different offset on the same drawing is a different picture', () => {
    const d = docWith([[0, 4]]);
    const key = d.layers[0].cels[0];
    key.length = 2;
    d.layers[0].cels.push({ id: 'b', start: 2, length: 2, drawingId: key.drawingId, offset: { x: 1, y: 0 } });
    key.offset = { x: 2, y: 0 };
    expect(poseAt(d, d.layers[0], 0)).not.toBe(poseAt(d, d.layers[0], 2));
  });

  it('carries the pixel size, so a pixel layer moves by document pixels', () => {
    const d = docWith([]);
    const l = newPixelLayer('p', 4);
    d.layers.push(l);
    addCel(d, l, 0, 2);
    l.cels[0].offset = { x: 8, y: 4 };
    const s = (poseAt(d, l, 0) as VectorDrawing).shapes[0];
    expect(isPosed(s) && s.posed.layers[0].pixelSize).toBe(4);
    expect(isPosed(s) && s.posed.matrix.slice(4)).toEqual([8, 4]);
  });

  it('goes from one key\'s offset to the next while a glide runs', () => {
    const d = docWith([[0, 4], [4, 4]]);
    const l = d.layers[0];
    l.cels[0].tween = { ease: 'linear' };
    l.cels[0].offset = { x: 0, y: 0 };
    delete l.cels[0].offset;
    l.cels[1].offset = { x: 8, y: -4 };
    expect(celOffsetAt(l, 0)).toBeUndefined();
    expect(celOffsetAt(l, 2)).toEqual({ x: 4, y: -2 });
    expect(celOffsetAt(l, 4)).toEqual({ x: 8, y: -4 });
  });

  it('is not shown on a camera or a tilemap layer', () => {
    const d = docWith([[0, 2]]);
    d.layers[0].cels[0].offset = { x: 5, y: 5 };
    expect(celOffsetAt({ ...d.layers[0], kind: 'camera' } as never, 0)).toBeUndefined();
  });

  it('moves the box a symbol covers', () => {
    const d = docWith([[0, 2]]);
    d.symbols = { s: { id: 's', name: 's', length: 2, layers: [d.layers[0]] } as never };
    const drawing = d.drawings[d.layers[0].cels[0].drawingId] as VectorDrawing;
    drawing.shapes.push({ id: 'r', type: 'fill', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }], color: '#f00', stroke: null, opacity: 1 } as never);
    const plain = symbolBounds(d, 's')!;
    d.layers[0].cels[0].offset = { x: 5, y: 7 };
    d.symbols.s = { ...d.symbols.s, layers: [{ ...d.layers[0] }] } as never;
    const shifted = symbolBounds(d, 's')!;
    expect([shifted.x - plain.x, shifted.y - plain.y]).toEqual([5, 7]);
  });
});

describe('drawing on a moved layer', () => {
  it('puts a pointer back on the drawing\'s own space, and gives the overlay the move', () => {
    const d = docWith([[0, 4]]);
    moved(d, 10, 3);
    expect(toLayerSpace(d, d.layers[0].id, 1, 'brush', { x: 50, y: 40 })).toEqual({ x: 40, y: 37 });
    expect(placementAt(d, d.layers[0], 1)).toEqual([1, 0, 0, 1, 10, 3]);
    // Tools that work on the stage as a whole are left alone.
    expect(toLayerSpace(d, d.layers[0].id, 1, 'hand', { x: 50, y: 40 })).toEqual({ x: 50, y: 40 });
    // A layer that was not moved gives the point back.
    const e = docWith([[0, 4]]);
    expect(toLayerSpace(e, e.layers[0].id, 1, 'brush', { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(placementAt(e, e.layers[0], 1)).toBeUndefined();
  });
});

describe('the saved version', () => {
  it('stays at the usual version when nothing is moved, and goes up by one when something is', () => {
    const d = docWith([[0, 4]]);
    expect(versionFor(d)).toBe(FORMAT_VERSION);
    moved(d, 1, 0);
    expect(versionFor(d)).toBe(OFFSET_FORMAT_VERSION);
    expect(OFFSET_FORMAT_VERSION).toBe(FORMAT_VERSION + 1);
    expect(NEWEST_FORMAT_VERSION).toBe(OFFSET_FORMAT_VERSION);
  });

  it('finds an offset in a symbol, in a set-aside artboard and in what a variation changes', () => {
    const base = () => docWith([[0, 4]]);
    const a = base();
    a.symbols = { s: { id: 's', name: 's', length: 1, layers: [{ ...a.layers[0], cels: [{ id: 'c', start: 0, length: 1, drawingId: 'x', offset: { x: 1, y: 1 } }] }] } as never };
    expect(usesCelOffsets(a)).toBe(true);
    const b = base();
    b.artboards = [{ id: 'a', name: 'a', x: 0, y: 0, content: { layers: [{ ...b.layers[0], cels: [{ id: 'c', start: 0, length: 1, drawingId: 'x', offset: { x: 1, y: 1 } }] }] } as never }];
    expect(usesCelOffsets(b)).toBe(true);
    const c = base();
    c.artboards = [{ id: 'v', name: 'v', x: 0, y: 0, variationOf: 'a', overrides: { layers: { items: { l: { sub: { items: { k: { patch: { set: { offset: { x: 2, y: 0 } } } } } } } } } } as never }];
    expect(usesCelOffsets(c)).toBe(true);
    expect(usesCelOffsets(base())).toBe(false);
  });

  it('writes version 4 only for a file that moves something, and reads it back the same', () => {
    const d = docWith([[0, 4], [4, 2]]);
    const plainBytes = saveFile(d, 'x');
    expect(JSON.parse(strFromU8(unzipSync(plainBytes)['manifest.json'])).version).toBe(FORMAT_VERSION);
    moved(d, -3, 2);
    d.layers[0].cels[1].offset = { x: 0.5, y: 9 };
    const bytes = saveFile(d, 'x');
    const files = unzipSync(bytes);
    expect(JSON.parse(strFromU8(files['manifest.json'])).version).toBe(OFFSET_FORMAT_VERSION);
    expect(JSON.parse(strFromU8(files['doc.json'])).version).toBe(OFFSET_FORMAT_VERSION);
    const back = loadFile(bytes).doc;
    expect(back.layers[0].cels.map((c) => c.offset)).toEqual([{ x: -3, y: 2 }, { x: 0.5, y: 9 }]);
    expect(back.version).toBe(FORMAT_VERSION);
  });

  it('opens an older file (no offsets anywhere) unchanged, with no field added', () => {
    const d = docWith([[0, 4]]);
    const back = loadFile(saveFile(d, 'x')).doc;
    expect('offset' in back.layers[0].cels[0]).toBe(false);
  });

  it('repairs a hand-edited offset instead of failing', () => {
    const d = docWith([[0, 1], [1, 1], [2, 1], [3, 1]]);
    const files = unzipSync(saveFile(d, 'x'));
    const raw = JSON.parse(strFromU8(files['doc.json']));
    raw.layers[0].cels[0].offset = { x: 'a', y: null };
    raw.layers[0].cels[1].offset = { x: 1e12, y: -5 };
    raw.layers[0].cels[2].offset = 'left';
    raw.layers[0].cels[3].offset = { x: 0, y: 0 };
    files['doc.json'] = strToU8(JSON.stringify(raw));
    files['manifest.json'] = strToU8(JSON.stringify({ format: 'frameling', version: OFFSET_FORMAT_VERSION, app: 't', created: '', name: 'n' }));
    const back = loadFile(zipSync(files as never)).doc;
    expect(back.layers[0].cels.map((c) => c.offset)).toEqual([undefined, { x: OFFSET_LIMIT, y: -5 }, undefined, undefined]);
  });

  it('still refuses a file from a version this one does not know', () => {
    const files = unzipSync(saveFile(docWith([[0, 1]]), 'x'));
    files['manifest.json'] = strToU8(JSON.stringify({ format: 'frameling', version: OFFSET_FORMAT_VERSION + 1, app: 't', created: '', name: 'n' }));
    expect(() => loadFile(zipSync(files as never))).toThrow(/newer Frameling/);
  });
});
