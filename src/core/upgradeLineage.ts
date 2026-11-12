/**
 * Old documents (no `lineage` flag) found the same shape in another key by its place in the list. On open they are
 * upgraded once: each shape in a later key takes the `origin` of the shape at the same place and kind in the key
 * before, when both keys have the same number of shapes, and the document gets the flag. Nothing drawn or exported
 * changes (`origin` is only read when a selection follows). Pure: no store, no DOM.
 */
import type { Doc, Id, Layer, VectorDrawing } from './format';
import { shapeLineage } from './followSelection';

/** Links the keys of one layer, in time order. `done` holds drawings already linked (a drawing is only changed once). */
function upgradeLayer(doc: Doc, layer: Layer, done: Set<Id>, moved: Map<Id, Id>): void {
  const root = (id: Id): Id => {
    for (let n = 0; moved.has(id) && n < 10000; n++) id = moved.get(id)!;
    return id;
  };
  let prev: VectorDrawing | null = null;
  const cels = [...layer.cels].sort((a, b) => a.start - b.start);
  for (const c of cels) {
    const d = doc.drawings[c.drawingId];
    if (d?.kind !== 'vector') {
      prev = null;
      continue;
    }
    if (d === prev) continue;
    // A key that already has lineage keeps it; a key with none is matched by place, like it always was.
    if (!done.has(d.id) && prev && d.shapes.length === prev.shapes.length && !d.shapes.some((s) => s.origin)) {
      d.shapes.forEach((s, i) => {
        if (prev!.shapes[i].type !== s.type) return;
        const line = root(shapeLineage(prev!.shapes[i]));
        s.origin = line;
        moved.set(s.id, line);
      });
    }
    done.add(d.id);
    prev = d;
  }
}

/** Gives an old document lineage (see above). Does nothing when it already has the flag. Changes `doc` in place. */
export function upgradeLineage(doc: Doc): void {
  if (doc.lineage) return;
  const done = new Set<Id>();
  const moved = new Map<Id, Id>();
  const each = (layers: Layer[]) => layers.forEach((l) => upgradeLayer(doc, l, done, moved));
  each(doc.layers);
  for (const s of Object.values(doc.symbols ?? {})) each(s.layers);
  for (const a of doc.artboards ?? []) if (a.content) each(a.content.layers);
  // A key that had lineage of its own pointed at ids that now belong to an older line: follow them there.
  if (moved.size) {
    for (const d of Object.values(doc.drawings)) {
      if (d.kind !== 'vector') continue;
      for (const s of d.shapes) {
        let o = s.origin;
        for (let n = 0; o && moved.has(o) && n < 10000; n++) o = moved.get(o);
        if (o && o !== s.origin) s.origin = o;
      }
    }
  }
  doc.lineage = true;
}
