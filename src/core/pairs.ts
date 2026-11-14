/**
 * Pairs: a vector layer and a pixel layer that are one drawing made of two kinds of marks. They are made by drawing: with
 * the switch on Pixels while you are on a vector layer, the stroke lands on a pixel layer next to it, made if it is not
 * there yet. A pair is shown as one row, and its cels keep the same starts and lengths so the two halves never drift.
 *
 * Pure functions on layers and documents, no DOM and no store. The part that keeps the cels in step is in
 * `timeline/pairs.ts` (it needs the store). Each half names the other in `layer.pair`.
 */
import type { Doc, Id, Layer, LayerKind } from './format';

/** The two kinds a pair is made of. */
export const isDrawKind = (kind: LayerKind): kind is 'vector' | 'pixel' => kind === 'vector' || kind === 'pixel';

/** The other half of a layer's pair, or undefined when there is none (a link the other layer does not return counts as none). */
export function pairOf(layers: readonly Layer[], layer: Layer | undefined | null): Layer | undefined {
  if (!layer?.pair) return undefined;
  const o = layers.find((l) => l.id === layer.pair);
  if (!o || o.pair !== layer.id || o.id === layer.id) return undefined;
  if (!isDrawKind(o.kind) || !isDrawKind(layer.kind) || o.kind === layer.kind) return undefined;
  return o;
}

/** The pair's other half by layer id. */
export const pairOfId = (layers: readonly Layer[], id: Id | null | undefined): Layer | undefined =>
  id ? pairOf(layers, layers.find((l) => l.id === id)) : undefined;

/** The two halves of the pair a layer belongs to, vector first, or null when it is on its own. */
export function halvesOf(layers: readonly Layer[], layer: Layer | undefined | null): { vector: Layer; pixel: Layer } | null {
  const o = pairOf(layers, layer);
  if (!layer || !o) return null;
  return layer.kind === 'vector' ? { vector: layer, pixel: o } : { vector: o, pixel: layer };
}

/**
 * True when the two halves sit side by side in the layer list and in the same folder, so they can be one row.
 * (Halves that have been split apart still keep their cels in step, but show as two rows.)
 */
export function sitTogether(layers: readonly Layer[], a: Layer, b: Layer): boolean {
  if ((a.folder ?? null) !== (b.folder ?? null)) return false;
  const i = layers.findIndex((l) => l.id === a.id);
  const j = layers.findIndex((l) => l.id === b.id);
  return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
}

/** The half that shows on top (nearer the front, the later one in the list), and the one under it. */
export function topAndBottom(layers: readonly Layer[], a: Layer, b: Layer): { top: Layer; bottom: Layer } {
  return layers.findIndex((l) => l.id === a.id) > layers.findIndex((l) => l.id === b.id) ? { top: a, bottom: b } : { top: b, bottom: a };
}

/** Every layer that is a half of a pair, as pairs: the top half first. Each pair once. */
export function allPairs(layers: readonly Layer[]): { top: Layer; bottom: Layer }[] {
  const out: { top: Layer; bottom: Layer }[] = [];
  const seen = new Set<Id>();
  for (const l of layers) {
    if (!l.pair || seen.has(l.id)) continue;
    const o = pairOf(layers, l);
    if (!o) continue;
    seen.add(l.id);
    seen.add(o.id);
    out.push(topAndBottom(layers, l, o));
  }
  return out;
}

const SUFFIX = /\s*\((pixels|vectors)\)\s*$/i;

/** The name a layer's other half is given: "Ink" becomes "Ink (pixels)" or "Ink (vectors)". */
export function siblingName(name: string, kind: 'vector' | 'pixel'): string {
  const base = name.replace(SUFFIX, '').trim() || 'Layer';
  return `${base} (${kind === 'pixel' ? 'pixels' : 'vectors'})`;
}

/** Joins two layers as a pair (the layers are changed in place; they can be drafts). Refuses two of one kind. */
export function linkPair(a: Layer, b: Layer): boolean {
  if (a.id === b.id || !isDrawKind(a.kind) || !isDrawKind(b.kind) || a.kind === b.kind) return false;
  a.pair = b.id;
  b.pair = a.id;
  return true;
}

/** Makes a layer on its own again, and its other half with it. */
export function unlinkPair(layers: Layer[], id: Id): boolean {
  const l = layers.find((x) => x.id === id);
  if (!l?.pair) return false;
  const o = layers.find((x) => x.id === l.pair);
  delete l.pair;
  if (o && o.pair === id) delete o.pair;
  return true;
}

/**
 * Drops every link that is not a real pair, from a list that has just been read from a file (plain objects, so they are
 * changed in place): a name that is not there, one the other layer does not return, two of the same kind.
 */
export function sanitisePairs(layers: Layer[]): void {
  for (const l of layers) if (l.pair && !pairOf(layers, l)) delete l.pair;
}

/** What a cel list has to match for two layers to be in step: where each key starts and how long it holds. */
const shape = (l: Layer): string => l.cels.map((c) => `${c.start}:${c.length}`).join(',');

/** True when the two layers have keys in the same places with the same holds. */
export const inStep = (a: Layer, b: Layer): boolean => shape(a) === shape(b);

/** The layers a layer's edit should also reach: itself and its other half. */
export function withHalf(layers: readonly Layer[], id: Id): Id[] {
  const o = pairOfId(layers, id);
  return o ? [id, o.id] : [id];
}

/** True when the document has any pair at all (a quick check before doing any pair work). */
export const hasPairs = (doc: Pick<Doc, 'layers'>): boolean => doc.layers.some((l) => !!l.pair);

/** The other half when the two sit side by side in one folder (so they move, hide and show as one row), else undefined. */
export function halfTogether(layers: readonly Layer[], layer: Layer | undefined | null): Layer | undefined {
  const o = pairOf(layers, layer);
  return o && layer && sitTogether(layers, layer, o) ? o : undefined;
}

/**
 * After one half of a pair moved, brings the other half back next to it: just under it (`below`) or just over it. It
 * joins the same folder. `layers` is the document's list, changed in place.
 */
export function gatherHalf(layers: Layer[], movedId: Id, otherId: Id, side: 'below' | 'above'): void {
  const other = layers.find((l) => l.id === otherId);
  const moved = layers.find((l) => l.id === movedId);
  if (!other || !moved) return;
  layers.splice(layers.indexOf(other), 1);
  const at = layers.indexOf(moved);
  layers.splice(side === 'below' ? at : at + 1, 0, other);
  if (moved.folder) other.folder = moved.folder;
  else delete other.folder;
}
