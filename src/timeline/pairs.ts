/**
 * Keeps the two halves of a pair (a vector layer and a pixel layer, see core/pairs.ts) in step, and makes a half.
 *
 * In step means the same keys in the same places with the same holds, and the same cel offset. It is kept by one
 * settler that runs after every change to the document, so every way of changing cels (add a key, delete, move, stretch,
 * add or remove a frame, set the hold, nudge, undo and redo included) keeps it without each one having to know. The half
 * that changed leads and the other follows. The settler never throws art away that it cannot match: the follower only
 * gets blank keys added, keys moved or stretched with the leader, and its keys removed when the leader's key is gone.
 */
import type { Draft } from 'immer';
import type { Cel, Doc, Drawing, Id, Layer } from '../core/format';
import { newDrawingFor, newPixelLayer, newVectorLayer, pruneDrawings, uid } from '../core/doc';
import { hasPairs, inStep, linkPair, pairOf, siblingName } from '../core/pairs';
import { registerSettler, type SettleContext } from '../core/store';
import { cloneDrawing } from './edit-core';

/** True while the open artboard is a variation: its layers are patches of the original's, so they are left alone. */
function inVariation(doc: Doc): boolean {
  if (!doc.artboards?.length) return false;
  const open = doc.artboards.find((a) => a.id === doc.activeArtboard && !a.content) ?? doc.artboards.find((a) => !a.content);
  return !!open?.variationOf;
}

/** The fields of a cel that make two lists of them the same. */
const sig = (c: Cel): string => JSON.stringify([c.id, c.start, c.length, c.drawingId, c.autoHold ?? false, c.offset?.x ?? 0, c.offset?.y ?? 0, c.name ?? '', c.tween ? 1 : 0]);

export interface Mirrored {
  /** The follower's new cels. */
  cels: Cel[];
  /** Drawings to add (blank ones for new keys, copies for a key that stopped sharing). */
  add: Drawing[];
}

/**
 * What the follower's cels become so that they match the leader's, given how the two looked before the change. A leader
 * key finds its partner by where it started before. Pure: nothing is changed.
 */
export function mirrorCels(doc: Doc, lead: Layer, follow: Layer, was: { lead: Layer; follow: Layer }): Mirrored {
  const partnerAt = new Map<number, Cel>(was.follow.cels.map((c) => [c.start, c]));
  const prevById = new Map<Id, Cel>(was.lead.cels.map((c) => [c.id, c]));
  const uses = new Map<Id, number>();
  for (const c of was.follow.cels) uses.set(c.drawingId, (uses.get(c.drawingId) ?? 0) + 1);
  const add: Drawing[] = [];
  // Which of the follower's drawings goes with each of the leader's, so a drawing the leader shares is shared here too.
  const map = new Map<Id, Id>();
  const partnerOf = (c: Cel): Cel | undefined => {
    const prev = prevById.get(c.id);
    return prev ? partnerAt.get(prev.start) : undefined;
  };
  for (const c of lead.cels) {
    const p = partnerOf(c);
    if (p && prevById.get(c.id)!.drawingId === c.drawingId && !map.has(c.drawingId)) map.set(c.drawingId, p.drawingId);
  }
  const cels: Cel[] = [];
  const leadStarts = new Set(was.lead.cels.map((c) => c.start));
  // A glide is never cut or squeezed to match: a follower key with one that would have to change is left as it was, and
  // the keys that would land on it are not mirrored there.
  const keep = new Set<Cel>();
  const hits = (a: { start: number; length: number }, b: { start: number; length: number }): boolean => a.start < b.start + b.length && b.start < a.start + a.length;
  for (const c of lead.cels) {
    const p = partnerOf(c);
    if (p?.tween && (p.start !== c.start || p.length !== c.length)) keep.add(p);
  }
  for (const c of lead.cels) {
    const p = partnerOf(c);
    if (p && keep.has(p)) continue;
    if ([...keep].some((k) => hits(k, c))) {
      if (p) keep.add(p);
      continue;
    }
    let drawingId: Id;
    if (p && prevById.get(c.id)!.drawingId === c.drawingId) drawingId = p.drawingId;
    else {
      const mapped = map.get(c.drawingId);
      if (mapped) drawingId = mapped;
      else if (p) {
        // The leader's key got a drawing of its own. Keep the follower's art; if others still show it, copy it.
        const src = doc.drawings[p.drawingId];
        if ((uses.get(p.drawingId) ?? 0) > 1 && src) {
          const copy = cloneDrawing(src);
          add.push(copy);
          drawingId = copy.id;
        } else drawingId = p.drawingId;
        map.set(c.drawingId, drawingId);
      } else {
        const blank = newDrawingFor(doc, follow);
        add.push(blank);
        drawingId = blank.id;
        map.set(c.drawingId, drawingId);
      }
    }
    cels.push({
      id: p?.id ?? uid('c'),
      start: c.start,
      length: c.length,
      drawingId,
      ...(c.autoHold ? { autoHold: true as const } : {}),
      ...(c.offset ? { offset: { ...c.offset } } : {}),
      // A glide stays with the half that has it, as long as the key is as long as it was.
      ...(p?.tween && p.length === c.length ? { tween: p.tween } : {}),
      ...(p?.name ? { name: p.name } : {}),
    });
  }
  cels.push(...keep);
  // Keys on the follower that had no partner (the two were not in step before) keep their art, unless a mirrored key is on
  // top of them.
  for (const o of was.follow.cels) {
    if (leadStarts.has(o.start)) continue;
    if (cels.some((c) => c.start < o.start + o.length && o.start < c.start + c.length)) continue;
    cels.push(o);
  }
  cels.sort((a, b) => a.start - b.start);
  return { cels, add };
}

/** Which half leads when both changed and no longer agree: the vector one. */
function leaderOf(a: Layer, b: Layer): { lead: Layer; follow: Layer } {
  return a.kind === 'vector' ? { lead: a, follow: b } : { lead: b, follow: a };
}

/** The settler: after a change, the half that did not change follows the half that did. Null when nothing needs doing. */
export function settlePairs(doc: Doc, ctx?: SettleContext): ((d: Draft<Doc>) => void) | null {
  if (!ctx || !hasPairs(doc) || doc.layers === ctx.before.layers || inVariation(doc)) return null;
  const jobs: { lead: Layer; follow: Layer; was: { lead: Layer; follow: Layer } }[] = [];
  const seen = new Set<Id>();
  for (const a of doc.layers) {
    if (!a.pair || seen.has(a.id)) continue;
    const b = pairOf(doc.layers, a);
    if (!b) continue;
    seen.add(a.id);
    seen.add(b.id);
    const wa = ctx.before.layers.find((l) => l.id === a.id);
    const wb = ctx.before.layers.find((l) => l.id === b.id);
    // A pair that was only just made is built in step.
    if (!wa || !wb || wa.pair !== b.id || wb.pair !== a.id) continue;
    const ca = a.cels !== wa.cels;
    const cb = b.cels !== wb.cels;
    if (!ca && !cb) continue;
    if (ca && cb && inStep(a, b)) continue;
    const { lead, follow } = ca && cb ? leaderOf(a, b) : ca ? { lead: a, follow: b } : { lead: b, follow: a };
    // A locked half is left as it is.
    if (follow.locked) continue;
    const was = lead === a ? { lead: wa, follow: wb } : { lead: wb, follow: wa };
    jobs.push({ lead, follow, was });
  }
  const todo: { followId: Id; m: Mirrored }[] = [];
  for (const j of jobs) {
    const m = mirrorCels(doc, j.lead, j.follow, j.was);
    if (m.add.length === 0 && m.cels.length === j.follow.cels.length && m.cels.every((c, i) => sig(c) === sig(j.follow.cels[i]))) continue;
    todo.push({ followId: j.follow.id, m });
  }
  if (!todo.length) return null;
  return (d) => {
    for (const t of todo) {
      const f = d.layers.find((l) => l.id === t.followId);
      if (!f) continue;
      for (const dr of t.m.add) d.drawings[dr.id] = dr as Draft<Drawing>;
      f.cels = t.m.cels as Draft<Cel>[];
    }
    pruneDrawings(d as Doc);
  };
}

registerSettler(settlePairs);

// ---------------------------------------------------------------- making a half

/** Why a layer cannot be given another half, or null when it can. */
export function whyNoHalf(layer: Layer | undefined): string | null {
  if (!layer) return 'There is no layer to pair with.';
  if (layer.kind !== 'vector' && layer.kind !== 'pixel') return 'Only a vector layer and a pixel layer can be a pair.';
  if (layer.kind === 'vector' && layer.rig) return 'This layer holds a skeleton, so it cannot take a pixel layer beside it.';
  if (layer.mask) return 'This layer is a mask, so it cannot take another layer beside it. Pick the layer you want to draw on.';
  if (layer.bind) return 'This layer is attached to a bone, and a new layer beside it would not move with the bone. Add the layer yourself and attach it too.';
  return null;
}

/**
 * Makes the other half of a layer: a layer of `kind` just above it, in the same folder, named after it, with the same
 * keys (blank). The two are joined as a pair. Returns the new layer's id, or null when the layer cannot have one.
 */
export function makeHalf(doc: Draft<Doc>, layerId: Id, kind: 'vector' | 'pixel', pixelSize: number): Id | null {
  const i = doc.layers.findIndex((l) => l.id === layerId);
  const src = doc.layers[i] as Layer | undefined;
  if (i < 0 || !src || src.kind === kind || whyNoHalf(src)) return null;
  const name = siblingName(src.name, kind);
  const half: Layer = kind === 'pixel' ? newPixelLayer(name, pixelSize) : newVectorLayer(name);
  if (src.opacity !== 1) half.opacity = src.opacity;
  if (src.blend) half.blend = src.blend;
  if (src.onion === false) half.onion = false;
  if (src.label) half.label = src.label;
  if (src.reference) half.reference = true;
  if (src.folder) half.folder = src.folder;
  if (src.depth) half.depth = src.depth;
  const made = new Map<Id, Id>();
  for (const c of src.cels as readonly Cel[]) {
    let drawingId = made.get(c.drawingId);
    if (!drawingId) {
      const blank = newDrawingFor(doc as Doc, half);
      doc.drawings[blank.id] = blank as Draft<Drawing>;
      drawingId = blank.id;
      made.set(c.drawingId, drawingId);
    }
    half.cels.push({ id: uid('c'), start: c.start, length: c.length, drawingId, ...(c.autoHold ? { autoHold: true as const } : {}), ...(c.offset ? { offset: { ...c.offset } } : {}) });
  }
  doc.layers.splice(i + 1, 0, half as Draft<Layer>);
  linkPair(doc.layers[i] as Layer, doc.layers[i + 1] as Layer);
  return half.id;
}
