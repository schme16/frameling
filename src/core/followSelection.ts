/**
 * Keeping the selection while the playhead moves or after Undo and Redo. A new key on a layer is a copy of the one
 * before with new shape ids (see `cloneDrawing`), so a selection by id would be lost the moment the playhead crosses
 * into it. Each copy remembers where it came from (`origin`), so the same shape can be found in every key. Old
 * documents have no `origin` (and no `lineage` flag): there the shape at the same place in the list stands in, and a
 * jump over several keys walks through the keys in between. Pure: no store, no DOM.
 */
import type { Cel, Doc, Id, Layer, Shape, VectorDrawing } from './format';
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
export function resolveFollowed(d: VectorDrawing, wanted: Followed[], positional = true): Id[] {
  const claimed = new Set<number>();
  const hasLineage = !positional || d.shapes.some((s) => s.origin);
  const out: Id[] = [];
  for (const w of wanted) {
    let i = d.shapes.findIndex((s, k) => !claimed.has(k) && shapeLineage(s) === w.lineage);
    // An old document (no `lineage` flag, no lineage in this key): the shape at the same place, when the two keys look alike.
    if (i < 0 && w.legacy && !hasLineage && d.shapes.length === w.of && d.shapes[w.at]?.type === w.type && !claimed.has(w.at)) i = w.at;
    if (i < 0) continue;
    claimed.add(i);
    out.push(d.shapes[i].id);
  }
  return out;
}

/** Shapes this key resolves for `wanted`, going through the keys between `a` and `b` when a direct match fails (old documents). */
function resolveAcross(doc: Doc, layer: Layer, a: Cel | undefined, b: Cel, db: VectorDrawing, wanted: Followed[]): Id[] {
  const positional = !doc.lineage;
  const direct = resolveFollowed(db, wanted, positional);
  if (!positional || direct.length === wanted.length) return direct;
  // Old documents: lineage may only reach part of the way. Step key by key and describe the shape again at each stop.
  const cels = [...layer.cels].sort((x, y) => x.start - y.start);
  const i = a ? cels.indexOf(a) : -1;
  const j = cels.indexOf(b);
  if (i < 0 || j < 0 || Math.abs(i - j) < 2) return direct;
  const stops = i < j ? cels.slice(i + 1, j) : cels.slice(j + 1, i).reverse();
  const steps: VectorDrawing[] = [];
  for (const c of stops) {
    const d = doc.drawings[c.drawingId];
    if (d?.kind === 'vector' && steps[steps.length - 1] !== d) steps.push(d);
  }
  const out: Id[] = [];
  const claimed = new Set<Id>();
  for (const w of wanted) {
    const own = resolveFollowed(db, [w], positional)[0];
    let id = own && !claimed.has(own) ? own : undefined;
    if (!id) {
      let cur = w;
      for (const d of steps) {
        const hit = resolveFollowed(d, [cur], positional)[0];
        if (hit) cur = describe(d, [hit]).wanted[0];
      }
      id = resolveFollowed(db, [cur], positional).find((x) => !claimed.has(x));
    }
    if (id) {
      claimed.add(id);
      out.push(id);
    }
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
  const next = [...(db && b ? resolveAcross(doc, layer, a, b, db, mem.wanted) : []), ...mem.other];
  if (same(next, selection)) return null;
  return { selection: next, memory: { ...mem, shown: next } };
}

/**
 * The part of `selection` that still exists after Undo or Redo: shapes on the key showing at `frame` on any layer of the
 * open drawing (the active layer's first, others too, so a selection across layers survives). After an artboard switch
 * that means the artboard now open.
 */
export function existingSelection(doc: Doc, layerId: Id | null, frame: number, selection: Id[]): Id[] {
  if (!selection.length) return selection;
  const here = new Set<Id>();
  const add = (d: VectorDrawing | null | undefined) => {
    if (d) for (const s of d.shapes) here.add(s.id);
  };
  add(vectorAt(doc, layerId, frame));
  for (const l of doc.layers) {
    const cel = celAt(l, frame);
    const d = cel ? doc.drawings[cel.drawingId] : undefined;
    if (d?.kind === 'vector') add(d);
  }
  return selection.filter((id) => here.has(id));
}
