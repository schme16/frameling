import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import type { Doc, PathShape, Shape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { findLost, lockedLayerAt, nearestShown, pixelBounds } from '../../src/canvas/lost';
import { checkLost, fixLost, installLostHint } from '../../src/canvas/lostHint';
import { shapeBounds, topShapeAt } from '../../src/canvas/geometry';

function square(id: string, x: number, y: number, opacity = 1): PathShape {
  return { id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + 20, y }, { x: x + 20, y: y + 20 }, { x, y: y + 20 }] }], fill: '#ff0000', stroke: null, opacity };
}

/** One vector layer with a square on frames 0 to 3, nothing after. */
function setup(shape = square('a', 10, 10)): Doc {
  const doc = newDoc({ width: 200, height: 100, length: 8 });
  const d = newVectorDrawing();
  d.shapes.push(shape);
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  return doc;
}

describe('finding a lost drawing', () => {
  it('says nothing when the drawing shows, and nothing is lost on an empty frame', () => {
    const doc = setup();
    expect(findLost(doc, 0)).toBeNull();
    expect(findLost(doc, 6)).toEqual([]);
  });

  it('spots a hidden layer, a see-through layer and see-through shapes', () => {
    const doc = setup();
    doc.layers[0].visible = false;
    expect(findLost(doc, 0)?.[0].kind).toBe('hidden-layer');
    doc.layers[0].visible = true;
    doc.layers[0].opacity = 0;
    expect(findLost(doc, 0)?.[0].kind).toBe('clear-layer');
    const clear = setup(square('a', 10, 10, 0));
    expect(findLost(clear, 0)?.[0]).toMatchObject({ kind: 'clear-shapes', shapeIds: ['a'] });
  });

  it('spots a drawing off the page, but not one that is flying in on purpose', () => {
    const doc = setup(square('a', 400, 10));
    expect(findLost(doc, 0)?.[0].kind).toBe('off-page');
    doc.layers[0].cels[0].tween = { ease: 'linear' };
    const d2 = newVectorDrawing();
    d2.shapes.push(square('b', 10, 10));
    doc.drawings[d2.id] = d2;
    doc.layers[0].cels.push({ id: 'c2', start: 4, length: 2, drawingId: d2.id });
    expect(findLost(doc, 0)).toBeNull();
  });

  it('spots a folder that is hidden and a mask that cuts it all away', () => {
    const doc = setup();
    doc.folders = { f: { id: 'f', name: 'Folder', visible: false, opacity: 1 } };
    doc.layers[0].folder = 'f';
    expect(findLost(doc, 0)?.[0]).toMatchObject({ kind: 'hidden-folder', folderId: 'f' });
    doc.folders.f.visible = true;
    const mask = newVectorLayer('Mask');
    mask.mask = 'show';
    mask.folder = 'f';
    const md = newVectorDrawing();
    md.shapes.push(square('m', 150, 60));
    doc.drawings[md.id] = md;
    mask.cels.push({ id: 'mc', start: 0, length: 4, drawingId: md.id });
    doc.layers.push(mask);
    expect(findLost(doc, 0)?.[0]).toMatchObject({ kind: 'masked', maskId: mask.id });
    // The mask over the drawing lets it show.
    (doc.drawings[md.id] as VectorDrawing).shapes = [square('m', 0, 0)];
    expect(findLost(doc, 0)).toBeNull();
  });

  it('a visible drawing on another layer means nothing is lost', () => {
    const doc = setup();
    doc.layers[0].visible = false;
    const l2 = newVectorLayer('Other');
    const d = newVectorDrawing();
    d.shapes.push(square('o', 50, 50));
    doc.drawings[d.id] = d;
    l2.cels.push({ id: 'o1', start: 0, length: 4, drawingId: d.id });
    doc.layers.push(l2);
    expect(findLost(doc, 0)).toBeNull();
  });

  it('reads pixel layers by their painted pixels', () => {
    const doc = newDoc({ width: 16, height: 16, length: 2 });
    const layer = newPixelLayer('Pixels', 1);
    const p = newPixelDrawing(16, 16);
    expect(pixelBounds(p)).toBeNull();
    const px = new Uint8ClampedArray(p.pixels);
    px[(3 * 16 + 5) * 4 + 3] = 255;
    p.pixels = px;
    expect(pixelBounds(p)).toEqual({ x: 5, y: 3, w: 1, h: 1 });
    doc.drawings[p.id] = p;
    layer.cels.push({ id: 'p1', start: 0, length: 2, drawingId: p.id });
    layer.visible = false;
    doc.layers = [layer];
    expect(findLost(doc, 0)?.[0].kind).toBe('hidden-layer');
  });

  it('finds the nearest frame that shows something', () => {
    expect(nearestShown(setup(), 6)).toBe(3);
  });

  it('knows a click landed on a locked layer', () => {
    const doc = setup();
    doc.layers[0].locked = true;
    doc.layers.push(newVectorLayer('Top'));
    const hit = (shapes: Shape[], x: number, y: number) => topShapeAt(shapes, x, y, 2);
    expect(lockedLayerAt(doc, 0, 15, 15, doc.layers[1].id, hit)?.id).toBe(doc.layers[0].id);
    expect(lockedLayerAt(doc, 0, 150, 80, doc.layers[1].id, hit)).toBeUndefined();
    doc.layers[0].locked = false;
    expect(lockedLayerAt(doc, 0, 15, 15, doc.layers[1].id, hit)).toBeUndefined();
  });
});

describe('the hint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('fixes an off-page drawing in one undo step', () => {
    const doc = setup(square('a', 400, 10));
    resetStore(doc);
    const c = findLost(store().get().doc, 0)![0];
    fixLost(c, 0);
    const d = store().get().doc;
    const shape = (d.drawings[d.layers[0].cels[0].drawingId] as VectorDrawing).shapes[0];
    const b = shapeBounds(shape);
    expect(b.x + b.w / 2).toBeCloseTo(100, 0);
    expect(findLost(d, 0)).toBeNull();
    store().undo();
    expect(findLost(store().get().doc, 0)?.[0].kind).toBe('off-page');
  });

  it('shows a layer back and mentions each cause once per document', () => {
    const doc = setup();
    doc.layers[0].visible = false;
    resetStore(doc);
    expect(checkLost(true)?.kind).toBe('hidden-layer');
    expect(checkLost(true)).toBeUndefined();
    fixLost(findLost(store().get().doc, 0)![0], 0);
    expect(store().get().doc.layers[0].visible).toBe(true);
  });

  it('checks a while after landing on a frame, not while scrubbing or after your own edits', () => {
    const doc = setup();
    doc.layers.push(newVectorLayer('Second'));
    // Frame 5 is empty, frame 1 has the drawing on a layer we'll hide.
    resetStore(doc);
    const stop = installLostHint(store(), 100);
    store().update('Hide', (d) => void (d.layers[0].visible = false));
    vi.advanceTimersByTime(200);
    // Doc edits alone don't check: still mentionable.
    store().setUi({ frame: 1 });
    store().setUi({ frame: 2 });
    vi.advanceTimersByTime(200);
    // Landed: told now, so asking again says nothing new.
    expect(checkLost(true)).toBeUndefined();
    stop();
  });
});
