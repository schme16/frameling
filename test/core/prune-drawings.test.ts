// pruneDrawings reads an immer draft without a proxy per cel. It must pick the same drawings as plain reading does.
import { describe, expect, it } from 'vitest';
import { createDraft, finishDraft, isDraft, produce } from 'immer';
import { newDoc, newVectorDrawing, newVectorLayer, peek, pruneDrawings } from '../../src/core/doc';
import type { Doc, Layer } from '../../src/core/format';

/** The straightforward version (reads everything through whatever it is handed). */
function referenceUsed(doc: Doc): Set<string> {
  const used = new Set<string>();
  const lists: Layer[][] = [doc.layers, ...(doc.editing ?? []).map((f) => f.layers), ...Object.values(doc.symbols ?? {}).map((s) => s.layers)];
  for (const a of doc.artboards ?? []) if (a.content) lists.push(a.content.layers);
  for (const a of doc.artboards ?? []) {
    const ls = a.overrides?.layers;
    if (!ls) continue;
    for (const l of ls.added ?? []) for (const c of l.cels) used.add(c.drawingId);
    for (const it of Object.values(ls.items ?? {})) {
      for (const c of it.sub?.added ?? []) used.add(c.drawingId);
      for (const c of Object.values(it.sub?.items ?? {})) {
        const id = c.patch?.set?.drawingId;
        if (typeof id === 'string') used.add(id);
      }
    }
  }
  for (const list of lists) for (const l of list) for (const c of l.cels) used.add(c.drawingId);
  for (const t of doc.tileset?.tiles ?? []) for (const f of t.frames) used.add(f.drawingId);
  return used;
}

function build(layers: number, keys: number): Doc {
  const doc = newDoc();
  doc.layers = [];
  doc.drawings = {};
  for (let i = 0; i < layers; i++) {
    const l = newVectorLayer('L' + i);
    for (let k = 0; k < keys; k++) {
      const d = newVectorDrawing();
      d.id = `d${i}_${k}`;
      doc.drawings[d.id] = d;
      l.cels.push({ id: `c${i}_${k}`, start: k, length: 1, drawingId: d.id });
    }
    doc.layers.push(l);
  }
  // Orphans nothing points at.
  for (const id of ['orphan1', 'orphan2']) doc.drawings[id] = { ...newVectorDrawing(), id };
  return doc;
}

const expected = (doc: Doc) => Object.keys(doc.drawings).filter((id) => referenceUsed(doc).has(id)).sort();

describe('pruneDrawings', () => {
  it('prunes a plain document', () => {
    const doc = build(3, 4);
    pruneDrawings(doc);
    expect(Object.keys(doc.drawings)).toHaveLength(12);
    expect(doc.drawings.orphan1).toBeUndefined();
  });

  it('gives the same result on a draft after edits of every depth', () => {
    const edits: Record<string, (d: Doc) => void> = {
      none: () => undefined,
      'delete one key': (d) => void (d.layers[1].cels = d.layers[1].cels.filter((c) => c.id !== 'c1_2')),
      'delete a layer': (d) => void d.layers.splice(0, 1),
      'repoint a cel': (d) => void (d.layers[2].cels[0].drawingId = 'd0_0'),
      'new layer with a new drawing': (d) => {
        const n = { ...newVectorDrawing(), id: 'fresh' };
        d.drawings[n.id] = n;
        const l = newVectorLayer('new');
        l.cels.push({ id: 'cn', start: 0, length: 1, drawingId: n.id });
        d.layers.push(l);
      },
      'edit a cel then delete its layer': (d) => {
        d.layers[0].cels[0].length = 4;
        d.layers.splice(0, 1);
      },
      'push a cel on a layer read before': (d) => {
        const l = d.layers[1];
        void l.cels.length;
        l.cels.push({ id: 'cx', start: 9, length: 1, drawingId: 'd2_3' });
        l.cels = l.cels.filter((c) => c.drawingId !== 'd1_0');
      },
    };
    for (const [name, edit] of Object.entries(edits)) {
      const base = build(3, 4);
      const next = produce(base, (d) => {
        edit(d);
        pruneDrawings(d);
      });
      // What the result should be: the edited doc, pruned the plain way.
      const plain = produce(base, (d) => void edit(d));
      expect(Object.keys(next.drawings).sort(), name).toEqual(expected(plain));
    }
  });

  it('sees symbols, open symbol frames, artboard content, variation overrides and tiles', () => {
    const base = build(1, 2);
    for (const id of ['sym1', 'ed1', 'art1', 'ovAdded', 'ovSubAdded', 'ovPatch', 'tile1']) base.drawings[id] = { ...newVectorDrawing(), id };
    const lay = (id: string): Layer => ({ ...newVectorLayer('x'), cels: [{ id: 'c' + id, start: 0, length: 1, drawingId: id }] });
    base.symbols = { s: { id: 's', name: 's', layers: [lay('sym1')], length: 1, origin: { x: 0, y: 0 } } } as any;
    base.editing = [{ symbolId: 's', layers: [lay('ed1')] }] as any;
    base.artboards = [
      { id: 'a1', name: 'a1', content: { layers: [lay('art1')] } },
      {
        id: 'a2', name: 'a2', follows: 'a1',
        overrides: { layers: { added: [lay('ovAdded')], items: { x: { sub: { added: [{ id: 'q', start: 0, length: 1, drawingId: 'ovSubAdded' }], items: { y: { patch: { set: { drawingId: 'ovPatch' } } } } } } } } },
      },
    ] as any;
    base.tileset = { tiles: [{ id: 't', frames: [{ drawingId: 'tile1' }] }] } as any;
    const next = produce(base, (d) => {
      d.layers[0].cels.pop();
      pruneDrawings(d);
    });
    expect(Object.keys(next.drawings).sort()).toEqual(['art1', 'd0_0', 'ed1', 'ovAdded', 'ovPatch', 'ovSubAdded', 'sym1', 'tile1']);
    const plain = structuredClone(base);
    pruneDrawings(plain);
    expect(Object.keys(plain.drawings).sort()).toEqual(['art1', 'd0_0', 'd0_1', 'ed1', 'ovAdded', 'ovPatch', 'ovSubAdded', 'sym1', 'tile1']);
  });

  it('does not draft the cels it reads', () => {
    const base = build(4, 50);
    const draft = createDraft(base);
    draft.layers[1].cels = draft.layers[1].cels.filter((c) => c.id !== 'c1_3');
    // Only the layer touched above is drafted; reading the rest in pruneDrawings must not add proxies for the cels.
    let drafted = 0;
    const count = () => {
      drafted = 0;
      for (const l of peek(draft.layers)) for (const c of peek(peek(l).cels)) if (isDraft(c)) drafted++;
    };
    count();
    const before = drafted;
    pruneDrawings(draft);
    count();
    expect(drafted).toBe(before);
    const out = finishDraft(draft);
    expect(Object.keys(out.drawings)).toHaveLength(4 * 50 - 1);
  });

  it('peek reads the current value of a draft and passes everything else through', () => {
    const base = { a: { n: 1 }, list: [1, 2] };
    const d = createDraft(base);
    d.a.n = 2;
    expect(peek(d.a).n).toBe(2);
    expect(isDraft(peek(d.a))).toBe(false);
    expect(peek(base.a)).toBe(base.a);
    expect(peek(5)).toBe(5);
    expect(peek(null)).toBeNull();
    expect(peek(undefined)).toBeUndefined();
  });
});
