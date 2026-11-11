/**
 * Symbol and tween actions, each one undo step. They read the store, refuse with a friendly line when they can't
 * (returned as a string so callers can toast or hint it), and otherwise change the document.
 */
import type { Draft } from 'immer';
import type { Cel, Doc, Easing, Id, InstanceShape, Layer, MotionPath, PathPoint, Shape, Tween, VectorDrawing } from '../core/format';
import { celAt, findLayer, uid } from '../core/doc';
import { store } from '../core/store';
import { easeLabel } from '../core/ease';
import {
  deleteUnusedSymbols,
  duplicateSymbol,
  enterSymbol,
  exitSymbol,
  freeSymbolName,
  identityTransform,
  instanceAt,
  isInstance,
  makeSymbol,
  newInstance,
  nextKey,
  symbolContent,
  symbolFrame,
  symbolsInside,
  transformMatrix,
} from '../core/symbols';
import { shapesBounds, symbolBounds } from '../canvas/geometry';
import { cloneDrawing } from '../timeline/edit-core';
import { activeLayer, editActiveDrawing, EDIT_HINTS } from '../tools/edit';
import { toast } from '../ui/toast';
import { leaveTileEdit } from '../tiles/tileEdit';

/** The first thing new in-betweens get. Gentle at both ends looks natural for most moves. */
export const DEFAULT_EASE: Easing = 'easeInOut';

/** Nothing went wrong (undefined), or why not, in plain words. */
export type Result = string | undefined;

const say = (r: Result): Result => {
  if (r) toast(r, { kind: 'warn' });
  return r;
};

// ---------------------------------------------------------------- reading

/** The active layer's drawing at the playhead, with its cel. */
export function currentKey(): { layer: Layer; cel: Cel; drawing: VectorDrawing } | undefined {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  const cel = layer ? celAt(layer, ui.frame) : undefined;
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  return layer && cel && d?.kind === 'vector' ? { layer, cel, drawing: d } : undefined;
}

/** The selected instances on the active drawing. */
export function selectedInstances(): InstanceShape[] {
  const k = currentKey();
  if (!k) return [];
  const sel = new Set(store().get().ui.selection);
  return k.drawing.shapes.filter((s): s is InstanceShape => isInstance(s) && sel.has(s.id));
}

/** The one selected instance, if exactly one is. */
export function selectedInstance(): InstanceShape | undefined {
  const list = selectedInstances();
  return list.length === 1 ? list[0] : undefined;
}

/** Breadcrumb names, outermost first ("Scene" is the stage). */
export function editPath(doc: Doc): { id: Id | null; name: string }[] {
  const out: { id: Id | null; name: string }[] = [{ id: null, name: 'Scene' }];
  for (const f of doc.editing ?? []) out.push({ id: f.symbolId, name: doc.symbols?.[f.symbolId]?.name ?? 'Symbol' });
  return out;
}

// ---------------------------------------------------------------- making and editing symbols

/** Turns the selected shapes (or the whole drawing when nothing is picked) into a new symbol. */
export function makeSymbolFromSelection(name?: string): Result {
  const { layer, problem } = activeLayer();
  if (problem || !layer) return say(EDIT_HINTS[problem ?? 'no-layer']);
  if (layer.kind !== 'vector') return say('Symbols are made from drawing layers. Pick a vector layer first.');
  const k = currentKey();
  if (!k || !k.drawing.shapes.length) return say('Draw something first, then make it into a symbol.');
  const sel = new Set(store().get().ui.selection);
  let shapes = k.drawing.shapes.filter((s) => sel.has(s.id));
  if (!shapes.length) shapes = k.drawing.shapes;
  const b = shapesBounds(shapes);
  const origin = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
  const ids = shapes.map((s) => s.id);
  let made: { symbolId: Id; instanceId: Id } | undefined;
  editActiveDrawing('Make a symbol', 'vector', (d, doc) => {
    // Held frames may have handed us a fresh copy, whose shapes have new ids: fall back to all of them.
    const pick = d.shapes.some((s) => ids.includes(s.id)) ? ids : d.shapes.map((s) => s.id);
    made = makeSymbol(doc as Doc, d.id, pick, origin, name);
  });
  if (!made) return undefined;
  store().setUi({ selection: [made.instanceId], tool: 'select' });
  const symName = store().get().doc.symbols?.[made.symbolId]?.name ?? 'symbol';
  toast(`Made "${symName}". Double-click it to draw inside, or find it in the Library.`, { kind: 'success' });
  return undefined;
}

/** Opens the instance (selected one by default) for editing in place. */
export function editInstance(id?: Id): Result {
  const { doc, ui } = store().get();
  const k = currentKey();
  const inst = k ? (id ? (k.drawing.shapes.find((s) => s.id === id) as InstanceShape | undefined) : selectedInstance()) : undefined;
  if (!k || !inst || !isInstance(inst)) return say('Select a symbol on the canvas first (or double-click it).');
  const c = symbolContent(doc, inst.symbolId);
  if (!c) return say("That symbol is missing, so there's nothing to edit.");
  // Where it actually is on this frame, tweens included, so the surroundings line up.
  const now = instanceAt(doc, k.layer, ui.frame, inst.id) ?? inst;
  const local = symbolFrame(inst, ui.frame - k.cel.start, c.length);
  return open(inst.symbolId, { instanceId: inst.id, matrix: transformMatrix(now.transform, c.def.origin) }, local);
}

/** Opens a symbol by itself (from the Library). */
export function editSymbol(id: Id): Result {
  // A tile open on the canvas goes back first, so the symbol opens in the document rather than in the tile.
  leaveTileEdit();
  if (!store().get().doc.symbols?.[id]) return say("That symbol is missing, so there's nothing to edit.");
  return open(id, { matrix: [1, 0, 0, 1, 0, 0] }, 0);
}

function open(symbolId: Id, at: { instanceId?: Id; matrix: [number, number, number, number, number, number] }, frame: number): Result {
  const { doc, ui } = store().get();
  if (doc.editing?.some((f) => f.symbolId === symbolId)) return say("You're already inside that symbol.");
  const name = doc.symbols?.[symbolId]?.name ?? 'symbol';
  let ok = false;
  store().update(`Edit "${name}"`, (d) => {
    ok = enterSymbol(d as Doc, symbolId, { ...at, frame: ui.frame, activeLayerId: ui.activeLayerId });
  });
  if (!ok) return undefined;
  const now = store().get().doc;
  store().setUi({ frame: Math.min(frame, now.length - 1), activeLayerId: now.layers[now.layers.length - 1]?.id ?? null, selection: [], playing: false });
  // Inside a symbol you draw in its own space, which only shows where it overlaps the stage.
  const b = symbolBounds(now, symbolId);
  if (b && (b.x + b.w < 0 || b.y + b.h < 0 || b.x > now.width || b.y > now.height)) toast("This symbol's drawing sits off the stage, so it's out of sight while you draw inside it.", { kind: 'warn' });
  return undefined;
}

/** Goes back out one level (or `levels`, or all the way with Infinity). */
export function leaveSymbol(levels = 1): Result {
  leaveTileEdit();
  const doc = store().get().doc;
  if (!doc.editing?.length) return undefined;
  for (let i = 0; i < levels; i++) {
    const cur = store().get().doc;
    if (!cur.editing?.length) break;
    const outer = cur.editing.length > 1 ? (cur.symbols?.[cur.editing[cur.editing.length - 2].symbolId]?.name ?? 'symbol') : 'scene';
    let back: { frame: number; activeLayerId: Id | null; instanceId?: Id } | undefined;
    store().update(`Back to ${outer}`, (d) => {
      // Read what we need while the draft is alive.
      const f = exitSymbol(d as Doc);
      if (f) back = { frame: f.frame, activeLayerId: f.activeLayerId, instanceId: f.instanceId };
    });
    if (back) store().setUi({ frame: back.frame, activeLayerId: back.activeLayerId, selection: back.instanceId ? [back.instanceId] : [], playing: false });
  }
  return undefined;
}

/** Would putting `symbolId` here put a symbol inside itself? */
export function wouldNestInItself(doc: Doc, symbolId: Id): boolean {
  const open = new Set((doc.editing ?? []).map((f) => f.symbolId));
  if (!open.size) return false;
  if (open.has(symbolId)) return true;
  for (const id of symbolsInside(doc, symbolId)) if (open.has(id)) return true;
  return false;
}

/** Places a new instance at a stage point (the middle of the stage by default) on the active layer. */
export function placeInstance(symbolId: Id, at?: { x: number; y: number }): Result {
  const doc = store().get().doc;
  const c = symbolContent(doc, symbolId);
  if (!c) return say("That symbol is missing, so it can't be placed.");
  if (wouldNestInItself(doc, symbolId)) return say("A symbol can't go inside itself.");
  const { layer, problem } = activeLayer();
  if (problem || !layer) return say(EDIT_HINTS[problem ?? 'no-layer']);
  if (layer.kind !== 'vector') return say('Symbols go on drawing layers. Pick a vector layer first.');
  const inst = newInstance(symbolId, at ?? c.def.origin);
  editActiveDrawing(`Place "${c.def.name}"`, 'vector', (d) => {
    d.shapes.push(inst);
  });
  store().setUi({ selection: [inst.id], tool: 'select' });
  return undefined;
}

/** Changes the selected instances (or one by id) on the active drawing. */
export function updateInstances(label: string, fn: (s: Draft<InstanceShape>) => void, opts: { coalesce?: string; id?: Id } = {}): Result {
  const k = currentKey();
  const ids = opts.id ? [opts.id] : selectedInstances().map((s) => s.id);
  if (!k || !ids.length) return say('Select a symbol on the canvas first.');
  if (k.layer.locked) return say(EDIT_HINTS.locked);
  store().update(
    label,
    (doc) => {
      const d = doc.drawings[k.drawing.id] as Draft<VectorDrawing>;
      for (const s of d.shapes) if (s.type === 'instance' && ids.includes(s.id)) fn(s);
    },
    opts,
  );
  return undefined;
}

/** Puts another symbol in the selected instances' place, keeping where they are. */
export function swapSymbol(to: Id): Result {
  const doc = store().get().doc;
  if (!doc.symbols?.[to]) return undefined;
  if (wouldNestInItself(doc, to)) return say("A symbol can't go inside itself.");
  return updateInstances(`Swap to "${doc.symbols[to].name}"`, (s) => {
    s.symbolId = to;
  });
}

/** Puts the selected instances back to their plain size and angle (keeps where they are). */
export function resetTransform(): Result {
  return updateInstances('Reset size and angle', (s) => {
    s.transform = identityTransform(s.transform.x, s.transform.y);
  });
}

export function renameSymbol(id: Id, name: string): void {
  const n = name.trim().slice(0, 60);
  if (!n) return;
  store().update('Rename symbol', (d) => {
    const s = d.symbols?.[id];
    if (s) s.name = n;
  });
}

export function duplicateSymbolById(id: Id): Id | undefined {
  let out: Id | undefined;
  store().update('Duplicate symbol', (d) => {
    out = duplicateSymbol(d as Doc, id);
  });
  return out;
}

/** Deletes one symbol (only when nothing uses it) or, with no id, every unused one. Returns how many went. */
export function deleteUnused(id?: Id): number {
  let n = 0;
  store().update(id ? 'Delete symbol' : 'Delete unused symbols', (d) => {
    n = deleteUnusedSymbols(d as Doc, id);
  });
  return n;
}

// ---------------------------------------------------------------- tweens

/** The key whose in-betweens cover the playhead on the active layer (it may not have any yet). */
export function currentTweenKey(): { layer: Layer; cel: Cel; next?: Cel } | undefined {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  const cel = layer ? celAt(layer, ui.frame) : undefined;
  if (!layer || !cel) return undefined;
  return { layer, cel, next: nextKey(layer, cel) };
}

/** Plain-shape drawings get wrapped into a symbol so they can move as one (on a draft). */
function wrapIfPlain(doc: Draft<Doc>, drawingId: Id, label: string): void {
  const d = doc.drawings[drawingId];
  if (d?.kind !== 'vector' || !d.shapes.length || d.shapes.some(isInstance)) return;
  const b = shapesBounds(d.shapes as Shape[]);
  const origin = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
  makeSymbol(doc as Doc, drawingId, d.shapes.map((s) => s.id), origin, freeSymbolName(doc as Doc, label));
}

/**
 * Makes in-betweens from the key at the playhead to the next one. With no next key it makes one: at the playhead if
 * it's partway through a hold, else on the hold's last frame. Drawings with no symbol in them are made into one
 * first (in-betweens move symbols).
 */
export function makeTween(layerId?: Id, frame?: number): Result {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, layerId ?? ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  const f = frame ?? ui.frame;
  if (!layer) return say(EDIT_HINTS['no-layer']);
  if (layer.locked) return say(EDIT_HINTS.locked);
  if (layer.kind !== 'vector') return say('In-betweens work on drawing layers, not pixel layers.');
  const cel = celAt(layer, f);
  if (!cel) return say('Pick a frame with a drawing on it, then make in-betweens from there.');
  const d0 = doc.drawings[cel.drawingId];
  if (d0?.kind !== 'vector' || !d0.shapes.length) return say('Draw something first: in-betweens move a drawing from one key to the next.');
  const hasNext = !!nextKey(layer, cel) || layer.cels.some((c) => c.start >= cel.start + cel.length);
  if (!hasNext && f === cel.start && cel.length < 2) return say('Hold this drawing for a few frames first (drag its end in the timeline), so there is room to move.');

  let endFrame = -1;
  let wrapped = false;
  store().update('Make in-betweens', (dd) => {
    const l = dd.layers.find((x) => x.id === layer.id)!;
    const a = l.cels.find((c) => c.id === cel.id)!;
    const before = Object.keys(dd.symbols ?? {}).length;
    wrapIfPlain(dd, a.drawingId, 'Moving part');
    let b = nextKey(l as Layer, a as Cel);
    if (!b) {
      const after = l.cels.find((c) => c.start >= a.start + a.length);
      if (after) {
        // Close the gap so the two keys touch.
        a.length = after.start - a.start;
        b = after;
      } else {
        const at = f > a.start ? f : a.start + a.length - 1;
        const end = a.start + a.length;
        const copy = cloneDrawing(dd.drawings[a.drawingId] as never);
        dd.drawings[copy.id] = copy as never;
        a.length = at - a.start;
        l.cels.push({ id: uid('c'), start: at, length: end - at, drawingId: copy.id });
        l.cels.sort((x, y) => x.start - y.start);
        b = l.cels.find((c) => c.start === at)!;
      }
    }
    if (b.drawingId === a.drawingId) {
      // The same drawing on both keys can't be in two places: give the end key its own copy.
      const copy = cloneDrawing(dd.drawings[b.drawingId] as never);
      dd.drawings[copy.id] = copy as never;
      b.drawingId = copy.id;
    }
    wrapIfPlain(dd, b.drawingId, 'Moving part');
    wrapped = Object.keys(dd.symbols ?? {}).length > before;
    a.tween = { ease: a.tween?.ease ?? DEFAULT_EASE, ...(a.tween?.spin ? { spin: a.tween.spin } : {}), ...(a.tween?.path ? { path: a.tween.path } : {}) };
    endFrame = b.start;
  });
  if (endFrame < 0) return undefined;
  const now = store().get().doc;
  const endCel = celAt(findLayer(now, layer.id)!, endFrame);
  const endDrawing = endCel ? now.drawings[endCel.drawingId] : undefined;
  const first = endDrawing?.kind === 'vector' ? endDrawing.shapes.find(isInstance) : undefined;
  store().setUi({ frame: endFrame, activeLayerId: layer.id, selection: first ? [first.id] : [], tool: 'select', playing: false });
  toast(`${wrapped ? 'Made it a symbol and added' : 'Added'} in-betweens. Now move or turn it here on frame ${endFrame + 1}, then press play.`, { kind: 'success' });
  return undefined;
}

/** Changes the in-betweens on the key at the playhead (making them first if there are none). */
export function updateTween(label: string, fn: (t: Draft<Tween>) => void, opts: { coalesce?: string } = {}): Result {
  const k = currentTweenKey();
  if (!k) return say('Pick a frame with in-betweens first.');
  if (k.layer.locked) return say(EDIT_HINTS.locked);
  if (!k.cel.tween) {
    const r = makeTween(k.layer.id, k.cel.start);
    if (r) return r;
    store().setUi({ frame: k.cel.start });
  }
  const again = currentTweenKey();
  if (!again?.cel.tween) return undefined;
  store().update(
    label,
    (doc) => {
      const c = doc.layers.find((l) => l.id === again.layer.id)?.cels.find((c) => c.id === again.cel.id);
      if (c?.tween) fn(c.tween);
    },
    opts,
  );
  return undefined;
}

export function setEase(e: Easing, coalesce?: string): Result {
  return updateTween(`Easing: ${easeLabel(e)}`, (t) => {
    t.ease = (Array.isArray(e) ? [...e] : e) as Easing;
  }, { coalesce });
}

export function removeTween(layerId?: Id, frame?: number): Result {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, layerId ?? ui.activeLayerId);
  const cel = layer ? celAt(layer, frame ?? ui.frame) : undefined;
  if (!layer || !cel?.tween) return say('There are no in-betweens here to remove.');
  if (layer.locked) return say(EDIT_HINTS.locked);
  store().update('Remove in-betweens', (d) => {
    const c = d.layers.find((l) => l.id === layer.id)?.cels.find((x) => x.id === cel.id);
    if (c) delete c.tween;
  });
  return undefined;
}

/** Simplifies a hand-drawn line (Ramer-Douglas-Peucker), so a motion path stays small and smooth. */
export function simplify(points: { x: number; y: number }[], tol: number): { x: number; y: number }[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = points[i];
    const b = points[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let best = tol;
    for (let k = i + 1; k < j; k++) {
      const p = points[k];
      const dist = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (dist > best) {
        best = dist;
        far = k;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Makes the in-betweens at the playhead follow this line. */
export function setMotionPath(points: PathPoint[]): Result {
  if (points.length < 2) return say('Draw a longer line for it to follow.');
  return updateTween('Follow a path', (t) => {
    t.path = { points: points.map((p) => ({ ...p })), orient: t.path?.orient ?? false } as MotionPath;
  });
}

export function clearMotionPath(): Result {
  return updateTween('Stop following the path', (t) => {
    delete t.path;
  });
}

/** Uses the selected line on this drawing as the path (and takes the line out of the drawing). */
export function pathFromSelection(): Result {
  const k = currentKey();
  const sel = new Set(store().get().ui.selection);
  const line = k?.drawing.shapes.find((s) => sel.has(s.id) && (s.type === 'stroke' || s.type === 'path'));
  if (!k || !line) return say('Select a line you drew (with the Select tool), then use it as the path.');
  const pts: PathPoint[] = line.type === 'stroke' ? simplify(line.points, 1) : line.type === 'path' ? line.paths[0]?.points ?? [] : [];
  // The line usually sits on the end key or a guide: take it out of the drawing it's in.
  store().update('Use line as path', (doc) => {
    const d = doc.drawings[k.drawing.id] as Draft<VectorDrawing>;
    d.shapes = d.shapes.filter((s) => s.id !== line.id);
  });
  store().setUi({ selection: [] });
  return setMotionPath(pts);
}
