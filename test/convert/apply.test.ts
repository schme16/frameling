import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { applyToPixels, applyToShapes, doneWords } from '../../src/convert/apply';
import { bakesFor, clipAround, coversLayer, pictureCount } from '../../src/convert/scope';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing, uid } from '../../src/core/doc';
import type { Doc, FillShape, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { gridPixels } from '../../src/core/pixelBounds';
import { fullMask } from '../../src/select/mask';

const fill = (id: string): FillShape => ({ id, type: 'fill', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }] }], color: '#ff0000', opacity: 1 });

/** A doc with one vector layer holding keys of [start, length, shape ids]. */
function vectorDoc(keys: [number, number, string[]][]): Doc {
  const doc = newDoc({ width: 16, height: 16, length: 12 });
  const layer = doc.layers[0];
  layer.cels = [];
  for (const [start, length, ids] of keys) {
    const d: VectorDrawing = { ...newVectorDrawing(), shapes: ids.map(fill) };
    doc.drawings[d.id] = d;
    layer.cels.push({ id: uid('c'), start, length, drawingId: d.id });
  }
  return doc;
}

const pic = (w = 2, h = 2) => ({ x: 1, y: 1, width: w, height: h, pixels: new Uint8ClampedArray(w * h * 4).fill(255) });

describe('bakesFor', () => {
  const doc = vectorDoc([[0, 3, ['a']], [3, 2, ['b']], [5, 4, ['c']]]);
  const layer = doc.layers[0];
  it('this drawing is the key at the frame, held as long as it is', () => {
    expect(bakesFor(layer, 'this', 4, null).map((b) => [b.start, b.length])).toEqual([[3, 2]]);
    expect(bakesFor(layer, 'this', 11, null)).toEqual([]);
  });
  it('every frame is every key', () => {
    expect(bakesFor(layer, 'all', 0, null).map((b) => [b.start, b.length])).toEqual([[0, 3], [3, 2], [5, 4]]);
  });
  it('the clip keeps only the part of each key inside it', () => {
    expect(bakesFor(layer, 'clip', 0, { start: 2, end: 5 }).map((b) => [b.start, b.length])).toEqual([[2, 1], [3, 2], [5, 1]]);
    expect(bakesFor(layer, 'clip', 0, null)).toEqual([]);
  });
  it('an in-between key is baked frame by frame', () => {
    const t = structuredClone(layer);
    t.cels[0].tween = { easing: 'linear' } as never;
    expect(bakesFor(t, 'all', 0, null).length).toBe(3 + 1 + 1);
    expect(bakesFor(t, 'this', 1, null).map((b) => [b.start, b.length, b.frame])).toEqual([[1, 1, 1]]);
  });
  it('a drawing held on two keys is one picture', () => {
    const l = structuredClone(layer);
    l.cels[2].drawingId = l.cels[0].drawingId;
    expect(pictureCount(bakesFor(l, 'all', 0, null))).toBe(2);
  });
  it('knows when the whole layer is covered', () => {
    expect(coversLayer(layer, bakesFor(layer, 'all', 0, null))).toBe(true);
    expect(coversLayer(layer, bakesFor(layer, 'this', 0, null))).toBe(false);
  });
});

describe('clipAround', () => {
  const clips = [{ id: 'a', name: 'idle', start: 0, end: 3, loop: true }, { id: 'b', name: 'run', start: 4, end: 8, loop: true }];
  it('finds the clip a frame is in, and prefers the clicked one', () => {
    expect(clipAround(clips, 5)?.id).toBe('b');
    expect(clipAround(clips, 9)).toBeNull();
    expect(clipAround(clips, 2, 'b')?.id).toBe('a');
  });
});

describe('applyToPixels', () => {
  const run = (doc: Doc, o: Partial<Parameters<typeof applyToPixels>[1]> & { frames?: 'this' | 'all' }) =>
    produce(doc, (d) => {
      const layer = d.layers[0];
      const bakes = bakesFor(layer, o.frames ?? 'all', 0, null);
      const pictures = new Map(bakes.map((b) => [b.key, pic()]));
      (d as unknown as { out: unknown }).out = applyToPixels(d as Doc, { layerId: layer.id, bakes, where: 'beside', pixelSize: 4, pictures, ...o });
    });

  it('makes a pixel layer above the original, with a cel per key, and hides the original when all of it was turned', () => {
    const doc = vectorDoc([[0, 3, ['a']], [3, 2, ['b']]]);
    const out = run(doc, {});
    expect(out.layers.length).toBe(2);
    const [orig, made] = out.layers;
    expect(orig.visible).toBe(false);
    expect(made.kind).toBe('pixel');
    expect(made.kind === 'pixel' && made.pixelSize).toBe(4);
    expect(made.cels.map((c) => [c.start, c.length])).toEqual([[0, 3], [3, 2]]);
    expect(Object.keys(out.drawings).length).toBe(4);
    // the original's drawings are untouched
    expect((out.drawings[orig.cels[0].drawingId] as VectorDrawing).shapes.length).toBe(1);
  });

  it('keeps the original showing when only part of it was turned', () => {
    const doc = vectorDoc([[0, 3, ['a']], [3, 2, ['b']]]);
    const out = run(doc, { frames: 'this' });
    expect(out.layers[0].visible).toBe(true);
    expect(out.layers[1].cels.length).toBe(1);
  });

  it('replace takes the shapes out of the original and swaps the empty layer for the new one', () => {
    const doc = vectorDoc([[0, 3, ['a']]]);
    const before = Object.keys(doc.drawings).length;
    const out = run(doc, { where: 'replace' });
    expect(out.layers.length).toBe(1);
    expect(out.layers[0].kind).toBe('pixel');
    expect(out.layers[0].name).toBe(doc.layers[0].name);
    // the old vector drawing is gone with its layer
    expect(Object.keys(out.drawings).length).toBe(before);
    expect(Object.values(out.drawings).every((d) => d.kind === 'pixel')).toBe(true);
  });

  it('replace with a selection only takes those shapes', () => {
    const doc = vectorDoc([[0, 3, ['a', 'b']]]);
    const out = run(doc, { where: 'replace', frames: 'this', shapeIds: ['a'] });
    expect(out.layers.length).toBe(2);
    expect(out.layers[0].visible).toBe(true);
    expect((out.drawings[out.layers[0].cels[0].drawingId] as VectorDrawing).shapes.map((s) => s.id)).toEqual(['b']);
  });

  it('does nothing for a pixel layer or no frames, and leaves the original document alone (undo is one step)', () => {
    const doc = vectorDoc([[0, 3, ['a']]]);
    const snapshot = JSON.stringify(doc);
    const out = produce(doc, (d) => {
      expect(applyToPixels(d as Doc, { layerId: d.layers[0].id, bakes: [], where: 'beside', pixelSize: 1, pictures: new Map() })).toBeNull();
    });
    expect(out).toBe(doc);
    run(doc, {});
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});

describe('applyToShapes', () => {
  function pixelDoc(): Doc {
    const doc = newDoc({ width: 8, height: 8, length: 6 });
    const l = newPixelLayer('Sprite', 2);
    doc.layers = [l];
    const d: PixelDrawing = { ...newPixelDrawing(4, 4), id: 'p1' };
    d.pixels.fill(255);
    doc.drawings[d.id] = d;
    l.cels = [{ id: 'c1', start: 0, length: 4, drawingId: d.id }];
    return doc;
  }
  const run = (doc: Doc, where: 'beside' | 'replace', mask = null as ReturnType<typeof fullMask> | null) =>
    produce(doc, (d) => {
      const l = d.layers[0];
      const bakes = bakesFor(l, 'all', 0, null);
      (d as unknown as { out: unknown }).out = applyToShapes(d as Doc, { layerId: l.id, bakes, where, traced: new Map(bakes.map((b) => [b.key, [fill('n1'), fill('n2')]])), mask });
    });

  it('makes a vector layer with the shapes and hides the pixels', () => {
    const out = run(pixelDoc(), 'beside');
    expect(out.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
    expect(out.layers[0].visible).toBe(false);
    const v = out.drawings[out.layers[1].cels[0].drawingId] as VectorDrawing;
    expect(v.shapes.map((s) => s.id)).toEqual(['n1', 'n2']);
    expect(out.layers[1].cels[0].length).toBe(4);
  });

  it('replace swaps the pixel layer for the shape layer', () => {
    const out = run(pixelDoc(), 'replace');
    expect(out.layers.map((l) => l.kind)).toEqual(['vector']);
    expect(out.layers[0].name).toBe('Sprite');
    expect(out.drawings.p1).toBeUndefined();
  });

  it('replace with a selection clears only the selected pixels', () => {
    const doc = pixelDoc();
    const m = fullMask(4, 4);
    m.bits.fill(0);
    m.bits[0] = 1;
    const out = run(doc, 'replace', m);
    expect(out.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
    const g = gridPixels(out.drawings.p1 as PixelDrawing, 4, 4);
    expect(g[3]).toBe(0);
    expect(g[7]).toBe(255);
  });
});

describe('doneWords', () => {
  it('says what happened to the original, and that undo undoes it', () => {
    expect(doneWords('pixels', { layerId: 'x', shapeIds: [], original: 'hidden', drawings: 1 })).toMatch(/hidden, not gone.*Undo/);
    expect(doneWords('shapes', { layerId: 'x', shapeIds: [], original: 'kept', drawings: 1 })).toMatch(/still there/);
  });
});
