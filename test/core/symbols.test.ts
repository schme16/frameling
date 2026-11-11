import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, pruneDrawings } from '../../src/core/doc';
import { bezierFor, ease, EASE_PRESETS } from '../../src/core/ease';
import type { Doc, InstanceShape, PathShape, VectorDrawing } from '../../src/core/format';
import {
  decompose,
  deleteUnusedSymbols,
  duplicateSymbol,
  enterSymbol,
  exitSymbol,
  instanceAt,
  isPosed,
  makeSymbol,
  pairInstances,
  pointOnPath,
  poseAt,
  rootDoc,
  symbolFrame,
  symbolUsage,
  symbolsInside,
  transformMatrix,
  tweenInstance,
} from '../../src/core/symbols';
import { shapeBounds, setGeometryDoc, transformShape, translate, hitShape } from '../../src/canvas/geometry';
import { loadFile, saveFile } from '../../src/io/file';

function square(id: string, x: number, y: number, size = 10): PathShape {
  return {
    id,
    type: 'path',
    paths: [{ closed: true, points: [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }] }],
    fill: '#ff0000',
    stroke: null,
    opacity: 1,
  };
}

/** A stage with one layer holding one drawing of two squares on frames 0..9. */
function stage(): { doc: Doc; drawing: VectorDrawing } {
  const doc = newDoc({ width: 200, height: 100, length: 20 });
  const d = newVectorDrawing();
  d.shapes.push(square('a', 10, 10), square('b', 50, 10));
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 10, drawingId: d.id });
  return { doc, drawing: d };
}

describe('instance transforms', () => {
  it('round-trips through a matrix', () => {
    const t = { x: 40, y: -12, scaleX: 1.5, scaleY: -0.75, rotation: 33, skew: 12 };
    const o = { x: 5, y: 7 };
    const back = decompose(transformMatrix(t, o), o);
    for (const k of Object.keys(t) as (keyof typeof t)[]) expect(back[k]).toBeCloseTo(t[k], 6);
  });

  it('places the origin at x, y', () => {
    const m = transformMatrix({ x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 90, skew: 0 }, { x: 10, y: 10 });
    expect(m[0] * 10 + m[2] * 10 + m[4]).toBeCloseTo(100);
    expect(m[1] * 10 + m[3] * 10 + m[5]).toBeCloseTo(50);
  });
});

describe('making symbols', () => {
  it('swaps the shapes for one instance in the same place in the stacking order', () => {
    const { doc, drawing } = stage();
    const next = produce(doc, (d) => {
      makeSymbol(d, drawing.id, ['a'], { x: 15, y: 15 }, 'Box');
    });
    const shapes = (next.drawings[drawing.id] as VectorDrawing).shapes;
    expect(shapes.map((s) => s.type)).toEqual(['instance', 'path']);
    const inst = shapes[0] as InstanceShape;
    const sym = next.symbols![inst.symbolId];
    expect(sym.name).toBe('Box');
    expect(sym.origin).toEqual({ x: 15, y: 15 });
    expect(inst.transform).toMatchObject({ x: 15, y: 15, scaleX: 1, rotation: 0 });
    // The symbol keeps the shape exactly where it was drawn.
    const inner = next.drawings[sym.layers[0].cels[0].drawingId] as VectorDrawing;
    expect((inner.shapes[0] as PathShape).paths[0].points[0]).toEqual({ x: 10, y: 10 });
  });

  it('counts, duplicates and deletes unused symbols', () => {
    const { doc, drawing } = stage();
    let next = produce(doc, (d) => {
      makeSymbol(d, drawing.id, ['a'], { x: 15, y: 15 });
    });
    const id = Object.keys(next.symbols!)[0];
    expect(symbolUsage(next).get(id)).toBe(1);
    let copy = '';
    next = produce(next, (d) => {
      copy = duplicateSymbol(d, id)!;
    });
    expect(next.symbols![copy].name).toBe('Symbol 1 copy');
    expect(next.symbols![copy].layers[0].cels[0].drawingId).not.toBe(next.symbols![id].layers[0].cels[0].drawingId);
    next = produce(next, (d) => {
      expect(deleteUnusedSymbols(d)).toBe(1);
    });
    expect(Object.keys(next.symbols!)).toEqual([id]);
  });

  it('keeps symbol drawings when pruning', () => {
    const { doc, drawing } = stage();
    const next = produce(doc, (d) => {
      makeSymbol(d, drawing.id, ['a'], { x: 15, y: 15 });
      pruneDrawings(d);
    });
    expect(Object.keys(next.drawings)).toHaveLength(2);
  });
});

describe('editing in place', () => {
  it('swaps the symbol in and puts everything back', () => {
    const { doc, drawing } = stage();
    let next = produce(doc, (d) => {
      makeSymbol(d, drawing.id, ['a'], { x: 15, y: 15 });
    });
    const id = Object.keys(next.symbols!)[0];
    const stageLayers = next.layers;
    next = produce(next, (d) => {
      enterSymbol(d, id, { frame: 3, activeLayerId: null, instanceId: undefined, matrix: [1, 0, 0, 1, 0, 0] });
    });
    expect(next.layers).toBe(doc.symbols?.[id]?.layers ?? next.layers);
    expect(next.length).toBe(1);
    expect(next.symbols![id].layers).toEqual([]);
    // Saving while inside writes the stage as it is.
    const root = rootDoc(next);
    expect(root.layers).toBe(stageLayers);
    expect(root.symbols![id].layers).toBe(next.layers);
    expect(root.editing).toBeUndefined();
    const back = loadFile(saveFile(next)).doc;
    expect(back.layers[0].id).toBe(stageLayers[0].id);
    expect(back.symbols![id].layers).toHaveLength(1);
    // Draw something inside, then leave.
    next = produce(next, (d) => {
      d.length = 6;
      exitSymbol(d);
    });
    expect(next.editing).toBeUndefined();
    expect(next.layers).toEqual(stageLayers);
    expect(next.symbols![id].length).toBe(6);
  });

  it('knows what is nested inside what', () => {
    const { doc, drawing } = stage();
    const next = produce(doc, (d) => {
      const one = makeSymbol(d, drawing.id, ['a'], { x: 15, y: 15 })!;
      makeSymbol(d, drawing.id, [one.instanceId, 'b'], { x: 30, y: 15 });
    });
    const [inner, outer] = Object.keys(next.symbols!);
    expect([...symbolsInside(next, outer)]).toEqual([inner]);
    expect(symbolsInside(next, inner).size).toBe(0);
  });
});

describe('posing and tweens', () => {
  function tweened(): Doc {
    const { doc, drawing } = stage();
    return produce(doc, (d) => {
      makeSymbol(d, drawing.id, ['a'], { x: 15, y: 15 });
      const sym = Object.values(d.symbols!)[0];
      // A two-frame symbol, so play modes show.
      sym.layers[0].cels[0].length = 1;
      const second = newVectorDrawing();
      second.shapes.push(square('z', 0, 0));
      d.drawings[second.id] = second;
      sym.layers[0].cels.push({ id: 'k2', start: 1, length: 1, drawingId: second.id });
      sym.length = 2;
      // Second key on the stage: the instance moved 100 to the right.
      const end = JSON.parse(JSON.stringify(d.drawings[drawing.id])) as VectorDrawing;
      end.id = 'end';
      (end.shapes[0] as InstanceShape).transform.x += 100;
      (end.shapes[0] as InstanceShape).opacity = 0;
      d.drawings.end = end;
      d.layers[0].cels.push({ id: 'c2', start: 10, length: 1, drawingId: 'end' });
      d.layers[0].cels[0].tween = { ease: 'linear' };
    });
  }

  it('leaves plain drawings alone', () => {
    const { doc, drawing } = stage();
    expect(poseAt(doc, doc.layers[0], 3)).toBe(drawing);
  });

  it('moves instances between keys and caches each frame', () => {
    const doc = tweened();
    const layer = doc.layers[0];
    const at = (f: number) => (poseAt(doc, layer, f) as VectorDrawing).shapes.find(isPosed)!;
    expect(at(0).transform.x).toBeCloseTo(15);
    expect(at(5).transform.x).toBeCloseTo(65);
    expect(at(5).opacity).toBeCloseTo(0.5);
    expect(at(10).transform.x).toBeCloseTo(115);
    expect(poseAt(doc, layer, 5)).toBe(poseAt(doc, layer, 5));
    expect(instanceAt(doc, layer, 5, at(5).id)!.transform.x).toBeCloseTo(65);
  });

  it('stops tweening when the keys no longer touch', () => {
    const doc = produce(tweened(), (d) => {
      d.layers[0].cels[1].start = 12;
    });
    const s = (poseAt(doc, doc.layers[0], 5) as VectorDrawing).shapes.find(isPosed)!;
    expect(s.transform.x).toBeCloseTo(15);
  });

  it('plays the symbol by its play mode', () => {
    const inst = { play: 'loop', firstFrame: 0 } as InstanceShape;
    expect([0, 1, 2, 3].map((f) => symbolFrame(inst, f, 2))).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2, 3].map((f) => symbolFrame({ ...inst, play: 'once' }, f, 3))).toEqual([0, 1, 2, 2]);
    expect([0, 1, 2].map((f) => symbolFrame({ ...inst, play: 'single', firstFrame: 1 }, f, 3))).toEqual([1, 1, 1]);
    const doc = tweened();
    const s = (f: number) => (poseAt(doc, doc.layers[0], f) as VectorDrawing).shapes.find(isPosed)!;
    expect(s(0).posed.layers[0].drawing).not.toBe(s(1).posed.layers[0].drawing);
    expect(s(0).posed.layers[0].drawing).toBe(s(2).posed.layers[0].drawing);
  });

  it('pairs instances by symbol, then by order', () => {
    const a = { symbolId: 'x' } as InstanceShape;
    const b = { symbolId: 'y' } as InstanceShape;
    const c = { symbolId: 'y' } as InstanceShape;
    const d = { symbolId: 'x' } as InstanceShape;
    expect(pairInstances([a, b], [c, d])).toEqual([d, c]);
  });

  it('follows a motion path and can turn along it', () => {
    const path = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], orient: true };
    expect(pointOnPath(path, 0.5)).toMatchObject({ x: 100, y: 0 });
    expect(pointOnPath(path, 0.75)).toMatchObject({ x: 100, y: 50, angle: 90 });
    const a = { transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1 } as InstanceShape;
    const b = { ...a, transform: { ...a.transform, x: 100, y: 100 } } as InstanceShape;
    const mid = tweenInstance(a, b, { ease: 'linear', path }, 0.75);
    expect(mid.transform.x).toBeCloseTo(100);
    expect(mid.transform.y).toBeCloseTo(50);
    expect(mid.transform.rotation).toBeCloseTo(90);
    const spun = tweenInstance(a, b, { ease: 'linear', spin: 1 }, 0.5);
    expect(spun.transform.rotation).toBeCloseTo(180);
  });
});

describe('easing', () => {
  it('starts at 0 and ends at 1 for every preset', () => {
    for (const p of EASE_PRESETS) {
      expect(ease(p.id, 0)).toBe(0);
      expect(ease(p.id, 1)).toBe(1);
    }
    expect(ease('easeOut', 0.5)).toBeGreaterThan(0.5);
    expect(ease('easeIn', 0.5)).toBeLessThan(0.5);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((t) => ease('backOut', t)))).toBeGreaterThan(1);
  });

  it('runs a custom curve like CSS', () => {
    expect(ease([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 4);
    expect(ease(bezierFor('easeInOut'), 0.5)).toBeCloseTo(0.5, 3);
  });
});

describe('files', () => {
  it('keep symbols, instances and tweens', () => {
    const { doc, drawing } = stage();
    const next = produce(doc, (d) => {
      makeSymbol(d, drawing.id, ['a'], { x: 15, y: 15 }, 'Logo');
      const inst = (d.drawings[drawing.id] as VectorDrawing).shapes[0] as InstanceShape;
      inst.tint = { color: '#00ff00', amount: 0.5 };
      inst.play = 'once';
      d.layers[0].cels[0].tween = { ease: [0.1, 0.2, 0.3, 1.4], spin: -1, path: { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], orient: true } };
    });
    const { doc: back, warnings } = loadFile(saveFile(next));
    expect(warnings).toEqual([]);
    expect(back.symbols).toEqual(next.symbols);
    expect(back.drawings[drawing.id]).toEqual(next.drawings[drawing.id]);
    expect(back.layers[0].cels[0].tween).toEqual(next.layers[0].cels[0].tween);
  });

  it('open old files without symbols as before', () => {
    const { doc } = stage();
    const back = loadFile(saveFile(doc)).doc;
    expect(back.symbols).toBeUndefined();
    expect(back.layers[0].cels[0].tween).toBeUndefined();
  });
});

describe('instance geometry', () => {
  let doc: Doc;
  let inst: InstanceShape;
  beforeEach(() => {
    const s = stage();
    doc = produce(s.doc, (d) => {
      makeSymbol(d, s.drawing.id, ['a'], { x: 15, y: 15 });
    });
    inst = (doc.drawings[s.drawing.id] as VectorDrawing).shapes[0] as InstanceShape;
    setGeometryDoc(() => doc);
  });

  it('measures, hits and moves an instance through its transform', () => {
    expect(shapeBounds(inst)).toEqual({ x: 10, y: 10, w: 10, h: 10 });
    expect(hitShape(inst, 12, 12, 0)).toBe(true);
    expect(hitShape(inst, 30, 12, 0)).toBe(false);
    const moved = transformShape(inst, translate(5, -2));
    expect(moved.transform).toMatchObject({ x: 20, y: 13, scaleX: 1, rotation: 0 });
    expect(shapeBounds(moved)).toEqual({ x: 15, y: 8, w: 10, h: 10 });
    setGeometryDoc(null);
  });
});
