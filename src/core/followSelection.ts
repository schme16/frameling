/**
 * Keeping the selection while the playhead moves or after Undo and Redo. A new key on a layer is a copy of the one
 * before with new shape ids (see `cloneDrawing`), so a selection by id would be lost the moment the playhead crosses
 * into it. Each copy remembers where it came from (`origin`), so the same shape can be found in every key. Old
 * documents have no `origin`: there the shape at the same place in the list stands in. Pure: no store, no DOM.
 */
import type { Doc, Id, Shape, VectorDrawing } from './format';
import { celAt, findLayer } from './doc';

/** The id every copy of a shape shares: its `origin`, or its own id when it is the first of its line. */
export const shapeLineage = (s: Pick<Shape, 'id' | 'origin'>): Id => s.origin ?? s.id;

/** One selected shape, described so it can be found again in any key. */
export interface Followed {
  lineage: Id;
  /** Where it sat in the key it was picked in, for documents without lineage. */
  at: number;
  type: Shape['type'];
  /** It had no `origin` of its own. */
  legacy: boolean;
  /** How many shapes that key had. */
  of: number;
}

/**
 * What the selection stands for across keys. `shown` is the selection it produced: when the current selection is
 * that very array, nothing else has touched it, so the memory still holds (shapes missing from one key come back
 * when the playhead returns). Any other selection starts a new memory.
 */
export interface FollowMemory {
  shown: Id[];
  wanted: Followed[];
  /** Selected ids that are not shapes of the key (kept as they are). */
  other: Id[];
}

function describe(d: VectorDrawing, selection: Id[]): { wanted: Followed[]; other: Id[] } {
  const wanted: Followed[] = [];
  const other: Id[] = [];
  for (const id of selection) {
    const i = d.shapes.findIndex((s) => s.id === id);
    if (i < 0) other.push(id);
    else wanted.push({ lineage: shapeLineage(d.shapes[i]), at: i, type: d.shapes[i].type, legacy: !d.shapes[i].origin, of: d.shapes.length });
  }
  return { wanted, other };
}

/** The ids of the shapes in `d` that `wanted` stands for (shapes this key has no copy of are left out). */
export function resolveFollowed(d: VectorDrawing, wanted: Followed[]): Id[] {
  const claimed = new Set<number>();
  const hasLineage = d.shapes.some((s) => s.origin);
  const out: Id[] = [];
  for (const w of wanted) {
    let i = d.shapes.findIndex((s, k) => !claimed.has(k) && shapeLineage(s) === w.lineage);
    // No lineage anywhere (an old document): the shape at the same place, when the two keys look alike.
    if (i < 0 && w.legacy && !hasLineage && d.shapes.length === w.of && d.shapes[w.at]?.type === w.type && !claimed.has(w.at)) i = w.at;
    if (i < 0) continue;
    claimed.add(i);
    out.push(d.shapes[i].id);
  }
  return out;
}

const same = (a: Id[], b: Id[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function vectorAt(doc: Doc, layerId: Id | null, frame: number): VectorDrawing | null | undefined {
  const layer = findLayer(doc, layerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer) return undefined;
  const cel = celAt(layer, frame);
  if (!cel) return null;
  const d = doc.drawings[cel.drawingId];
  return d?.kind === 'vector' ? d : null;
}

/**
 * The selection to use on frame `to` instead of `selection`, or null when it should stay as it is. Strokes, fills,
 * paths, symbol instances, text and particles all follow. Shapes the new key has no copy of are left out of the
 * selection there, and come back when the playhead returns to a key that has them (through the returned memory,
 * which the caller hands back next time).
 */
export function followSelection(doc: Doc, layerId: Id | null, selection: Id[], from: number, to: number, memory?: FollowMemory | null): { selection: Id[]; memory: FollowMemory } | null {
  if (from === to) return null;
  const layer = findLayer(doc, layerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer) return null;
  const a = celAt(layer, from);
  const b = celAt(layer, to);
  if (a && b && a.drawingId === b.drawingId) return null;
  let mem: FollowMemory;
  if (memory && memory.shown === selection) mem = memory;
  else {
    const da = vectorAt(doc, layerId, from);
    if (!da || !selection.length) return null;
    const { wanted, other } = describe(da, selection);
    mem = { shown: selection, wanted, other };
  }
  if (!mem.wanted.length) return null;
  const db = vectorAt(doc, layerId, to);
  const next = [...(db ? resolveFollowed(db, mem.wanted) : []), ...mem.other];
  if (same(next, selection)) return null;
  return { selection: next, memory: { ...mem, shown: next } };
}

/** The part of `selection` that still exists on the active layer's key at `frame` (after Undo or Redo). */
export function existingSelection(doc: Doc, layerId: Id | null, frame: number, selection: Id[]): Id[] {
  if (!selection.length) return selection;
  const d = vectorAt(doc, layerId, frame);
  if (!d) return [];
  const here = new Set(d.shapes.map((s) => s.id));
  return selection.filter((id) => here.has(id));
}
