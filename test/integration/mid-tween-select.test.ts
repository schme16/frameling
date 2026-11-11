import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { InstanceShape, PathShape, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { instanceBounds } from '../../src/canvas/geometry';
import { poseLive } from '../../src/core/symbols';
import { selectTool } from '../../src/tools/select';
import { ctx, drag } from '../tools/helpers';

// A 20 x 20 square symbol gliding from x 0 (frame 0) to x 100 (frame 10), linear.
function setup() {
  const doc = newDoc({ width: 400, height: 200, length: 12 });
  const sq: PathShape = { id: 'sq', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }], fill: '#ff0000', stroke: null, opacity: 1 };
  const inner = newVectorDrawing();
  inner.shapes.push(sq);
  doc.drawings[inner.id] = inner;
  doc.symbols = {
    y: { id: 'y', name: 'Box', length: 1, origin: { x: 10, y: 10 }, layers: [{ id: 'il', name: 'L', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'ic', start: 0, length: 1, drawingId: inner.id }] }] },
  };
  const inst = (x: number): InstanceShape => ({ id: 'i', type: 'instance', symbolId: 'y', transform: { x, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 });
  const a = newVectorDrawing();
  a.shapes.push(inst(10));
  const b = newVectorDrawing();
  b.shapes.push(inst(110));
  doc.drawings[a.id] = a;
  doc.drawings[b.id] = b;
  doc.layers[0].cels = [
    { id: 'ka', start: 0, length: 10, drawingId: a.id, tween: { ease: 'linear' } },
    { id: 'kb', start: 10, length: 2, drawingId: b.id },
  ];
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 5, tool: 'select' });
}

const layer = () => store().get().doc.layers[0];
const instOn = (cel: number) => {
  const { doc } = store().get();
  return (doc.drawings[layer().cels[cel].drawingId] as VectorDrawing).shapes[0] as InstanceShape;
};

describe('selecting a symbol on an in-between', () => {
  beforeEach(() => {
    setChoice('draw.tweenFrame', undefined);
    setup();
  });
  afterEach(() => setChoice('draw.tweenFrame', undefined));

  it('clicks where it shows, not where the key has it', () => {
    // At frame 5 it's at x 60; the key has it at 10.
    drag(selectTool, ctx(), [[60, 50], [60, 50]]);
    expect(store().get().ui.selection).toEqual(['i']);
    store().setUi({ selection: [] });
    drag(selectTool, ctx(), [[10, 50], [10, 50]]);
    expect(store().get().ui.selection).toEqual([]);
  });

  it('a drag makes a key from the in-between by default, and the glide carries on', () => {
    drag(selectTool, ctx(), [[60, 50], [70, 50], [80, 60]]);
    const cels = layer().cels;
    expect(cels.map((c) => [c.start, c.length])).toEqual([[0, 5], [5, 5], [10, 2]]);
    expect(instOn(1).transform.x).toBeCloseTo(80);
    expect(instOn(1).transform.y).toBeCloseTo(60);
    // The key before is untouched and both halves still glide.
    expect(instOn(0).transform.x).toBe(10);
    expect(cels[0].tween?.ease).toBe('linear');
    expect(cels[1].tween?.ease).toBe('linear');
    store().undo();
    expect(layer().cels).toHaveLength(2);
  });

  it('"change the key before" moves the key by the same amount', () => {
    setChoice('draw.tweenFrame', 'edit-key');
    drag(selectTool, ctx(), [[60, 50], [80, 60]]);
    expect(layer().cels).toHaveLength(2);
    expect(instOn(0).transform.x).toBeCloseTo(30);
    expect(instOn(0).transform.y).toBeCloseTo(60);
  });

  it('a symbol being dragged previews where it is going, not where it was', () => {
    const { doc } = store().get();
    const live = structuredClone(doc.drawings[layer().cels[0].drawingId]) as VectorDrawing;
    (live.shapes[0] as InstanceShape).transform.x = 300;
    const posed = poseLive(doc, layer(), 5, live) as VectorDrawing;
    const p = posed.shapes[0] as InstanceShape & { posed: { matrix: number[] } };
    expect(p.posed.matrix[4]).toBeCloseTo(290);
    expect(instanceBounds(live.shapes[0] as InstanceShape, doc).x).toBeCloseTo(290);
  });
});
