/**
 * Symbol and tween actions, each one undo step. They read the store, refuse with a friendly line when they can't
 * (returned as a string so callers can toast or hint it), and otherwise change the document.
 */
import { sharedEditNote } from '../artboards/variations';
import type { Draft } from 'immer';
import type { Cel, Doc, Easing, Id, InstanceShape, Layer, MotionPath, PathPoint, Shape, ShapeHint, Tween, VectorDrawing } from '../core/format';
import { currentChoice, registerChoice, withChoice } from '../core/choices';
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
  framesWithArt,
  isInstance,
  keysInSpan,
  makeFramesSymbol,
  makePixelSymbol,
  makeSymbol,
  newInstance,
  nextKey,
  pixelKeyAt,
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
import { tl } from '../timeline/state';
import { parseRef } from '../timeline/tracks';

registerChoice<'symbol' | 'morph'>({
  id: 'tween.plainDrawing',
  title: 'In-betweens on a plain drawing',
  question: 'This drawing is not a symbol. How should it change from this key to the next?',
  category: 'Animation',
  default: 'symbol',
  help: 'Drawings that already hold symbols always move. You can switch any in-betweens in the Symbol and motion panel.',
  options: [
    { value: 'symbol', label: 'Move it as one piece', detail: 'Frameling makes it a symbol, then you move, turn, resize or fade it on the next key (classic tween).' },
    { value: 'morph', label: 'Morph the shapes', detail: 'The outlines and colours melt into whatever you draw on the next key (shape tween).' },
  ],
});

export type FramesChoice = 'all' | 'one';

registerChoice<FramesChoice>({
  id: 'symbols.frames',
  title: 'Symbol from a layer with several drawings',
  question: 'This layer has several drawings. What should the new symbol hold?',
  category: 'Animation',
  default: 'all',
  help: 'symbols-frames',
  options: [
    { value: 'all', label: 'The whole animation', detail: 'Every drawing, in time, as one looping symbol. Place it again and again, move it, fade it.' },
    { value: 'one', label: 'Just this drawing', detail: 'Only the drawing on this frame (or your selection on a vector layer). The other drawings stay on the layer.' },
  ],
});

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

/** The keys picked on the timeline that belong to this layer. */
export function pickedKeys(layerId: Id): Id[] {
  const out: Id[] = [];
  for (const r of tl().keys) {
    const p = parseRef(r);
    if (p?.kind === 'cel' && p.layerId === layerId) out.push(p.celId);
  }
  return out;
}

/**
 * Turns the selected shapes (or the whole drawing when nothing is picked) into a new symbol. A layer with several
 * drawings can become one looping symbol of the whole animation instead: with keys picked on the timeline it does that
 * straight away, otherwise it asks once (and remembers) which one is wanted.
 */
export function makeSymbolFromSelection(name?: string): Result {
  const { layer, problem } = activeLayer();
  if (problem || !layer) return say(EDIT_HINTS[problem ?? 'no-layer']);
  if (layer.kind !== 'pixel' && layer.kind !== 'vector') return say('Symbols are made from drawing layers. Pick a vector or pixel layer first.');
  const { doc, ui } = store().get();
  const picked = pickedKeys(layer.id);
  const several = framesWithArt(doc, layer, picked) > 1;
  if (several && picked.length > 1) return makeSymbolFromFrames({ layerId: layer.id, celIds: picked, name });
  // A selection on the canvas means "just these shapes", so it is never asked about.
  const chosen = layer.kind === 'vector' && ui.selection.length > 0;
  if (several && !chosen && !layer.locked && !(layer.kind === 'vector' && layer.rig)) {
    withChoice<FramesChoice>('symbols.frames', (v) => void (v === 'all' ? makeSymbolFromFrames({ layerId: layer.id, name }) : makeSymbolFromDrawing(name)));
    return undefined;
  }
  return makeSymbolFromDrawing(name);
}

/** Turns just the drawing at the playhead (the selected shapes, on a vector layer) into a symbol. */
export function makeSymbolFromDrawing(name?: string): Result {
  const { layer, problem } = activeLayer();
  if (problem || !layer) return say(EDIT_HINTS[problem ?? 'no-layer']);
  if (layer.kind === 'pixel') return makeSymbolFromPixels(layer.id, name);
  if (layer.kind !== 'vector') return say('Symbols are made from drawing layers. Pick a vector or pixel layer first.');
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

/**
 * Turns the layer's whole animation (or the stretch between the keys picked on the timeline) into one symbol that
 * plays the same drawings in the same time and loops. The picture stays where it is; the symbol sits on a vector layer
 * (the same layer for vector art, and for pixel art that was the layer's only drawings).
 */
export function makeSymbolFromFrames(opts: { layerId?: Id; celIds?: Id[]; name?: string } = {}): Result {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, opts.layerId ?? ui.activeLayerId);
  if (!layer || (layer.kind !== 'pixel' && layer.kind !== 'vector')) return say('Pick a pixel or vector layer with some drawings on it first.');
  if (layer.locked) return say(EDIT_HINTS.locked);
  if (layer.kind === 'vector' && layer.rig) return say('A bones layer holds poses, not drawings, so it cannot become a symbol. Use a layer with drawings on it.');
  const picked = opts.celIds ?? pickedKeys(layer.id);
  const keys = keysInSpan(layer, picked);
  if (framesWithArt(doc, layer, picked) < 1) return say('Draw something first, then make it into a symbol.');
  const shared = sharedEditNote(doc, 'symbols');
  if (shared) return say(shared);
  // Vector art turns around the middle of everything drawn on any of the frames.
  let origin: { x: number; y: number } | undefined;
  if (layer.kind === 'vector') {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of keys) {
      const d = doc.drawings[c.drawingId];
      const b = d?.kind === 'vector' && d.shapes.length ? shapesBounds(d.shapes as Shape[]) : null;
      if (!b) continue;
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    origin = Number.isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: 0, y: 0 };
  }
  const ids = keys.map((c) => c.id);
  let made: ReturnType<typeof makeFramesSymbol>;
  store().update('Make a symbol from the animation', (d) => {
    made = makeFramesSymbol(d as Doc, layer.id, { celIds: ids, name: opts.name, origin });
  });
  if (!made) return undefined;
  const m = made;
  store().setUi({ activeLayerId: m.layerId, selection: [m.instanceId], tool: 'select' });
  const symName = store().get().doc.symbols?.[m.symbolId]?.name ?? 'symbol';
  const where = m.layerId === layer.id ? 'This layer now holds the symbol' : 'It sits on a new layer just above';
  toast(`Made "${symName}" from ${m.frames} drawings. It plays them in order and loops. ${where}, so you can move, turn, fade and tween it. Double-click it to change a drawing.`, { kind: 'success' });
  return undefined;
}

/**
 * Turns the pixel drawing at the playhead into a symbol. The picture stays where it is and stays pixels; it sits on a
 * vector layer now (instances live there), which is the same layer when this was its only drawing.
 */
export function makeSymbolFromPixels(layerId?: Id, name?: string): Result {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, layerId ?? ui.activeLayerId);
  if (!layer || layer.kind !== 'pixel') return say('Pick a pixel layer with a drawing on it first.');
  if (layer.locked) return say(EDIT_HINTS.locked);
  if (!pixelKeyAt(doc, layer.id, ui.frame)) return say('Draw something first, then make it into a symbol.');
  const shared = sharedEditNote(doc, 'symbols');
  if (shared) return say(shared);
  let made: { symbolId: Id; instanceId: Id; layerId: Id } | undefined;
  store().update('Make a symbol', (d) => {
    made = makePixelSymbol(d as Doc, layer.id, ui.frame, name);
  });
  if (!made) return undefined;
  store().setUi({ activeLayerId: made.layerId, selection: [made.instanceId], tool: 'select' });
  const now = store().get().doc;
  const symName = now.symbols?.[made.symbolId]?.name ?? 'symbol';
  const same = made.layerId === layer.id;
  toast(`Made "${symName}" from your pixel art. ${same ? 'This layer now holds the symbol' : 'It sits on a new layer just above'}, so you can move, turn, fade and tween it. Double-click it to keep drawing in pixels.`, { kind: 'success' });
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
  const shared = sharedEditNote(doc, 'symbols');
  if (shared) return say(shared);
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
  if (layer.kind !== 'vector' && layer.kind !== 'pixel') return say('Symbols go on drawing layers. Pick a vector or pixel layer first.');
  const inst = newInstance(symbolId, at ?? c.def.origin);
  if (layer.kind === 'pixel') {
    // A pixel layer holds pixels, not symbols: the copy goes on a new vector layer just above it.
    if (layer.locked) return say(EDIT_HINTS.locked);
    const frame = store().get().ui.frame;
    const newId = uid('l');
    store().update(`Place "${c.def.name}"`, (d) => {
      const i = d.layers.findIndex((x) => x.id === layer.id);
      const drawing: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: [inst] };
      d.drawings[drawing.id] = drawing;
      // It lasts as long as the pixel drawing under it does, or to the end of the animation on an empty frame.
      const under = celAt(d.layers[i] as Layer, frame);
      const start = under?.start ?? frame;
      const len = under?.length ?? Math.max(1, d.length - frame);
      d.layers.splice(i + 1, 0, { id: newId, name: c.def.name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: uid('c'), start, length: len, drawingId: drawing.id }] });
    });
    store().setUi({ activeLayerId: newId, selection: [inst.id], tool: 'select' });
    toast(`Put "${c.def.name}" on a new layer above, since pixel layers hold pixels and symbols go on their own layer.`, { kind: 'success' });
    return undefined;
  }
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
export function makeTween(layerId?: Id, frame?: number, kind: 'classic' | 'shape' = 'classic'): Result {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, layerId ?? ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  const f = frame ?? ui.frame;
  if (!layer) return say(EDIT_HINTS['no-layer']);
  if (layer.locked) return say(EDIT_HINTS.locked);
  const camera = layer.kind === 'camera';
  const pixel = layer.kind === 'pixel';
  if (layer.kind !== 'vector' && !camera && !pixel) return say('In-betweens work on drawing layers.');
  if (pixel && kind === 'shape') return say('A morph reshapes outlines, which pixels do not have. Make in-betweens instead and the pixel art moves, turns and fades.');
  if (camera) kind = 'classic';
  const cel = celAt(layer, f);
  if (!cel) return say('Pick a frame with a drawing on it, then make in-betweens from there.');
  const d0 = doc.drawings[cel.drawingId];
  if (!camera && !(d0?.kind === 'vector' && d0.shapes.length) && !(pixel && pixelKeyAt(doc, layer.id, f))) return say('Draw something first: in-betweens move a drawing from one key to the next.');
  // Pixel art with another drawing after it moves into that one: both become symbols on one layer.
  const after = pixel ? [...layer.cels].filter((c) => c.start >= cel.start + cel.length).sort((x, y) => x.start - y.start)[0] : undefined;
  const liftNext = after && pixelKeyAt(doc, layer.id, after.start) ? after : undefined;
  const hasNext = pixel ? !!liftNext : !!nextKey(layer, cel) || layer.cels.some((c) => c.start >= cel.start + cel.length);
  // A lone one-frame drawing has no room to move: hold it for about a second first, so the tween just works.
  const room = !hasNext && f === cel.start && cel.length < 2 ? Math.max(2, Math.min(doc.fps, 48)) : 0;

  let endFrame = -1;
  let wrapped = false;
  let layerNow: Id = layer.id;
  store().update('Make in-betweens', (dd) => {
    // Pixel art moves as a symbol, so the key becomes one first (on a vector layer in the same place).
    if (pixel) {
      const toKey = liftNext ? makePixelSymbol(dd as Doc, layer.id, liftNext.start) : undefined;
      const lifted = makePixelSymbol(dd as Doc, layer.id, f);
      if (!lifted) return;
      layerNow = lifted.layerId;
      if (toKey) {
        // The end key's symbol goes onto the same layer, so the two keys can move into each other.
        const home = dd.layers.find((x) => x.id === layerNow)!;
        const from = dd.layers.findIndex((x) => x.id === toKey.layerId);
        home.cels.push(...dd.layers[from].cels);
        home.cels.sort((x, y) => x.start - y.start);
        dd.layers.splice(from, 1);
      }
    }
    const l = dd.layers.find((x) => x.id === layerNow)!;
    const a = pixel ? celAt(l as Layer, f)! : l.cels.find((c) => c.id === cel.id)!;
    if (room) {
      a.length = room;
      dd.length = Math.max(dd.length, a.start + room);
    }
    const before = Object.keys(dd.symbols ?? {}).length - (pixel ? (liftNext ? 2 : 1) : 0);
    // A morph changes the shapes themselves, so they stay plain shapes.
    if (kind === 'classic') wrapIfPlain(dd, a.drawingId, 'Moving part');
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
        l.cels.push({ id: uid('c'), start: at, length: end - at, drawingId: copy.id, ...(a.offset ? { offset: { ...a.offset } } : {}) });
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
    if (kind === 'classic') wrapIfPlain(dd, b.drawingId, 'Moving part');
    wrapped = Object.keys(dd.symbols ?? {}).length > before;
    a.tween = { ...(kind === 'shape' ? { kind: 'shape' as const } : {}), ease: a.tween?.ease ?? DEFAULT_EASE, ...(a.tween?.slice ? { slice: a.tween.slice } : {}), ...(a.tween?.spin ? { spin: a.tween.spin } : {}), ...(a.tween?.facing ? { facing: a.tween.facing } : {}), ...(a.tween?.path ? { path: a.tween.path } : {}), ...(kind === 'shape' && a.tween?.hints ? { hints: a.tween.hints } : {}) };
    endFrame = b.start;
  });
  if (endFrame < 0) return undefined;
  const now = store().get().doc;
  const endCel = celAt(findLayer(now, layerNow)!, endFrame);
  const endDrawing = endCel ? now.drawings[endCel.drawingId] : undefined;
  const first = endDrawing?.kind === 'vector' ? endDrawing.shapes.find(isInstance) : undefined;
  if (camera) {
    store().setUi({ frame: endFrame, activeLayerId: layerNow, selection: [], playing: false });
    toast(`Added camera in-betweens. Now move the camera frame here on frame ${endFrame + 1}, then press play.`, { kind: 'success' });
    return undefined;
  }
  if (kind === 'shape') {
    store().setUi({ frame: endFrame, activeLayerId: layer.id, selection: [], playing: false });
    toast(`Added a morph. Now change the drawing here on frame ${endFrame + 1} (reshape it, recolour it or draw something new), then press play.`, { kind: 'success' });
    return undefined;
  }
  store().setUi({ frame: endFrame, activeLayerId: layerNow, selection: first ? [first.id] : [], tool: 'select', playing: false });
  toast(`${wrapped ? 'Made it a symbol and added' : 'Added'} in-betweens. Now move or turn it here on frame ${endFrame + 1}, then press play.`, { kind: 'success' });
  return undefined;
}

/** True when the key at the playhead holds plain shapes (no symbols), where moving and morphing are both sensible. */
export function plainKeyHere(layerId?: Id, frame?: number): boolean {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, layerId ?? ui.activeLayerId);
  const cel = layer?.kind === 'vector' ? celAt(layer, frame ?? ui.frame) : undefined;
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  return d?.kind === 'vector' && d.shapes.length > 0 && !d.shapes.some(isInstance);
}

/**
 * Make in-betweens the way the person likes for plain drawings: asks the first time whether to move it as one piece
 * (it becomes a symbol) or morph its shapes, then remembers. Drawings with symbols always move.
 */
export function makeTweenAsking(layerId?: Id, frame?: number): void {
  if (!plainKeyHere(layerId, frame)) {
    makeTween(layerId, frame);
    return;
  }
  withChoice<'symbol' | 'morph'>('tween.plainDrawing', (v) => void makeTween(layerId, frame, v === 'morph' ? 'shape' : 'classic'));
}

/** Morph between this key's drawing and the next one's (shape tween). */
export function makeShapeTween(layerId?: Id, frame?: number): Result {
  return makeTween(layerId, frame, 'shape');
}

/** Switches the in-betweens here between moving symbols and morphing shapes. */
export function setTweenKind(kind: 'classic' | 'shape'): Result {
  const k = currentTweenKey();
  if (!k?.cel.tween) return say('Pick a frame with in-betweens first.');
  if (kind === 'classic') {
    const d = store().get().doc.drawings[k.cel.drawingId];
    if (d?.kind === 'vector' && !d.shapes.some(isInstance)) return say('Moving as one piece needs a symbol. Select the drawing and press F8 to make it one, or keep morphing.');
  }
  return updateTween(kind === 'shape' ? 'Morph the shapes' : 'Move as one piece', (t) => {
    if (kind === 'shape') t.kind = 'shape';
    else {
      delete t.kind;
      delete t.hints;
    }
  });
}

// ---------------------------------------------------------------- shape hints

// A key can end one morph and start the next. Which side the hints panel last asked for wins there.
let hintFocus: { celId: Id; end: 'from' | 'to' } | null = null;

/** Show the hints of the morph on `celId`, on its first key ('from') or its last ('to'). */
export function focusHints(celId: Id, end: 'from' | 'to'): void {
  hintFocus = { celId, end };
}

/** The shape tween whose start or end key is at the playhead on the active layer, and which end we're on. */
export function hintTarget(): { layer: Layer; cel: Cel; next: Cel; end: 'from' | 'to' } | undefined {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  if (!layer || layer.kind !== 'vector') return undefined;
  const cel = celAt(layer, ui.frame);
  if (!cel) return undefined;
  if (hintFocus) {
    const f = layer.cels.find((c) => c.id === hintFocus!.celId);
    const n = f && f.tween?.kind === 'shape' ? nextKey(layer, f) : undefined;
    if (f && n && ui.frame === (hintFocus.end === 'from' ? f.start : n.start)) return { layer, cel: f, next: n, end: hintFocus.end };
  }
  // On a morph's own key (or anywhere in it): its start shapes.
  const next = nextKey(layer, cel);
  if (cel.tween?.kind === 'shape' && next && ui.frame === cel.start) return { layer, cel, next, end: 'from' };
  // On the key a morph ends at: the end shapes.
  const i = layer.cels.indexOf(cel);
  const prev = i > 0 ? layer.cels[i - 1] : undefined;
  if (prev?.tween?.kind === 'shape' && ui.frame === cel.start && nextKey(layer, prev) === cel) return { layer, cel: prev, next: cel, end: 'to' };
  if (cel.tween?.kind === 'shape' && next) return { layer, cel, next, end: 'from' };
  return undefined;
}

/** Adds a hint (a, b, c...) at a point, on both keys at once; drag its end-key twin into place afterwards. */
export function addShapeHint(at: { x: number; y: number }): Result {
  const t = hintTarget();
  if (!t) return say('Shape hints go on a morph. Make one first (Frames and motion > In-betweens and easing > Morph between shapes), then add hints on its first or last key.');
  if ((t.cel.tween?.hints?.length ?? 0) >= 26) return say('That is the most hints a morph can have (26).');
  const id = uid('h');
  return updateHints('Add a shape hint', t, (hs) => void hs.push({ id, from: { ...at }, to: { ...at } }));
}

export function moveShapeHint(id: Id, end: 'from' | 'to', at: { x: number; y: number }, coalesce?: string): Result {
  const t = hintTarget();
  if (!t) return undefined;
  return updateHints('Move a shape hint', t, (hs) => {
    const h = hs.find((x) => x.id === id);
    if (h) h[end] = { x: at.x, y: at.y };
  }, coalesce);
}

export function removeShapeHint(id: Id): Result {
  const t = hintTarget();
  if (!t) return undefined;
  return updateHints('Remove a shape hint', t, (hs) => {
    const i = hs.findIndex((x) => x.id === id);
    if (i >= 0) hs.splice(i, 1);
  });
}

export function clearShapeHints(): Result {
  const t = hintTarget();
  if (!t?.cel.tween?.hints?.length) return say('There are no shape hints here to remove.');
  return updateHints('Remove all shape hints', t, (hs) => void hs.splice(0, hs.length));
}

function updateHints(label: string, t: { layer: Layer; cel: Cel }, fn: (hs: ShapeHint[]) => void, coalesce?: string): Result {
  if (t.layer.locked) return say(EDIT_HINTS.locked);
  store().update(
    label,
    (doc) => {
      const c = doc.layers.find((l) => l.id === t.layer.id)?.cels.find((x) => x.id === t.cel.id);
      if (!c?.tween) return;
      const hs = (c.tween.hints ??= []) as ShapeHint[];
      fn(hs);
      if (!hs.length) delete c.tween.hints;
    },
    coalesce ? { coalesce } : {},
  );
  return undefined;
}

/** Changes the in-betweens on the key at the playhead (making them first if there are none). */
export function updateTween(label: string, fn: (t: Draft<Tween>) => void, opts: { coalesce?: string } = {}): Result {
  const k = currentTweenKey();
  if (!k) return say('Pick a frame with in-betweens first.');
  if (k.layer.locked) return say(EDIT_HINTS.locked);
  if (!k.cel.tween) {
    const r = makeTween(k.layer.id, k.cel.start, plainKeyHere(k.layer.id, k.cel.start) && currentChoice('tween.plainDrawing') === 'morph' ? 'shape' : 'classic');
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
    // A picked easing is for the whole span, not for what was left of an older curve.
    delete t.slice;
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
    delete t.facing;
  });
}

export function clearMotionPath(): Result {
  return updateTween('Stop following the path', (t) => {
    delete t.path;
    delete t.facing;
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
