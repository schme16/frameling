/**
 * Keeping selected text selected while the playhead moves. A new key on a layer is a copy of the one before with new
 * shape ids, so a selection by id would be lost the moment the playhead crosses into it. A selected text shape is
 * carried over to the text at the same place in the new key's shapes, when there is one. Pure: no store, no DOM.
 */
import type { Doc, Id } from './format';
import { celAt, findLayer } from './doc';

/** The selection to use on `to` instead of `selection`, or null when it should stay as it is. */
export function followTextSelection(doc: Doc, layerId: Id | null, selection: Id[], from: number, to: number): Id[] | null {
  if (!selection.length || from === to) return null;
  const layer = findLayer(doc, layerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer) return null;
  const a = celAt(layer, from);
  const b = celAt(layer, to);
  if (!a || !b || a.drawingId === b.drawingId) return null;
  const da = doc.drawings[a.drawingId];
  const db = doc.drawings[b.drawingId];
  if (da?.kind !== 'vector' || db?.kind !== 'vector') return null;
  let changed = false;
  const next = selection.map((id) => {
    const i = da.shapes.findIndex((s) => s.id === id);
    if (i < 0 || da.shapes[i].type !== 'text') return id;
    const there = db.shapes[i];
    if (there?.type !== 'text' || there.id === id) return id;
    changed = true;
    return there.id;
  });
  return changed ? next : null;
}
