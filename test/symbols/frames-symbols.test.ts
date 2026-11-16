import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, InstanceShape, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { resetChoices, setChoice } from '../../src/core/choices';
import { resetStore, store } from '../../src/core/store';
import { drawingHasArt, framesWithArt, isInstance, isPosed, keysInSpan, makeFramesSymbol, poseAt, rootDoc } from '../../src/core/symbols';
import { loadFile, saveFile } from '../../src/io/file';
import { makeSymbolFromFrames, makeSymbolFromSelection, makeTween, pickedKeys } from '../../src/symbols/ops';
import { celRef } from '../../src/timeline/tracks';
import { pickKeys, resetTl } from '../../src/timeline/state';
import { offerTweenAt, resetTweenOffer, tweenOfferAt } from '../../src/timeline/tweenOffer';
import { symbolBounds } from '../../src/canvas/geometry';
import { docToLottie } from '../../src/export/lottie';
import { playablePackage } from '../../src/export/playable';
import { readPlayable } from '../../src/interactives/link';

/**
 * A 64x64 stage, 4 pixel art pixels (a 16x16 grid), 12 frames. A pixel layer with a walk of three drawings: a red block
 * at grid x 2, x 6 and x 10 (all two rows tall, at y 3), on frames 0-1, 2-3 and 4-5.
 */
function walk(): Doc {
  const doc = newDoc({ width: 64, height: 64, length: 12, pixel: { pixelSize: 4 } });
  [2, 6, 10].forEach((gx, i) => {
    const d = newPixelDrawing(16, 16);
    for (let y = 3; y < 5; y++) for (let x = gx; x < gx + 2; x++) d.pixels.set([255, i * 100, 0, 255], (y * 16 + x) * 4);
    doc.drawings[d.id] = { ...d, x: 0, y: 0 };
    doc.layers[0].cels.push({ id: `c${i}`, start: i * 2, length: 2, drawingId: d.id });
  });
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  return doc;
}

const instAt = (frame: number): InstanceShape => {
  const { doc } = store().get();
  const l = doc.layers[0];
  const cel = l.cels.find((c) => frame >= c.start && frame < c.start + c.length)!;
  return (doc.drawings[cel.drawingId] as VectorDrawing).shapes.find(isInstance)!;
};

beforeEach(() => {
  resetTl();
  resetTweenOffer();
});
afterEach(() => {
  resetChoices();
  resetTl();
});

describe('a pixel symbol holding a whole animation', () => {
  it('takes every drawing with its timing and loops as one symbol', () => {
    walk();
    expect(makeSymbolFromFrames()).toBeUndefined();
    const { doc } = store().get();
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0].kind).toBe('vector');
    expect(doc.layers[0].cels).toMatchObject([{ start: 0, length: 6 }]);
    const inst = instAt(0);
    expect(inst.play).toBe('loop');
    const sym = doc.symbols![inst.symbolId];
    expect(sym.length).toBe(6);
    const inner = sym.layers[0];
    expect(inner.kind).toBe('pixel');
    expect(inner.cels.map((c) => [c.start, c.length])).toEqual([[0, 2], [2, 2], [4, 2]]);
    const drawings = inner.cels.map((c) => doc.drawings[c.drawingId] as PixelDrawing);
    expect(drawings.map((d) => [d.x, d.y, d.width, d.height])).toEqual([[2, 3, 2, 2], [6, 3, 2, 2], [10, 3, 2, 2]]);
    // The middle is the middle of every frame together, so it turns around the whole walk.
    expect(sym.origin).toEqual({ x: ((2 + 12) / 2) * 4, y: 16 });
  });

  it('shows each drawing on its own frame, and loops past the end', () => {
    walk();
    makeSymbolFromFrames();
    const { doc } = store().get();
    const reds = (frame: number) => {
      const p = (poseAt(doc, doc.layers[0], frame) as VectorDrawing).shapes.find(isPosed)!;
      const d = p.posed.layers[0].drawing as PixelDrawing;
      return [d.x, d.pixels[1]];
    };
    expect(reds(0)).toEqual([2, 0]);
    expect(reds(1)).toEqual([2, 0]);
    expect(reds(2)).toEqual([6, 100]);
    expect(reds(5)).toEqual([10, 200]);
  });

  it('is one undo step and puts the pixel layer back', () => {
    const before = walk();
    makeSymbolFromFrames();
    store().undo();
    const { doc } = store().get();
    expect(doc.layers[0].kind).toBe('pixel');
    expect(doc.layers[0].cels).toHaveLength(3);
    expect(doc.symbols).toBeUndefined();
    expect(doc.layers[0].id).toBe(before.layers[0].id);
  });

  it('with keys picked takes just that stretch and leaves the rest on the pixel layer, symbol on a new layer above', () => {
    const d0 = walk();
    const lid = d0.layers[0].id;
    pickKeys([celRef(lid, 'c0'), celRef(lid, 'c1')]);
    expect(pickedKeys(lid).sort()).toEqual(['c0', 'c1']);
    makeSymbolFromSelection();
    const { doc } = store().get();
    expect(doc.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
    expect(doc.layers[0].cels.map((c) => c.id)).toEqual(['c2']);
    expect(doc.layers[1].cels).toMatchObject([{ start: 0, length: 4 }]);
    const sym = Object.values(doc.symbols!)[0];
    expect(sym.length).toBe(4);
    expect(sym.layers[0].cels).toHaveLength(2);
  });

  it('a stretch that starts later keeps its place on the timeline and starts at frame 0 inside', () => {
    const d0 = walk();
    const lid = d0.layers[0].id;
    pickKeys([celRef(lid, 'c1'), celRef(lid, 'c2')]);
    makeSymbolFromSelection();
    const { doc } = store().get();
    expect(doc.layers[1].cels).toMatchObject([{ start: 2, length: 4 }]);
    const sym = Object.values(doc.symbols!)[0];
    expect(sym.layers[0].cels.map((c) => c.start)).toEqual([0, 2]);
  });

  it('copies a drawing that something else shows too, and keeps a drawing held twice inside as one', () => {
    const d0 = walk();
    store().update('share', (x) => {
      x.layers[0].cels.push({ id: 'c3', start: 6, length: 2, drawingId: x.layers[0].cels[0].drawingId });
    });
    const first = d0.layers[0].cels[0].drawingId;
    // Only the first two keys go in; frame 6 still shows the first drawing, so the symbol has its own copy.
    pickKeys([celRef(d0.layers[0].id, 'c0'), celRef(d0.layers[0].id, 'c1')]);
    makeSymbolFromSelection();
    const { doc } = store().get();
    const sym = Object.values(doc.symbols!)[0];
    expect(sym.layers[0].cels[0].drawingId).not.toBe(first);
    expect(doc.drawings[first]).toBeDefined();
    expect(doc.layers[0].cels.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('skips empty frames (a gap in the symbol) and refuses when everything is empty', () => {
    walk();
    store().update('blank', (d) => {
      const id = d.layers[0].cels[1].drawingId;
      (d.drawings[id] as PixelDrawing).pixels.fill(0);
    });
    makeSymbolFromFrames();
    const { doc } = store().get();
    const sym = Object.values(doc.symbols!)[0];
    expect(sym.length).toBe(6);
    expect(sym.layers[0].cels.map((c) => c.start)).toEqual([0, 4]);

    walk();
    store().update('blank all', (d) => {
      for (const c of d.layers[0].cels) (d.drawings[c.drawingId] as PixelDrawing).pixels.fill(0);
    });
    expect(makeSymbolFromFrames()).toMatch(/Draw something first/);
    expect(store().get().doc.symbols).toBeUndefined();
  });

  it('refuses plainly on a locked layer and the core function ignores a layer that is not drawings', () => {
    walk();
    store().update('lock', (d) => void (d.layers[0].locked = true));
    expect(makeSymbolFromFrames()).toMatch(/locked|Unlock/i);
    const doc = newDoc({ width: 64, height: 64, length: 4 });
    expect(makeFramesSymbol(doc, 'nope')).toBeUndefined();
  });

  it('opens and saves like any symbol: the file keeps every drawing', () => {
    walk();
    makeSymbolFromFrames();
    const back = loadFile(saveFile(rootDoc(store().get().doc))).doc;
    const inst = (back.drawings[back.layers[0].cels[0].drawingId] as VectorDrawing).shapes.find(isInstance)!;
    const sym = back.symbols![inst.symbolId];
    expect(sym.length).toBe(6);
    expect(sym.layers[0].cels).toHaveLength(3);
    for (const c of sym.layers[0].cels) expect((back.drawings[c.drawingId] as PixelDrawing).pixels.byteLength).toBeGreaterThan(0);
    expect(symbolBounds(back, inst.symbolId)).toEqual({ x: 8, y: 12, w: 40, h: 8 });
  });

  it('survives the Interactives package: the drawing inside reopens with every frame of the symbol', () => {
    walk();
    makeSymbolFromFrames();
    const doc = rootDoc(store().get().doc);
    const frames = Array.from({ length: doc.length }, () => ({ width: 4, height: 4, pixels: new Uint8ClampedArray(64).fill(255) }));
    const pkg = playablePackage({ doc, frames, range: { start: 0, end: doc.length - 1 }, scale: 1, pixelArt: true, background: null, maxSide: 4096, source: saveFile(doc) });
    const source = readPlayable(pkg.bytes).source!;
    const back = loadFile(source).doc;
    const inst = (back.drawings[back.layers[0].cels[0].drawingId] as VectorDrawing).shapes.find(isInstance)!;
    expect(back.symbols![inst.symbolId].layers[0].cels).toHaveLength(3);
  });

  it('Lottie plays every drawing: the symbol becomes a precomp with one picture layer per drawing, on its own frames', () => {
    walk();
    makeSymbolFromFrames();
    const lot = docToLottie(rootDoc(store().get().doc)) as { assets: { id: string; layers?: { ty: number; ip: number; op: number }[] }[] };
    const comp = lot.assets.find((a) => a.layers?.some((l) => l.ty === 2));
    expect(comp).toBeDefined();
    const pics = comp!.layers!.filter((l) => l.ty === 2);
    expect(pics.map((l) => [l.ip, l.op]).sort((a, b) => a[0] - b[0])).toEqual([[0, 2], [2, 4], [4, 6]]);
    // Three different pictures, not one drawing repeated.
    expect(new Set(lot.assets.filter((a) => !a.layers).map((a) => a.id)).size).toBe(3);
  });

  it('keeps the helpers honest', () => {
    const d = walk();
    expect(keysInSpan(d.layers[0]).map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
    // Picking the first and last takes the one in between too, so nothing is left lying under the symbol.
    expect(keysInSpan(d.layers[0], ['c0', 'c2']).map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
    expect(keysInSpan(d.layers[0], ['c1']).map((c) => c.id)).toEqual(['c1']);
    expect(framesWithArt(d, d.layers[0])).toBe(3);
    expect(drawingHasArt(newPixelDrawing(4, 4))).toBe(false);
  });
});

describe('a vector layer with several drawings', () => {
  function vec(): Doc {
    const doc = newDoc({ width: 64, height: 64, length: 12 });
    [0, 1, 2].forEach((i) => {
      const id = `v${i}`;
      doc.drawings[id] = { id, kind: 'vector', shapes: [{ id: `r${i}`, type: 'path', paths: [{ closed: true, points: [{ x: 10 + i * 10, y: 10 }, { x: 20 + i * 10, y: 10 }, { x: 20 + i * 10, y: 20 }] }], fill: '#f00', stroke: null, opacity: 1 }] };
      doc.layers[0].cels.push({ id: `k${i}`, start: i * 2, length: 2, drawingId: id });
    });
    // A later key outside the stretch we pick.
    doc.drawings.vz = { id: 'vz', kind: 'vector', shapes: [] };
    doc.layers[0].cels.push({ id: 'kz', start: 8, length: 2, drawingId: 'vz' });
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, frame: 0, selection: [] });
    return doc;
  }

  it('makes one looping symbol of the keys and keeps the layer and the keys outside', () => {
    vec();
    pickKeys([celRef(store().get().doc.layers[0].id, 'k0'), celRef(store().get().doc.layers[0].id, 'k2')]);
    makeSymbolFromSelection();
    const { doc } = store().get();
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0].kind).toBe('vector');
    expect(doc.layers[0].cels.map((c) => [c.start, c.length])).toEqual([[0, 6], [8, 2]]);
    const inst = (doc.drawings[doc.layers[0].cels[0].drawingId] as VectorDrawing).shapes.find(isInstance)!;
    const sym = doc.symbols![inst.symbolId];
    expect(sym.length).toBe(6);
    expect(sym.layers[0].kind).toBe('vector');
    expect(sym.layers[0].cels.map((c) => c.start)).toEqual([0, 2, 4]);
    // The middle of every frame's shapes together: x 10 to 40, y 10 to 20.
    expect(sym.origin).toEqual({ x: 25, y: 15 });
  });

  it('a selection on the canvas still means just those shapes, with no question', () => {
    vec();
    store().setUi({ selection: ['r0'] });
    makeSymbolFromSelection();
    const { doc } = store().get();
    const sym = Object.values(doc.symbols!)[0];
    expect(sym.length).toBe(1);
    expect(doc.layers[0].cels).toHaveLength(4);
  });

  it('refuses a bones layer', () => {
    vec();
    store().update('rig', (d) => void ((d.layers[0] as { rig?: unknown }).rig = { bones: [] }));
    expect(makeSymbolFromSelection()).toBeUndefined();
    expect(makeSymbolFromFrames()).toMatch(/bones/i);
    expect(store().get().doc.symbols).toBeUndefined();
  });
});

describe('F8 on a layer with several drawings', () => {
  it('uses the remembered answer: the whole animation or just this drawing', () => {
    walk();
    setChoice('symbols.frames', 'all');
    makeSymbolFromSelection();
    expect(Object.values(store().get().doc.symbols!)[0].length).toBe(6);
    walk();
    setChoice('symbols.frames', 'one');
    makeSymbolFromSelection();
    const { doc } = store().get();
    expect(Object.values(doc.symbols!)[0].length).toBe(1);
    expect(doc.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
  });

  it('does not ask when the layer has only one drawing', () => {
    walk();
    store().update('one', (d) => void (d.layers[0].cels = d.layers[0].cels.slice(0, 1)));
    makeSymbolFromSelection();
    expect(Object.values(store().get().doc.symbols!)[0].length).toBe(1);
  });
});

describe('the in-between offer on pixel layers', () => {
  it('offers between two pixel keys, not on a key, not with an empty one', () => {
    const doc = walk();
    expect(tweenOfferAt(doc, doc.layers[0], 1)).toMatchObject({ start: 0, end: 1, morph: false });
    expect(tweenOfferAt(doc, doc.layers[0], 0)).toBeNull();
    expect(tweenOfferAt(doc, doc.layers[0], 5)).toBeNull();
    (doc.drawings[doc.layers[0].cels[1].drawingId] as PixelDrawing).pixels.fill(0);
    expect(tweenOfferAt(doc, doc.layers[0], 1)).toBeNull();
  });

  it('is offered by a click and accepting moves the first drawing into the next, both as symbols on one layer', () => {
    walk();
    const s = store();
    expect(offerTweenAt(s.get().doc, s.get().doc.layers[0], 1)).not.toBeNull();
    store().setUi({ frame: 0 });
    expect(makeTween(undefined, 0)).toBeUndefined();
    const { doc } = s.get();
    const vec = doc.layers.filter((l) => l.kind === 'vector');
    expect(vec).toHaveLength(1);
    expect(doc.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
    // Frame 0-1 holds the first sprite with in-betweens to the sprite that starts on frame 2.
    expect(vec[0].cels.map((c) => c.start)).toEqual([0, 2]);
    expect(vec[0].cels[0].tween).toBeDefined();
    expect(Object.keys(doc.symbols!)).toHaveLength(2);
    // The pixel layer keeps the third drawing.
    expect(doc.layers[0].cels.map((c) => c.id)).toEqual(['c2']);
  });
});
