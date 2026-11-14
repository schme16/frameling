import { describe, expect, it } from 'vitest';
import type { Doc, InstanceShape } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { makeSymbol } from '../../src/core/symbols';
import { docToLottie, PICTURE_LOOKS, PictureBank, visibleBox } from '../../src/export/lottie';
import { lottieSizes } from '../../src/export/lottie-size';
import { addVectorLayer, ellipsePath, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

/* eslint-disable @typescript-eslint/no-explicit-any */
const solid = (w: number, h: number, v: number, a = 255): Uint8ClampedArray => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) px.set([v, v, v, a], i);
  return px;
};

describe('Lottie: fading a layer as a whole', () => {
  function fadeDoc(opacity: number, shapes: number, blend?: 'multiply'): Doc {
    const doc = newDoc({ width: 200, height: 100, length: 4 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Faded');
    l.opacity = opacity;
    if (blend) l.blend = blend;
    const parts = [fill([ellipsePath(50, 50, 30, 30)], '#ff0000'), fill([ellipsePath(70, 50, 30, 30)], '#0000ff')].slice(0, shapes);
    hold(l, vectorDrawing(doc, parts).id, 0, 4);
    return doc;
  }
  const faded = (data: any) => data.layers.find((l: any) => l.nm === 'Faded');
  const matteOf = (data: any, l: any) => data.layers.find((m: any) => m.ind === l.ind - 1);

  it('puts overlapping shapes under a see-through matte, so the canvas player fades them together', () => {
    const data = docToLottie(fadeDoc(0.5, 2));
    const l = faded(data);
    expect(l.tt).toBe(1);
    expect(l.ks.o.k).toBe(100);
    const m = matteOf(data, l);
    expect(m.td).toBe(1);
    expect(m.ks.o.k).toBe(50);
    expect([m.ip, m.op]).toEqual([l.ip, l.op]);
    // Nothing hangs off the camera, so the matte covers the stage wherever the layer is.
    expect(m.parent).toBeUndefined();
  });

  it('leaves a single shape alone: opacity on it is the same thing', () => {
    const l = faded(docToLottie(fadeDoc(0.5, 1)));
    expect(l.tt).toBeUndefined();
    expect(l.ks.o.k).toBe(50);
  });

  it('leaves a layer at full strength alone', () => {
    const l = faded(docToLottie(fadeDoc(1, 2)));
    expect(l.tt).toBeUndefined();
  });

  it('keeps a blend mode on the layer, since a matte would drop it in the canvas player', () => {
    const l = faded(docToLottie(fadeDoc(0.5, 2, 'multiply')));
    expect(l.tt).toBeUndefined();
    expect(l.bm).toBe(1);
  });

  it('fades a folder of layers as one picture', () => {
    const doc = newDoc({ width: 200, height: 100, length: 2 });
    doc.layers = [];
    doc.folders = { f1: { id: 'f1', name: 'Group', visible: true, opacity: 0.5 } };
    for (const [i, c] of ['#ff0000', '#0000ff'].entries()) {
      const l = addVectorLayer(doc, 'In ' + i);
      l.folder = 'f1';
      hold(l, vectorDrawing(doc, [fill([ellipsePath(50 + i * 20, 50, 30, 30)], c)]).id, 0, 2);
    }
    const data = docToLottie(doc);
    const group = data.layers.find((l: any) => l.nm === 'Group');
    expect(group.tt).toBe(1);
    expect(group.ks.o.k).toBe(100);
    expect(data.layers.find((m: any) => m.ind === group.ind - 1).ks.o.k).toBe(50);
  });

  it('fades a symbol copy with overlapping shapes inside as a whole', () => {
    const doc = newDoc({ width: 200, height: 100, length: 2 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Copies');
    const k = vectorDrawing(doc, [fill([ellipsePath(30, 50, 20, 20)], '#ff0000'), fill([ellipsePath(45, 50, 20, 20)], '#0000ff')]);
    makeSymbol(doc, k.id, k.shapes.map((s) => s.id), { x: 40, y: 50 }, 'Pair');
    const inst = k.shapes[0] as InstanceShape;
    k.shapes = [{ ...inst, id: uid('s'), opacity: 0.4 }];
    hold(l, k.id, 0, 2);
    const data = docToLottie(doc);
    const copy = data.layers.find((x: any) => x.ty === 0 && x.tt);
    expect(copy.ks.o.k).toBe(100);
    expect(data.layers.find((m: any) => m.ind === copy.ind - 1).ks.o.k).toBe(40);
  });

  it('stays valid: the matte sits directly above the layer and indexes are unique', () => {
    const data = docToLottie(fadeDoc(0.3, 2));
    const inds = data.layers.map((l: any) => l.ind);
    expect(new Set(inds).size).toBe(inds.length);
    const l = faded(data);
    expect(data.layers.indexOf(matteOf(data, l))).toBe(data.layers.indexOf(l) - 1);
  });
});

describe('Lottie: baked pictures', () => {
  it('trims to what shows, ignoring a faint tail', () => {
    const px = new Uint8ClampedArray(10 * 10 * 4);
    px.set([255, 0, 0, 255], (3 * 10 + 4) * 4);
    px.set([255, 0, 0, 255], (6 * 10 + 7) * 4);
    px.set([255, 0, 0, 2], (9 * 10 + 0) * 4);
    expect(visibleBox(px, 10, 10)).toEqual({ x0: 4, y0: 3, x1: 7, y1: 6 });
    expect(visibleBox(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });

  it('gives the same pictures (or nearly) one image, and different ones their own', () => {
    let n = 0;
    const bank = new PictureBank(() => `i${n++}`);
    const a = bank.idFor(4, 4, solid(4, 4, 100));
    expect(a).toEqual({ id: 'i0', fresh: true });
    expect(bank.idFor(4, 4, solid(4, 4, 100))).toEqual({ id: 'i0', fresh: false });
    // A hair different (rounding noise) is the same picture.
    expect(bank.idFor(4, 4, solid(4, 4, 102)).id).toBe('i0');
    // Visibly different, or another size, is not.
    expect(bank.idFor(4, 4, solid(4, 4, 140)).id).toBe('i1');
    expect(bank.idFor(2, 8, solid(2, 8, 100)).id).toBe('i2');
  });

  it('has three looks, balanced by default, sharp keeping PNG at twice the stage', () => {
    expect(PICTURE_LOOKS.sharp).toEqual({ scale: 2, format: 'png', quality: 1 });
    expect(PICTURE_LOOKS.balanced.format).toBe('webp');
    expect(PICTURE_LOOKS.small.scale).toBeLessThan(PICTURE_LOOKS.balanced.scale);
  });
});

describe('Lottie size breakdown', () => {
  it('splits a file into pictures, keyframes, shapes and the rest', () => {
    const data = {
      v: '5.7.4',
      assets: [
        { id: 'image_0', w: 1, h: 1, p: 'data:image/webp;base64,' + 'A'.repeat(100) },
        { id: 'image_1', w: 1, h: 1, p: 'data:image/png;base64,' + 'B'.repeat(50) },
      ],
      layers: [
        { ty: 2, nm: 'Baked', refId: 'image_0', ks: {} },
        { ty: 2, nm: 'Pixels', refId: 'image_1', ks: {} },
        { ty: 4, nm: 'Shape', ks: { p: { a: 1, k: [{ t: 0, s: [1, 2] }, { t: 1, s: [3, 4] }] } }, shapes: [{ ty: 'gr', it: [] }] },
      ],
    };
    const s = lottieSizes(data);
    expect(s.baked).toBe(123);
    expect(s.pixels).toBe(72);
    expect(s.pictures).toBe(2);
    expect(s.keyframes).toBeGreaterThan(20);
    expect(s.shapes).toBeGreaterThan(0);
    expect(s.baked + s.pixels + s.keyframes + s.shapes + s.other).toBe(s.total);
  });
});
