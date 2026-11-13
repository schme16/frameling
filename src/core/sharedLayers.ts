/**
 * Shared layers: one layer stack for a whole drawing (frames on boards). The document owns the layers; each artboard
 * keeps only its own cels on each of them, in `ArtboardContent.cels`. Pure functions on layers, no store, no DOM.
 */
import type { Cel, Id, Layer } from './format';

const made = new WeakMap<Layer, WeakMap<Cel[], Layer>>();

/** The layer with other cels on it. The same layer comes back for the same cels, so caches keyed on layers keep working. */
export function withCels(layer: Layer, cels: Cel[]): Layer {
  if (layer.cels === cels) return layer;
  let by = made.get(layer);
  if (!by) made.set(layer, (by = new WeakMap()));
  let hit = by.get(cels);
  if (!hit) by.set(cels, (hit = { ...layer, cels } as Layer));
  return hit;
}

/**
 * The stack as one artboard sees it: every layer of the stack, holding what that artboard has drawn on it. A layer with
 * nothing drawn on it here gets a fresh empty list, so the result is safe to draw into.
 */
export function layersWithCels(stack: readonly Layer[], cels: Record<Id, Cel[]> | undefined): Layer[] {
  const out = stack.map((l) => {
    const own = cels?.[l.id];
    return own ? withCels(l, own) : ({ ...l, cels: [] } as Layer);
  });
  for (const l of out) siblings.set(l, out);
  return out;
}

/** The layers one artboard sees, by any one of them: a layer that looks for another beside it (a bound layer finding its bones layer) stays on its own board. */
export const siblings = new WeakMap<Layer, readonly Layer[]>();

/** What the open artboard has drawn on each layer of the stack, by layer id. Layers with nothing on them are left out. */
export function celsOfStack(layers: readonly Layer[]): Record<Id, Cel[]> {
  const out: Record<Id, Cel[]> = {};
  for (const l of layers) if (l.cels.length) out[l.id] = l.cels;
  return out;
}

const looks = new WeakMap<readonly Layer[], string>();

/**
 * What a shared stack looks like apart from the drawing on it, as text that stays the same while nothing about how the
 * layers show has changed. Closed boards' pictures are drawn again only when it changes.
 */
export function stackLook(layers: readonly Layer[]): string {
  let hit = looks.get(layers);
  if (hit === undefined) {
    hit = JSON.stringify(layers.map((l) => [l.id, l.visible, l.opacity, l.blend, l.effects, l.mask, l.clipToBelow, l.folder, l.reference, l.depth, l.bind, l.label]));
    looks.set(layers, hit);
  }
  return hit;
}
