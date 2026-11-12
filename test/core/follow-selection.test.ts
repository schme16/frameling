import { describe, expect, it } from 'vitest';
import type { Doc, InstanceShape, PathShape, Shape, StrokeShape, VectorDrawing } from '../../src/core/format';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { existingSelection, followSelection, resolveFollowed, shapeLineage } from '../../src/core/followSelection';
import { switchArtboard } from '../../src/artboards/model';
import { cloneShape } from '../../src/canvas/geometry';
import { cloneDrawing } from '../../src/timeline/edit-core';
import { loadFile, saveFile } from '../../src/io/file';
import { upgradeLineage } from '../../src/core/upgradeLineage';
import { newTextShape } from '../../src/text/model';
import { TEMPLATES } from '../../src/templates';
import { drawingsDiffer } from '../../src/quests/predicates';

const box = (id: string, x = 0): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y: 0 }, { x: x + 5, y: 0 }, { x: x + 5, y: 5 }] }], fill: '#f00', stroke: null, opacity: 1 });
const line = (id: string): StrokeShape => ({ id, type: 'stroke', points: [{ x: 0, y: 0, p: 0.5 }, { x: 9, y: 9, p: 0.5 }], brush: { size: 4, thinning: 0, smoothing: 0, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: '#000', opacity: 1 });
const inst = (id: string): InstanceShape => ({ id, type: 'instance', symbolId: 'sym', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 });

/** Puts drawings on the first layer, one key of 5 frames each. */
function build(drawings: VectorDrawing[], old = false): Doc {
  const doc = newDoc({ width: 100, height: 100, length: drawings.length * 5 });
  // A document from before lineage existed has no flag.
  if (old) delete doc.lineage;
  drawings.forEach((d, i) => {
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: `k${i}`, start: i * 5, length: 5, drawingId: d.id });
  });
  return doc;
}
const drawing = (shapes: Shape[]): VectorDrawing => ({ ...newVectorDrawing(), shapes });
const layerId = (d: Doc) => d.layers[0].id;

describe('lineage: where a shape was copied from', () => {
  it('cloneDrawing gives new ids but remembers the first shape, through later copies', () => {
    const a = drawing([box('x'), line('y')]);
    const b = cloneDrawing(a) as VectorDrawing;
    const c = cloneDrawing(b) as VectorDrawing;
    expect(b.shapes.map((s) => s.id)).not.toContain('x');
    expect(b.shapes.map((s) => s.origin)).toEqual(['x', 'y']);
    expect(c.shapes.map((s) => s.origin)).toEqual(['x', 'y']);
    expect(c.shapes.map((s) => shapeLineage(s))).toEqual(['x', 'y']);
    // The source is left alone.
    expect(a.shapes.map((s) => s.origin)).toEqual([undefined, undefined]);
  });

  it('a copy still looks the same as its source (ids and lineage do not count)', () => {
    const a = drawing([box('x')]);
    expect(drawingsDiffer(a, cloneDrawing(a))).toBe(false);
  });

  it('a copy under a new id (Paste, Duplicate) is a shape of its own', () => {
    const c = cloneDrawing(drawing([box('x')])) as VectorDrawing;
    expect(cloneShape(c.shapes[0], 'new').origin).toBeUndefined();
    expect(cloneShape(c.shapes[0], c.shapes[0].id).origin).toBe('x');
  });
});

describe('following the selection from key to key', () => {
  it('finds the same shape even when shapes were added or removed before it', () => {
    const a = drawing([box('a1'), box('a2'), line('a3')]);
    const b = cloneDrawing(a) as VectorDrawing;
    b.shapes.shift(); // the first shape is gone from this key
    b.shapes.unshift(box('fresh'), box('fresh2'));
    const doc = build([a, b]);
    const r = followSelection(doc, layerId(doc), ['a3'], 0, 5);
    expect(r?.selection).toEqual([b.shapes[3].id]);
    expect(b.shapes[3].origin).toBe('a3');
  });

  it('follows every kind: strokes, paths, symbol instances and text', () => {
    const a = drawing([box('p'), line('s'), inst('i'), newTextShape('t', { x: 1, y: 2 }, { text: 'Hi' })]);
    const b = cloneDrawing(a) as VectorDrawing;
    const doc = build([a, b]);
    const r = followSelection(doc, layerId(doc), ['p', 's', 'i', 't'], 0, 5);
    expect(r?.selection).toEqual(b.shapes.map((s) => s.id));
  });

  it('keeps going over three keys, and back again', () => {
    const a = drawing([box('p'), line('s')]);
    const b = cloneDrawing(a) as VectorDrawing;
    const c = cloneDrawing(b) as VectorDrawing;
    const doc = build([a, b, c]);
    const ab = followSelection(doc, layerId(doc), ['s'], 0, 5)!;
    const bc = followSelection(doc, layerId(doc), ab.selection, 5, 10, ab.memory)!;
    expect(bc.selection).toEqual([c.shapes[1].id]);
    expect(followSelection(doc, layerId(doc), bc.selection, 10, 0, bc.memory)?.selection).toEqual(['s']);
  });

  it('drops shapes the new key has no copy of, and brings them back on return', () => {
    const a = drawing([box('p'), line('s')]);
    const b = cloneDrawing(a) as VectorDrawing;
    b.shapes.shift();
    const c = drawing([box('other')]);
    const doc = build([a, b, c]);
    const one = followSelection(doc, layerId(doc), ['p', 's'], 0, 5)!;
    expect(one.selection).toEqual([b.shapes[0].id]);
    // A key that has none of them: nothing selected there.
    const two = followSelection(doc, layerId(doc), one.selection, 5, 10, one.memory)!;
    expect(two.selection).toEqual([]);
    // Back at the first key all of them are selected again.
    const back = followSelection(doc, layerId(doc), two.selection, 10, 0, two.memory)!;
    expect(back.selection).toEqual(['p', 's']);
  });

  it('a selection made by the user after a follow is not mixed up with the old memory', () => {
    const a = drawing([box('p'), line('s')]);
    const b = cloneDrawing(a) as VectorDrawing;
    const doc = build([a, b]);
    const r = followSelection(doc, layerId(doc), ['p', 's'], 0, 5)!;
    // The user picks one shape in the second key.
    const picked = [b.shapes[0].id];
    expect(followSelection(doc, layerId(doc), picked, 5, 0, r.memory)?.selection).toEqual(['p']);
  });

  it('leaves the selection alone inside one key, and when nothing is selected', () => {
    const a = drawing([box('p')]);
    const doc = build([a, cloneDrawing(a) as VectorDrawing]);
    expect(followSelection(doc, layerId(doc), ['p'], 0, 3)).toBeNull();
    expect(followSelection(doc, layerId(doc), [], 0, 5)).toBeNull();
    expect(followSelection(doc, 'nope', ['p'], 0, 5)).not.toBeUndefined();
  });

  it('old documents (no lineage): the shape at the same place, when the keys look alike', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1'), line('b2')]);
    const doc = build([a, b], true);
    expect(followSelection(doc, layerId(doc), ['a2'], 0, 5)?.selection).toEqual(['b2']);
    // Different kind at that place, or a different number of shapes: no guess.
    const c = drawing([line('c1'), box('c2')]);
    const d = drawing([box('d1')]);
    const doc2 = build([a, c, d], true);
    expect(followSelection(doc2, layerId(doc2), ['a2'], 0, 5)?.selection).toEqual([]);
    expect(followSelection(doc2, layerId(doc2), ['a2'], 0, 10)?.selection).toEqual([]);
  });

  it('lineage wins over position, and a key with lineage never falls back to position', () => {
    const a = drawing([box('a1'), box('a2')]);
    const b = cloneDrawing(a) as VectorDrawing;
    b.shapes.reverse();
    const doc = build([a, b]);
    expect(followSelection(doc, layerId(doc), ['a1'], 0, 5)?.selection).toEqual([b.shapes[1].id]);
    expect(resolveFollowed(b, [{ lineage: 'gone', at: 0, type: 'path', legacy: true, of: 2 }])).toEqual([]);
  });

  it('shapes that share a lineage are matched one by one, not all to the first', () => {
    const a = drawing([box('x'), { ...box('y'), origin: 'x' }]);
    const b = cloneDrawing(a) as VectorDrawing;
    const doc = build([a, b]);
    expect(followSelection(doc, layerId(doc), ['y'], 0, 5)?.selection).toEqual([b.shapes[0].id]);
    const both = followSelection(doc, layerId(doc), ['x', 'y'], 0, 5)?.selection;
    expect(both).toEqual([b.shapes[0].id, b.shapes[1].id]);
  });
});

describe('new documents never match unrelated keys by position', () => {
  it('newDoc carries the lineage flag, so two keys that merely look alike are not the same shapes', () => {
    expect(newDoc().lineage).toBe(true);
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1'), line('b2')]);
    const doc = build([a, b]);
    expect(followSelection(doc, layerId(doc), ['a2'], 0, 5)?.selection).toEqual([]);
    // The same keys in a document without the flag still match by place.
    expect(followSelection(build([a, b], true), layerId(doc), ['a2'], 0, 5)?.selection).toEqual(['b2']);
  });

  it('the flag is saved and read back; an old file is upgraded when it opens', () => {
    const doc = build([drawing([box('p')])]);
    expect(loadFile(saveFile(doc, '1.0.0')).doc.lineage).toBe(true);
    const old = build([drawing([box('p')])], true);
    expect(loadFile(saveFile(old, '1.0.0')).doc.lineage).toBe(true);
    // Junk is not a flag, so that file counts as old too.
    const junk = { ...doc, lineage: 'yes' as unknown as true };
    expect(loadFile(saveFile(junk, '1.0.0')).doc.lineage).toBe(true);
  });

  it('every template builds a document with the flag', () => {
    for (const t of TEMPLATES) expect(t.make().lineage, t.id).toBe(true);
  });
});

describe('old documents: a jump over several keys', () => {
  it('walks through the keys in between, so an old key reaches a newer clone directly', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1'), line('b2')]); // old key with no lineage
    const c = cloneDrawing(b) as VectorDrawing; // made later: origin points at b's shapes
    const doc = build([a, b, c], true);
    // Direct: a's lineage is a1/a2, c's is b1/b2, so nothing matches without the stops in between.
    expect(followSelection(doc, layerId(doc), ['a2'], 0, 10)?.selection).toEqual([c.shapes[1].id]);
    expect(followSelection(doc, layerId(doc), ['a1', 'a2'], 0, 10)?.selection).toEqual([c.shapes[0].id, c.shapes[1].id]);
    // And back the other way.
    expect(followSelection(doc, layerId(doc), [c.shapes[1].id], 10, 0)?.selection).toEqual(['a2']);
  });

  it('does not guess when an in-between key lost the shape', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1')]);
    const c = cloneDrawing(b) as VectorDrawing;
    const doc = build([a, b, c], true);
    expect(followSelection(doc, layerId(doc), ['a2'], 0, 10)?.selection).toEqual([]);
  });

  it('a document with the flag does not walk (lineage is complete)', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1'), line('b2')]);
    const c = cloneDrawing(b) as VectorDrawing;
    const doc = build([a, b, c]);
    expect(followSelection(doc, layerId(doc), ['a2'], 0, 10)?.selection).toEqual([]);
  });
});

describe('looking the same ignores lineage', () => {
  it('a drawing differs from its copy only when something real changed', () => {
    const a = drawing([box('x'), line('y')]);
    const b = cloneDrawing(a) as VectorDrawing;
    const c = cloneDrawing(b) as VectorDrawing;
    expect(drawingsDiffer(a, c)).toBe(false);
    (c.shapes[0] as PathShape).fill = '#0f0';
    expect(drawingsDiffer(a, c)).toBe(true);
  });
});

describe('the store keeps the selection on the same shapes while the playhead moves', () => {
  function setup() {
    const a = drawing([box('p'), line('s')]);
    const b = cloneDrawing(a) as VectorDrawing;
    b.shapes.shift();
    const doc = build([a, b]);
    resetStore(doc);
    store().setUi({ activeLayerId: layerId(doc), frame: 1, selection: ['p', 's'] });
    return { a, b };
  }

  it('follows into the next key, drops what is missing there, and gets it back', () => {
    const { b } = setup();
    store().setUi({ frame: 6 });
    expect(store().get().ui.selection).toEqual([b.shapes[0].id]);
    store().setUi({ frame: 2 });
    expect(store().get().ui.selection).toEqual(['p', 's']);
  });

  it('a selection made in between starts fresh', () => {
    const { b } = setup();
    store().setUi({ frame: 6 });
    store().setUi({ selection: [b.shapes[0].id] });
    store().setUi({ frame: 0 });
    expect(store().get().ui.selection).toEqual(['s']);
  });
});

describe('the follow memory belongs to one document', () => {
  const memory = () => (store() as unknown as { follow: unknown }).follow;
  function holding() {
    const a = drawing([box('p'), line('s')]);
    const b = cloneDrawing(a) as VectorDrawing;
    b.shapes.shift();
    const doc = build([a, b]);
    resetStore(doc);
    store().setUi({ activeLayerId: layerId(doc), frame: 1, selection: ['p', 's'] });
    store().setUi({ frame: 6 });
    expect(memory()).not.toBeNull();
    return doc;
  }

  it('is reset when a document is loaded', () => {
    holding();
    store().load(newDoc());
    expect(memory()).toBeNull();
  });

  it('is reset while a nested document is open, and given back when it closes', () => {
    const doc = holding();
    const mem = memory();
    store().enterNested(newDoc(), { tag: 'tile:1', merge: (parent) => parent });
    expect(memory()).toBeNull();
    store().exitNested();
    expect(memory()).toBe(mem);
    expect(store().get().doc).toBe(doc);
    // The shape that was missing in the second key still comes back.
    store().setUi({ frame: 2 });
    expect(store().get().ui.selection).toEqual(['p', 's']);
  });
});

describe('Undo and Redo keep the selection where the shapes still exist', () => {
  it('existingSelection keeps only shapes on the active key', () => {
    const a = drawing([box('p'), line('s')]);
    const doc = build([a]);
    expect(existingSelection(doc, layerId(doc), 0, ['p', 'gone', 's'])).toEqual(['p', 's']);
    expect(existingSelection(doc, layerId(doc), 0, ['gone'])).toEqual([]);
    expect(existingSelection(doc, layerId(doc), 12, ['p'])).toEqual([]);
  });

  it('keeps a selection that spans layers, on each layer\'s key at the playhead', () => {
    const a = drawing([box('p')]);
    const doc = build([a]);
    const other = drawing([box('q')]);
    doc.drawings[other.id] = other;
    doc.layers.push({ ...doc.layers[0], id: 'L2', cels: [{ id: 'o0', start: 0, length: 5, drawingId: other.id }] });
    expect(existingSelection(doc, layerId(doc), 0, ['p', 'q', 'gone'])).toEqual(['p', 'q']);
    // A key on the other layer that is not at the playhead does not count.
    doc.layers[1].cels[0].start = 3;
    expect(existingSelection(doc, layerId(doc), 0, ['p', 'q'])).toEqual(['p']);
  });

  it('after Undo or Redo of an artboard switch, keeps what exists in the artboard now open', () => {
    const doc = build([drawing([box('p')])]);
    doc.artboards = [{ id: 'ab1', name: 'One', x: 0, y: 0 }, { id: 'ab2', name: 'Two', x: 400, y: 0 }];
    doc.activeArtboard = 'ab1';
    const d2 = drawing([box('r')]);
    const l2 = { ...doc.layers[0], id: 'L9', cels: [{ id: 'o0', start: 0, length: 5, drawingId: d2.id }] };
    doc.drawings[d2.id] = d2;
    doc.artboards[1].content = { width: 100, height: 100, length: 5, background: null, layers: [l2], clips: [], markers: [] } as never;
    resetStore(doc);
    store().setUi({ activeLayerId: layerId(doc), frame: 0, selection: ['p'] });
    store().update('Open artboard', (d) => void switchArtboard(d, 'ab2'));
    // The selection ids are not on the open artboard now.
    expect(store().get().doc.activeArtboard).toBe('ab2');
    store().undo();
    expect(store().get().doc.activeArtboard).toBe('ab1');
    expect(store().get().ui.selection).toEqual(['p']);
    store().redo();
    expect(store().get().doc.activeArtboard).toBe('ab2');
    expect(store().get().ui.selection).toEqual([]);
    store().undo();
    expect(store().get().ui.selection).toEqual([]);
  });

  it('keeps the selection after undoing a move, and clears it after undoing the add', () => {
    const a = drawing([box('p')]);
    const doc = build([a]);
    resetStore(doc);
    store().setUi({ activeLayerId: layerId(doc), frame: 0 });
    store().update('Move', (d) => void ((d.drawings[a.id] as VectorDrawing).shapes[0] as PathShape).paths[0].points.push({ x: 1, y: 1 }));
    store().update('Add', (d) => void (d.drawings[a.id] as VectorDrawing).shapes.push(box('q')));
    store().setUi({ selection: ['p', 'q'] });
    store().undo();
    expect(store().get().ui.selection).toEqual(['p']);
    store().undo();
    expect(store().get().ui.selection).toEqual(['p']);
    store().redo();
    expect(store().get().ui.selection).toEqual(['p']);
    store().redo();
    store().setUi({ selection: ['q'] });
    store().redo();
    expect(store().get().ui.selection).toEqual(['q']);
  });
});

describe('the file keeps lineage', () => {
  it('round-trips origin on every kind of shape and drops a bad one', () => {
    const a = drawing([box('p'), line('s'), inst('i'), newTextShape('t', { x: 1, y: 2 }, { text: 'Hi' })]);
    const b = cloneDrawing(a) as VectorDrawing;
    const doc = build([a, b]);
    const { doc: back, warnings } = loadFile(saveFile(doc, '1.0.0'));
    expect(warnings).toEqual([]);
    expect((back.drawings[b.id] as VectorDrawing).shapes.map((s) => s.origin)).toEqual(['p', 's', 'i', 't']);
    expect((back.drawings[a.id] as VectorDrawing).shapes.map((s) => s.origin)).toEqual([undefined, undefined, undefined, undefined]);
    expect(back).toEqual(doc);
    // Junk is dropped; the shape is still read.
    // A drawing is never changed in place once it has been saved (saving keeps its text), so this is a new one.
    const b2: VectorDrawing = { ...b, shapes: b.shapes.map((s) => ({ ...s })) };
    (b2.shapes[0] as unknown as { origin: unknown }).origin = 7;
    (b2.shapes[2] as unknown as { origin: unknown }).origin = '';
    const bad = loadFile(saveFile({ ...doc, drawings: { ...doc.drawings, [b.id]: b2 } }, '1.0.0')).doc.drawings[b.id] as VectorDrawing;
    expect(bad.shapes).toHaveLength(4);
    expect(bad.shapes.map((s) => s.origin)).toEqual([undefined, 's', undefined, 't']);
  });
});

describe('old files are upgraded when they open', () => {
  const reopen = (doc: Doc) => loadFile(saveFile(doc, '1.0.0')).doc;
  const shapesOf = (doc: Doc, d: VectorDrawing) => (doc.drawings[d.id] as VectorDrawing).shapes;

  it('keys that look alike are linked, the first key stays the root, and the flag is set', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1'), line('b2')]);
    const c = drawing([box('c1'), line('c2')]);
    const back = reopen(build([a, b, c], true));
    expect(back.lineage).toBe(true);
    expect(shapesOf(back, a).map((s) => s.origin)).toEqual([undefined, undefined]);
    expect(shapesOf(back, b).map((s) => s.origin)).toEqual(['a1', 'a2']);
    // Every later key points at the root, not at the key before.
    expect(shapesOf(back, c).map((s) => s.origin)).toEqual(['a1', 'a2']);
    // The selection follows, over one key and over two.
    expect(followSelection(back, layerId(back), ['a2'], 0, 5)?.selection).toEqual(['b2']);
    expect(followSelection(back, layerId(back), ['a2'], 0, 10)?.selection).toEqual(['c2']);
  });

  it('behaves like position matching did: other counts or kinds stay separate roots', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([line('b1'), box('b2')]); // kinds differ at both places
    const c = drawing([line('c1'), box('c2')]);
    const d = drawing([box('d1')]); // fewer shapes
    const back = reopen(build([a, b, c, d], true));
    expect(shapesOf(back, b).map((s) => s.origin)).toEqual([undefined, undefined]);
    expect(shapesOf(back, c).map((s) => s.origin)).toEqual(['b1', 'b2']);
    expect(shapesOf(back, d).map((s) => s.origin)).toEqual([undefined]);
    expect(followSelection(back, layerId(back), ['a2'], 0, 5)?.selection).toEqual([]);
  });

  it('a mixed file: later keys that already have lineage join the upgraded line', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1'), line('b2')]);
    const c = cloneDrawing(b) as VectorDrawing; // origin points at b's own ids
    const back = reopen(build([a, b, c], true));
    expect(shapesOf(back, c).map((s) => s.origin)).toEqual(['a1', 'a2']);
    expect(followSelection(back, layerId(back), ['a2'], 0, 10)?.selection).toEqual([shapesOf(back, c)[1].id]);
  });

  it('does not change what is drawn or saved apart from origin and the flag', () => {
    const a = drawing([box('a1'), line('a2')]);
    const b = drawing([box('b1'), line('b2')]);
    const doc = build([a, b], true);
    const strip = (d: Doc) => JSON.parse(JSON.stringify(d, (k, v) => (k === 'origin' && typeof v === 'string' ? undefined : k === 'lineage' ? undefined : v)));
    const back = reopen(doc);
    expect(strip(back)).toEqual(strip(doc));
    expect(drawingsDiffer(a, shapesOf(back, b) ? (back.drawings[b.id] as VectorDrawing) : b)).toBe(drawingsDiffer(a, b));
  });

  it('holds and repeated drawings are not linked to themselves; a document with the flag is untouched', () => {
    const a = drawing([box('a1')]);
    const doc = build([a], true);
    doc.layers[0].cels.push({ id: 'hold', start: 5, length: 5, drawingId: a.id });
    expect(shapesOf(reopen(doc), a)[0].origin).toBeUndefined();
    const flagged = build([drawing([box('x1')]), drawing([box('y1')])]);
    const before = JSON.stringify(flagged);
    upgradeLineage(flagged);
    expect(JSON.stringify(flagged)).toBe(before);
  });

  it('symbols and other artboards are upgraded too, and opening makes no undo step', () => {
    const a = drawing([box('a1')]);
    const b = drawing([box('b1')]);
    const doc = build([drawing([box('z')])], true);
    doc.drawings[a.id] = a;
    doc.drawings[b.id] = b;
    doc.symbols = { sym: { id: 'sym', name: 'S', length: 10, origin: { x: 0, y: 0 }, layers: [{ ...doc.layers[0], id: 'sl', cels: [{ id: 's0', start: 0, length: 5, drawingId: a.id }, { id: 's1', start: 5, length: 5, drawingId: b.id }] }] } };
    const back = reopen(doc);
    expect(back.lineage).toBe(true);
    expect(shapesOf(back, b)[0].origin).toBe('a1');
    // Loading it into the store makes no undo step, and the file is not marked changed.
    store().load(back, null);
    expect(store().canUndo()).toBe(false);
    expect(store().get().ui.dirty).toBe(false);
  });
});
