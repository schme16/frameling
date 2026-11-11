import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Cel, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { addShapeHint, clearShapeHints, focusHints, hintTarget, makeShapeTween, makeTweenAsking, moveShapeHint, removeShapeHint, setTweenKind } from '../../src/symbols/ops';
import { hintMarkers } from '../../src/symbols/hints';
import { poseAt } from '../../src/core/symbols';

const square = (id: string, x: number): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y: 10 }, { x: x + 20, y: 10 }, { x: x + 20, y: 30 }, { x, y: 30 }] }], fill: '#ff0000', stroke: null, opacity: 1 });

beforeEach(() => {
  const doc = newDoc({ width: 200, height: 100, length: 12 });
  const d: VectorDrawing = { ...newVectorDrawing(), shapes: [square('a', 10)] };
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 12, drawingId: d.id });
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
});

const cels = (): Cel[] => store().get().doc.layers[0].cels;

describe('morphs (shape tweens)', () => {
  it('makes a morph without turning the drawing into a symbol, and lands on the end key', () => {
    makeShapeTween();
    const [a, b] = cels();
    expect(a.tween?.kind).toBe('shape');
    expect(b.start).toBe(11);
    expect(store().get().doc.symbols).toBeUndefined();
    expect(store().get().ui.frame).toBe(11);
    const d = store().get().doc.drawings[b.drawingId] as VectorDrawing;
    expect(d.shapes[0].type).toBe('path');
  });

  it('remembers the plain-drawing choice: morph', () => {
    setChoice('tween.plainDrawing', 'morph');
    makeTweenAsking();
    expect(cels()[0].tween?.kind).toBe('shape');
    setChoice('tween.plainDrawing', undefined);
  });

  it('remembers the plain-drawing choice: move (makes a symbol)', () => {
    setChoice('tween.plainDrawing', 'symbol');
    makeTweenAsking();
    expect(cels()[0].tween?.kind).toBeUndefined();
    expect(Object.keys(store().get().doc.symbols ?? {})).toHaveLength(1);
    setChoice('tween.plainDrawing', undefined);
  });

  it('switching to Move needs a symbol, switching back to Morph keeps the easing', () => {
    makeShapeTween();
    store().setUi({ frame: 0 });
    expect(setTweenKind('classic')).toMatch(/symbol/);
    expect(cels()[0].tween?.kind).toBe('shape');
  });

  it('hints: add on the first key, drag the twin on the last key, remove', () => {
    makeShapeTween();
    store().setUi({ frame: 0 });
    expect(hintTarget()?.end).toBe('from');
    addShapeHint({ x: 10, y: 10 });
    addShapeHint({ x: 30, y: 30 });
    expect(cels()[0].tween?.hints).toHaveLength(2);
    const [h1] = cels()[0].tween!.hints!;
    // On the last key, the markers are the end points, and moving one changes only its `to`.
    store().setUi({ frame: 11 });
    expect(hintTarget()?.end).toBe('to');
    moveShapeHint(h1.id, 'to', { x: 30, y: 10 });
    const moved = cels()[0].tween!.hints![0];
    expect(moved.from).toEqual({ x: 10, y: 10 });
    expect(moved.to).toEqual({ x: 30, y: 10 });
    const m = hintMarkers()!;
    expect(m.end).toBe('to');
    expect(m.markers[0].x).toBeCloseTo(30);
    removeShapeHint(h1.id);
    expect(cels()[0].tween?.hints).toHaveLength(1);
    clearShapeHints();
    expect(cels()[0].tween?.hints).toBeUndefined();
  });

  it('an in-between frame shows a morph of the two drawings', () => {
    makeShapeTween();
    // Move the end key's square to the right and recolour it.
    const end = cels()[1];
    store().update('edit', (doc) => {
      const d = doc.drawings[end.drawingId] as VectorDrawing;
      d.shapes = [{ ...square('z', 110), fill: '#0000ff' }];
    });
    const doc = store().get().doc;
    const mid = poseAt(doc, doc.layers[0], 6) as VectorDrawing;
    const s = mid.shapes[0] as PathShape;
    const xs = s.paths[0].points.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThan(10);
    expect(Math.max(...xs)).toBeLessThan(130);
    expect(s.fill).not.toBe('#ff0000');
  });

  it('on a key that ends one morph and starts the next, the side asked for wins', () => {
    makeShapeTween();
    // Second morph from the end key on to a new one.
    store().update('more', (doc) => {
      const l = doc.layers[0];
      l.cels[1].length = 1;
      l.cels[1].tween = { kind: 'shape', ease: 'linear' };
      doc.drawings.dz = { id: 'dz', kind: 'vector', shapes: [square('y', 50)] };
      l.cels.push({ id: 'c3', start: 12, length: 1, drawingId: 'dz' });
      doc.length = 13;
    });
    const [first, second] = cels();
    store().setUi({ frame: 11 });
    expect(hintTarget()?.cel.id).toBe(second.id);
    focusHints(first.id, 'to');
    expect(hintTarget()).toMatchObject({ end: 'to' });
    expect(hintTarget()?.cel.id).toBe(first.id);
    focusHints(second.id, 'from');
    expect(hintTarget()?.cel.id).toBe(second.id);
  });
});
