// What a Turn into command would work on right now. Small and apart from the code that does the turning (ops.ts and the
// rasteriser and tracer behind it), so the command list can ask "is this available here?" without bringing them along.
import { celAt, findLayer } from '../core/doc';
import type { Clip, Id, Layer } from '../core/format';
import { store, type State } from '../core/store';
import { isEditingVariation } from '../artboards/variations';
import { pixelSelection } from '../select/pixel-state';
import type { Mask } from '../select/mask';
import { tl } from '../timeline/state';
import { hasArt } from './relevant';
import { clipAround } from './scope';

/** What is being turned into what: shapes into pixels, or pixels into shapes. */
export type Way = 'pixels' | 'shapes';

export interface Source {
  way: Way;
  layer: Layer;
  frame: number;
  /** Shape ids that are selected (shapes into pixels). */
  selection: Id[];
  /** Pixels that are selected (pixels into shapes). */
  mask: Mask | null;
  /** The clip the frame is in, if any. */
  clip: Clip | null;
}

/** What `way` would work on right now, or a plain-words reason it can't. */
export function sourceNow(way: Way, s: State = store().get()): Source | { why: string } {
  const layer = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
  const need = way === 'pixels' ? 'vector' : 'pixel';
  if (!layer || layer.kind !== need) return { why: way === 'pixels' ? 'Pick a layer of shapes (a vector layer) first.' : 'Pick a pixel layer first.' };
  if (isEditingVariation(s.doc)) return { why: 'This is a variation, so layers can’t change kind here. Go to the original.' };
  if (layer.locked) return { why: 'This layer is locked. Unlock it first.' };
  if (!hasArt(s.doc, layer)) return { why: way === 'pixels' ? 'There are no shapes on this layer yet.' : 'There are no pixels on this layer yet.' };
  const mask = way === 'shapes' ? pixelSelection() : null;
  const cel = celAt(layer, s.ui.frame);
  const drawing = cel ? s.doc.drawings[cel.drawingId] : undefined;
  const ids = way === 'pixels' && drawing?.kind === 'vector' ? s.ui.selection.filter((id) => drawing.shapes.some((x) => x.id === id)) : [];
  return { way, layer, frame: s.ui.frame, selection: ids, mask, clip: clipAround(s.doc.clips, s.ui.frame, tl().clipId) };
}

export const isSource = (x: Source | { why: string }): x is Source => !('why' in x);

