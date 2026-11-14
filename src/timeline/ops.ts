/**
 * The timeline's edit operations, applied to the app's store. Every one is a single undo step with a plain-words
 * label ("Undo Add a frame"). The maths lives in `edit-core.ts`; this file adds the store, the current frame and
 * layer as defaults, the locked-layer check, and what the playhead and active layer do afterwards.
 *
 * Every function returns an `Outcome` instead of throwing. When `ok` is false, `reason` says why and `whyNot()`
 * gives a friendly sentence for a toast.
 */
import type { Draft } from 'immer';
import type { ClipDirection, Doc, Id } from '../core/format';
import { celAt, findLayer } from '../core/doc';
import { store } from '../core/store';
import * as core from './edit-core';
import type { Clash } from './edit-core';
import { shiftInOut } from './inout';
import { emptyTail, fitLength, tidyEnd as tidyEndCore } from './tidyEnd';
import { canAsk, currentChoice, rememberedChoice, withChoice } from '../core/choices';
import type { TidyEndChoice } from './choices';
import './choices';

export type Reason = 'locked' | 'no-layer' | 'nothing-here' | 'last-layer' | 'no-change' | 'in-symbol';
export interface Outcome {
  ok: boolean;
  reason?: Reason;
  /** The id of whatever was made (a cel, layer, clip or marker). */
  id?: Id;
}

const WHY: Record<Reason, string> = {
  locked: 'This layer is locked. Unlock it (the padlock) to change its frames.',
  'no-layer': 'Add a layer first.',
  'nothing-here': 'There is no drawing on this frame. Press N to start one.',
  'last-layer': 'You need at least one layer, so this one has to stay.',
  'no-change': 'Nothing to change there.',
  'in-symbol': 'Markers and clips belong to the main scene. Go back out of the symbol first.',
};

/** A friendly sentence for why an op did nothing. */
export function whyNot(o: Outcome): string {
  return o.reason ? WHY[o.reason] : '';
}

const ok = (id?: Id): Outcome => ({ ok: true, id });
const no = (reason: Reason): Outcome => ({ ok: false, reason });

// ---------------------------------------------------------------- the end of the animation

/**
 * Inside an edit: if you've said "take them off", the empty frames go in the same undo step. Where the question
 * can't be put at all (a script, an automated run), the default answer stands and folds in the same way, so the edit
 * is still one undo step. Only the main timeline.
 */
export function foldTail(d: Draft<Doc>): void {
  if (d.editing) return;
  const answer = rememberedChoice('timeline.tidyEnd') ?? (canAsk('timeline.tidyEnd') ? undefined : currentChoice('timeline.tidyEnd'));
  if (answer === 'tidy') tidyEndCore(d as Doc);
}

/** After the end moved in, the playhead stays on a frame that is still there. */
export function keepPlayheadIn(): void {
  const { doc, ui } = store().get();
  if (ui.frame > doc.length - 1) store().setUi({ frame: Math.max(0, doc.length - 1) });
}

/** After an edit that pulled the last thing in (it ended at frame `was`, now earlier) and left empty frames: take them off and say so, until you've chosen otherwise. */
export function offerTidyEnd(was = 0): void {
  const doc = store().get().doc;
  if (doc.editing || fitLength(doc) >= was || !emptyTail(doc)) return;
  // Only empty frames go, and Undo brings them back, so it just happens and a toast says so (with a Change button).
  withChoice<TidyEndChoice>(
    'timeline.tidyEnd',
    (v) => {
      if (v === 'tidy') tidyEnd();
    },
    { gently: true },
  );
}

/**
 * A store update that watches the end of the animation: if the edit pulls the last drawing, marker or clip in and
 * leaves empty frames on the end, they go in the same undo step when you've said so, and otherwise you're asked
 * (once). Opening a file never does this, and neither does an edit that leaves the end alone.
 */
function update(label: string, recipe: (d: Draft<Doc>) => void, opts?: { coalesce?: string }): void {
  const was = fitLength(store().get().doc);
  store().update(label, (d) => {
    recipe(d);
    if (fitLength(d as Doc) < was) foldTail(d);
  }, opts);
  keepPlayheadIn();
  offerTidyEnd(was);
}

/** Takes the empty frames off the end now, whatever you've chosen to do after edits. */
export function tidyEnd(): Outcome {
  const o = simple('Take the empty frames off the end', (d) => !d.editing && tidyEndCore(d as Doc));
  keepPlayheadIn();
  return o;
}

/** The layer edits go to when none is named: the active one, or the top one. */
export function currentLayerId(): Id | null {
  const { doc, ui } = store().get();
  return findLayer(doc, ui.activeLayerId)?.id ?? doc.layers[doc.layers.length - 1]?.id ?? null;
}

function target(layerId?: Id, frame?: number): { layerId: Id; frame: number } | null {
  const id = layerId ?? currentLayerId();
  return id ? { layerId: id, frame: frame ?? store().get().ui.frame } : null;
}

/** Runs a cel edit: checks the layer exists and isn't locked, applies it as one undo step. */
function edit(label: string, layerId: Id | undefined, run: (doc: Draft<Doc>, layerId: Id) => Id | boolean | null, opts?: { coalesce?: string }): Outcome {
  const id = layerId ?? currentLayerId();
  const layer = findLayer(store().get().doc, id);
  if (!id || !layer) return no('no-layer');
  if (layer.locked) return no('locked');
  let result: Id | boolean | null = null;
  const before = store().get().doc;
  update(label, (d) => void (result = run(d, id)), opts);
  if (!result) return no('nothing-here');
  // A recipe that said yes but left the doc alone (same length, say) changed nothing.
  if (store().get().doc === before) return no('no-change');
  return ok(typeof result === 'string' ? result : undefined);
}

// ---------------------------------------------------------------- keys

/** A new empty drawing at the current frame (splits a hold; on an empty frame makes a key). */
export function newBlankKey(layerId?: Id, frame?: number, copy = false): Outcome {
  const t = target(layerId, frame);
  if (!t) return no('no-layer');
  return edit(copy ? 'New drawing (copy of this one)' : 'New blank drawing', t.layerId, (d) => core.newBlankKey(d, t.layerId, t.frame, copy));
}

/** Copies the drawing to the next frame and moves the playhead onto the copy. On an empty frame, copies the last drawing to it. */
export function duplicateKey(layerId?: Id, frame?: number): Outcome {
  const t = target(layerId, frame);
  if (!t) return no('no-layer');
  // On an empty frame, copy the last drawing to here instead, and stay put.
  const layer = findLayer(store().get().doc, t.layerId);
  if (layer && !celAt(layer, t.frame) && layer.cels.some((c) => c.start < t.frame)) {
    const here = edit('Copy the last drawing to this frame', t.layerId, (d) => core.copyEarlierKey(d, t.layerId, t.frame));
    if (here.ok) store().setUi({ activeLayerId: t.layerId });
    return here;
  }
  const r = edit('Copy drawing to next frame', t.layerId, (d) => core.duplicateKey(d, t.layerId, t.frame));
  if (r.ok) store().setUi({ frame: t.frame + 1, activeLayerId: t.layerId });
  return r;
}

export function clearKey(layerId?: Id, frame?: number): Outcome {
  const t = target(layerId, frame);
  if (!t) return no('no-layer');
  return edit('Clear drawing', t.layerId, (d) => core.clearKey(d, t.layerId, t.frame));
}

/** Removes the drawing and its hold, leaving empty frames. */
export function deleteKey(layerId?: Id, frame?: number): Outcome {
  const t = target(layerId, frame);
  if (!t) return no('no-layer');
  return edit('Make frames empty', t.layerId, (d) => core.deleteKey(d, t.layerId, t.frame));
}

export function insertFrame(layerId?: Id, frame?: number): Outcome {
  const t = target(layerId, frame);
  if (!t) return no('no-layer');
  // With one layer, a frame on it is a frame of the whole animation, so the play range moves too.
  return edit('Add a frame', t.layerId, (d) => {
    const done = core.insertFrame(d, t.layerId, t.frame);
    if (done && d.layers.length === 1) shiftInOut(d, t.frame, 1);
    return done;
  });
}

export function removeFrame(layerId?: Id, frame?: number): Outcome {
  const t = target(layerId, frame);
  if (!t) return no('no-layer');
  return edit('Remove a frame', t.layerId, (d) => {
    const done = core.removeFrame(d, t.layerId, t.frame);
    if (done && d.layers.length === 1) shiftInOut(d, t.frame, -1);
    return done;
  });
}

/** Adds a frame at the playhead on every unlocked layer, in one undo step (like adding a page to the whole flipbook). */
export function insertFrameAll(frame?: number): Outcome {
  const at = frame ?? store().get().ui.frame;
  let any = false;
  store().update('Add a frame (all layers)', (d) => {
    for (const l of d.layers) if (!l.locked && core.insertFrame(d, l.id, at)) any = true;
    if (any) shiftInOut(d, at, 1);
  });
  return any ? ok() : no('nothing-here');
}

/** Removes the frame at the playhead from every unlocked layer, in one undo step. */
export function removeFrameAll(frame?: number): Outcome {
  const at = frame ?? store().get().ui.frame;
  let any = false;
  const before = store().get().doc;
  update('Remove a frame (all layers)', (d) => {
    for (const l of d.layers) if (!l.locked && core.removeFrame(d, l.id, at)) any = true;
    if (any) shiftInOut(d, at, -1);
  });
  if (!any || store().get().doc === before) return no('nothing-here');
  return ok();
}

const ON: Record<number, string> = { 1: ' (on ones)', 2: ' (on twos)', 3: ' (on threes)', 4: ' (on fours)' };

/** Holds the drawing at the frame for `frames` frames (1 = on ones, 2 = on twos...). */
export function setExposure(frames: number, layerId?: Id, frame?: number, clash: Clash = 'push'): Outcome {
  const t = target(layerId, frame);
  if (!t) return no('no-layer');
  const layer = findLayer(store().get().doc, t.layerId);
  if (layer && !celAt(layer, t.frame)) return no('nothing-here');
  return edit(`Hold for ${frames} frame${frames === 1 ? '' : 's'}${ON[frames] ?? ''}`, t.layerId, (d) => core.setExposure(d, t.layerId, t.frame, frames, clash));
}

export function moveCel(layerId: Id, celId: Id, start: number, clash: Clash = 'push', toLayerId?: Id): Outcome {
  const dest = findLayer(store().get().doc, toLayerId ?? layerId);
  if (dest?.locked) return no('locked');
  return edit('Move drawing', layerId, (d) => core.moveCel(d, layerId, celId, start, clash, toLayerId));
}

export function resizeCel(layerId: Id, celId: Id, length: number, clash: Clash = 'push'): Outcome {
  return edit('Change how long a drawing is held', layerId, (d) => core.resizeCel(d, layerId, celId, length, clash));
}

// ---------------------------------------------------------------- layers

export function addVectorLayer(aboveId?: Id | null): Outcome {
  const above = aboveId === undefined ? currentLayerId() : aboveId;
  let id = '';
  store().update('Add vector layer', (d) => void (id = core.addVectorLayer(d, above)));
  store().setUi({ activeLayerId: id });
  return ok(id);
}

export function addPixelLayer(aboveId?: Id | null, pixelSize?: number): Outcome {
  const above = aboveId === undefined ? currentLayerId() : aboveId;
  let id = '';
  store().update('Add pixel layer', (d) => void (id = core.addPixelLayer(d, above, undefined, pixelSize)));
  store().setUi({ activeLayerId: id });
  return ok(id);
}

export function deleteLayer(layerId?: Id): Outcome {
  const id = layerId ?? currentLayerId();
  if (!id || !findLayer(store().get().doc, id)) return no('no-layer');
  let next: Id | null = null;
  update('Delete layer', (d) => void (next = core.deleteLayer(d, id)?.next ?? null));
  if (!next) return no('last-layer');
  if (store().get().ui.activeLayerId === id) store().setUi({ activeLayerId: next });
  return ok();
}

export function duplicateLayer(layerId?: Id): Outcome {
  const id = layerId ?? currentLayerId();
  if (!id || !findLayer(store().get().doc, id)) return no('no-layer');
  let copy: Id | null = null;
  store().update('Duplicate layer', (d) => void (copy = core.duplicateLayer(d, id)));
  if (!copy) return no('no-layer');
  store().setUi({ activeLayerId: copy });
  return ok(copy);
}

export function renameLayer(layerId: Id, name: string): Outcome {
  return simple('Rename layer', (d) => core.renameLayer(d, layerId, name));
}

/** Moves a layer to array index `to` (bottom first). */
export function reorderLayer(layerId: Id, to: number): Outcome {
  return simple('Move layer', (d) => core.reorderLayer(d, layerId, to));
}

export function stepLayer(dir: 'up' | 'down', layerId?: Id): Outcome {
  const id = layerId ?? currentLayerId();
  if (!id) return no('no-layer');
  return simple(dir === 'up' ? 'Move layer up' : 'Move layer down', (d) => core.stepLayer(d, id, dir));
}

export function setLayerVisible(layerId: Id, visible: boolean): Outcome {
  return simple(visible ? 'Show layer' : 'Hide layer', (d) => core.setLayerVisible(d, layerId, visible));
}

export function setLayerLocked(layerId: Id, locked: boolean): Outcome {
  return simple(locked ? 'Lock layer' : 'Unlock layer', (d) => core.setLayerLocked(d, layerId, locked));
}

export function setLayerOnion(layerId: Id, onion: boolean): Outcome {
  return simple(onion ? 'Show layer in onion skin' : 'Leave layer out of onion skin', (d) => core.setLayerOnion(d, layerId, onion));
}

export function setLayerReference(layerId: Id, reference: boolean): Outcome {
  return simple(reference ? 'Make reference layer (not exported)' : 'Export this layer again', (d) => core.setLayerReference(d, layerId, reference));
}

export function toggleLayerReference(layerId?: Id): Outcome {
  const id = layerId ?? currentLayerId();
  const l = findLayer(store().get().doc, id);
  return l ? setLayerReference(l.id, !l.reference) : no('no-layer');
}

/** Drag a slider and it is one undo step. */
export function setLayerOpacity(layerId: Id, opacity: number): Outcome {
  return simple('Change layer opacity', (d) => core.setLayerOpacity(d, layerId, opacity), { coalesce: `layer-opacity:${layerId}` });
}

export function toggleLayerVisible(layerId?: Id): Outcome {
  const id = layerId ?? currentLayerId();
  const l = findLayer(store().get().doc, id);
  return l ? setLayerVisible(l.id, !l.visible) : no('no-layer');
}

export function toggleLayerLocked(layerId?: Id): Outcome {
  const id = layerId ?? currentLayerId();
  const l = findLayer(store().get().doc, id);
  return l ? setLayerLocked(l.id, !l.locked) : no('no-layer');
}

// ---------------------------------------------------------------- document, clips, markers

export function setFps(fps: number): Outcome {
  return simple('Change speed (frames per second)', (d) => core.setFps(d, fps), { coalesce: 'fps' });
}

export function setDocLength(length: number): Outcome {
  return simple('Change animation length', (d) => core.setDocLength(d, length), { coalesce: 'doc-length' });
}

/** Markers and clips are the scene's: inside a symbol they would land on the scene at the symbol's frame numbers. */
const inSymbol = (): boolean => !!store().get().doc.editing?.length;

export function addClip(a: number, b: number, name?: string): Outcome {
  if (inSymbol()) return no('in-symbol');
  let id = '';
  store().update('Add clip', (d) => void (id = core.addClip(d, a, b, name)));
  return ok(id);
}
export function renameClip(id: Id, name: string): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Rename clip', (d) => core.renameClip(d, id, name));
}
export function setClipRange(id: Id, a: number, b: number): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Change clip frames', (d) => core.setClipRange(d, id, a, b));
}
export function setClipLoop(id: Id, loop: boolean): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple(loop ? 'Make clip loop' : 'Make clip play once', (d) => core.setClipLoop(d, id, loop));
}
export function setClipDirection(id: Id, direction: ClipDirection): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Change how a clip plays', (d) => core.setClipDirection(d, id, direction));
}
export function setClipRepeat(id: Id, repeat: 'forever' | number): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Change how often a clip plays', (d) => core.setClipRepeat(d, id, repeat));
}
export function removeClip(id: Id): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Delete clip', (d) => core.removeClip(d, id));
}

export function addMarker(frame?: number, name?: string): Outcome {
  if (inSymbol()) return no('in-symbol');
  let id = '';
  const f = frame ?? store().get().ui.frame;
  store().update('Add marker', (d) => void (id = core.addMarker(d, f, name)));
  return ok(id);
}
export function renameMarker(id: Id, name: string): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Rename marker', (d) => core.renameMarker(d, id, name));
}
export function moveMarker(id: Id, frame: number): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Move marker', (d) => core.moveMarker(d, id, frame));
}
export function removeMarker(id: Id): Outcome {
  if (inSymbol()) return no('in-symbol');
  return simple('Delete marker', (d) => core.removeMarker(d, id));
}

function simple(label: string, run: (doc: Draft<Doc>) => boolean, opts?: { coalesce?: string }): Outcome {
  let did = false;
  store().update(label, (d) => void (did = run(d)), opts);
  return did ? ok() : no('no-change');
}
