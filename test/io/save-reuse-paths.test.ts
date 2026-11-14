// Autosave and versions copy a vector drawing's saved text when it is the same object as last time. So every way a
// point can change has to give the drawing a new object. Each path below saves, changes one point that way, saves
// again, and checks the file holds the new point (and matches a save that never reused anything).
import { describe, expect, it } from 'vitest';
import { applyPatches, produceWithPatches } from 'immer';
import { strFromU8, unzipSync } from 'fflate';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, StrokeShape } from '../../src/core/format';
import { Store, resetStore, store } from '../../src/core/store';
import { editActiveDrawing } from '../../src/tools/edit';
import { applyOps } from '../../src/plugins/ops';
import { saveFile } from '../../src/io/file';
import { makeVariation } from '../../src/artboards/variations';
import { activeId } from '../../src/artboards/model';
import { VectorStroke } from '../../src/tools/vectorStroke';

const NOW = new Date('2026-01-01T00:00:00Z');
const REUSE = { reuse: true };
const brush = { size: 4, thinning: 0, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
const stroke = (id: string, x: number): StrokeShape => ({ id, type: 'stroke', points: [{ x, y: 10, p: 0.5 }, { x: x + 10, y: 20, p: 0.5 }], brush: { ...brush }, color: '#ff0000', opacity: 1 });

function make(): Doc {
  const doc = newDoc({ width: 100, height: 50, length: 4 });
  doc.drawings = {};
  doc.layers[0].cels = [];
  for (let i = 0; i < 4; i++) {
    const d = { ...newVectorDrawing(), id: 'd' + i, shapes: [stroke('s' + i, 10 + i), stroke('t' + i, 30 + i)] };
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c' + i, start: i, length: 1, drawingId: d.id });
  }
  return doc;
}

const saved = (doc: Doc, reuse: boolean) => JSON.parse(strFromU8(unzipSync(saveFile(doc, 't', NOW, reuse ? REUSE : {}))['doc.json']));
const pointX = (doc: Doc, reuse = true) => saved(doc, reuse).drawings.d0.shapes[0].points[0].x;

/** Saves with reuse, runs `change` on the store, saves with reuse again: the file must show the new x, like a plain save. */
function check(change: (s: Store) => void, expectX: number, doc: Doc = make()) {
  const s = new Store(doc);
  expect(pointX(s.get().doc)).toBe(10);
  change(s);
  const now = s.get().doc;
  expect(pointX(now)).toBe(expectX);
  expect(pointX(now, false)).toBe(expectX);
  // The whole file is what a save with no reuse gives.
  expect(JSON.stringify(saved(now, true))).toBe(JSON.stringify(saved(now, false)));
  return s;
}

describe('a changed point reaches the next autosave', () => {
  it('through update()', () => {
    check((s) => s.update('Move', (d) => void ((d.drawings.d0 as any).shapes[0].points[0].x = 55)), 55);
  });
  it('through update() with a coalesce key, over and over', () => {
    check((s) => {
      for (const x of [20, 30, 40]) {
        s.update('Drag', (d) => void ((d.drawings.d0 as any).shapes[0].points[0].x = x), { coalesce: 'drag' });
        pointX(s.get().doc);
      }
    }, 40);
  });
  it('through undo and redo', () => {
    const s = check((st) => st.update('Move', (d) => void ((d.drawings.d0 as any).shapes[0].points[0].x = 55)), 55);
    s.undo();
    expect(pointX(s.get().doc)).toBe(10);
    s.redo();
    expect(pointX(s.get().doc)).toBe(55);
    s.undo();
    expect(pointX(s.get().doc)).toBe(10);
  });
  it('through applyPatches on the committed document', () => {
    check((s) => {
      const [, patches] = produceWithPatches(s.get().doc, (d) => void ((d.drawings.d0 as any).shapes[0].points[0].x = 66));
      s.load(applyPatches(s.get().doc, patches));
    }, 66);
  });
  it('through a tool edit of the active drawing', () => {
    const doc = make();
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
    expect(pointX(store().get().doc)).toBe(10);
    expect(editActiveDrawing('Move point', 'vector', (d) => void ((d.shapes[0] as any).points[0].x = 77))).toBe('ok');
    expect(pointX(store().get().doc)).toBe(77);
    expect(JSON.stringify(saved(store().get().doc, true))).toBe(JSON.stringify(saved(store().get().doc, false)));
  });
  it('through a freehand stroke added to a drawing that was saved', () => {
    const doc = make();
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
    expect(saved(store().get().doc, true).drawings.d0.shapes).toHaveLength(2);
    const st = new VectorStroke(brush, '#00ff00');
    const e = (x: number) => ({ x, y: 5, pressure: 0.5, hasPressure: false }) as any;
    st.add(e(1), 1);
    st.commit(e(40), 1, { hint: () => undefined } as any);
    const out = saved(store().get().doc, true);
    expect(out.drawings.d0.shapes).toHaveLength(3);
    expect(JSON.stringify(out)).toBe(JSON.stringify(saved(store().get().doc, false)));
  });
  it('through a plugin op', () => {
    check((s) => s.update('Plugin', (d) => applyOps(d, [{ op: 'transformDrawing', drawingId: 'd0', matrix: [1, 0, 0, 1, 5, 0] }])), 15);
    check((s) => s.update('Plugin', (d) => applyOps(d, [{ op: 'flipDrawing', drawingId: 'd0', axis: 'horizontal' }])), 90);
  });
  it('through a plugin style change', () => {
    const s = new Store(make());
    pointX(s.get().doc);
    s.update('Plugin', (d) => applyOps(d, [{ op: 'setShapeStyle', drawingId: 'd0', shapeId: 's0', color: '#00ff00' }]));
    expect(saved(s.get().doc, true).drawings.d0.shapes[0].color).toBe('#00ff00');
    s.update('Plugin', (d) => applyOps(d, [{ op: 'removeShape', drawingId: 'd0', shapeId: 's0' }]));
    expect(saved(s.get().doc, true).drawings.d0.shapes).toHaveLength(1);
  });
  it('through a document that is loaded in place of the old one', () => {
    const s = check((st) => st.load(((): Doc => { const d = make(); (d.drawings.d0 as any).shapes[0].points[0].x = 12; return d; })()), 12);
    expect(s.get().doc.drawings.d0).toBeDefined();
  });
  it('on the original of a variation, which follows the original', () => {
    const s = new Store(make());
    s.update('Variation', (d) => void makeVariation(d, activeId(d), { name: 'V' }));
    expect(pointX(s.get().doc)).toBe(10);
    s.update('Move', (d) => void ((d.drawings.d0 as any).shapes[0].points[0].x = 31));
    expect(pointX(s.get().doc)).toBe(31);
    expect(JSON.stringify(saved(s.get().doc, true))).toBe(JSON.stringify(saved(s.get().doc, false)));
  });
  it('and a write in place into a drawing that was saved throws instead of being lost', () => {
    const doc = make();
    expect(pointX(doc)).toBe(10);
    expect(() => ((doc.drawings.d0 as any).shapes[0].points[0].x = 5)).toThrow(TypeError);
    expect(() => (doc.drawings.d0 as any).shapes.push(stroke('z', 1))).toThrow(TypeError);
  });
});
