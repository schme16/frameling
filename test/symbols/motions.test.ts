import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, InstanceShape, PathShape, VectorDrawing } from '../../src/core/format';
import { MOTIONS, motionFrames, motionKeys, motionPoses } from '../../src/core/motions';
import { resetStore, store } from '../../src/core/store';
import { instanceAt, isInstance } from '../../src/core/symbols';
import { applyMotion, motionFits, motionProblem } from '../../src/symbols/motions';
import { makeMotion } from '../../src/symbols/motion-ops';

function square(id: string, x: number, y: number): PathShape {
  return { id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + 20, y }, { x: x + 20, y: y + 20 }, { x, y: y + 20 }] }], fill: '#ff0000', stroke: null, opacity: 1 };
}

function setup(length = 24, celLength = 24): Doc {
  const doc = newDoc({ width: 200, height: 100, length, fps: 12 });
  const d = newVectorDrawing();
  d.shapes.push(square('a', 10, 10), square('b', 60, 10));
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: celLength, drawingId: d.id });
  return doc;
}

const rest = { transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 0.8 };

describe('motion poses', () => {
  it('every motion ends at rest and keeps its keys on separate frames', () => {
    for (const m of MOTIONS) {
      for (const frames of [3, 7, 24]) {
        const keys = motionKeys(m.id, rest, { w: 40, h: 40 }, frames);
        const last = keys[keys.length - 1];
        expect(last.transform).toEqual(rest.transform);
        expect(last.opacity).toBe(0.8);
        for (let i = 1; i < keys.length; i++) expect(keys[i].frame).toBeGreaterThan(keys[i - 1].frame);
        expect(keys[0].frame).toBe(0);
      }
    }
  });

  it('pop in and fade in start clear', () => {
    expect(motionKeys('popIn', rest, { w: 40, h: 40 }, 5)[0].opacity).toBe(0);
    expect(motionKeys('fadeIn', rest, { w: 40, h: 40 }, 5)[0].opacity).toBe(0);
    expect(motionKeys('popIn', rest, { w: 40, h: 40 }, 5)[0].transform.scaleX).toBeCloseTo(0.3);
  });

  it('bounce goes up by about its height and scales with size', () => {
    const small = Math.min(...motionKeys('bounce', rest, { w: 40, h: 40 }, 10).map((k) => k.transform.y));
    const big = Math.min(...motionKeys('bounce', rest, { w: 200, h: 200 }, 10).map((k) => k.transform.y));
    expect(small).toBeLessThan(50);
    expect(big).toBeLessThan(small);
  });

  it('length follows the frame rate, never fewer frames than poses', () => {
    expect(motionFrames('float', 12)).toBe(24);
    expect(motionFrames('shake', 2)).toBe(motionPoses('shake', 1, 1).length - 1);
  });
});

describe('applying a motion', () => {
  it('wraps the whole drawing into a symbol and adds tweened keys from the playhead', () => {
    const doc = setup();
    const out = applyMotion(doc, { layerId: doc.layers[0].id, frame: 4, selection: [] }, 'wobble');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.wrapped).toBe(true);
    const cels = doc.layers[0].cels;
    // The hold before it stays, then one key per pose.
    expect(cels[0]).toMatchObject({ start: 0, length: 4 });
    expect(cels.length).toBe(1 + motionPoses('wobble', 1, 1).length);
    expect(cels.slice(1, -1).every((c) => !!c.tween)).toBe(true);
    expect(cels[cels.length - 1].tween).toBeUndefined();
    // Still ends where it ended.
    const last = cels[cels.length - 1];
    expect(last.start + last.length).toBe(24);
    // The wobble turns it on the second key, and the last key is back to rest.
    const inst = (f: number) => instanceAt(doc, doc.layers[0], f, out.instanceIds[0]) ?? (doc.drawings[cels.find((c) => c.start === f)!.drawingId] as VectorDrawing).shapes.find(isInstance)!;
    const second = doc.drawings[cels[2].drawingId] as VectorDrawing;
    expect((second.shapes.find(isInstance) as InstanceShape).transform.rotation).not.toBe(0);
    const end = doc.drawings[last.drawingId] as VectorDrawing;
    expect((end.shapes.find(isInstance) as InstanceShape).transform.rotation).toBe(0);
    expect(inst(4)).toBeTruthy();
  });

  it('moves only the selected shape and leaves the rest where they are', () => {
    const doc = setup();
    const out = applyMotion(doc, { layerId: doc.layers[0].id, frame: 0, selection: ['b'] }, 'shake');
    expect(out.ok).toBe(true);
    for (const c of doc.layers[0].cels) {
      const d = doc.drawings[c.drawingId] as VectorDrawing;
      expect(d.shapes.filter(isInstance)).toHaveLength(1);
      expect(d.shapes.filter((s) => s.type === 'path')).toHaveLength(1);
    }
  });

  it('squeezes into the gap before the next drawing, or pushes it along', () => {
    const make = () => {
      const doc = setup(24, 4);
      const d2 = newVectorDrawing();
      d2.shapes.push(square('z', 0, 0));
      doc.drawings[d2.id] = d2;
      doc.layers[0].cels.push({ id: 'c2', start: 6, length: 4, drawingId: d2.id });
      return doc;
    };
    const w = (doc: Doc) => ({ layerId: doc.layers[0].id, frame: 0, selection: [] });
    const a = make();
    expect(motionFits(a, w(a), 'float')).toBe(false);
    applyMotion(a, w(a), 'float', 'squeeze');
    expect(a.layers[0].cels.find((c) => c.id === 'c2')!.start).toBe(6);
    const b = make();
    applyMotion(b, w(b), 'float', 'push');
    const moved = b.layers[0].cels.find((c) => c.id === 'c2')!;
    expect(moved.start).toBe(motionFrames('float', 12) + 1);
    expect(b.length).toBeGreaterThanOrEqual(moved.start + moved.length);
    // Cels never overlap.
    const cels = b.layers[0].cels;
    for (let i = 1; i < cels.length; i++) expect(cels[i].start).toBeGreaterThanOrEqual(cels[i - 1].start + cels[i - 1].length);
  });

  it('says no on a locked layer, an empty frame or a key that already moves', () => {
    const doc = setup();
    doc.layers[0].locked = true;
    expect(motionProblem(doc, { layerId: doc.layers[0].id, frame: 0, selection: [] })).toMatch(/locked/);
    const e = setup(24, 4);
    expect(motionProblem(e, { layerId: e.layers[0].id, frame: 10, selection: [] })).toMatch(/Draw something/);
    const t = setup();
    t.layers[0].cels[0].tween = { ease: 'linear' };
    expect(motionProblem(t, { layerId: t.layers[0].id, frame: 0, selection: [] })).toMatch(/already moving/);
  });
});

describe('makeMotion in the store', () => {
  beforeEach(() => {
    const doc = setup();
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, frame: 0, selection: [] });
  });

  it('is one undo step and selects what moves', () => {
    const before = store().get().doc;
    makeMotion('bounce');
    const after = store().get().doc;
    expect(after.layers[0].cels.length).toBeGreaterThan(1);
    expect(store().get().ui.selection).toHaveLength(1);
    store().undo();
    expect(store().get().doc.layers[0].cels).toEqual(before.layers[0].cels);
    expect(store().get().doc.symbols ?? {}).toEqual(before.symbols ?? {});
  });
});
