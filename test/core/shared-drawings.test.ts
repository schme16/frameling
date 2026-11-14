import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, newVectorLayer, celAt } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { placesOf, sharedDrawings, sharedWords } from '../../src/core/sharedDrawings';
import { addArtboard, artboardsOf } from '../../src/artboards/model';
import { makeOwnDrawing } from '../../src/timeline/edit-core';
import * as ops from '../../src/timeline/ops';
import { resetStore } from '../../src/core/store';
import { resetChoices, setChoice } from '../../src/core/choices';
import { editActiveDrawing } from '../../src/tools/edit';

/** One layer with a drawing held across four frames. */
function one(): { doc: Doc; id: string } {
  const doc = newDoc();
  const d = newVectorDrawing();
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 4, drawingId: d.id });
  return { doc, id: d.id };
}

describe('drawings shown in more than one place', () => {
  it('finds nothing in a file where every drawing is used once', () => {
    const { doc, id } = one();
    expect(sharedDrawings(doc).size).toBe(0);
    expect(placesOf(doc, id)).toBe(1);
  });

  it('counts a drawing used twice on one timeline', () => {
    const { doc, id } = one();
    doc.layers[0].cels.push({ id: 'c2', start: 6, length: 2, drawingId: id });
    expect(placesOf(doc, id)).toBe(2);
    expect(sharedDrawings(doc).get(id)).toMatchObject({ total: 2, here: 2, boards: [], symbols: 0 });
  });

  it('counts a drawing on two layers', () => {
    const { doc, id } = one();
    const l = newVectorLayer('Second');
    l.cels.push({ id: 'c9', start: 0, length: 2, drawingId: id });
    doc.layers.push(l);
    expect(placesOf(doc, id)).toBe(2);
  });

  it('counts a drawing shown on another artboard, and names it', () => {
    const { doc, id } = one();
    const b = addArtboard(doc, { name: 'Walk' });
    const board = artboardsOf(doc).find((a) => a.id === b)!;
    // The new artboard is not the open one, so its layers sit in `content`.
    expect(board.content).toBeTruthy();
    board.content!.layers[0].cels.push({ id: 'cw', start: 0, length: 3, drawingId: id });
    const use = sharedDrawings(doc).get(id)!;
    expect(use).toMatchObject({ total: 2, here: 1, boards: ['Walk'] });
    expect(sharedWords(use)).toBe('Shown in 2 places: here and on the artboard Walk.');
  });

  it('counts a drawing shown in a symbol', () => {
    const { doc, id } = one();
    doc.symbols = { s1: { id: 's1', name: 'Hero', length: 2, layers: [{ ...newVectorLayer('In'), cels: [{ id: 'cs', start: 0, length: 2, drawingId: id }] }] } as never };
    expect(sharedDrawings(doc).get(id)).toMatchObject({ total: 2, symbols: 1 });
    expect(sharedWords(sharedDrawings(doc).get(id))).toBe('Shown in 2 places: here and in a symbol.');
  });

  it("leaves a variation out: it follows its original on purpose", () => {
    const { doc, id } = one();
    const b = addArtboard(doc, { name: 'Alt' });
    const board = artboardsOf(doc).find((a) => a.id === b)!;
    board.content!.layers[0].cels.push({ id: 'cw', start: 0, length: 3, drawingId: id });
    board.variationOf = artboardsOf(doc)[0].id;
    expect(placesOf(doc, id)).toBe(1);
  });

  it('says nothing while a symbol is open for editing in place', () => {
    const { doc, id } = one();
    doc.layers[0].cels.push({ id: 'c2', start: 6, length: 2, drawingId: id });
    doc.editing = [{ symbolId: 's1', layers: [], length: 1, frame: 0, activeLayerId: null, matrix: [1, 0, 0, 1, 0, 0] }];
    expect(sharedDrawings(doc).size).toBe(0);
  });

  it('hands back the very same answer until something about sharing changes', () => {
    const { doc, id } = one();
    doc.layers[0].cels.push({ id: 'c2', start: 6, length: 2, drawingId: id });
    const first = sharedDrawings(doc);
    // A change to the layers that leaves the sharing as it was: a new array, the same story.
    const next = { ...doc, layers: doc.layers.map((l) => ({ ...l })) };
    expect(sharedDrawings(next)).toBe(first);
    // A real change gives a new answer.
    const moved = { ...doc, layers: doc.layers.map((l) => ({ ...l, cels: l.cels.slice(0, 1) })) };
    expect(sharedDrawings(moved).size).toBe(0);
  });

  it('writes the places in plain words', () => {
    expect(sharedWords(undefined)).toBeNull();
    expect(sharedWords({ total: 5, here: 2, boards: ['wave', 'talk'], symbols: 1 })).toBe('Shown in 5 places: 2 here, on the artboards wave and talk and in a symbol.');
  });
});

describe('make this drawing its own', () => {
  it('gives the cel a copy under a new id and leaves the others on the old one', () => {
    const { doc, id } = one();
    doc.layers[0].cels.push({ id: 'c2', start: 6, length: 2, drawingId: id });
    const copy = makeOwnDrawing(doc, doc.layers[0].id, 6)!;
    expect(copy).toBeTruthy();
    expect(copy).not.toBe(id);
    expect(celAt(doc.layers[0], 0)!.drawingId).toBe(id);
    expect(celAt(doc.layers[0], 6)!.drawingId).toBe(copy);
    expect(doc.drawings[copy]).toEqual(expect.objectContaining({ kind: 'vector' }));
    expect(placesOf(doc, id)).toBe(1);
  });

  it('does nothing on an empty frame', () => {
    const { doc } = one();
    expect(makeOwnDrawing(doc, doc.layers[0].id, 9)).toBeNull();
  });

  it('copies the shapes, not the same array', () => {
    const { doc, id } = one();
    const src = doc.drawings[id];
    if (src.kind === 'vector') src.shapes.push({ id: 's1', type: 'fill', paths: [], color: '#000', opacity: 1 } as never);
    doc.layers[0].cels.push({ id: 'c2', start: 6, length: 2, drawingId: id });
    const copy = makeOwnDrawing(doc, doc.layers[0].id, 6)!;
    const c = doc.drawings[copy];
    expect(c.kind === 'vector' && c.shapes.length).toBe(1);
    if (c.kind === 'vector' && src.kind === 'vector') expect(c.shapes).not.toBe(src.shapes);
  });

  it('is one undo step, and says so when the drawing was not shared', () => {
    const { doc, id } = one();
    const s = resetStore(doc);
    s.setUi({ frame: 0, activeLayerId: doc.layers[0].id });
    expect(ops.makeOwnDrawing()).toMatchObject({ ok: false, reason: 'not-shared' });
    expect(ops.whyNot({ ok: false, reason: 'not-shared' })).toMatch(/already its own/);
    s.update('share', (d) => void d.layers[0].cels.push({ id: 'c2', start: 6, length: 2, drawingId: id }));
    s.setUi({ frame: 6 });
    expect(ops.makeOwnDrawing()).toMatchObject({ ok: true });
    expect(placesOf(s.get().doc, id)).toBe(1);
    s.undo();
    expect(placesOf(s.get().doc, id)).toBe(2);
  });
});

describe('drawing on a shared drawing', () => {
  const add = (dr: { shapes: unknown[] }) => void dr.shapes.push({ id: 's', type: 'fill', paths: [], color: '#000', opacity: 1 });
  const setup = () => {
    const { doc, id } = one();
    doc.layers[0].cels.push({ id: 'c2', start: 6, length: 2, drawingId: id });
    doc.length = 8;
    const s = resetStore(doc);
    s.setUi({ frame: 6, activeLayerId: doc.layers[0].id });
    return { s, id };
  };
  const shapes = (s: ReturnType<typeof resetStore>, id: string) => {
    const d = s.get().doc.drawings[id];
    return d.kind === 'vector' ? d.shapes.length : -1;
  };
  beforeEach(() => resetChoices());

  it('changes it everywhere when that is the answer (and by default, as it always has)', () => {
    const { s, id } = setup();
    editActiveDrawing('Draw', 'vector', add as never);
    expect(shapes(s, id)).toBe(1);
    expect(placesOf(s.get().doc, id)).toBe(2);
  });

  it('gives this place a copy of its own when that is the answer, and the others stay as they were', () => {
    setChoice('draw.sharedDrawing', 'own');
    const { s, id } = setup();
    editActiveDrawing('Draw', 'vector', add as never);
    expect(shapes(s, id)).toBe(0);
    const l = s.get().doc.layers[0];
    const mine = celAt(l, 6)!.drawingId;
    expect(mine).not.toBe(id);
    expect(shapes(s, mine)).toBe(1);
    expect(celAt(l, 0)!.drawingId).toBe(id);
    // One undo step puts it all back.
    s.undo();
    expect(celAt(s.get().doc.layers[0], 6)!.drawingId).toBe(id);
    expect(shapes(s, id)).toBe(0);
  });

  it('asks nothing about a drawing that is only shown once', () => {
    setChoice('draw.sharedDrawing', 'own');
    const { doc, id } = one();
    const s = resetStore(doc);
    s.setUi({ frame: 0, activeLayerId: doc.layers[0].id });
    editActiveDrawing('Draw', 'vector', add as never);
    expect(celAt(s.get().doc.layers[0], 0)!.drawingId).toBe(id);
    expect(shapes(s, id)).toBe(1);
  });
});
