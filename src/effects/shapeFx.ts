/**
 * Effects on one shape, not the whole layer. Pure: no DOM, no store.
 *
 * A shape's `effects` are the same list a layer has (soften, glow, shadow and the rest). They run on that shape alone,
 * first to last, and the layer's own effects then run on the layer as a whole, so the order is always shape first, then
 * layer, then folder. They are not animated: a shape's settings are the same on every frame it shows, and a new key
 * of the drawing can carry its own.
 *
 * A shape with effects is left out of merge drawing's cutting and joining (like a grouped shape), because merging
 * rebuilds shapes from their outlines and would quietly lose the effect. See `mergeable` in geometry/merge.ts.
 */
import type { Doc, Drawing, EffectKind, Id, Layer, LayerEffect, Shape } from '../core/format';
import { activeEffects, defaultValues, isNoop } from './model';

/** The effect list a shape carries, or undefined. Every kind of shape can have one. */
export const shapeEffects = (s: Shape): LayerEffect[] | undefined => (s as { effects?: LayerEffect[] }).effects;

/** Does the shape have an effect that is switched on and changes something? */
export function hasShapeFx(s: Shape): boolean {
  const fx = shapeEffects(s);
  return !!fx && fx.some((e) => e.on !== false && !isNoop(e.kind, { ...defaultValues(e.kind), ...e.values }));
}

/** The effects to draw for a shape: on, and not doing nothing (never animated, so frame 0 of the values). */
export const drawableShapeFx = (s: Shape, frame = 0): { kind: EffectKind; v: Record<string, number | string> }[] => activeEffects(staticList(shapeEffects(s)), frame);

// A shape's effects ignore `keys`: settings are the same on every frame.
function staticList(list: LayerEffect[] | undefined): LayerEffect[] | undefined {
  if (!list?.some((e) => e.keys?.length)) return list;
  return list.map((e) => (e.keys?.length ? { ...e, keys: undefined } : e));
}

/** Does any shape in the drawing have an effect (that does something)? */
export const drawingHasShapeFx = (d: Drawing | undefined): boolean => !!d && d.kind === 'vector' && d.shapes.some(hasShapeFx);

/** The kinds of effect the shapes of a drawing carry (the ones that do something). */
export function shapeFxKinds(d: Drawing | undefined, into: Set<EffectKind> = new Set()): Set<EffectKind> {
  if (!d || d.kind !== 'vector') return into;
  for (const s of d.shapes) if (hasShapeFx(s)) for (const e of shapeEffects(s)!) if (e.on !== false) into.add(e.kind);
  return into;
}

/**
 * The drawings a vector layer shows on any of these frames (all of them when no frames are given), and the drawings of
 * the symbols copied into them, since a shape with an effect inside a symbol copy has the same trouble in an export.
 */
function layerDrawings(doc: Doc, layer: Layer, frames?: number[], depth = 0, seen = new Set<Id>()): Drawing[] {
  if (layer.kind !== 'vector' || depth > 8) return [];
  const out: Drawing[] = [];
  for (const c of layer.cels) {
    if (frames && !frames.some((f) => f >= c.start && f < c.start + c.length)) continue;
    const d = doc.drawings[c.drawingId];
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
    if (d.kind !== 'vector') continue;
    for (const s of d.shapes) {
      if (s.type !== 'instance') continue;
      for (const l of doc.symbols?.[s.symbolId]?.layers ?? []) out.push(...layerDrawings(doc, l, undefined, depth + 1, seen));
    }
  }
  return out;
}

/** Does a layer hold a shape with an effect on any of these frames? (For exporters that cannot carry it as it is.) */
export const layerHasShapeFx = (doc: Doc, layer: Layer, frames?: number[]): boolean => layerDrawings(doc, layer, frames).some((d) => drawingHasShapeFx(d));

/** The kinds of effect the shapes of a layer carry on any of these frames. */
export function layerShapeFxKinds(doc: Doc, layer: Layer, frames?: number[]): Set<EffectKind> {
  const out = new Set<EffectKind>();
  for (const d of layerDrawings(doc, layer, frames)) shapeFxKinds(d, out);
  return out;
}

/** The shapes of a list the ids name. */
export const shapesById = <T extends Shape>(shapes: readonly T[], ids: ReadonlySet<Id>): T[] => shapes.filter((s) => ids.has(s.id));

/**
 * What the Effects panel shows for the picked shapes: the first one's stack (picked shapes get the same effect with the
 * same id when it is added to all of them, so they edit together), and whether the picked shapes disagree.
 */
export function stackOf(picked: readonly Shape[]): { effects: LayerEffect[]; mixed: boolean } {
  if (!picked.length) return { effects: [], mixed: false };
  const first = shapeEffects(picked[0]) ?? [];
  const key = (list: LayerEffect[] | undefined) => (list ?? []).map((e) => `${e.id}:${e.kind}`).join('|');
  const k0 = key(first);
  return { effects: first, mixed: picked.some((s) => key(shapeEffects(s)) !== k0) };
}

/** A copy of a shape's effects with fresh ids (for a shape made from another). */
export const cloneEffects = (list: LayerEffect[] | undefined): LayerEffect[] | undefined => (list?.length ? JSON.parse(JSON.stringify(list)) : undefined);

/** How far a shape's effects reach past its outline in document pixels, for boxes that must hold everything painted. */
export function shapeFxReach(s: Shape, reachOf: (kind: string, v: Record<string, number | string>) => number): number {
  let r = 0;
  for (const e of drawableShapeFx(s)) r += reachOf(e.kind, e.v);
  return r;
}
