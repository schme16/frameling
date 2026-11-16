// The selection is remembered per artboard, like the frame and the layer: going back brings it back.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, Id, VectorLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { activeId, addArtboard, artboardsOf, ensureArtboards } from '../../src/artboards/model';
import { goToArtboard, installArtboards, resetArtboardView } from '../../src/artboards/ops';
import { setViewport } from '../../src/canvas/controller';

const shape = (id: string) => ({ id, type: 'path' as const, paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], fill: '#000', stroke: null, opacity: 1 });

/** Two artboards, each with a vector layer holding two shapes (a1, a2 and b1, b2). Returns their ids and layers. */
function twoBoards() {
  const doc: Doc = newDoc({ width: 100, height: 100, length: 4 });
  const la = doc.layers[0] as VectorLayer;
  const da = newVectorDrawing();
  da.shapes = [shape('a1'), shape('a2')];
  doc.drawings[da.id] = da;
  la.cels.push({ id: 'ca', start: 0, length: 4, drawingId: da.id });
  const idB = addArtboard(doc, { name: 'Other', width: 100, height: 100, length: 4 });
  const boards = ensureArtboards(doc);
  const db = newVectorDrawing();
  db.shapes = [shape('b1'), shape('b2')];
  doc.drawings[db.id] = db;
  const lb = boards.find((x) => x.id === idB)!.content!.layers[0] as VectorLayer;
  lb.cels.push({ id: 'cb', start: 0, length: 4, drawingId: db.id });
  resetArtboardView();
  resetStore(doc);
  installArtboards();
  setViewport({ w: 900, h: 600, dpr: 1 });
  const [a, b] = artboardsOf(store().get().doc);
  return { a: a.id, b: b.id, la: la.id, lb: lb.id, da: da.id, db: db.id };
}
const sel = (): Id[] => store().get().ui.selection;
const open = () => activeId(store().get().doc);

describe('the selection each artboard was left with', () => {
  let t: ReturnType<typeof twoBoards>;
  beforeEach(() => {
    t = twoBoards();
    store().setUi({ activeLayerId: t.la, frame: 0, selection: ['a1', 'a2'] });
  });

  it('comes back when you switch back', () => {
    goToArtboard(t.b);
    expect(open()).toBe(t.b);
    // Never visited: nothing selected, and nothing of the other artboard's.
    expect(sel()).toEqual([]);
    store().setUi({ selection: ['b2'] });
    goToArtboard(t.a);
    expect(sel()).toEqual(['a1', 'a2']);
    goToArtboard(t.b);
    expect(sel()).toEqual(['b2']);
  });

  it('only brings back shapes that are still there', () => {
    goToArtboard(t.b);
    // a2 is deleted from the first artboard while it is away.
    store().update('Remove', (d) => {
      d.drawings[t.da] = { ...(d.drawings[t.da] as ReturnType<typeof newVectorDrawing>), shapes: [shape('a1')] };
    });
    goToArtboard(t.a);
    expect(sel()).toEqual(['a1']);
  });

  it('is empty when every remembered shape is gone', () => {
    goToArtboard(t.b);
    store().update('Remove', (d) => {
      (d.drawings[t.da] as ReturnType<typeof newVectorDrawing>).shapes = [];
    });
    goToArtboard(t.a);
    expect(sel()).toEqual([]);
  });

  it('is restored when you go back to an artboard, and Undo does not walk the switches', () => {
    goToArtboard(t.b);
    store().setUi({ selection: ['b1'] });
    goToArtboard(t.a);
    expect(sel()).toEqual(['a1', 'a2']);
    goToArtboard(t.b);
    expect(sel()).toEqual(['b1']);
    goToArtboard(t.a);
    expect(sel()).toEqual(['a1', 'a2']);
    // Switching is a look: nothing here was an edit, so there is nothing to undo.
    expect(store().canUndo()).toBe(false);
  });

  it('never carries a shape id from one artboard to the other', () => {
    goToArtboard(t.b);
    expect(sel().some((id) => id.startsWith('a'))).toBe(false);
    goToArtboard(t.a);
    expect(sel().some((id) => id.startsWith('b'))).toBe(false);
  });

  it('is forgotten when another document opens', () => {
    goToArtboard(t.b);
    store().setUi({ selection: ['b1'] });
    const again = twoBoards();
    goToArtboard(again.b);
    expect(sel()).toEqual([]);
  });
});
