// A pair is a vector layer and a pixel layer made by drawing. These check that the two halves keep the same keys through
// every timeline operation, that the pair is one row in a layer list, and that nothing about it changes an old document.
import { describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import type { Doc, Layer, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { newDoc, newPixelLayer, newVectorDrawing, uid } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { halvesOf, inStep, linkPair, pairOf, sanitisePairs, siblingName, unlinkPair } from '../../src/core/pairs';
import { makeHalf, settlePairs, whyNoHalf } from '../../src/timeline/pairs';
import * as ops from '../../src/timeline/ops';
import * as core from '../../src/timeline/edit-core';
import { moveNode } from '../../src/effects/edit';
import { clipFromCels, pasteClip, targetLayers } from '../../src/timeline/frameClip';
import { loadFile, saveFile } from '../../src/io/file';
import { addCel } from './helpers';

/** A shape in a vector drawing, so a copy can be told from a blank one. */
function mark(doc: Doc, drawingId: string, colour = '#ff0000'): void {
  (doc.drawings[drawingId] as VectorDrawing).shapes.push({ id: uid('s'), type: 'stroke', color: colour, opacity: 1, brush: { size: 4 } as never, points: [{ x: 1, y: 1, p: 1 }] } as never);
}

const byId = (doc: Doc, id: string): Layer => doc.layers.find((l) => l.id === id)!;
const shape = (l: Layer): [number, number][] => l.cels.map((c) => [c.start, c.length]);

/** A vector layer "Ink" with keys at 0..4 and 4..8 (each with a mark), given a pixel half, in the store. */
function pairInStore(cels: [number, number][] = [[0, 4], [4, 4]]): { v: string; p: string } {
  const doc = newDoc({ length: 24 });
  const ink = doc.layers[0];
  ink.name = 'Ink';
  for (const [s, l] of cels) mark(doc, doc.drawings[addCel(doc, ink, s, l) && ink.cels.find((c) => c.start === s)!.drawingId].id);
  resetStore(doc);
  let p = '';
  store().update('Make half', (d) => void (p = makeHalf(d, ink.id, 'pixel', 8)!));
  return { v: ink.id, p };
}
const now = (): Doc => store().get().doc;
const V = (ids: { v: string }) => byId(now(), ids.v);
const P = (ids: { p: string }) => byId(now(), ids.p);

describe('what a pair is', () => {
  it('is two layers that name each other, one vector and one pixel', () => {
    const ids = pairInStore();
    expect(V(ids).pair).toBe(ids.p);
    expect(P(ids).pair).toBe(ids.v);
    expect(pairOf(now().layers, V(ids))?.id).toBe(ids.p);
    expect(halvesOf(now().layers, P(ids))).toEqual({ vector: V(ids), pixel: P(ids) });
  });

  it('is no pair when the other layer does not name it back, or when both are one kind', () => {
    const doc = newDoc();
    const a = doc.layers[0];
    const b = newPixelLayer('B', 8);
    const c = newPixelLayer('C', 8);
    doc.layers.push(b, c);
    a.pair = b.id;
    expect(pairOf(doc.layers, a)).toBeUndefined();
    linkPair(a, b);
    expect(pairOf(doc.layers, a)?.id).toBe(b.id);
    b.pair = c.id;
    c.pair = b.id;
    expect(pairOf(doc.layers, b)).toBeUndefined();
    expect(linkPair(b, c)).toBe(false);
  });

  it('is named after the layer, and never stacks the same word twice', () => {
    expect(siblingName('Ink', 'pixel')).toBe('Ink (pixels)');
    expect(siblingName('Ink (pixels)', 'vector')).toBe('Ink (vectors)');
    expect(siblingName('  ', 'pixel')).toBe('Layer (pixels)');
  });

  it('is made above the layer, in its folder, with the same keys and blank drawings', () => {
    const doc = newDoc({ length: 24 });
    const ink = doc.layers[0];
    doc.folders = { f1: { id: 'f1', name: 'Folder', visible: true, opacity: 1 } };
    ink.folder = 'f1';
    ink.opacity = 0.5;
    addCel(doc, ink, 0, 3);
    addCel(doc, ink, 3, 5);
    ink.reference = true;
    ink.cels[1].autoHold = true;
    ink.cels[1].offset = { x: 4, y: 2 };
    resetStore(doc);
    let id = '';
    store().update('Make', (d) => void (id = makeHalf(d, ink.id, 'pixel', 4)!));
    const half = byId(now(), id);
    expect(now().layers.map((l) => l.id)).toEqual([ink.id, id]);
    expect(half.kind).toBe('pixel');
    expect((half as { pixelSize: number }).pixelSize).toBe(4);
    expect(half.folder).toBe('f1');
    expect(half.reference).toBe(true);
    expect(half.opacity).toBe(0.5);
    expect(shape(half)).toEqual([[0, 3], [3, 5]]);
    expect(half.cels[1].autoHold).toBe(true);
    expect(half.cels[1].offset).toEqual({ x: 4, y: 2 });
    for (const c of half.cels) expect((now().drawings[c.drawingId] as PixelDrawing).width).toBe(0);
    expect(inStep(byId(now(), ink.id), half)).toBe(true);
  });

  it('is refused for a bones layer, a tile layer and the camera', () => {
    const doc = newDoc();
    expect(whyNoHalf(doc.layers[0])).toBeNull();
    expect(whyNoHalf({ ...doc.layers[0], rig: {} } as never)).toMatch(/skeleton/);
    expect(whyNoHalf({ ...doc.layers[0], kind: 'tilemap' } as never)).toMatch(/Only a vector layer/);
    expect(whyNoHalf({ ...doc.layers[0], mask: 'show' } as never)).toMatch(/mask/);
    expect(whyNoHalf({ ...doc.layers[0], bind: { rig: 'r', bone: 'b' } } as never)).toMatch(/bone/);
    expect(whyNoHalf(undefined)).toBeTruthy();
  });

  it('can be split into two plain layers, and the keys stay', () => {
    const ids = pairInStore();
    expect(ops.unpairLayers(ids.v).ok).toBe(true);
    expect(V(ids).pair).toBeUndefined();
    expect(P(ids).pair).toBeUndefined();
    expect(V(ids).cels).toHaveLength(2);
    expect(P(ids).cels).toHaveLength(2);
    // Now they are two ordinary layers: a key on one does not touch the other.
    ops.newBlankKey(ids.v, 10);
    expect(V(ids).cels).toHaveLength(3);
    expect(P(ids).cels).toHaveLength(2);
    expect(unlinkPair(now().layers as Layer[], ids.v)).toBe(false);
  });
});

describe('every timeline operation keeps the two halves in step', () => {
  it('add a key: on the vector half, the pixel half gets a blank one', () => {
    const ids = pairInStore();
    ops.newBlankKey(ids.v, 10);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(V(ids).cels.at(-1)!.start).toBe(10);
    expect((now().drawings[P(ids).cels.at(-1)!.drawingId] as PixelDrawing).kind).toBe('pixel');
  });

  it('add a key: on the pixel half, the vector half gets a blank one', () => {
    const ids = pairInStore();
    ops.newBlankKey(ids.p, 10);
    expect(shape(P(ids))).toEqual(shape(V(ids)));
    const d = now().drawings[V(ids).cels.at(-1)!.drawingId] as VectorDrawing;
    expect(d.kind).toBe('vector');
    expect(d.shapes).toHaveLength(0);
  });

  it('a stroke on a frame that has no key makes the key on both', () => {
    const ids = pairInStore([[0, 2]]);
    store().update('Draw stroke', (d) => {
      const p = d.layers.find((l) => l.id === ids.p)!;
      const dr = { id: uid('p'), kind: 'pixel', width: 1, height: 1, pixels: new Uint8ClampedArray([9, 9, 9, 255]) } as PixelDrawing;
      d.drawings[dr.id] = dr as never;
      p.cels.push({ id: uid('c'), start: 6, length: 1, drawingId: dr.id });
    });
    expect(shape(V(ids))).toEqual([[0, 2], [6, 1]]);
    expect(shape(P(ids))).toEqual([[0, 2], [6, 1]]);
  });

  it('delete a key: both go', () => {
    const ids = pairInStore();
    expect(ops.deleteKey(ids.v, 0).ok).toBe(true);
    expect(shape(V(ids))).toEqual([[4, 4]]);
    expect(shape(P(ids))).toEqual([[4, 4]]);
    expect(Object.keys(now().drawings)).toHaveLength(2);
  });

  it('move a key: both move, and the keys pushed along go with them', () => {
    const ids = pairInStore();
    ops.moveCel(ids.p, P(ids).cels[0].id, 2);
    expect(shape(P(ids))).toEqual(shape(V(ids)));
    expect(V(ids).cels[0].start).toBe(2);
    // The vector half kept its own drawing: the mark is still on the first key.
    expect((now().drawings[V(ids).cels[0].drawingId] as VectorDrawing).shapes).toHaveLength(1);
  });

  it('extend a key: both hold longer', () => {
    const ids = pairInStore();
    ops.resizeCel(ids.v, V(ids).cels[0].id, 2);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(V(ids).cels[0].length).toBe(2);
    ops.setExposure(3, ids.p, 4);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
  });

  it('add and remove a frame: both shift', () => {
    const ids = pairInStore();
    ops.insertFrame(ids.v, 2);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(shape(V(ids))).toEqual([[0, 5], [5, 4]]);
    ops.removeFrame(ids.p, 0);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(shape(V(ids))).toEqual([[0, 4], [4, 4]]);
  });

  it('copy a key to the next frame: the drawing comes on both halves', () => {
    const ids = pairInStore();
    // Put something on the pixel half's first key, so a copy can be told from a blank one.
    store().update('paint', (d) => {
      const dr = d.drawings[byId(d, ids.p).cels[0].drawingId] as PixelDrawing;
      dr.width = 1;
      dr.height = 1;
      dr.pixels = new Uint8ClampedArray([1, 2, 3, 255]);
    });
    ops.duplicateKey(ids.v, 0);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(V(ids).cels).toHaveLength(3);
    const vCopy = now().drawings[V(ids).cels[1].drawingId] as VectorDrawing;
    const pCopy = now().drawings[P(ids).cels[1].drawingId] as PixelDrawing;
    expect(vCopy.shapes).toHaveLength(1);
    expect(Array.from(pCopy.pixels)).toEqual([1, 2, 3, 255]);
  });

  it('a new copy of a drawing: both halves get a copy', () => {
    const ids = pairInStore();
    ops.newBlankKey(ids.v, 2, true);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(V(ids).cels).toHaveLength(3);
  });

  it('clear a key: both are wiped, the keys stay', () => {
    const ids = pairInStore();
    store().update('paint', (d) => {
      const dr = d.drawings[byId(d, ids.p).cels[0].drawingId] as PixelDrawing;
      dr.width = 1;
      dr.height = 1;
      dr.pixels = new Uint8ClampedArray([1, 2, 3, 255]);
    });
    ops.clearKey(ids.p, 0);
    expect(shape(V(ids))).toEqual([[0, 4], [4, 4]]);
    expect((now().drawings[V(ids).cels[0].drawingId] as VectorDrawing).shapes).toHaveLength(0);
    expect((now().drawings[P(ids).cels[0].drawingId] as PixelDrawing).width).toBe(0);
  });

  it('shared drawings: a drawing held in two places is held in two places on the other half too', () => {
    const ids = pairInStore();
    // Make the second vector key show the first key's drawing.
    store().update('share', (d) => {
      const v = byId(d, ids.v);
      v.cels[1].drawingId = v.cels[0].drawingId;
    });
    expect(P(ids).cels[1].drawingId).toBe(P(ids).cels[0].drawingId);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
  });

  it('shared drawings: making one its own gives the other half its own copy too', () => {
    const ids = pairInStore();
    store().update('share', (d) => {
      const v = byId(d, ids.v);
      v.cels[1].drawingId = v.cels[0].drawingId;
    });
    expect(ops.makeOwnDrawing(ids.v, 4).ok).toBe(true);
    expect(V(ids).cels[1].drawingId).not.toBe(V(ids).cels[0].drawingId);
    expect(P(ids).cels[1].drawingId).not.toBe(P(ids).cels[0].drawingId);
  });

  it('shared drawings: the settler alone never wipes the half that did not change', () => {
    // A leader's key getting a drawing of its own (not by the ops above) copies the follower's shared art, never blanks it.
    const ids = pairInStore();
    store().update('share both', (d) => {
      const v = byId(d, ids.v);
      const p = byId(d, ids.p);
      v.cels[1].drawingId = v.cels[0].drawingId;
      p.cels[1].drawingId = p.cels[0].drawingId;
    });
    const before = P(ids).cels[0].drawingId;
    store().update('own', (d) => {
      const v = byId(d, ids.v);
      const fresh = newVectorDrawing();
      d.drawings[fresh.id] = fresh as never;
      v.cels[1].drawingId = fresh.id;
    });
    expect(P(ids).cels[0].drawingId).toBe(before);
    expect(P(ids).cels[1].drawingId).not.toBe(before);
    expect(now().drawings[P(ids).cels[1].drawingId]).toBeTruthy();
  });

  it('cel offsets: moving the drawing moves both halves, and putting it back puts both back', () => {
    const ids = pairInStore();
    ops.nudgeKey(3, 1, ids.v, 0);
    expect(V(ids).cels[0].offset).toEqual({ x: 3, y: 1 });
    expect(P(ids).cels[0].offset).toEqual({ x: 3, y: 1 });
    ops.resetKeyOffset(ids.p, 0);
    expect(V(ids).cels[0].offset).toBeUndefined();
    expect(P(ids).cels[0].offset).toBeUndefined();
  });

  it('cel offsets: nudging a later frame of a hold cuts both holds in the same place', () => {
    const ids = pairInStore([[0, 8]]);
    ops.nudgeKey(0, 2, ids.v, 3);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(V(ids).cels).toHaveLength(2);
    expect(P(ids).cels[1].offset).toEqual({ x: 0, y: 2 });
    // The cut shares the one drawing on both halves.
    expect(V(ids).cels[1].drawingId).toBe(V(ids).cels[0].drawingId);
    expect(P(ids).cels[1].drawingId).toBe(P(ids).cels[0].drawingId);
  });

  it('tween: a glide stays on the half that has it and is not copied to the other', () => {
    const ids = pairInStore();
    store().update('tween', (d) => void (byId(d, ids.v).cels[0].tween = { ease: 'easeInOut' } as never));
    expect(V(ids).cels[0].tween).toBeTruthy();
    expect(P(ids).cels[0].tween).toBeUndefined();
    // A key added on the pixel half later keeps the vector glide as it was.
    ops.newBlankKey(ids.p, 12);
    expect(V(ids).cels[0].tween).toBeTruthy();
    expect(shape(V(ids))).toEqual(shape(P(ids)));
  });

  it('tween: a pixel stroke in the middle of a vector glide cuts the pixel half and leaves the glide whole', () => {
    const ids = pairInStore([[0, 8]]);
    store().update('tween', (d) => void (byId(d, ids.v).cels[0].tween = { ease: 'easeInOut' } as never));
    // A stroke at frame 4 on the pixel half: its blank hold is cut in two, the way drawing on a later frame does.
    store().update('stroke', (d) => {
      const p = byId(d, ids.p);
      const dr = { id: uid('p'), kind: 'pixel', width: 1, height: 1, pixels: new Uint8ClampedArray([9, 9, 9, 255]) } as PixelDrawing;
      d.drawings[dr.id] = dr as never;
      p.cels[0].length = 4;
      p.cels.push({ id: uid('c'), start: 4, length: 4, drawingId: dr.id });
    });
    expect(shape(P(ids))).toEqual([[0, 4], [4, 4]]);
    expect(shape(V(ids))).toEqual([[0, 8]]);
    expect(V(ids).cels[0].tween).toEqual({ ease: 'easeInOut' });
    // The glide's art is still there, and nothing was added on top of it.
    expect(now().drawings[V(ids).cels[0].drawingId]).toBeTruthy();
  });

  it('paste: keys copied from a pair carry both halves, and land on the pair', () => {
    const ids = pairInStore([[0, 2]]);
    const clip = clipFromCels(now(), [{ layerId: ids.p, celId: P(ids).cels[0].id }])!;
    expect(clip.layers.map((l) => l.kind)).toEqual(['pixel', 'vector']);
    // Pasting from the lower half still starts at the pair's top half.
    const t = targetLayers(now(), clip, ids.v);
    expect(t.ok && t.layers.map((l) => l.id)).toEqual([ids.p, ids.v]);
    store().update('Paste keys', (d) => {
      const live = [byId(d, ids.p), byId(d, ids.v)];
      pasteClip(d, clip, live, 6, 'push');
    });
    expect(shape(V(ids))).toEqual([[0, 2], [6, 2]]);
    expect(shape(P(ids))).toEqual([[0, 2], [6, 2]]);
  });

  it('paste: a key copied from one layer and pasted on a half still gives the other half a key', () => {
    const ids = pairInStore([[0, 2]]);
    const { doc: other, layer } = oneVectorKey();
    const single = clipFromCels(other, [{ layerId: layer.id, celId: layer.cels[0].id }])!;
    expect(single.layers).toHaveLength(1);
    store().update('Paste a key', (d) => void pasteClip(d, single, [byId(d, ids.v)], 8, 'push'));
    expect(V(ids).cels.some((c) => c.start === 8)).toBe(true);
    expect(shape(V(ids))).toEqual(shape(P(ids)));
  });

  it('undo takes the key back from both halves in one step', () => {
    const ids = pairInStore();
    const before = now();
    ops.newBlankKey(ids.v, 10);
    expect(V(ids).cels).toHaveLength(3);
    store().undo();
    expect(now()).toEqual(before);
    store().redo();
    expect(shape(V(ids))).toEqual(shape(P(ids)));
    expect(V(ids).cels).toHaveLength(3);
  });

  it('a half with art the other half has no key for keeps its art', () => {
    const ids = pairInStore([[0, 2]]);
    // Out of step on purpose: the pixel half has a key at 10 the vector half does not.
    store().update('stray', (d) => {
      const p = byId(d, ids.p);
      const dr = { id: uid('p'), kind: 'pixel', width: 1, height: 1, pixels: new Uint8ClampedArray([5, 5, 5, 255]) } as PixelDrawing;
      d.drawings[dr.id] = dr as never;
      byId(d, ids.p).cels.push({ id: uid('c'), start: 10, length: 1, drawingId: dr.id });
      void p;
    });
    ops.newBlankKey(ids.v, 4);
    expect(P(ids).cels.some((c) => c.start === 10)).toBe(true);
    expect(P(ids).cels.some((c) => c.start === 4)).toBe(true);
  });

  it('a locked half is not changed by the other, and the edit says why', () => {
    const ids = pairInStore();
    store().update('lock', (d) => void (byId(d, ids.p).locked = true));
    const r = ops.newBlankKey(ids.v, 10);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('pair-locked');
    expect(V(ids).cels).toHaveLength(2);
    // A change that gets past the check (a paste, say) leaves the locked half as it is.
    store().update('direct', (d) => void byId(d, ids.v).cels.push({ id: 'x', start: 12, length: 1, drawingId: byId(d, ids.v).cels[0].drawingId }));
    expect(P(ids).cels).toHaveLength(2);
  });

  it('leaves documents without a pair exactly alone', () => {
    const doc = newDoc();
    addCel(doc, doc.layers[0], 0, 3);
    resetStore(doc);
    expect(settlePairs(now(), { patches: [], before: doc })).toBeNull();
    const was = now();
    ops.newBlankKey(doc.layers[0].id, 5);
    expect(store().get().doc.layers[0].cels).toHaveLength(2);
    expect(now()).not.toBe(was);
  });
});

function oneVectorKey(): { doc: Doc; layer: Layer } {
  const doc = newDoc({ length: 24 });
  addCel(doc, doc.layers[0], 0, 1);
  return { doc, layer: doc.layers[0] };
}

describe('the layers of a pair move, copy and go as one', () => {
  it('duplicating a half copies the pair, and the copies are a pair in step', () => {
    const ids = pairInStore();
    const copy = ops.duplicateLayer(ids.p);
    expect(copy.ok).toBe(true);
    const layers = now().layers;
    expect(layers).toHaveLength(4);
    const copyP = byId(now(), copy.id!);
    const copyV = pairOf(layers, copyP)!;
    expect(copyP.kind).toBe('pixel');
    expect(copyV.kind).toBe('vector');
    expect(copyV.id).not.toBe(ids.v);
    expect(inStep(copyV, copyP)).toBe(true);
    // The originals are still a pair of their own, and the two pairs sit side by side.
    expect(pairOf(layers, V(ids))?.id).toBe(ids.p);
    expect(layers.map((l) => l.id)).toEqual([ids.v, ids.p, copyV.id, copyP.id].sort((a, b) => layers.findIndex((l) => l.id === a) - layers.findIndex((l) => l.id === b)));
    expect(Math.abs(layers.indexOf(copyV) - layers.indexOf(copyP))).toBe(1);
    // The copies have drawings of their own.
    expect(copyV.cels[0].drawingId).not.toBe(V(ids).cels[0].drawingId);
  });

  it('deleting a half leaves the other as a plain layer; deleting the pair removes both', () => {
    const a = pairInStore();
    ops.deleteLayer(a.p);
    expect(now().layers).toHaveLength(1);
    expect(V(a).pair).toBeUndefined();

    const b = pairInStore();
    store().update('another', (d) => void d.layers.unshift(newPixelLayer('Back', 8) as never));
    expect(now().layers).toHaveLength(3);
    expect(ops.deletePair(b.v).ok).toBe(true);
    expect(now().layers.map((l) => l.name)).toEqual(['Back']);
    expect(Object.keys(now().drawings).length).toBe(0);
  });

  it('deleting a pair that is every layer is refused', () => {
    const ids = pairInStore();
    expect(ops.deletePair(ids.p).reason).toBe('last-layer');
    expect(now().layers).toHaveLength(2);
  });

  it('moving one half up or down takes the other with it', () => {
    const ids = pairInStore();
    store().update('others', (d) => {
      d.layers.unshift(newPixelLayer('Back', 8) as never);
      d.layers.push(newPixelLayer('Front', 8) as never);
    });
    // Back, the pair, Front: one step up takes the whole pair past Front.
    expect(ops.stepLayer('up', ids.v).ok).toBe(true);
    const i = now().layers.findIndex((l) => l.id === ids.v);
    expect(now().layers[i + 1].id).toBe(ids.p);
    expect(now().layers.map((l) => l.name)).toEqual(['Back', 'Front', 'Ink', 'Ink (pixels)']);
    ops.stepLayer('down', ids.p);
    expect(now().layers.map((l) => l.name)).toEqual(['Back', 'Ink', 'Ink (pixels)', 'Front']);
  });

  it('dragging a half in the list drags the pair, and dropping beside the pair lands beside both', () => {
    const ids = pairInStore();
    store().update('others', (d) => void d.layers.unshift(newPixelLayer('Back', 8) as never));
    const back = now().layers[0].id;
    store().update('drag', (d) => void moveNode(d, { layer: back }, { layer: ids.v }, 'above'));
    expect(now().layers.map((l) => l.id)).toEqual([ids.v, ids.p, back]);
    store().update('drag', (d) => void moveNode(d, { layer: ids.v }, { layer: back }, 'above'));
    expect(now().layers.map((l) => l.id)).toEqual([back, ids.v, ids.p]);
  });

  it('reordering to a place moves the pair', () => {
    const ids = pairInStore();
    store().update('others', (d) => void d.layers.unshift(newPixelLayer('Back', 8) as never));
    store().update('move', (d) => void core.reorderLayer(d, ids.v, 0));
    const i = now().layers.findIndex((l) => l.id === ids.v);
    expect(Math.abs(i - now().layers.findIndex((l) => l.id === ids.p))).toBe(1);
  });

  it('renaming the pair renames both halves after one name', () => {
    const ids = pairInStore();
    ops.renamePair(ids.p, 'Sparkle');
    expect(V(ids).name).toBe('Sparkle (vectors)');
    expect(P(ids).name).toBe('Sparkle (pixels)');
  });
});

describe('a pair in a file', () => {
  it('is kept through saving and opening', () => {
    const ids = pairInStore();
    const back = loadFile(saveFile(now(), '1.0.0')).doc;
    expect(byId(back, ids.v).pair).toBe(ids.p);
    expect(byId(back, ids.p).pair).toBe(ids.v);
  });

  it('drops a link to a layer that is not there, one that does not link back, and one joining two of a kind', () => {
    const ids = pairInStore();
    const doc = structuredClone(now()) as Doc;
    byId(doc, ids.p).pair = 'gone';
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect(byId(back, ids.v).pair).toBeUndefined();
    expect(byId(back, ids.p).pair).toBeUndefined();
    const two = structuredClone(now()) as Doc;
    two.layers.push(newPixelLayer('Other', 8));
    byId(two, ids.v).pair = two.layers[2].id;
    two.layers[2].pair = ids.v;
    byId(two, ids.p).pair = ids.v;
    const lay = loadFile(saveFile(two, '1.0.0')).doc;
    // The vector layer named two layers and each named it back: the later one it points at is a pair; the other is not.
    expect(lay.layers.filter((l) => l.pair).length).toBeLessThanOrEqual(2);
    const l2 = structuredClone(now()) as Doc;
    sanitisePairs(l2.layers);
    expect(l2.layers.every((l) => l.pair)).toBe(true);
  });

  it('is never added to a document that has none, so old documents open and save as before', () => {
    const doc = newDoc();
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect('pair' in back.layers[0]).toBe(false);
    expect(loadFile(saveFile(back, '1.0.0')).doc.layers).toEqual(back.layers);
  });
});

describe('a long run of edits on a pair', () => {
  // A small seeded generator, so a failure can be run again.
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  it('always leaves the halves in step, tidy, and holding the right kind of drawing', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = rng(seed);
      const ids = pairInStore([[0, 3], [3, 2], [8, 4]]);
      const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
      for (let i = 0; i < 80; i++) {
        const half = pick([ids.v, ids.p]);
        const layer = byId(now(), half);
        const cel = layer.cels.length ? pick(layer.cels) : undefined;
        const frame = Math.floor(r() * 20);
        switch (Math.floor(r() * 10)) {
          case 0: ops.newBlankKey(half, frame); break;
          case 1: ops.newBlankKey(half, frame, true); break;
          case 2: ops.deleteKey(half, frame); break;
          case 3: if (cel) ops.moveCel(half, cel.id, Math.floor(r() * 18), pick(['push', 'trim'] as const)); break;
          case 4: if (cel) ops.resizeCel(half, cel.id, 1 + Math.floor(r() * 5), pick(['push', 'trim'] as const)); break;
          case 5: ops.insertFrame(half, frame); break;
          case 6: ops.removeFrame(half, frame); break;
          case 7: ops.duplicateKey(half, frame); break;
          case 8: ops.setExposure(1 + Math.floor(r() * 4), half, frame); break;
          default: ops.nudgeKey(Math.floor(r() * 3) - 1, 1, half, frame);
        }
        if (r() < 0.1) store().undo();
        const v = V(ids);
        const p = P(ids);
        expect(shape(v), `seed ${seed} step ${i}`).toEqual(shape(p));
        expect(v.cels.map((c) => c.offset?.x ?? 0), `offsets, seed ${seed} step ${i}`).toEqual(p.cels.map((c) => c.offset?.x ?? 0));
        let at = 0;
        for (const c of v.cels) {
          expect(c.start).toBeGreaterThanOrEqual(at);
          at = c.start + c.length;
        }
        for (const c of v.cels) expect(now().drawings[c.drawingId]?.kind).toBe('vector');
        for (const c of p.cels) expect(now().drawings[c.drawingId]?.kind).toBe('pixel');
      }
    }
  });
});
