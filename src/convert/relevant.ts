// Whether the Turn into section of Properties has anything to offer. Kept small (no UI imports) so the panel list can use it.
import { findLayer } from '../core/doc';
import type { Doc, Layer } from '../core/format';
import type { State } from '../core/store';

/** Does this layer have anything to turn on any of its frames? */
export function hasArt(doc: Doc, layer: Layer): boolean {
  for (const c of layer.cels) {
    const d = doc.drawings[c.drawingId];
    if (layer.kind === 'vector' && d?.kind === 'vector' && d.shapes.length > 0) return true;
    if (layer.kind === 'pixel' && d?.kind === 'pixel' && d.width > 0 && d.height > 0) return true;
  }
  return false;
}

/** Which way the active layer can be turned: shapes into pixels, pixels into shapes, or neither. */
export function wayFor(s: State): 'pixels' | 'shapes' | null {
  const layer = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
  if (!layer || (layer.kind !== 'vector' && layer.kind !== 'pixel') || !hasArt(s.doc, layer)) return null;
  return layer.kind === 'vector' ? 'pixels' : 'shapes';
}
