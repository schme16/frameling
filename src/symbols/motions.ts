/**
 * One-click motions on the document: turns a motion's poses (core/motions.ts) into keys with in-betweens on the layer,
 * starting at the playhead. Works on what's selected (symbols move as they are, plain shapes are made into a symbol
 * first) or, with nothing selected, the whole drawing. Plain functions on a doc (a draft or a plain object in tests);
 * motion-ops.ts wraps them in one undo step.
 */
import { current, isDraft } from 'immer';
import type { Cel, Doc, Id, InstanceShape, Layer, VectorDrawing } from '../core/format';
import { celAt, findLayer, uid } from '../core/doc';
import { freeSymbolName, isInstance, makePixelSymbol, makeSymbol, pixelKeyAt, symbolContent } from '../core/symbols';
import { motionFrames, motionKeys, motionPoses, type MotionId } from '../core/motions';
import { shapesBounds, symbolBounds } from '../canvas/geometry';
import { cloneDrawing } from '../timeline/edit-core';

/** When the motion runs into the next drawing on the layer: make it quicker to fit, or move later drawings along. */
export type MotionRoom = 'squeeze' | 'push';

export interface MotionWhere {
  layerId: Id;
  frame: number;
  /** The selection on the drawing at the playhead (empty = the whole drawing). */
  selection: Id[];
}

export type MotionOutcome = { ok: true; start: number; frames: number; instanceIds: Id[]; wrapped: boolean; layerId: Id } | { ok: false; why: string };

const plain = <T,>(x: T): T => (isDraft(x) ? (current(x as never) as T) : x);
const end = (c: Cel) => c.start + c.length;

/** Why a motion can't go here, in plain words, or null when it can. */
export function motionProblem(doc: Doc, w: MotionWhere, opts: { allowTween?: boolean } = {}): string | null {
  const layer = findLayer(doc, w.layerId);
  if (!layer) return 'Add a layer first, then draw something to move.';
  if (layer.locked) return 'This layer is locked. Unlock it in the timeline to animate it.';
  if (layer.kind === 'pixel') {
    if (celAt(layer, w.frame)?.tween) return 'This drawing is already moving (it has in-betweens). Pick a frame without them, or remove them first.';
    return pixelKeyAt(doc, layer.id, w.frame) ? null : 'Draw something first (or go to a frame with a drawing), then make it move.';
  }
  if (layer.kind !== 'vector') return 'One-click motions work on drawing layers.';
  if (layer.rig) return 'This is the Bones layer. Pick the layer with your drawing on it.';
  const cel = celAt(layer, w.frame);
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  if (!cel || d?.kind !== 'vector' || !d.shapes.length) return 'Draw something first (or go to a frame with a drawing), then make it move.';
  if (cel.tween && !(opts.allowTween && w.frame === cel.start)) return 'This drawing is already moving (it has in-betweens). Pick a frame without them, or remove them first.';
  return null;
}

/** The next drawing after the one at the playhead, on the same layer (where the motion would run into it). */
export function nextStart(layer: Layer, cel: Cel): number {
  return layer.cels.find((c) => c.start >= end(cel))?.start ?? Infinity;
}

/** True when the motion fits before the next drawing on the layer, so there's nothing to ask. */
export function motionFits(doc: Doc, w: MotionWhere, id: MotionId): boolean {
  const layer = findLayer(doc, w.layerId);
  const cel = layer && celAt(layer, w.frame);
  if (!layer || !cel) return true;
  return w.frame + motionFrames(id, doc.fps) < nextStart(layer, cel);
}

/** Stage size of an instance (its symbol's box, scaled). */
function instanceSize(doc: Doc, s: InstanceShape): { w: number; h: number } {
  const r = symbolBounds(doc, s.symbolId);
  if (!r) return { w: 40, h: 40 };
  return { w: r.w * Math.abs(s.transform.scaleX), h: r.h * Math.abs(s.transform.scaleY) };
}

export interface Prepared {
  layer: Layer;
  cel: Cel;
  base: VectorDrawing;
  /** The instances that move. */
  targets: Id[];
  /** Plain shapes (or pixels) were made into a symbol to be moved. */
  wrapped: boolean;
  start: number;
  layerId: Id;
}

/**
 * Gets the key at the playhead ready to be moved: a pixel key made into a symbol, a hold split so the move starts at
 * the playhead, a drawing shared with other frames given its own copy, and plain shapes made into a symbol. Changes
 * `doc` in place.
 */
export function prepareTargets(doc: Doc, w: MotionWhere, opts: { allowTween?: boolean } = {}): ({ ok: true } & Prepared) | { ok: false; why: string } {
  const why = motionProblem(doc, w, opts);
  if (why) return { ok: false, why };
  let layer = findLayer(doc, w.layerId)!;
  // Pixel art moves as a symbol: the key becomes one first, on a vector layer in the same place.
  let lifted = false;
  if (layer.kind === 'pixel') {
    const made = makePixelSymbol(doc, layer.id, w.frame, freeSymbolName(doc, 'Moving part'));
    if (!made) return { ok: false, why: 'Draw something first (or go to a frame with a drawing), then make it move.' };
    w = { ...w, layerId: made.layerId, selection: [made.instanceId] };
    layer = findLayer(doc, made.layerId)!;
    lifted = true;
  }
  let cel = celAt(layer, w.frame)!;
  const start = w.frame;

  // Start at the playhead: split a hold there.
  if (start > cel.start) {
    const copy = cloneDrawing(doc.drawings[cel.drawingId]);
    doc.drawings[copy.id] = copy;
    const tail: Cel = { id: uid('c'), start, length: end(cel) - start, drawingId: copy.id };
    cel.length = start - cel.start;
    // The held part keeps its look. A selection was made on the shared drawing, so map it across by position.
    const before = doc.drawings[cel.drawingId] as VectorDrawing;
    const sel = new Set(w.selection);
    w = { ...w, selection: before.shapes.flatMap((s, i) => (sel.has(s.id) ? [(copy as VectorDrawing).shapes[i].id] : [])) };
    delete cel.autoHold;
    layer.cels.push(tail);
    layer.cels.sort((a, b) => a.start - b.start);
    cel = tail;
  } else if (doc.layers.some((l) => l.cels.some((c) => c !== cel && c.drawingId === cel.drawingId)) || sharedInSymbols(doc, cel)) {
    // Another frame shows this same drawing: give this key its own copy, keeping selected shapes' positions.
    const old = doc.drawings[cel.drawingId] as VectorDrawing;
    const copy = cloneDrawing(old) as VectorDrawing;
    doc.drawings[copy.id] = copy;
    const sel = new Set(w.selection);
    w = { ...w, selection: old.shapes.flatMap((s, i) => (sel.has(s.id) ? [copy.shapes[i].id] : [])) };
    cel.drawingId = copy.id;
  }

  // What moves: selected symbols as they are, selected plain shapes (or the whole drawing) made into one symbol.
  const base = doc.drawings[cel.drawingId] as VectorDrawing;
  const sel = new Set(w.selection.filter((sid) => base.shapes.some((s) => s.id === sid)));
  let targets: Id[];
  let wrapped = lifted;
  const picked = sel.size ? base.shapes.filter((s) => sel.has(s.id)) : base.shapes;
  const loose = picked.filter((s) => !isInstance(s));
  targets = picked.filter(isInstance).map((s) => s.id);
  if (loose.length) {
    const b = shapesBounds(plain(loose));
    const origin = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
    const made = makeSymbol(doc, base.id, loose.map((s) => s.id), origin, freeSymbolName(doc, 'Moving part'));
    if (made) {
      targets.push(made.instanceId);
      wrapped = true;
    }
  }
  if (!targets.length) return { ok: false, why: 'Select something to move first.' };
  return { ok: true, layer, cel, base, targets, wrapped, start, layerId: w.layerId };
}

/**
 * Adds the motion. Changes `doc` in place. `room` says what to do when it runs into the next drawing (the default
 * squeezes it in).
 */
export function applyMotion(doc: Doc, w: MotionWhere, id: MotionId, room: MotionRoom = 'squeeze'): MotionOutcome {
  const prep = prepareTargets(doc, w);
  if (!prep.ok) return prep;
  const { layer, cel, base, targets, wrapped, start } = prep;
  w = { ...w, layerId: prep.layerId };

  // How long, and room for it.
  let frames = motionFrames(id, doc.fps);
  const minFrames = motionPoses(id, 1, 1).length - 1;
  const next = nextStart(layer, cel);
  if (start + frames >= next) {
    if (room === 'squeeze' && next - start - 1 >= minFrames) frames = next - start - 1;
    else {
      // Move everything after it along, on this layer only.
      const by = start + frames + 1 - next;
      for (const c of layer.cels) if (c.start >= next) c.start += by;
    }
  }
  const restEnd = Math.max(end(cel), start + frames + 1);

  // The keys. Every target shares the frames (they depend only on the motion), each has its own rest pose.
  const pristine = plain(base);
  const idx = targets.map((t) => pristine.shapes.findIndex((s) => s.id === t));
  const plans = idx.map((i) => {
    const s = pristine.shapes[i] as InstanceShape;
    return motionKeys(id, { transform: s.transform, opacity: s.opacity }, instanceSize(plain(doc), s), frames);
  });
  const keyFrames = plans[0].map((k) => k.frame);
  const oldTween = cel.tween;
  const cels: Cel[] = [];
  const ids: Id[] = [];
  keyFrames.forEach((kf, k) => {
    const d = k === 0 ? base : (cloneDrawing(pristine) as VectorDrawing);
    if (k) doc.drawings[d.id] = d;
    idx.forEach((i, t) => {
      const s = d.shapes[i] as InstanceShape;
      const key = plans[t][k];
      s.transform = { ...key.transform };
      s.opacity = key.opacity;
      if (k === 0) ids.push(s.id);
    });
    const last = k === keyFrames.length - 1;
    const at = start + kf;
    const c: Cel = { id: k === 0 ? cel.id : uid('c'), start: at, length: (last ? restEnd : start + keyFrames[k + 1]) - at, drawingId: d.id };
    if (!last) c.tween = { ease: plans[0][k].ease };
    else if (oldTween) c.tween = oldTween;
    cels.push(c);
  });
  layer.cels.splice(layer.cels.indexOf(cel), 1, ...cels);
  layer.cels.sort((a, b) => a.start - b.start);
  doc.length = Math.max(doc.length, ...layer.cels.map(end));
  return { ok: true, start, frames, instanceIds: ids, wrapped, layerId: w.layerId };
}

/** Cels inside symbols that show this drawing (a key copied into a symbol). */
function sharedInSymbols(doc: Doc, cel: Cel): boolean {
  for (const id of Object.keys(doc.symbols ?? {})) {
    const c = symbolContent(doc, id);
    if (c?.layers.some((l) => l.cels.some((x) => x !== cel && x.drawingId === cel.drawingId))) return true;
  }
  return false;
}
