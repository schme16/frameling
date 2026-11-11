// The empty frame ghost: on a frame where a layer has nothing drawn, the last drawing before it shows faintly, so it's
// clear where the drawing went and there's something to draw over. It's not the onion skin (one drawing, its own
// colours, no settings) and it only shows in the editor, never in playback or exports.
import type { Doc, Drawing, Id } from '../core/format';
import { celAt } from '../core/doc';
import { poseAt } from '../core/symbols';

export interface GhostItem {
  drawing: Drawing;
  pixelSize: number;
}

// How strongly the ghost shows.
export const GHOST_ALPHA = 0.22;

// Layers where a new drawing was started over the last one on this frame. They keep showing the ghost while you stay
// on the frame, so it doesn't vanish with the first stroke.
let tracing: { frame: number; layers: Set<Id> } | null = null;

/** Says a new drawing was (or is being) started on this layer at `frame`, over the last one. */
export function markTracing(layerId: Id, frame: number): void {
  if (!tracing || tracing.frame !== frame) tracing = { frame, layers: new Set() };
  tracing.layers.add(layerId);
}

/** The layers still being drawn over the ghost on `frame` (forgotten once you go to another frame). */
export function tracingAt(frame: number): ReadonlySet<Id> {
  if (tracing && tracing.frame !== frame) tracing = null;
  return tracing?.layers ?? new Set();
}

/**
 * What the ghost shows on `frame`: for each visible drawing layer with nothing on this frame (or a new drawing just
 * started over the last one), the last drawing before it.
 */
export function ghostItems(doc: Doc, frame: number, traced: ReadonlySet<Id> = tracingAt(frame)): GhostItem[] {
  const out: GhostItem[] = [];
  for (const layer of doc.layers) {
    if (!layer.visible || layer.onion === false) continue;
    if (layer.kind !== 'vector' && layer.kind !== 'pixel') continue;
    if (layer.kind === 'vector' && layer.rig) continue;
    const cel = celAt(layer, frame);
    let prev = undefined as (typeof layer.cels)[number] | undefined;
    if (!cel) {
      for (const c of layer.cels) if (c.start + c.length <= frame) prev = c;
    } else if (traced.has(layer.id)) {
      // Started here: the one before. Still being started (a stroke going in over a hold): the held one.
      if (cel.start < frame) prev = cel;
      else for (const c of layer.cels) if (c.start + c.length <= frame) prev = c;
    }
    if (!prev) continue;
    const d = poseAt(doc, layer, prev.start + prev.length - 1);
    if (!d || d.kind === 'tilemap' || d.kind === 'camera') continue;
    out.push({ drawing: d, pixelSize: layer.kind === 'pixel' ? layer.pixelSize : 1 });
  }
  return out;
}
