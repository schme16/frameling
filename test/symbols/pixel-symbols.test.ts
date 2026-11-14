import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing } from '../../src/core/doc';
import type { Doc, InstanceShape, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { isInstance, isPosed, makePixelSymbol, pixelKeyAt, poseAt, rootDoc } from '../../src/core/symbols';
import { symbolBounds, instanceBounds } from '../../src/canvas/geometry';
import { loadFile, saveFile } from '../../src/io/file';
import { makeSymbolFromSelection, makeTween, placeInstance } from '../../src/symbols/ops';
import { makeMotion } from '../../src/symbols/motion-ops';
import { motionProblem } from '../../src/symbols/motions';

/** A 64x64 stage with 4 pixel art pixels (a 16x16 grid); a 3x2 block of red at grid (2, 3). */
function setup(extra = false): Doc {
  const doc = newDoc({ width: 64, height: 64, length: 12, pixel: { pixelSize: 4 } });
  const d = newPixelDrawing(16, 16);
  for (let y = 3; y < 5; y++) for (let x = 2; x < 5; x++) d.pixels.set([255, 0, 0, 255], (y * 16 + x) * 4);
  doc.drawings[d.id] = { ...d, x: 0, y: 0 };
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 6, drawingId: d.id });
  if (extra) {
    const e = newPixelDrawing(16, 16);
    e.pixels.set([0, 0, 255, 255], 0);
    doc.drawings[e.id] = e;
    doc.layers[0].cels.push({ id: 'c2', start: 6, length: 3, drawingId: e.id });
  }
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  return doc;
}

const instOn = (layerIndex: number, frame = 0): InstanceShape => {
  const { doc } = store().get();
  const l = doc.layers[layerIndex];
  const cel = l.cels.find((c) => frame >= c.start && frame < c.start + c.length)!;
  return (doc.drawings[cel.drawingId] as VectorDrawing).shapes.find(isInstance)!;
};

describe('pixel layers into symbols', () => {
  let doc0: Doc;
  beforeEach(() => void (doc0 = setup()));

  it('turns a layer with one drawing into a vector layer holding the instance, same place and look', () => {
    const layerId = doc0.layers[0].id;
    expect(makeSymbolFromSelection()).toBeUndefined();
    const { doc, ui } = store().get();
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0].id).toBe(layerId);
    expect(doc.layers[0].kind).toBe('vector');
    expect(doc.layers[0].name).toBe('Layer 1');
    expect(doc.layers[0].cels).toMatchObject([{ start: 0, length: 6 }]);
    const inst = instOn(0);
    expect(ui.selection).toEqual([inst.id]);
    // The symbol keeps a pixel layer at the same pixel size, with the same pixels.
    const sym = doc.symbols![inst.symbolId];
    expect(sym.layers[0].kind).toBe('pixel');
    expect(sym.layers[0].kind === 'pixel' && sym.layers[0].pixelSize).toBe(4);
    const inner = doc.drawings[sym.layers[0].cels[0].drawingId] as PixelDrawing;
    expect(inner.kind).toBe('pixel');
    expect([inner.x, inner.y, inner.width, inner.height]).toEqual([2, 3, 3, 2]);
    expect(inner.pixels[0]).toBe(255);
    // Undo puts the pixel layer back as it was.
    store().undo();
    expect(store().get().doc.layers[0].kind).toBe('pixel');
    expect(store().get().doc.symbols).toBeUndefined();
  });

  it('keeps nothing on screen moving: the instance at rest draws the pixels where they were', () => {
    makeSymbolFromSelection();
    const { doc } = store().get();
    const inst = instOn(0);
    const posed = poseAt(doc, doc.layers[0], 0) as VectorDrawing;
    const p = posed.shapes.find(isPosed)!;
    // Its middle is the art's own middle, not the stage's.
    expect(doc.symbols![inst.symbolId].origin).toEqual({ x: 14, y: 16 });
    expect(p.posed.matrix.map((n) => Math.round(n * 1000) / 1000)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(p.posed.layers).toHaveLength(1);
    expect(p.posed.layers[0].pixelSize).toBe(4);
    expect(p.posed.layers[0].drawing.kind).toBe('pixel');
    // Its box covers the pixel block (so it can be clicked and selected on the stage).
    expect(symbolBounds(doc, inst.symbolId)).toEqual({ x: 8, y: 12, w: 12, h: 8 });
    expect(instanceBounds(inst, doc).w).toBe(12);
  });

  it('leaves other drawings on the pixel layer and puts the symbol on a new layer above', () => {
    setup(true);
    makeSymbolFromSelection();
    const { doc, ui } = store().get();
    expect(doc.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
    expect(doc.layers[1].name).toBe('Layer 1 symbol');
    expect(doc.layers[0].cels.map((c) => c.start)).toEqual([6]);
    expect(doc.layers[1].cels).toMatchObject([{ start: 0, length: 6 }]);
    expect(ui.activeLayerId).toBe(doc.layers[1].id);
  });

  it('gives the symbol its own copy when another frame shows the same drawing', () => {
    const d = store().get().doc;
    store().update('share', (x) => {
      x.layers[0].cels.push({ id: 'c9', start: 8, length: 2, drawingId: x.layers[0].cels[0].drawingId });
    });
    makeSymbolFromSelection();
    const { doc } = store().get();
    const sym = Object.values(doc.symbols!)[0];
    expect(sym.layers[0].cels[0].drawingId).not.toBe(d.layers[0].cels[0].drawingId);
    expect(doc.drawings[sym.layers[0].cels[0].drawingId].kind).toBe('pixel');
    // The other frame still shows its pixels on the pixel layer.
    expect(doc.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
    expect(doc.drawings[d.layers[0].cels[0].drawingId]).toBeDefined();
  });

  it('refuses plainly with nothing drawn or a locked layer', () => {
    store().update('lock', (x) => void (x.layers[0].locked = true));
    expect(makeSymbolFromSelection()).toMatch(/locked|Unlock/i);
    store().update('unlock', (x) => void (x.layers[0].locked = false));
    store().setUi({ frame: 10 });
    expect(makeSymbolFromSelection()).toMatch(/Draw something first/);
    expect(pixelKeyAt(store().get().doc, store().get().doc.layers[0].id, 10)).toBe(false);
  });

  it('does nothing for a vector layer or a missing one', () => {
    const d = structuredClone(doc0) as Doc;
    expect(makePixelSymbol(d, 'nope', 0)).toBeUndefined();
    const id = d.layers[0].id;
    d.layers[0] = { ...d.layers[0], kind: 'vector' } as never;
    expect(makePixelSymbol(d, id, 0)).toBeUndefined();
  });

  it('places a symbol from the Library while a pixel layer is open, on a new vector layer above', () => {
    makeSymbolFromSelection();
    const symbolId = instOn(0).symbolId;
    // A pixel layer to place onto.
    store().update('add', (d) => {
      d.layers.push({ id: 'lp', name: 'Pixels', kind: 'pixel', visible: true, locked: false, opacity: 1, pixelSize: 4, cels: [] });
    });
    store().setUi({ activeLayerId: 'lp', frame: 2 });
    expect(placeInstance(symbolId)).toBeUndefined();
    const { doc, ui } = store().get();
    expect(doc.layers.map((l) => l.kind)).toEqual(['vector', 'pixel', 'vector']);
    const cel = doc.layers[2].cels[0];
    expect(cel.start).toBe(2);
    expect(cel.length).toBe(10);
    expect(ui.activeLayerId).toBe(doc.layers[2].id);
  });

  it('makes in-betweens on a pixel key: it becomes a symbol, an end key appears, the instance glides', () => {
    expect(makeTween()).toBeUndefined();
    const { doc } = store().get();
    const layer = doc.layers[0];
    expect(layer.kind).toBe('vector');
    expect(layer.cels.length).toBe(2);
    expect(layer.cels[0].tween).toBeTruthy();
    const end = layer.cels[1];
    const endInst = (doc.drawings[end.drawingId] as VectorDrawing).shapes.find(isInstance)!;
    // Move the end key and check the middle frame is halfway.
    store().update('move', (d) => {
      const e = (d.drawings[end.drawingId] as VectorDrawing).shapes.find(isInstance)!;
      e.transform = { ...e.transform, x: e.transform.x + 40 };
    });
    const mid = Math.round((end.start) / 2);
    const now = store().get().doc;
    const posed = poseAt(now, now.layers[0], mid) as VectorDrawing;
    const p = posed.shapes.find(isPosed)!;
    expect(p.posed.matrix[4]).toBeGreaterThan(0);
    expect(p.posed.matrix[4]).toBeLessThan(40);
    expect(endInst.symbolId).toBe(instOn(0).symbolId);
  });

  it('refuses a morph on pixels, in words', () => {
    store().setUi({ activeLayerId: store().get().doc.layers[0].id });
    expect(makeTween(undefined, undefined, 'shape')).toMatch(/pixels/);
    expect(store().get().doc.layers[0].kind).toBe('pixel');
  });

  it('adds a one-click motion to pixel art', () => {
    const where = { layerId: doc0.layers[0].id, frame: 0, selection: [] };
    expect(motionProblem(store().get().doc, where)).toBeNull();
    makeMotion('bounce');
    const { doc, ui } = store().get();
    expect(doc.layers[0].kind).toBe('vector');
    expect(doc.layers[0].cels.length).toBeGreaterThan(2);
    expect(doc.layers[0].cels[0].tween).toBeTruthy();
    expect(ui.activeLayerId).toBe(doc.layers[0].id);
    store().undo();
    expect(store().get().doc.layers[0].kind).toBe('pixel');
  });

  it('says plainly why a motion cannot go on an empty pixel frame', () => {
    const where = { layerId: doc0.layers[0].id, frame: 10, selection: [] };
    expect(motionProblem(store().get().doc, where)).toMatch(/Draw something first/);
  });

  it('saves and opens: the symbol still holds its pixels', () => {
    makeSymbolFromSelection();
    const before = store().get().doc;
    const back = loadFile(saveFile(rootDoc(before))).doc;
    const inst = (back.drawings[back.layers[0].cels[0].drawingId] as VectorDrawing).shapes.find(isInstance)!;
    const sym = back.symbols![inst.symbolId];
    expect(sym.layers[0].kind).toBe('pixel');
    const d = back.drawings[sym.layers[0].cels[0].drawingId] as PixelDrawing;
    expect(d.kind).toBe('pixel');
    expect(d.width).toBe(3);
    expect(d.height).toBe(2);
    expect(d.pixels[0]).toBe(255);
    // Opened pixels sit where they did (the trimmed block keeps its place on the grid).
    expect(symbolBounds(back, inst.symbolId)).toEqual({ x: 8, y: 12, w: 12, h: 8 });
  });
});
