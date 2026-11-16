import { describe, expect, it } from 'vitest';
import type { Doc, Layer, VectorDrawing } from '../../src/core/format';
import { addPixelLayer, addVectorLayer } from '../../src/timeline/edit-core';
import { newDoc, newPixelDrawing, newVectorDrawing, pixelGrid, uid } from '../../src/core/doc';
import { clipFromCels, clipFromFrame, clipFromRefs, landsOnKeys, pasteClip, sourceLayers, targetLayers, whyNotKind, type Convert } from '../../src/timeline/frameClip';
import { celRef } from '../../src/timeline/tracks';
import { keyConverter } from '../../src/clipboard/frames';

/** Puts a drawing with one shape (a marker, by its colour) on a layer. */
function key(doc: Doc, layer: Layer, start: number, length: number, mark = '#ff0000'): string {
  const d: VectorDrawing = newVectorDrawing();
  d.shapes.push({ id: uid('s'), type: 'stroke', color: mark, opacity: 1, brush: { size: 4 } as never, points: [{ x: 1, y: 1, p: 1 }] } as never);
  doc.drawings[d.id] = d;
  const id = uid('c');
  layer.cels.push({ id, start, length, drawingId: d.id });
  layer.cels.sort((a, b) => a.start - b.start);
  return id;
}
const layerOf = (doc: Doc, id: string): Layer => doc.layers.find((l) => l.id === id)!;
const shape = (l: Layer): [number, number][] => l.cels.map((c) => [c.start, c.length]);
const colourOf = (doc: Doc, l: Layer, i: number): string => {
  const d = doc.drawings[l.cels[i].drawingId];
  return d.kind === 'vector' ? (d.shapes[0] as { color: string }).color : '?';
};

function walk(): { doc: Doc; a: Layer } {
  const doc = newDoc({ length: 24 });
  const a = doc.layers[0];
  key(doc, a, 0, 2, '#111111');
  key(doc, a, 2, 1, '#222222');
  key(doc, a, 3, 3, '#333333');
  return { doc, a };
}

describe('copying keys', () => {
  it('keeps each drawing, its hold and its place in time', () => {
    const { doc, a } = walk();
    const clip = clipFromCels(doc, a.cels.slice(1).map((c) => ({ layerId: a.id, celId: c.id })))!;
    expect(clip.first).toBe(2);
    expect(clip.span).toBe(4);
    expect(clip.items.map((i) => [i.offset, i.length])).toEqual([[0, 1], [1, 3]]);
    expect(clip.drawings).toHaveLength(2);
  });
  it('copies the drawing at a frame, the whole hold', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 4)!;
    expect([clip.first, clip.span]).toEqual([3, 3]);
    expect(clipFromFrame(doc, a.id, 10)).toBeNull();
  });
  it('takes only drawing keys from a mixed pick and counts the rest', () => {
    const { doc, a } = walk();
    const r = clipFromRefs(doc, [celRef(a.id, a.cels[0].id), `e:${a.id}:fx1:3`, `p:${a.id}:x:${a.cels[1].id}`]);
    expect(r.clip?.items).toHaveLength(1);
    expect(r.skipped).toBe(2);
  });
  it('is a copy: changing the original afterwards does not change it', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 0)!;
    (doc.drawings[a.cels[0].drawingId] as VectorDrawing).shapes.length = 0;
    expect((clip.drawings[0] as VectorDrawing).shapes).toHaveLength(1);
  });
  it('drops a tween whose far end was not copied, and keeps one whose far end was', () => {
    const { doc, a } = walk();
    a.cels[0].tween = { ease: 'linear' } as never;
    a.cels[1].tween = { ease: 'linear' } as never;
    const both = clipFromCels(doc, [a.cels[0], a.cels[1]].map((c) => ({ layerId: a.id, celId: c.id })))!;
    expect(both.items.map((i) => !!i.tween)).toEqual([true, false]);
  });
});

describe('pasting keys later in time', () => {
  it('lands the first key on the frame, with the same holds', () => {
    const { doc, a } = walk();
    const clip = clipFromCels(doc, a.cels.map((c) => ({ layerId: a.id, celId: c.id })))!;
    const r = pasteClip(doc, clip, [a], 10, 'push');
    expect(shape(a)).toEqual([[0, 2], [2, 1], [3, 3], [10, 2], [12, 1], [13, 3]]);
    expect(r.made).toHaveLength(3);
  });
  it('makes new drawings, so changing one never changes the other', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 0)!;
    pasteClip(doc, clip, [a], 8, 'push');
    const first = a.cels[0].drawingId;
    const pasted = a.cels[a.cels.length - 1].drawingId;
    expect(pasted).not.toBe(first);
    expect(colourOf(doc, a, a.cels.length - 1)).toBe('#111111');
    (doc.drawings[pasted] as VectorDrawing).shapes.length = 0;
    expect((doc.drawings[first] as VectorDrawing).shapes).toHaveLength(1);
  });
  it('can be pasted again and again from the same copy', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 0)!;
    pasteClip(doc, clip, [a], 8, 'push');
    pasteClip(doc, clip, [a], 12, 'push');
    expect(shape(a).slice(-2)).toEqual([[8, 2], [12, 2]]);
  });
  it('keeps a drawing shown by two keys as one drawing in the paste, so a split hold stays joined', () => {
    const { doc, a } = walk();
    const shared = a.cels[0].drawingId;
    a.cels[2].drawingId = shared;
    const clip = clipFromCels(doc, [a.cels[0], a.cels[2]].map((c) => ({ layerId: a.id, celId: c.id })))!;
    expect(clip.drawings).toHaveLength(1);
    pasteClip(doc, clip, [a], 12, 'push');
    const tail = a.cels.slice(-2);
    expect(tail[0].drawingId).toBe(tail[1].drawingId);
    expect(tail[0].drawingId).not.toBe(shared);
  });
  it('makes the animation longer when it runs past the end', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 3)!;
    pasteClip(doc, clip, [a], 30, 'push');
    expect(doc.length).toBeGreaterThanOrEqual(33);
  });
  it('removes nothing the paste did not use', () => {
    const { doc, a } = walk();
    const before = Object.keys(doc.drawings).length;
    pasteClip(doc, clipFromFrame(doc, a.id, 0)!, [a], 12, 'push');
    expect(Object.keys(doc.drawings).length).toBe(before + 1);
  });
});

describe('pasting on top of keys that are there', () => {
  it('says when it will', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 0)!;
    expect(landsOnKeys(clip, [a], 4)).toBe(true);
    expect(landsOnKeys(clip, [a], 8)).toBe(false);
  });
  it('makes room: what is in the way moves later and nothing is lost', () => {
    const { doc, a } = walk();
    const clip = clipFromCels(doc, [a.cels[0]].map((c) => ({ layerId: a.id, celId: c.id })))!;
    pasteClip(doc, clip, [a], 2, 'push');
    expect(shape(a)).toEqual([[0, 2], [2, 2], [4, 1], [5, 3]]);
    expect(colourOf(doc, a, 1)).toBe('#111111');
    expect(a.cels).toHaveLength(4);
  });
  it('covers: the animation keeps its length and what is under goes', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 0)!;
    pasteClip(doc, clip, [a], 2, 'trim');
    expect(shape(a)).toEqual([[0, 2], [2, 2], [4, 2]]);
    expect(colourOf(doc, a, 1)).toBe('#111111');
  });
  it('cuts short a hold that runs into the paste', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 2)!;
    pasteClip(doc, clip, [a], 4, 'push');
    // the 3-frame hold at 3 is cut to one frame where the paste starts
    expect(shape(a)[2]).toEqual([3, 1]);
    expect(shape(a)[3]).toEqual([4, 1]);
  });
  it('keeps every layer tidy: sorted, never overlapping', () => {
    const { doc, a } = walk();
    const clip = clipFromCels(doc, a.cels.map((c) => ({ layerId: a.id, celId: c.id })))!;
    for (const at of [1, 2, 4, 5]) for (const how of ['push', 'trim'] as const) {
      const copy = structuredClone(doc);
      const la = copy.layers[0];
      pasteClip(copy, structuredClone(clip), [la], at, how);
      let end = 0;
      for (const c of la.cels) {
        expect(c.start).toBeGreaterThanOrEqual(end);
        expect(c.length).toBeGreaterThanOrEqual(1);
        end = c.start + c.length;
      }
    }
  });
});

describe('across layers', () => {
  it('lands several layers on this one and the ones below it, in the same order', () => {
    const doc = newDoc({ length: 24 });
    const bottom = doc.layers[0];
    const mid = layerOf(doc, addVectorLayer(doc, bottom.id, 'Mid'));
    const top = layerOf(doc, addVectorLayer(doc, mid.id, 'Top'));
    key(doc, top, 0, 2, '#aa0000');
    key(doc, mid, 1, 2, '#00aa00');
    const clip = clipFromCels(doc, [top, mid].map((l) => ({ layerId: l.id, celId: l.cels[0].id })))!;
    expect(clip.layers.map((l) => l.name)).toEqual(['Top', 'Mid']);
    const spare = layerOf(doc, addVectorLayer(doc, top.id, 'Spare'));
    const t = targetLayers(doc, clip, spare.id);
    expect(t.ok && t.layers.map((l) => l.name)).toEqual(['Spare', 'Top']);
    if (t.ok) pasteClip(doc, clip, t.layers, 10, 'push');
    expect(shape(spare)).toEqual([[10, 2]]);
    expect(shape(top)).toEqual([[0, 2], [11, 2]]);
  });
  it('refuses plainly when there are not enough layers below', () => {
    const doc = newDoc({ length: 12 });
    const a = doc.layers[0];
    const b = layerOf(doc, addVectorLayer(doc, a.id, 'B'));
    key(doc, a, 0, 1);
    key(doc, b, 0, 1);
    const clip = clipFromCels(doc, [a, b].map((l) => ({ layerId: l.id, celId: l.cels[0].id })))!;
    const t = targetLayers(doc, clip, a.id);
    expect(t.ok).toBe(false);
    expect(!t.ok && t.why).toContain('2 layers');
  });
  it('pastes in place on the layers they came from, and says when one is gone', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 3)!;
    const s = sourceLayers(doc, clip);
    expect(s.ok).toBe(true);
    if (s.ok) pasteClip(doc, clip, s.layers, clip.first, 'trim');
    expect(shape(a)).toEqual([[0, 2], [2, 1], [3, 3]]);
    doc.layers = doc.layers.filter((l) => l.id !== a.id);
    expect(sourceLayers(doc, clip).ok).toBe(false);
  });
});

describe('across kinds of layer', () => {
  it('only lets drawn layers swap, with a plain reason for the rest', () => {
    const doc = newDoc({ length: 12 });
    const px = layerOf(doc, addPixelLayer(doc, null, 'Px', 1));
    const v = doc.layers[0];
    expect(whyNotKind({ id: 'x', name: 'x', kind: 'vector' }, px)).toBe('');
    expect(whyNotKind({ id: 'x', name: 'x', kind: 'camera' }, v)).toContain('camera layer');
    expect(whyNotKind({ id: 'x', name: 'x', kind: 'tilemap' }, v)).toContain('tile layer');
  });
  it('turns a pixel drawing into a picture on a vector layer, and tells how many', () => {
    const doc = newDoc({ length: 12, width: 64, height: 64 });
    const px = layerOf(doc, addPixelLayer(doc, null, 'Px', 2));
    const g = pixelGrid(doc, px as never);
    const d = newPixelDrawing(g.width, g.height);
    for (let i = 0; i < 20; i++) d.pixels.set([200, 30, 30, 255], (g.width * 5 + 5 + i) * 4);
    doc.drawings[d.id] = d;
    px.cels.push({ id: 'c1', start: 0, length: 3, drawingId: d.id });
    const clip = clipFromFrame(doc, px.id, 0)!;
    const v = doc.layers[0];
    const r = pasteClip(doc, clip, [v], 4, 'push', keyConverter(doc));
    expect(r.converted).toEqual([{ from: 'pixel', to: 'vector', count: 1 }]);
    const made = doc.drawings[v.cels[v.cels.length - 1].drawingId];
    expect(made.kind).toBe('vector');
    const inst = (made as VectorDrawing).shapes[0];
    expect(inst.type).toBe('instance');
    const sym = doc.symbols![(inst as { symbolId: string }).symbolId];
    expect(sym.layers[0].kind).toBe('pixel');
    // the picture's own drawing is in the document, so nothing dangles
    expect(doc.drawings[sym.layers[0].cels[0].drawingId]).toBeTruthy();
  });
  it('leaves a key out and counts it when it cannot be converted', () => {
    const { doc, a } = walk();
    const clip = clipFromFrame(doc, a.id, 0)!;
    const px = layerOf(doc, addPixelLayer(doc, null, 'Px', 1));
    const none: Convert = () => null;
    const r = pasteClip(doc, clip, [px], 0, 'push', none);
    expect(r.left).toBe(1);
    expect(r.made).toHaveLength(0);
    expect(px.cels).toHaveLength(0);
  });
  it('fits pixels to a layer with another pixel size, kept at the top left', () => {
    const doc = newDoc({ length: 12, width: 64, height: 64 });
    const small = layerOf(doc, addPixelLayer(doc, null, 'Small', 4));
    const big = layerOf(doc, addPixelLayer(doc, null, 'Big', 2));
    const gs = pixelGrid(doc, small as never);
    const d = newPixelDrawing(gs.width, gs.height);
    d.pixels.set([1, 2, 3, 255], 0);
    doc.drawings[d.id] = d;
    small.cels.push({ id: 'c1', start: 0, length: 1, drawingId: d.id });
    const clip = clipFromFrame(doc, small.id, 0)!;
    pasteClip(doc, clip, [big], 0, 'push');
    const out = doc.drawings[big.cels[0].drawingId];
    expect(out.kind).toBe('pixel');
    if (out.kind === 'pixel') expect([...out.pixels.slice(0, 4)]).toEqual([1, 2, 3, 255]);
  });
});
