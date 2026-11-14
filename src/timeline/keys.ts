/**
 * Moving, stretching and deleting keys picked on the timeline, across layers. The maths is pure (works on a draft or
 * a plain doc); the store versions at the bottom make each change one undo step.
 *
 * Retiming a drawing key moves where that drawing starts. A hold that ran right up to the next key keeps doing so
 * (it grows or shrinks to meet it), so tweens stay joined up. A hold that ended in empty frames slides with its key.
 */
import type { Doc, Id, Layer } from '../core/format';
import { pruneDrawings } from '../core/doc';
import { store } from '../core/store';
import { ensureLength, MAX_LENGTH } from './edit-core';
import { foldTail, keepPlayheadIn, offerTidyEnd } from './ops';
import { fitLength } from './tidyEnd';
import { celRef, fxRef, parseRef, type KeyRef } from './tracks';
import { applyPropEdits, planPropEdits, propWhy, type PropPicks } from './propKeys';

const end = (c: { start: number; length: number }) => c.start + c.length;

interface Picked {
  cels: Map<Id, Set<Id>>;
  fx: Map<Id, Map<Id, Set<number>>>;
  /** Symbol property keys (one row's key on a drawing key). */
  props: PropPicks;
}

function pick(refs: Iterable<KeyRef>): Picked {
  const cels = new Map<Id, Set<Id>>();
  const fx = new Map<Id, Map<Id, Set<number>>>();
  const props: PropPicks = new Map();
  for (const r of refs) {
    const p = parseRef(r);
    if (!p) continue;
    if (p.kind === 'prop') {
      if (!props.has(p.layerId)) props.set(p.layerId, new Map());
      const m = props.get(p.layerId)!;
      if (!m.has(p.propId)) m.set(p.propId, new Set());
      m.get(p.propId)!.add(p.celId);
    } else if (p.kind === 'cel') {
      if (!cels.has(p.layerId)) cels.set(p.layerId, new Set());
      cels.get(p.layerId)!.add(p.celId);
    } else {
      if (!fx.has(p.layerId)) fx.set(p.layerId, new Map());
      const m = fx.get(p.layerId)!;
      if (!m.has(p.effectId)) m.set(p.effectId, new Set());
      m.get(p.effectId)!.add(p.frame);
    }
  }
  // A drawing key that is picked takes all its property keys along, so those aren't picked a second time.
  for (const [layerId, byProp] of props) {
    const own = cels.get(layerId);
    if (!own) continue;
    for (const [propId, ids] of byProp) {
      for (const id of ids) if (own.has(id)) ids.delete(id);
      if (!ids.size) byProp.delete(propId);
    }
    if (!byProp.size) props.delete(layerId);
  }
  return { cels, fx, props };
}

/** Drawing keys and property keys picked together on one layer can't be moved in one go. */
function mixed(p: Picked): boolean {
  for (const layerId of p.props.keys()) if (p.cels.has(layerId)) return true;
  return false;
}

/** The layers the picked keys are on. */
export function layersOf(refs: Iterable<KeyRef>): Set<Id> {
  const out = new Set<Id>();
  for (const r of refs) {
    const p = parseRef(r);
    if (p) out.add(p.layerId);
  }
  return out;
}

/** New starts and lengths for a layer's cels when some of them move, or null when they'd run into each other. */
function planCels(layer: Layer, chosen: Set<Id>, map: (f: number) => number): { start: number; length: number }[] | null {
  const cs = layer.cels;
  const starts = cs.map((c) => (chosen.has(c.id) ? map(c.start) : c.start));
  for (let i = 0; i < starts.length; i++) {
    if (!Number.isInteger(starts[i]) || starts[i] < 0 || starts[i] >= MAX_LENGTH) return null;
    if (i > 0 && starts[i] <= starts[i - 1]) return null;
  }
  return cs.map((c, i) => {
    const touches = i < cs.length - 1 && end(c) === cs[i + 1].start;
    let length = c.length;
    if (touches) length = starts[i + 1] - starts[i];
    // The last drawing, carried on automatically to the end: it still ends where it did.
    else if (i === cs.length - 1 && c.autoHold && chosen.has(c.id)) length = Math.max(1, end(c) - starts[i]);
    if (i < cs.length - 1) length = Math.min(length, starts[i + 1] - starts[i]);
    return { start: starts[i], length: Math.max(1, length) };
  });
}

function planFx(frames: number[], chosen: Set<number>, map: (f: number) => number): number[] | null {
  const next = frames.map((f) => (chosen.has(f) ? map(f) : f));
  if (next.some((f) => !Number.isInteger(f) || f < 0 || f >= MAX_LENGTH)) return null;
  if (new Set(next).size !== next.length) return null;
  return next;
}

/**
 * Moves the picked keys to `map(frame)`. Returns the refs they have afterwards (effect keys are named by their frame,
 * so theirs change), or null when nothing moved or the keys would collide (the doc is left alone then).
 */
export function retimeKeys(doc: Doc, refs: Iterable<KeyRef>, map: (frame: number) => number): KeyRef[] | null {
  const picked = pick(refs);
  const { cels, fx } = picked;
  keysWhy = '';
  if (mixed(picked)) {
    keysWhy = 'Move the drawing keys and the property keys one set at a time.';
    return null;
  }
  const propPlan = planPropEdits(doc, picked.props, map);
  if (!propPlan && picked.props.size) {
    keysWhy = propWhy;
    return null;
  }
  const celPlans = new Map<Layer, { start: number; length: number }[]>();
  for (const [layerId, ids] of cels) {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (!layer) continue;
    const plan = planCels(layer, ids, map);
    if (!plan) return null;
    celPlans.set(layer, plan);
  }
  const fxPlans: { keys: { frame: number }[]; frames: number[] }[] = [];
  for (const [layerId, byEffect] of fx) {
    const layer = doc.layers.find((l) => l.id === layerId);
    for (const [effectId, frames] of byEffect) {
      const e = layer?.effects?.find((x) => x.id === effectId);
      if (!e?.keys) continue;
      const plan = planFx(e.keys.map((k) => k.frame), frames, map);
      if (!plan) return null;
      fxPlans.push({ keys: e.keys, frames: plan });
    }
  }
  let changed = false;
  let furthest = 0;
  const out: KeyRef[] = [];
  for (const [layer, plan] of celPlans) {
    layer.cels.forEach((c, i) => {
      if (c.start !== plan[i].start || c.length !== plan[i].length) changed = true;
      c.start = plan[i].start;
      c.length = plan[i].length;
      furthest = Math.max(furthest, end(c));
      if (cels.get(layer.id)?.has(c.id)) out.push(celRef(layer.id, c.id));
    });
  }
  for (const [layerId, byEffect] of fx) {
    const layer = doc.layers.find((l) => l.id === layerId);
    for (const [effectId, frames] of byEffect) {
      const e = layer?.effects?.find((x) => x.id === effectId);
      for (const f of frames) if (e?.keys?.some((k) => k.frame === f)) out.push(fxRef(layerId, effectId, map(f)));
    }
  }
  for (const p of fxPlans) {
    p.keys.forEach((k, i) => {
      if (k.frame !== p.frames[i]) changed = true;
      k.frame = p.frames[i];
      furthest = Math.max(furthest, k.frame + 1);
    });
    p.keys.sort((a, b) => a.frame - b.frame);
  }
  if (propPlan?.changed) {
    changed = true;
    out.push(...applyPropEdits(doc, propPlan));
    for (const l of propPlan.layers) {
      const last = l.layer.cels[l.layer.cels.length - 1];
      if (last) furthest = Math.max(furthest, end(last));
    }
  }
  if (!changed) return null;
  ensureLength(doc, furthest);
  return out;
}

/** Why the last retime was refused, when it can say. */
let keysWhy = '';

/** The earliest frame among the picked keys. */
export function firstFrameOf(doc: Doc, refs: Iterable<KeyRef>): number | undefined {
  let first: number | undefined;
  for (const r of refs) {
    const p = parseRef(r);
    const layer = p && doc.layers.find((l) => l.id === p.layerId);
    if (!p || !layer) continue;
    const f = p.kind === 'fx' ? p.frame : layer.cels.find((c) => c.id === p.celId)?.start;
    if (f !== undefined && (first === undefined || f < first)) first = f;
  }
  return first;
}

/** Can the picked keys all move by `by` frames without running into anything? */
export function canShift(doc: Doc, refs: KeyRef[], by: number): boolean {
  const picked = pick(refs);
  const { cels, fx } = picked;
  const map = (f: number) => f + by;
  if (mixed(picked) || (picked.props.size && !planPropEdits(doc, picked.props, map))) return false;
  for (const [layerId, ids] of cels) {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (layer && !planCels(layer, ids, map)) return false;
  }
  for (const [layerId, byEffect] of fx) {
    const layer = doc.layers.find((l) => l.id === layerId);
    for (const [effectId, frames] of byEffect) {
      const e = layer?.effects?.find((x) => x.id === effectId);
      if (e?.keys && !planFx(e.keys.map((k) => k.frame), frames, map)) return false;
    }
  }
  return true;
}

/** The furthest the keys can go toward `by` (stopping before they'd bump into a key that isn't moving). */
export function clampShift(doc: Doc, refs: KeyRef[], by: number): number {
  for (let d = by; d !== 0; d -= Math.sign(d)) if (canShift(doc, refs, d)) return d;
  return 0;
}

/** Where a frame lands when the picked keys are stretched by `factor` from `anchor`. */
export const scaleMap = (anchor: number, factor: number) => (f: number) => anchor + Math.round((f - anchor) * factor);

/**
 * Takes the picked keys away. A drawing's frames go to the drawing before it when that one ran right up to it (it holds
 * on over them), otherwise they become empty. Returns false when nothing was there.
 */
export function removeKeys(doc: Doc, refs: Iterable<KeyRef>): boolean {
  const { cels, fx, props } = pick(refs);
  let changed = false;
  // Property keys first: each only resets its own row to the key before it.
  if (props.size) {
    const plan = planPropEdits(doc, props, null);
    if (!plan) {
      keysWhy = propWhy;
      if (!cels.size && !fx.size) return false;
    } else if (plan.changed) {
      applyPropEdits(doc, plan);
      changed = true;
    }
  }
  for (const [layerId, ids] of cels) {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (!layer) continue;
    const keep: typeof layer.cels = [];
    for (const c of layer.cels) {
      if (!ids.has(c.id)) {
        keep.push(c);
        continue;
      }
      changed = true;
      const prev = keep[keep.length - 1];
      if (prev && end(prev) === c.start) prev.length += c.length;
    }
    layer.cels = keep;
  }
  for (const [layerId, byEffect] of fx) {
    const layer = doc.layers.find((l) => l.id === layerId);
    for (const [effectId, frames] of byEffect) {
      const e = layer?.effects?.find((x) => x.id === effectId);
      if (!e?.keys) continue;
      const before = e.keys.length;
      e.keys = e.keys.filter((k) => !frames.has(k.frame));
      if (e.keys.length !== before) changed = true;
      // One key left is a still value, not an animation: fold it back into the effect's settings.
      if (e.keys.length < 2) {
        if (e.keys[0]) Object.assign(e.values, e.keys[0].values);
        delete e.keys;
      }
    }
  }
  if (changed) pruneDrawings(doc);
  return changed;
}

// ---------------------------------------------------------------- on the store

export type KeysOutcome = { ok: true; refs: KeyRef[] } | { ok: false; why: string };

function lockedAmong(refs: Iterable<KeyRef>): Layer | undefined {
  const doc = store().get().doc;
  const ids = layersOf(refs);
  return doc.layers.find((l) => ids.has(l.id) && l.locked);
}

const LOCKED = (l: Layer) => `${l.name} is locked. Unlock it (the padlock) to change its keys.`;

/** Moves the keys by whole frames, as one undo step. */
export function moveKeys(refs: KeyRef[], by: number, coalesce?: string): KeysOutcome {
  if (!refs.length || !by) return { ok: false, why: '' };
  const locked = lockedAmong(refs);
  if (locked) return { ok: false, why: LOCKED(locked) };
  let out: KeyRef[] | null = null;
  store().update(refs.length === 1 ? 'Move a key' : 'Move keys', (d) => void (out = retimeKeys(d as Doc, refs, (f) => f + by)), coalesce ? { coalesce } : undefined);
  return out ? { ok: true, refs: out } : { ok: false, why: keysWhy || 'Those keys would land on other keys there.' };
}

/** Spreads the keys out (factor above 1) or squeezes them together, from the earliest one, as one undo step. */
export function scaleKeys(refs: KeyRef[], factor: number, anchor?: number): KeysOutcome {
  if (refs.length < 2 || !(factor > 0) || factor === 1) return { ok: false, why: 'Pick two or more keys to spread out or squeeze together.' };
  const locked = lockedAmong(refs);
  if (locked) return { ok: false, why: LOCKED(locked) };
  const a = anchor ?? firstFrameOf(store().get().doc, refs) ?? 0;
  let out: KeyRef[] | null = null;
  store().update(factor > 1 ? 'Spread keys out' : 'Squeeze keys together', (d) => void (out = retimeKeys(d as Doc, refs, scaleMap(a, factor))));
  return out ? { ok: true, refs: out } : { ok: false, why: keysWhy || 'Squeezed that much, some keys would land on the same frame.' };
}

/** Deletes the keys, as one undo step. */
export function deleteKeys(refs: KeyRef[]): KeysOutcome {
  if (!refs.length) return { ok: false, why: '' };
  const locked = lockedAmong(refs);
  if (locked) return { ok: false, why: LOCKED(locked) };
  let done = false;
  keysWhy = '';
  const was = fitLength(store().get().doc);
  store().update(refs.length === 1 ? 'Delete a key' : 'Delete keys', (d) => {
    done = removeKeys(d as Doc, refs);
    if (done && fitLength(d as Doc) < was) foldTail(d as Doc);
  });
  if (done) {
    keepPlayheadIn();
    offerTidyEnd(was);
  }
  return done ? { ok: true, refs: [] } : { ok: false, why: keysWhy };
}
