import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, InstanceShape, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { isInstance, rootDoc } from '../../src/core/symbols';
import { editInstance, leaveSymbol, makeSymbolFromSelection, makeTween, placeInstance, removeTween, setEase, setMotionPath, simplify, swapSymbol, wouldNestInItself } from '../../src/symbols/ops';

function square(id: string, x: number, y: number): PathShape {
  return { id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }] }], fill: '#ff0000', stroke: null, opacity: 1 };
}

function setup(): Doc {
  const doc = newDoc({ width: 200, height: 100, length: 12 });
  const d = newVectorDrawing();
  d.shapes.push(square('a', 10, 10), square('b', 50, 10));
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 12, drawingId: d.id });
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  return doc;
}

const shapesAt = (f: number): VectorDrawing['shapes'] => {
  const { doc } = store().get();
  const cel = doc.layers[0].cels.find((c) => f >= c.start && f < c.start + c.length)!;
  return (doc.drawings[cel.drawingId] as VectorDrawing).shapes;
};

describe('symbol actions', () => {
  beforeEach(() => void setup());

  it('makes a symbol from the selection and selects the new instance', () => {
    store().setUi({ selection: ['a'] });
    makeSymbolFromSelection();
    const shapes = shapesAt(0);
    expect(shapes.map((s) => s.type)).toEqual(['instance', 'path']);
    expect(store().get().ui.selection).toEqual([shapes[0].id]);
    // One step to undo.
    store().undo();
    expect(shapesAt(0).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('opens a symbol in place and comes back out', () => {
    store().setUi({ selection: ['a'] });
    makeSymbolFromSelection();
    const inst = shapesAt(0)[0] as InstanceShape;
    store().setUi({ frame: 4 });
    editInstance(inst.id);
    const s = store().get();
    expect(s.doc.editing).toHaveLength(1);
    expect(s.doc.layers[0].name).toBe('Layer 1');
    expect(s.ui.frame).toBe(0);
    expect(wouldNestInItself(s.doc, inst.symbolId)).toBe(true);
    expect(placeInstance(inst.symbolId)).toMatch(/inside itself/);
    leaveSymbol();
    expect(store().get().doc.editing).toBeUndefined();
    expect(store().get().ui.frame).toBe(4);
    expect(store().get().ui.selection).toEqual([inst.id]);
  });

  it('swaps a symbol', () => {
    store().setUi({ selection: ['a'] });
    makeSymbolFromSelection();
    store().setUi({ selection: ['b'] });
    makeSymbolFromSelection();
    const [one, two] = shapesAt(0) as InstanceShape[];
    store().setUi({ selection: [two.id] });
    swapSymbol(one.symbolId);
    expect((shapesAt(0)[1] as InstanceShape).symbolId).toBe(one.symbolId);
  });
});

describe('making in-betweens', () => {
  beforeEach(() => void setup());

  it('makes an end key on the last held frame and wraps plain drawings into a symbol', () => {
    makeTween();
    const { doc, ui } = store().get();
    const cels = doc.layers[0].cels;
    expect(cels.map((c) => [c.start, c.length])).toEqual([
      [0, 11],
      [11, 1],
    ]);
    expect(cels[0].tween?.ease).toBe('easeInOut');
    expect(Object.keys(doc.symbols!)).toHaveLength(1);
    expect(shapesAt(0).every(isInstance)).toBe(true);
    expect(shapesAt(11).every(isInstance)).toBe(true);
    expect(cels[0].drawingId).not.toBe(cels[1].drawingId);
    expect(ui.frame).toBe(11);
    expect(ui.selection).toEqual([shapesAt(11)[0].id]);
  });

  it('holds a lone one-frame drawing for a second first, so there is room to move', () => {
    store().update('one frame', (d) => {
      d.layers[0].cels[0].length = 1;
      d.length = 4;
      d.fps = 12;
    });
    makeTween();
    const { doc, ui } = store().get();
    expect(doc.layers[0].cels.map((c) => [c.start, c.length])).toEqual([
      [0, 11],
      [11, 1],
    ]);
    expect(doc.length).toBe(12);
    expect(ui.frame).toBe(11);
  });

  it('splits at the playhead when it is partway through a hold', () => {
    store().setUi({ frame: 6 });
    makeTween();
    expect(store().get().doc.layers[0].cels.map((c) => c.start)).toEqual([0, 6]);
  });

  it('closes a gap to the next key', () => {
    store().update('gap', (d) => {
      d.layers[0].cels[0].length = 3;
      const nd = newVectorDrawing();
      nd.shapes.push(square('z', 80, 10));
      d.drawings[nd.id] = nd;
      d.layers[0].cels.push({ id: 'c9', start: 8, length: 2, drawingId: nd.id });
    });
    makeTween();
    const cels = store().get().doc.layers[0].cels;
    expect(cels[0].length).toBe(8);
    expect(cels[0].tween).toBeTruthy();
  });

  it('changes the easing and path, and removes the in-betweens', () => {
    makeTween();
    store().setUi({ frame: 3 });
    setEase('bounceOut');
    expect(store().get().doc.layers[0].cels[0].tween?.ease).toBe('bounceOut');
    setMotionPath([{ x: 0, y: 0 }, { x: 50, y: 50 }]);
    expect(store().get().doc.layers[0].cels[0].tween?.path?.points).toHaveLength(2);
    removeTween();
    expect(store().get().doc.layers[0].cels[0].tween).toBeUndefined();
  });

  it('saves the scene while a symbol is open', () => {
    makeTween();
    store().setUi({ frame: 0 });
    editInstance(shapesAt(0)[0].id);
    const root = rootDoc(store().get().doc);
    expect(root.layers[0].cels).toHaveLength(2);
  });
});

describe('simplify', () => {
  it('drops points on a straight line', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i, y: i < 10 ? 0 : i - 10 }));
    expect(simplify(pts, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 19, y: 9 }]);
  });
});
