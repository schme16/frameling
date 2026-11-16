// Pins what sharedDrawings answers across a run of edits, against a plain walk of the whole document (the way it was
// first written). The answer must stay the same however the work is done underneath.
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Cel, Doc, Id, Layer } from '../../src/core/format';
import { sharedDrawings, type DrawingUse } from '../../src/core/sharedDrawings';

/** The plain whole-document walk. */
function walk(doc: Doc): Record<Id, DrawingUse> {
  const m = new Map<Id, DrawingUse>();
  const bump = (id: Id, where: 'here' | 'symbols' | { board: string }): void => {
    let u = m.get(id);
    if (!u) m.set(id, (u = { total: 0, here: 0, boards: [], symbols: 0 }));
    u.total++;
    if (where === 'here') u.here++;
    else if (where === 'symbols') u.symbols++;
    else if (!u.boards.includes(where.board)) u.boards.push(where.board);
  };
  const layers = (ls: readonly Layer[] | undefined, w: 'here' | 'symbols' | { board: string }): void => {
    for (const l of ls ?? []) for (const c of l.cels) bump(c.drawingId, w);
  };
  if (!doc.editing?.length) {
    layers(doc.layers, 'here');
    for (const s of Object.values(doc.symbols ?? {})) layers(s.layers, 'symbols');
    for (const a of doc.artboards ?? []) {
      if (a.variationOf || !a.content) continue;
      layers(a.content.layers, { board: a.name });
      for (const list of Object.values(a.content.cels ?? {})) for (const c of list) bump(c.drawingId, { board: a.name });
    }
  }
  return Object.fromEntries([...m].filter(([, u]) => u.total >= 2));
}

const asObject = (doc: Doc): Record<Id, DrawingUse> => Object.fromEntries(sharedDrawings(doc));

const cel = (id: string, drawingId: string, start = 0): Cel => ({ id, start, length: 1, drawingId });
const layer = (name: string, cels: Cel[]): Layer => ({ ...newVectorLayer(name), cels });

/** A document with ten layers of two cels each, nothing shared. */
function base(): Doc {
  const doc = newDoc();
  doc.layers = Array.from({ length: 10 }, (_, i) => layer(`L${i}`, [cel(`a${i}`, `d${i}a`, 0), cel(`b${i}`, `d${i}b`, 1)]));
  return doc;
}

/** An edit the way the store makes one: a new layers array, with only the touched layer replaced. */
const withLayer = (doc: Doc, at: number, cels: Cel[]): Doc => ({ ...doc, layers: doc.layers.map((l, i) => (i === at ? { ...l, cels } : l)) });

describe('sharedDrawings across a run of edits', () => {
  it('agrees with a whole walk after every step of a mixed run', () => {
    let doc = base();
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).size).toBe(0);

    // Two layers come to show the same drawing.
    doc = withLayer(doc, 3, [cel('a3', 'd0a'), cel('b3', 'd3b', 1)]);
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).get('d0a')).toMatchObject({ total: 2, here: 2 });

    // A third, in the same layer as the first.
    doc = withLayer(doc, 0, [cel('a0', 'd0a'), cel('b0', 'd0a', 1), cel('c0', 'd0b', 2)]);
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).get('d0a')).toMatchObject({ total: 3, here: 3 });

    // The sharing goes away again, one layer at a time.
    doc = withLayer(doc, 3, [cel('a3', 'd3a'), cel('b3', 'd3b', 1)]);
    expect(asObject(doc)).toEqual(walk(doc));
    doc = withLayer(doc, 0, [cel('a0', 'd0a'), cel('b0', 'd0b', 1)]);
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).size).toBe(0);

    // A layer added, a layer removed, layers reordered.
    doc = { ...doc, layers: [...doc.layers, layer('New', [cel('n', 'd5a')])] };
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).get('d5a')).toMatchObject({ total: 2 });
    doc = { ...doc, layers: doc.layers.slice().reverse() };
    expect(asObject(doc)).toEqual(walk(doc));
    doc = { ...doc, layers: doc.layers.filter((l) => l.name !== 'L5') };
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).size).toBe(0);
  });

  it('keeps symbols and other artboards in the count while the layers change', () => {
    let doc = base();
    doc.symbols = { s1: { id: 's1', name: 'Hero', length: 2, origin: { x: 0, y: 0 }, layers: [layer('In', [cel('sc', 'd2a')])] } };
    doc.artboards = [
      { id: 'ab1', name: 'Open', x: 0, y: 0 },
      { id: 'ab2', name: 'Walk', x: 0, y: 0, content: { width: 1, height: 1, background: null, length: 1, layers: [layer('W', [cel('w1', 'd2a'), cel('w2', 'd2a', 1), cel('w3', 'd4b', 2)])], clips: [], markers: [] } },
      { id: 'ab3', name: 'Alt', x: 0, y: 0, variationOf: 'ab1', content: { width: 1, height: 1, background: null, length: 1, layers: [layer('A', [cel('x1', 'd9a')])], clips: [], markers: [] } },
    ] as Doc['artboards'];
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).get('d2a')).toEqual({ total: 4, here: 1, boards: ['Walk'], symbols: 1 });
    // d4b is on the open board once and on Walk once; d9a is only in a variation, so it is left out.
    expect(sharedDrawings(doc).get('d4b')).toEqual({ total: 2, here: 1, boards: ['Walk'], symbols: 0 });
    expect(sharedDrawings(doc).has('d9a')).toBe(false);

    // Editing the open layers must keep what the symbol and the artboard say.
    doc = withLayer(doc, 2, [cel('a2', 'd2a'), cel('b2', 'd2b', 1)]);
    expect(asObject(doc)).toEqual(walk(doc));
    doc = withLayer(doc, 2, [cel('a2', 'd7a'), cel('b2', 'd2b', 1)]);
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).get('d2a')).toEqual({ total: 3, here: 0, boards: ['Walk'], symbols: 1 });
    doc = withLayer(doc, 4, [cel('a4', 'd4a')]);
    expect(asObject(doc)).toEqual(walk(doc));

    // A symbol or artboard change shows up too.
    doc = { ...doc, symbols: {} };
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).get('d2a')).toMatchObject({ total: 2, symbols: 0 });
  });

  it('goes quiet while a symbol is open, and comes back with the right answer when it closes', () => {
    let doc = withLayer(base(), 1, [cel('a1', 'd0a'), cel('b1', 'd1b', 1)]);
    expect(sharedDrawings(doc).size).toBe(1);
    const editing = [{ symbolId: 's1', layers: [], length: 1, frame: 0, activeLayerId: null, matrix: [1, 0, 0, 1, 0, 0] }] as unknown as Doc['editing'];
    const open = { ...doc, editing };
    expect(sharedDrawings(open).size).toBe(0);
    // An edit to the layers while it is open, then it closes.
    const editedOpen = withLayer(open, 6, [cel('a6', 'd1b')]);
    expect(sharedDrawings(editedOpen).size).toBe(0);
    doc = { ...editedOpen, editing: undefined };
    expect(asObject(doc)).toEqual(walk(doc));
    expect(sharedDrawings(doc).get('d1b')).toMatchObject({ total: 2 });
  });

  it('answers the same for a copy of the layers whose cels are the same', () => {
    const doc = withLayer(base(), 2, [cel('a2', 'd0a'), cel('b2', 'd2b', 1)]);
    const first = sharedDrawings(doc);
    const copy = { ...doc, layers: doc.layers.map((l) => ({ ...l })) };
    expect(sharedDrawings(copy)).toBe(first);
    const undone = { ...doc, layers: doc.layers.map((l, i) => (i === 2 ? { ...l, cels: [cel('a2', 'd2a'), cel('b2', 'd2b', 1)] } : l)) };
    expect(sharedDrawings(undone).size).toBe(0);
    // ...and redo brings it back, as a fresh answer that says the same thing.
    expect(asObject({ ...undone, layers: doc.layers })).toEqual(asObject(doc));
  });

  it('is right when a cel changes inside a layer that kept its object', () => {
    // Undo and redo can swap a layer's cels array for an older one: the layer is a new object, the drawings are the same.
    const doc = withLayer(base(), 5, [cel('a5', 'd1a'), cel('b5', 'd5b', 1)]);
    expect(sharedDrawings(doc).get('d1a')).toMatchObject({ total: 2 });
    const swapped = withLayer(doc, 1, [cel('a1', 'd5b'), cel('b1', 'd1b', 1)]);
    expect(asObject(swapped)).toEqual(walk(swapped));
    expect(sharedDrawings(swapped).has('d1a')).toBe(false);
    expect(sharedDrawings(swapped).get('d5b')).toMatchObject({ total: 2 });
  });
});
