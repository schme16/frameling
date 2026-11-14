/**
 * Record a move, on the document: turns a plan from core/recordMotion.ts into keys with in-betweens (or two keys and a
 * path) on the layer, starting at the playhead. `applyRecording` is a plain function on a doc, like `applyMotion`;
 * the live part (the thing following the hand while you drag) and the last recording kept for tidying are below it.
 */
import { current, isDraft } from 'immer';
import { useSyncExternalStore } from 'react';
import { registerChoice, withChoice } from '../core/choices';
import { findLayer, pruneDrawings, uid } from '../core/doc';
import type { Cel, Doc, Id, InstanceShape, VectorDrawing } from '../core/format';
import { planMove, stageScale, type Keep, type MovePlan, type Sample } from '../core/recordMotion';
import { store } from '../core/store';
import { getToolSettings, setToolSettings, type ToolSettings } from '../tools/settings';
import { cloneDrawing } from '../timeline/edit-core';
import { toast } from '../ui/toast';
import { nextStart, prepareTargets, type MotionWhere } from './motions';
import { where } from './motion-ops';

/** When the recording runs over drawings later on the layer: take their place, or move them along. */
export type RecordRoom = 'replace' | 'push';

registerChoice<RecordRoom>({
  id: 'record.room',
  title: 'A recorded move that runs over later drawings',
  question: 'Your move is longer than the gap before the next drawing on this layer. What should happen?',
  category: 'Animation',
  default: 'replace',
  help: 'record-motion',
  options: [
    { value: 'replace', label: 'The move takes their place', detail: 'The later drawings that it runs over are replaced by the move. Undo brings them back.', did: 'The move took the place of the drawings it ran over.' },
    { value: 'push', label: 'Move later drawings along', detail: 'The move keeps its length and the drawings after it on this layer move later.', did: 'Later drawings moved along to make room.' },
  ],
});

const plain = <T,>(x: T): T => (isDraft(x) ? (current(x as never) as T) : x);
const end = (c: Cel) => c.start + c.length;

export type RecordOutcome = { ok: true; start: number; frames: number; keys: number; instanceIds: Id[]; wrapped: boolean; layerId: Id } | { ok: false; why: string };

/** True when a move of this plan would run over keys later on the layer, so there is something to ask. */
export function runsOver(doc: Doc, w: MotionWhere, plan: MovePlan): boolean {
  const layer = findLayer(doc, w.layerId);
  if (!layer || layer.kind !== 'vector') return false;
  return layer.cels.some((c) => c.start > w.frame && c.start <= w.frame + plan.frames);
}

/** Adds the recorded move to the layer. Changes `doc` in place. */
export function applyRecording(doc: Doc, w: MotionWhere, plan: MovePlan, room: RecordRoom = 'replace', face = false): RecordOutcome {
  const prep = prepareTargets(doc, w, { allowTween: true });
  if (!prep.ok) return prep;
  const { layer, cel, base, targets, wrapped, start } = prep;
  const lastFrame = start + plan.frames;
  delete cel.tween;
  // Keys later on the layer that the move runs over.
  const inWay = layer.cels.filter((c) => c !== cel && c.start > start && c.start <= lastFrame);
  let restEnd = Math.max(end(cel), lastFrame + 1);
  if (inWay.length) {
    if (room === 'push') {
      const by = lastFrame + 1 - inWay[0].start;
      const from = inWay[0].start;
      for (const c of layer.cels) if (c !== cel && c.start >= from) c.start += by;
    } else {
      restEnd = Math.max(restEnd, ...inWay.map(end));
      for (const c of inWay) layer.cels.splice(layer.cels.indexOf(c), 1);
      const after = layer.cels.filter((c) => c.start > lastFrame).map((c) => c.start);
      if (after.length) restEnd = Math.min(restEnd, Math.min(...after));
    }
  }

  const pristine = plain(base);
  const idx = targets.map((t) => pristine.shapes.findIndex((s) => s.id === t));
  const rests = idx.map((i) => (pristine.shapes[i] as InstanceShape).transform);
  const keys = plan.keys;
  const cels: Cel[] = [];
  keys.forEach((k, ki) => {
    const d = ki === 0 ? base : (cloneDrawing(pristine) as VectorDrawing);
    if (ki) doc.drawings[d.id] = d;
    idx.forEach((i, t) => {
      const s = d.shapes[i] as InstanceShape;
      s.transform = { ...rests[t], x: rests[t].x + k.x, y: rests[t].y + k.y };
    });
    const last = ki === keys.length - 1;
    const at = start + k.frame;
    const c: Cel = { id: ki === 0 ? cel.id : uid('c'), start: at, length: (last ? restEnd : start + keys[ki + 1].frame) - at, drawingId: d.id };
    if (!last && keys[ki + 1].frame - k.frame > 1) c.tween = { ease: k.ease };
    cels.push(c);
  });
  if (plan.path && cels.length > 1) {
    // Absolute stage points: the path is relative to the start, so it begins on the first thing's own place.
    const o = rests[0];
    const mv = <T extends { x: number; y: number }>(p: T) => ({ x: p.x + o.x, y: p.y + o.y });
    const points = plan.path.points.map((p) => ({ ...mv(p), ...(p.c1 ? { c1: mv(p.c1) } : {}), ...(p.c2 ? { c2: mv(p.c2) } : {}) }));
    cels[0].tween = { ease: plan.path.ease, path: { points, orient: face } };
  }
  layer.cels.splice(layer.cels.indexOf(cel), 1, ...cels);
  layer.cels.sort((a, b) => a.start - b.start);
  doc.length = Math.max(doc.length, ...layer.cels.map(end));
  if (inWay.length && room === 'replace') pruneDrawings(doc);
  return { ok: true, start, frames: plan.frames, keys: keys.length, instanceIds: targets, wrapped, layerId: prep.layerId };
}

// ---------------------------------------------------------------- live: the thing follows the hand while you drag

export interface Live {
  layerId: Id;
  celId: Id;
  targets: Id[];
  /** Where each target stood before the drag. */
  rests: { x: number; y: number }[];
  start: number;
  /** The frame the next drawing on the layer starts at (Infinity = none). */
  next: number;
}

/** The step in the history to come back to when the drag ends, so what happened live leaves no undo steps behind. */
export function historyMark(): number | null {
  return store().historyIds().undo;
}

/** Puts the history back to a mark made by `historyMark`. */
export function backTo(mark: number | null): void {
  const s = store();
  let guard = 5000;
  while (s.historyIds().undo !== mark && s.canUndo() && guard-- > 0) s.undo();
}

/** Gets the key ready and makes it follow the hand. Null (with the reason) when there is nothing to move. */
export function beginLive(w: MotionWhere): { live: Live } | { why: string } {
  let live: Live | undefined;
  let why = '';
  store().update('Record a move', (d) => {
    const p = prepareTargets(d as Doc, w, { allowTween: true });
    if (!p.ok) {
      why = p.why;
      return;
    }
    // While performing, the held drawing is what moves, so an old move on it steps aside (it is put back at the end).
    delete p.cel.tween;
    const drawing = p.base;
    const rests = p.targets.map((t) => {
      const s = drawing.shapes.find((x) => x.id === t) as InstanceShape;
      return { x: s.transform.x, y: s.transform.y };
    });
    live = { layerId: p.layerId, celId: p.cel.id, targets: [...p.targets], rests, start: p.start, next: nextStart(p.layer, p.cel) };
  });
  return live ? { live } : { why: why || 'Draw something first, then record its move.' };
}

/** Moves what is being recorded by (dx, dy) from where it started, and keeps its drawing on show up to `frame`. */
export function moveLive(live: Live, dx: number, dy: number, frame: number): void {
  store().update(
    'Record a move',
    (d) => {
      const layer = findLayer(d as Doc, live.layerId);
      const cel = layer?.cels.find((c) => c.id === live.celId);
      const drawing = cel ? (d.drawings[cel.drawingId] as VectorDrawing | undefined) : undefined;
      if (!cel || drawing?.kind !== 'vector') return;
      live.targets.forEach((t, i) => {
        const s = drawing.shapes.find((x) => x.id === t) as InstanceShape | undefined;
        if (s) {
          s.transform.x = live.rests[i].x + dx;
          s.transform.y = live.rests[i].y + dy;
        }
      });
      const want = Math.min(frame - cel.start + 1, live.next - cel.start);
      if (want > cel.length) cel.length = want;
      if (cel.start + cel.length > d.length) d.length = cel.start + cel.length;
    },
    { coalesce: 'record-live' },
  );
}

// ---------------------------------------------------------------- the last take, kept for tidying

/** What the bar over the canvas knows about the recording just made. */
export interface Take {
  samples: Sample[];
  where: MotionWhere;
  start: number;
  /** The history step the result is, so the bar only shows while that is still the latest thing done. */
  undoId: number | null;
  keys: number;
  frames: number;
  /** What the playhead and selection were before recording started. */
  ui: { frame: number; activeLayerId: Id | null; selection: Id[] };
}

let take: Take | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

export function getTake(): Take | null {
  return take;
}
export function useTake(): Take | null {
  return useSyncExternalStore(subscribe, () => take);
}
export function clearTake(): void {
  if (!take) return;
  take = null;
  tell();
}

/** Is the take's result still the latest step, so tidying it is safe? */
export function takeIsLatest(t: Take | null = take): boolean {
  return !!t && t.undoId !== null && store().historyIds().undo === t.undoId;
}

/**
 * Turns the readings into keys with today's Detail and Keep choices, as one undo step. Used straight after a drag, and
 * again when Detail or Keep change: then `redo` takes the last result back first.
 */
export function commitTake(samples: Sample[], w: MotionWhere, saved: Take['ui']): void {
  const { doc } = store().get();
  const set = getToolSettings();
  const keep: Keep = set.recordKeep === 'path' ? 'path' : 'keys';
  const plan = planMove(samples, doc.fps, set.recordDetail, keep, stageScale(doc.width, doc.height));
  if (!plan) {
    take = null;
    tell();
    toast('That was too quick to catch. Press, then drag for a moment, then let go.', { kind: 'warn' });
    return;
  }
  const run = (room: RecordRoom) => {
    let out: RecordOutcome | undefined;
    store().update('Record a move', (d) => {
      out = applyRecording(d as Doc, w, plan, room, set.recordFace);
    });
    if (!out) return;
    if (!out.ok) {
      toast(out.why, { kind: 'warn' });
      return;
    }
    store().setUi({ frame: out.start, activeLayerId: out.layerId, selection: out.instanceIds, playing: false });
    take = { samples, where: w, start: out.start, undoId: store().historyIds().undo, keys: out.keys, frames: out.frames, ui: saved };
    tell();
    // The bar over the canvas says what was made, so there is no toast to add to it.
  };
  if (runsOver(doc, w, plan)) withChoice<RecordRoom>('record.room', run);
  else run('replace');
}

/** Redoes the take with the Detail and Keep choices as they are now. */
export function retune(): void {
  const t = take;
  if (!t || !takeIsLatest(t)) return;
  store().undo();
  commitTake(t.samples, t.where, t.ui);
}

/** Takes the last recording back and leaves things ready to record again. */
export function recordAgain(): void {
  const t = take;
  if (t && takeIsLatest(t)) {
    store().undo();
    store().setUi({ frame: t.start, activeLayerId: t.ui.activeLayerId, selection: t.ui.selection, playing: false });
  }
  clearTake();
}

export function playTake(): void {
  const t = take;
  if (t) store().setUi({ frame: t.start, playing: true });
}

/** What a drag would work on right now, as the one-click motions see it. */
export function recordWhere(): MotionWhere | null {
  return where();
}

/** Changes Detail, Keep or Face the way it goes, and when a recording was just made, redoes it that way. */
export function changeRecordSetting(patch: Partial<Pick<ToolSettings, 'recordDetail' | 'recordKeep' | 'recordFace'>>): void {
  setToolSettings(patch);
  if (takeIsLatest()) retune();
}
