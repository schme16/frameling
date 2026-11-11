/**
 * The timeline's edit operations as plain functions on a document. Each one changes the doc it is given (a draft
 * inside `store().update`, or a plain object in tests), keeps every layer's cels sorted and non-overlapping, and
 * says what it did through its return value. Nothing here knows about the store, React or locking: `ops.ts` wraps
 * these with undo labels and the friendly refusals ("This layer is locked").
 *
 * Frames are 0-based in the data. The panel shows them 1-based.
 */
import { current, isDraft } from 'immer';
import type { Cel, Clip, Doc, Drawing, Id, Layer, Marker, Shape } from '../core/format';
import { currentChoice } from '../core/choices';
import { celAt, findLayer, newDrawingFor, newPixelLayer, newVectorLayer, pruneDrawings, uid } from '../core/doc';

/** What to do when a cel lands on top of others: shove them later (push) or cut them back (trim). */
export type Clash = 'push' | 'trim';

export const MAX_FPS = 120;
export const MAX_LENGTH = 10000;

const end = (c: Cel) => c.start + c.length;

function plain<T>(x: T): T {
  return isDraft(x) ? (current(x as never) as T) : x;
}

/** A deep copy of a drawing under a new id (shapes get new ids too, pixels get their own buffer). */
export function cloneDrawing(d: Drawing): Drawing {
  const src = plain(d);
  if (src.kind === 'pixel') return { ...src, id: uid('p'), pixels: new Uint8ClampedArray(src.pixels) };
  const shapes = structuredClone(src.shapes) as Shape[];
  for (const s of shapes) s.id = uid('s');
  return { id: uid('v'), kind: 'vector', shapes };
}

/** Makes sure the document is at least `frames` long. */
export function ensureLength(doc: Doc, frames: number): void {
  if (frames > doc.length) doc.length = Math.min(MAX_LENGTH, frames);
}

function ensureFits(doc: Doc, layer: Layer): void {
  const last = layer.cels[layer.cels.length - 1];
  if (last) ensureLength(doc, end(last));
}

/**
 * Puts `placed` (already in `layer.cels`) where it says it is and moves the others out of its way. Cels that start
 * before it get their tail cut. Cels from it onwards are pushed later, or trimmed (and removed if nothing is left).
 */
function resolve(layer: Layer, placed: Cel, clash: Clash): void {
  layer.cels.sort((a, b) => a.start - b.start || (a === placed ? -1 : b === placed ? 1 : 0));
  const at = layer.cels.indexOf(placed);
  for (let i = 0; i < at; i++) {
    const c = layer.cels[i];
    if (end(c) > placed.start) c.length = placed.start - c.start;
  }
  let cursor = end(placed);
  const keep = layer.cels.slice(0, at + 1);
  for (let i = at + 1; i < layer.cels.length; i++) {
    const c = layer.cels[i];
    if (c.start >= cursor) {
      cursor = end(c);
    } else if (clash === 'push') {
      c.start = cursor;
      cursor = end(c);
    } else {
      const cut = cursor - c.start;
      if (cut >= c.length) continue;
      c.start = cursor;
      c.length -= cut;
      cursor = end(c);
    }
    keep.push(c);
  }
  layer.cels = keep;
}

function shiftFrom(layer: Layer, fromStart: number, by: number): void {
  for (const c of layer.cels) if (c.start >= fromStart) c.start += by;
}

function nextKeyStart(layer: Layer, frame: number): number | undefined {
  return layer.cels.find((c) => c.start > frame)?.start;
}

// ---------------------------------------------------------------- keys

/**
 * A new, empty drawing at `frame`. On a held frame it cuts the hold in two (the later part gets the new drawing).
 * On the first frame of a key it swaps in an empty drawing. On an empty frame it makes a new key that holds until
 * the next key (or for one frame). With `copy` the new drawing starts as a copy of the one it replaces.
 * Returns the new cel's id.
 */
export function newBlankKey(doc: Doc, layerId: Id, frame: number, copy = false): Id | null {
  const layer = findLayer(doc, layerId);
  if (!layer || frame < 0) return null;
  const cel = celAt(layer, frame);
  const make = (src?: Drawing): Drawing => {
    const d = copy && src ? cloneDrawing(src) : newDrawingFor(doc, layer);
    doc.drawings[d.id] = d;
    return d;
  };
  let id: Id;
  if (!cel) {
    const next = nextKeyStart(layer, frame);
    const d = make();
    const c: Cel = { id: uid('c'), start: frame, length: next === undefined ? 1 : next - frame, drawingId: d.id };
    layer.cels.push(c);
    layer.cels.sort((a, b) => a.start - b.start);
    id = c.id;
  } else if (cel.start === frame) {
    const d = make(doc.drawings[cel.drawingId]);
    cel.drawingId = d.id;
    id = cel.id;
  } else {
    const oldEnd = end(cel);
    const d = make(doc.drawings[cel.drawingId]);
    cel.length = frame - cel.start;
    const c: Cel = { id: uid('c'), start: frame, length: oldEnd - frame, drawingId: d.id };
    layer.cels.push(c);
    layer.cels.sort((a, b) => a.start - b.start);
    id = c.id;
  }
  ensureFits(doc, layer);
  pruneDrawings(doc);
  return id;
}

/**
 * Copies the drawing at `frame` to the next frame. If the next frame is still part of the same hold the hold is
 * split (nothing changes on screen, but the copy is now its own drawing). If it is empty the copy gets one frame.
 * If another key is there the later keys shift right to make room. Returns the new cel's id, or null when there is
 * no drawing at `frame`.
 */
export function duplicateKey(doc: Doc, layerId: Id, frame: number): Id | null {
  const layer = findLayer(doc, layerId);
  const cel = layer && celAt(layer, frame);
  if (!layer || !cel) return null;
  const target = frame + 1;
  const copy = cloneDrawing(doc.drawings[cel.drawingId]);
  doc.drawings[copy.id] = copy;
  let c: Cel;
  if (target < end(cel)) {
    c = { id: uid('c'), start: target, length: end(cel) - target, drawingId: copy.id };
    cel.length = target - cel.start;
  } else {
    if (celAt(layer, target)) shiftFrom(layer, target, 1);
    c = { id: uid('c'), start: target, length: 1, drawingId: copy.id };
  }
  layer.cels.push(c);
  layer.cels.sort((a, b) => a.start - b.start);
  ensureFits(doc, layer);
  return c.id;
}

/** Wipes the drawing at `frame` (the key stays, with the same hold, but the drawing is empty). */
export function clearKey(doc: Doc, layerId: Id, frame: number): boolean {
  const layer = findLayer(doc, layerId);
  const cel = layer && celAt(layer, frame);
  if (!layer || !cel) return false;
  const d = newDrawingFor(doc, layer);
  doc.drawings[d.id] = d;
  cel.drawingId = d.id;
  pruneDrawings(doc);
  return true;
}

/** Takes the key (and its whole hold) away, leaving empty frames. */
export function deleteKey(doc: Doc, layerId: Id, frame: number): boolean {
  const layer = findLayer(doc, layerId);
  const cel = layer && celAt(layer, frame);
  if (!layer || !cel) return false;
  layer.cels = layer.cels.filter((c) => c !== cel);
  pruneDrawings(doc);
  return true;
}

/**
 * Holds the drawing at `frame` one frame longer and shifts everything after it on this layer right. On an empty
 * frame it adds an empty frame instead. Returns false if `frame` is before the start.
 */
export function insertFrame(doc: Doc, layerId: Id, frame: number): boolean {
  const layer = findLayer(doc, layerId);
  if (!layer || frame < 0) return false;
  const cel = celAt(layer, frame);
  if (cel) {
    shiftFrom(layer, end(cel), 1);
    cel.length += 1;
  } else {
    shiftFrom(layer, frame, 1);
  }
  ensureFits(doc, layer);
  return true;
}

/**
 * Takes one frame out: a held drawing gets one frame shorter (a one-frame key goes away) and everything after it
 * shifts left. On an empty frame the empty frame closes up. Returns false when there is nothing to take out.
 */
export function removeFrame(doc: Doc, layerId: Id, frame: number): boolean {
  const layer = findLayer(doc, layerId);
  if (!layer || frame < 0) return false;
  const cel = celAt(layer, frame);
  if (cel) {
    const wasEnd = end(cel);
    if (cel.length > 1) cel.length -= 1;
    else layer.cels = layer.cels.filter((c) => c !== cel);
    shiftFrom(layer, wasEnd, -1);
    pruneDrawings(doc);
    return true;
  }
  if (!layer.cels.some((c) => c.start > frame)) return false;
  shiftFrom(layer, frame + 1, -1);
  return true;
}

/** Sets how long the drawing at `frame` is held (1 = on ones, 2 = on twos...). Later cels get pushed along, or covered. */
export function setExposure(doc: Doc, layerId: Id, frame: number, frames: number, clash: Clash = 'push'): boolean {
  const layer = findLayer(doc, layerId);
  const cel = layer && celAt(layer, frame);
  if (!layer || !cel) return false;
  return resizeCel(doc, layerId, cel.id, frames, clash);
}

/** Changes the length of a cel (dragging its end). Returns false if nothing changed. */
export function resizeCel(doc: Doc, layerId: Id, celId: Id, length: number, clash: Clash = 'push'): boolean {
  const layer = findLayer(doc, layerId);
  const cel = layer?.cels.find((c) => c.id === celId);
  const n = Math.max(1, Math.round(length));
  if (!layer || !cel || cel.length === n) return false;
  cel.length = n;
  resolve(layer, cel, clash);
  ensureFits(doc, layer);
  return true;
}

/** Moves a cel so it starts at `start`, optionally onto another layer. Returns false if nothing changed. */
export function moveCel(doc: Doc, layerId: Id, celId: Id, start: number, clash: Clash = 'push', toLayerId: Id = layerId): boolean {
  const from = findLayer(doc, layerId);
  const to = findLayer(doc, toLayerId);
  const cel = from?.cels.find((c) => c.id === celId);
  const at = Math.max(0, Math.round(start));
  if (!from || !to || !cel) return false;
  if (from === to && cel.start === at) return false;
  if (from.kind !== to.kind) return false;
  if (from !== to) from.cels = from.cels.filter((c) => c !== cel);
  cel.start = at;
  if (from !== to) to.cels.push(cel);
  resolve(to, cel, clash);
  ensureFits(doc, to);
  return true;
}

// ---------------------------------------------------------------- layers

function uniqueLayerName(doc: Doc, base: string): string {
  const names = new Set(doc.layers.map((l) => l.name));
  for (let n = doc.layers.length + 1; ; n++) {
    const name = `${base} ${n}`;
    if (!names.has(name)) return name;
  }
}

/** Index a new layer goes at: just above `aboveId`, or on top. */
function slotAbove(doc: Doc, aboveId?: Id | null): number {
  const i = aboveId ? doc.layers.findIndex((l) => l.id === aboveId) : -1;
  return i < 0 ? doc.layers.length : i + 1;
}

export function addVectorLayer(doc: Doc, aboveId?: Id | null, name?: string): Id {
  const l = newVectorLayer(name ?? uniqueLayerName(doc, 'Layer'));
  // Preferences > Behaviour can make new vector layers merge shapes (see src/tools/merge-mode.ts).
  if (currentChoice('draw.newLayerMode') === 'merge') l.drawMode = 'merge';
  doc.layers.splice(slotAbove(doc, aboveId), 0, l);
  return l.id;
}

/** The pixel size a new pixel layer starts with: the one the active (or top) pixel layer uses, else 8. */
export function defaultPixelSize(doc: Doc, aboveId?: Id | null): number {
  const active = findLayer(doc, aboveId);
  if (active?.kind === 'pixel') return active.pixelSize;
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (l.kind === 'pixel') return l.pixelSize;
  }
  return 8;
}

export function addPixelLayer(doc: Doc, aboveId?: Id | null, name?: string, pixelSize?: number): Id {
  const l = newPixelLayer(name ?? uniqueLayerName(doc, 'Layer'), pixelSize ?? defaultPixelSize(doc, aboveId));
  doc.layers.splice(slotAbove(doc, aboveId), 0, l);
  return l.id;
}

/** Deletes a layer and its drawings. Refuses to delete the last one. Returns the layer that should be active next. */
export function deleteLayer(doc: Doc, layerId: Id): { next: Id } | null {
  const i = doc.layers.findIndex((l) => l.id === layerId);
  if (i < 0 || doc.layers.length <= 1) return null;
  doc.layers.splice(i, 1);
  pruneDrawings(doc);
  return { next: doc.layers[Math.min(i, doc.layers.length - 1)].id };
}

/** A full copy of a layer (its drawings are copied too, so editing one never changes the other), placed just above it. */
export function duplicateLayer(doc: Doc, layerId: Id): Id | null {
  const i = doc.layers.findIndex((l) => l.id === layerId);
  if (i < 0) return null;
  const src = plain(doc.layers[i]);
  const copy = structuredClone(src) as Layer;
  copy.id = uid('l');
  copy.name = `${src.name} copy`;
  const made = new Map<Id, Id>();
  for (const c of copy.cels) {
    c.id = uid('c');
    let to = made.get(c.drawingId);
    if (!to) {
      const d = cloneDrawing(doc.drawings[c.drawingId]);
      doc.drawings[d.id] = d;
      to = d.id;
      made.set(c.drawingId, to);
    }
    c.drawingId = to;
  }
  doc.layers.splice(i + 1, 0, copy);
  return copy.id;
}

export function renameLayer(doc: Doc, layerId: Id, name: string): boolean {
  const l = findLayer(doc, layerId);
  const n = name.trim();
  if (!l || !n || l.name === n) return false;
  l.name = n;
  return true;
}

/** Moves a layer to array index `to` (bottom first). */
export function reorderLayer(doc: Doc, layerId: Id, to: number): boolean {
  const from = doc.layers.findIndex((l) => l.id === layerId);
  const dest = Math.max(0, Math.min(doc.layers.length - 1, Math.round(to)));
  if (from < 0 || from === dest) return false;
  const [l] = doc.layers.splice(from, 1);
  doc.layers.splice(dest, 0, l);
  return true;
}

/** One step towards the top (`up`) or the bottom of the picture. */
export function stepLayer(doc: Doc, layerId: Id, dir: 'up' | 'down'): boolean {
  const i = doc.layers.findIndex((l) => l.id === layerId);
  return i >= 0 && reorderLayer(doc, layerId, i + (dir === 'up' ? 1 : -1));
}

export function setLayerVisible(doc: Doc, layerId: Id, visible: boolean): boolean {
  const l = findLayer(doc, layerId);
  if (!l || l.visible === visible) return false;
  l.visible = visible;
  return true;
}

export function setLayerLocked(doc: Doc, layerId: Id, locked: boolean): boolean {
  const l = findLayer(doc, layerId);
  if (!l || l.locked === locked) return false;
  l.locked = locked;
  return true;
}

/** Whether a layer shows in the onion skin (missing counts as on). */
export function setLayerOnion(doc: Doc, layerId: Id, onion: boolean): boolean {
  const l = findLayer(doc, layerId);
  if (!l || (l.onion !== false) === onion) return false;
  if (onion) delete l.onion;
  else l.onion = false;
  return true;
}

export function setLayerOpacity(doc: Doc, layerId: Id, opacity: number): boolean {
  const l = findLayer(doc, layerId);
  const o = Math.max(0, Math.min(1, opacity));
  if (!l || l.opacity === o || Number.isNaN(o)) return false;
  l.opacity = o;
  return true;
}

// ---------------------------------------------------------------- document, clips, markers

export function setFps(doc: Doc, fps: number): boolean {
  const n = Math.max(1, Math.min(MAX_FPS, Math.round(fps)));
  if (Number.isNaN(n) || n === doc.fps) return false;
  doc.fps = n;
  return true;
}

export function setDocLength(doc: Doc, length: number): boolean {
  const n = Math.max(1, Math.min(MAX_LENGTH, Math.round(length)));
  if (Number.isNaN(n) || n === doc.length) return false;
  doc.length = n;
  return true;
}

function clampFrame(doc: Doc, f: number): number {
  return Math.max(0, Math.min(doc.length - 1, Math.round(f)));
}

/** Adds a named frame range. The ends can be given in either order and are kept inside the document. */
export function addClip(doc: Doc, a: number, b: number, name?: string, loop = true): Id {
  const start = clampFrame(doc, Math.min(a, b));
  const last = clampFrame(doc, Math.max(a, b));
  const clip: Clip = { id: uid('k'), name: name?.trim() || `Clip ${doc.clips.length + 1}`, start, end: last, loop };
  doc.clips.push(clip);
  return clip.id;
}

export function renameClip(doc: Doc, id: Id, name: string): boolean {
  const c = doc.clips.find((x) => x.id === id);
  const n = name.trim();
  if (!c || !n || c.name === n) return false;
  c.name = n;
  return true;
}

export function setClipRange(doc: Doc, id: Id, a: number, b: number): boolean {
  const c = doc.clips.find((x) => x.id === id);
  if (!c) return false;
  const start = clampFrame(doc, Math.min(a, b));
  const last = clampFrame(doc, Math.max(a, b));
  if (start === c.start && last === c.end) return false;
  c.start = start;
  c.end = last;
  return true;
}

export function setClipLoop(doc: Doc, id: Id, loop: boolean): boolean {
  const c = doc.clips.find((x) => x.id === id);
  if (!c || c.loop === loop) return false;
  c.loop = loop;
  return true;
}

export function removeClip(doc: Doc, id: Id): boolean {
  const n = doc.clips.length;
  doc.clips = doc.clips.filter((c) => c.id !== id);
  return doc.clips.length !== n;
}

export function addMarker(doc: Doc, frame: number, name?: string): Id {
  const m: Marker = { id: uid('m'), name: name?.trim() || `Marker ${doc.markers.length + 1}`, frame: clampFrame(doc, frame) };
  doc.markers.push(m);
  return m.id;
}

export function renameMarker(doc: Doc, id: Id, name: string): boolean {
  const m = doc.markers.find((x) => x.id === id);
  const n = name.trim();
  if (!m || !n || m.name === n) return false;
  m.name = n;
  return true;
}

export function moveMarker(doc: Doc, id: Id, frame: number): boolean {
  const m = doc.markers.find((x) => x.id === id);
  const f = clampFrame(doc, frame);
  if (!m || m.frame === f) return false;
  m.frame = f;
  return true;
}

export function removeMarker(doc: Doc, id: Id): boolean {
  const n = doc.markers.length;
  doc.markers = doc.markers.filter((m) => m.id !== id);
  return doc.markers.length !== n;
}
