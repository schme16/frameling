import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, celAt } from '../../src/core/doc';
import type { Easing } from '../../src/core/format';
import { poseAt } from '../../src/core/symbols';
import { resetStore } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { editActiveDrawing } from '../../src/tools/edit';

function setup() {
  const doc = newDoc();
  const d = newVectorDrawing();
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  const s = resetStore(doc);
  s.setUi({ frame: 2, activeLayerId: doc.layers[0].id });
  return s;
}
const add = (dr: { shapes: unknown[] }) => void dr.shapes.push({ id: 's', type: 'fill', paths: [], color: '#000', opacity: 1 });

describe('drawing on a held frame', () => {
  it('makes a new key from a copy when chosen', () => {
    setChoice('draw.heldFrame', 'new-key');
    const s = setup();
    editActiveDrawing('Draw', 'vector', add as never);
    const l = s.get().doc.layers[0];
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 2], [2, 2]]);
    const first = s.get().doc.drawings[celAt(l, 0)!.drawingId];
    const here = s.get().doc.drawings[celAt(l, 2)!.drawingId];
    expect(first.kind === 'vector' && first.shapes.length).toBe(0);
    expect(here.kind === 'vector' && here.shapes.length).toBe(1);
    s.undo();
    expect(s.get().doc.layers[0].cels.map((c) => [c.start, c.length])).toEqual([[0, 4]]);
  });

  it('changes the held drawing when chosen', () => {
    setChoice('draw.heldFrame', 'edit-held');
    const s = setup();
    editActiveDrawing('Draw', 'vector', add as never);
    const l = s.get().doc.layers[0];
    expect(l.cels.length).toBe(1);
    const d = s.get().doc.drawings[l.cels[0].drawingId];
    expect(d.kind === 'vector' && d.shapes.length).toBe(1);
  });
});

describe('drawing on an in-between', () => {
  const inst = (id: string, x: number): never =>
    ({ id, type: 'instance', symbolId: 'sym', transform: { x, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0 }, opacity: 1, play: 'loop', firstFrame: 0 }) as never;
  const xs = (s: ReturnType<typeof resetStore>) => {
    const doc = s.get().doc;
    const l = doc.layers[0];
    const out: number[] = [];
    for (let f = 0; f < 10; f++) {
      const d = poseAt(doc, l, f);
      const i = d?.kind === 'vector' ? d.shapes.find((x) => x.type === 'instance') : undefined;
      out.push(i && i.type === 'instance' ? i.transform.x : NaN);
    }
    return out;
  };
  const make = (ease: Easing) => {
    const doc = newDoc();
    const a = newVectorDrawing();
    const b = newVectorDrawing();
    a.shapes.push(inst('i1', 0));
    b.shapes.push(inst('i1', 100));
    doc.drawings[a.id] = a;
    doc.drawings[b.id] = b;
    doc.layers[0].cels.push({ id: 'c1', start: 0, length: 10, drawingId: a.id, tween: { ease } }, { id: 'c2', start: 10, length: 2, drawingId: b.id });
    doc.length = 12;
    const s = resetStore(doc);
    s.setUi({ frame: 4, activeLayerId: doc.layers[0].id });
    return s;
  };

  it('keeps the easing when a new key is made mid-tween (each half plays its part of the curve)', () => {
    setChoice('draw.tweenFrame', 'new-key');
    for (const e of ['easeIn', 'easeInOut', 'bounceOut', [0.2, 0.8, 0.7, 0.1]] as Easing[]) {
      const s = make(e);
      const before = xs(s);
      editActiveDrawing('Draw', 'vector', add as never);
      const l = s.get().doc.layers[0];
      expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 4], [4, 6], [10, 2]]);
      expect(l.cels[0].tween?.slice?.[0]).toBe(0);
      expect(l.cels[1].tween?.slice?.[1]).toBe(1);
      expect(l.cels[0].tween?.slice?.[1]).toBeCloseTo(l.cels[1].tween!.slice![0], 9);
      const after = xs(s);
      for (let f = 0; f < 10; f++) expect(after[f]).toBeCloseTo(before[f], 5);
    }
  });

  it('cuts a second time in the same span and still matches', () => {
    setChoice('draw.tweenFrame', 'new-key');
    const s = make('easeOut');
    const before = xs(s);
    editActiveDrawing('Draw', 'vector', add as never);
    s.setUi({ frame: 7 });
    editActiveDrawing('Draw', 'vector', add as never);
    const after = xs(s);
    for (let f = 0; f < 10; f++) expect(after[f]).toBeCloseTo(before[f], 5);
  });

  it('leaves a linear whole-curve cut with a slice only where it is needed', () => {
    setChoice('draw.tweenFrame', 'new-key');
    const s = make('linear');
    editActiveDrawing('Draw', 'vector', add as never);
    expect(s.get().doc.layers[0].cels[1].tween?.ease).toBe('linear');
  });
});
