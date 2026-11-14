/**
 * Copying and pasting drawing keys on the timeline. Pure: it works on a document (a draft inside `store().update`, or a
 * plain object in tests) and holds what was copied as a value, so the same clip can be pasted again and again.
 *
 * A copy keeps each key's drawing (as its own deep copy), how long it is held and where it sits in time, and which layer
 * it came from. A paste makes new drawings from those copies, so changing a pasted drawing never changes the original.
 * (A drawing that was shown by two keys is still one drawing in the paste, so a hold that was split stays shared.)
 * Several layers copied together land on the layer you paste on and the ones below it, in the same order.
 */
import type { Cel, Doc, Drawing, Id, Layer, PixelDrawing, SymbolDef, Tween } from '../core/format';
import { findLayer, pixelGrid, pruneDrawings, uid } from '../core/doc';
import { gridPixels, setGridPixels } from '../core/pixelBounds';
import { resizePixels } from '../select/mask';
import { cloneDrawing, ensureLength, type Clash } from './edit-core';
import { parseRef, type KeyRef } from './tracks';

const end = (c: { start: number; length: number }) => c.start + c.length;

export type LayerKind = Layer['kind'];

export interface ClipLayer {
  id: Id;
  name: string;
  kind: LayerKind;
  /** A pixel layer's art grid, so pixels pasted on a layer with another pixel size can be fitted to it. */
  grid?: { width: number; height: number };
  /** And how many page units one of its art pixels is. */
  pixelSize?: number;
}

export interface ClipItem {
  /** Which entry of `layers`. */
  layer: number;
  /** Frames after the clip's first key. */
  offset: number;
  length: number;
  /** Which entry of `drawings`. */
  drawing: number;
  tween?: Tween;
}

export interface FrameClip {
  /** Top of the timeline first, so the first one lands on the layer you paste on and the rest go below it. */
  layers: ClipLayer[];
  drawings: Drawing[];
  items: ClipItem[];
  /** The frame the first copied key was on. */
  first: number;
  /** Frames from the first key to the end of the last one. */
  span: number;
}

const plainCopy = (d: Drawing): Drawing => cloneDrawing(d);

/** Builds a clip from keys (cels) given as layer and cel ids. Null when none of them is there. */
export function clipFromCels(doc: Doc, picks: { layerId: Id; celId: Id }[]): FrameClip | null {
  const byLayer = new Map<Id, Set<Id>>();
  for (const p of picks) {
    if (!byLayer.has(p.layerId)) byLayer.set(p.layerId, new Set());
    byLayer.get(p.layerId)!.add(p.celId);
  }
  // Top of the stack first: the timeline lists layers from the top.
  const layers: ClipLayer[] = [];
  const found: { layer: number; cel: Cel }[] = [];
  const stack = [...doc.layers].reverse();
  for (const l of stack) {
    const ids = byLayer.get(l.id);
    if (!ids) continue;
    const cels = l.cels.filter((c) => ids.has(c.id) && doc.drawings[c.drawingId]);
    if (!cels.length) continue;
    const entry: ClipLayer = { id: l.id, name: l.name, kind: l.kind };
    if (l.kind === 'pixel') {
      entry.grid = pixelGrid(doc, l);
      entry.pixelSize = l.pixelSize;
    }
    layers.push(entry);
    for (const cel of cels) found.push({ layer: layers.length - 1, cel });
  }
  if (!found.length) return null;
  const first = Math.min(...found.map((f) => f.cel.start));
  const last = Math.max(...found.map((f) => end(f.cel)));
  const drawings: Drawing[] = [];
  const index = new Map<Id, number>();
  const items: ClipItem[] = [];
  for (const { layer, cel } of found) {
    let di = index.get(cel.drawingId);
    if (di === undefined) {
      di = drawings.push(plainCopy(doc.drawings[cel.drawingId])) - 1;
      index.set(cel.drawingId, di);
    }
    items.push({ layer, offset: cel.start - first, length: cel.length, drawing: di, ...(cel.tween ? { tween: structuredClone(cel.tween) } : {}) });
  }
  // A tween only means something when the key it runs to comes along, right where this one ends.
  for (const it of items) {
    if (!it.tween) continue;
    const next = items.some((o) => o.layer === it.layer && o.offset === it.offset + it.length);
    if (!next) delete it.tween;
  }
  items.sort((a, b) => a.layer - b.layer || a.offset - b.offset);
  return { layers, drawings, items, first, span: last - first };
}

/** Builds a clip from picked keys. Only drawing keys are copied; `skipped` counts the picks that weren't (effect keys, property keys alone). */
export function clipFromRefs(doc: Doc, refs: Iterable<KeyRef>): { clip: FrameClip | null; skipped: number } {
  const picks: { layerId: Id; celId: Id }[] = [];
  let skipped = 0;
  for (const r of refs) {
    const p = parseRef(r);
    if (p?.kind === 'cel') picks.push({ layerId: p.layerId, celId: p.celId });
    else skipped++;
  }
  return { clip: clipFromCels(doc, picks), skipped };
}

/** The drawing key showing at a frame of a layer, as a clip (the copy for when no keys are picked). */
export function clipFromFrame(doc: Doc, layerId: Id, frame: number): FrameClip | null {
  const layer = findLayer(doc, layerId);
  const cel = layer?.cels.find((c) => frame >= c.start && frame < end(c));
  return layer && cel ? clipFromCels(doc, [{ layerId, celId: cel.id }]) : null;
}

export type Targets = { ok: true; layers: Layer[] } | { ok: false; why: string };

/** The layers each clip layer lands on: the first on `start`, the rest on the layers below it in the stack. */
export function targetLayers(doc: Doc, clip: FrameClip, startId: Id | null | undefined): Targets {
  const at = doc.layers.findIndex((l) => l.id === startId);
  if (at < 0) return { ok: false, why: 'Pick a layer in the timeline to paste on.' };
  const out: Layer[] = [];
  for (let i = 0; i < clip.layers.length; i++) {
    const l = doc.layers[at - i];
    if (!l) {
      const n = clip.layers.length;
      return { ok: false, why: `You copied keys from ${n} layers, so they need ${n} layers from this one down, and there are only ${i}. Pick a higher layer, or copy fewer.` };
    }
    out.push(l);
  }
  return { ok: true, layers: out };
}

/** The layers the keys came from, for pasting in place. Fails when one is gone or has changed kind. */
export function sourceLayers(doc: Doc, clip: FrameClip): Targets {
  const out: Layer[] = [];
  for (const cl of clip.layers) {
    const l = findLayer(doc, cl.id);
    if (!l || l.kind !== cl.kind) return { ok: false, why: `The layer ${cl.name} isn't there any more, so there is nowhere to paste them in place. Pick a layer and paste there instead.` };
    out.push(l);
  }
  return { ok: true, layers: out };
}

/** What a drawing becomes on a layer of another kind (made by the caller, which knows how to draw). Null: it can't be done. */
export interface Converted {
  drawing: Drawing;
  /** Symbols the new drawing uses and the document doesn't have yet (a picture on a vector layer is a symbol made of pixels). */
  symbols?: Record<Id, SymbolDef>;
  /** Drawings those symbols hold (they live in the document's list, like every drawing). */
  drawings?: Drawing[];
}
export type Convert = (clip: FrameClip, drawing: number, from: ClipLayer, to: Layer) => Converted | null;

/** Which pairs of layers can swap drawings without being converted. */
export const sameKind = (from: LayerKind, to: LayerKind): boolean => from === to;

/** Why a key from one kind of layer can't go on another (tilemap and camera keys only fit their own kind), or '' when it can be converted. */
export function whyNotKind(from: ClipLayer, to: Layer): string {
  if (from.kind === to.kind) return '';
  const drawn = (k: LayerKind) => k === 'vector' || k === 'pixel';
  if (drawn(from.kind) && drawn(to.kind)) return '';
  const name = (k: LayerKind) => (k === 'tilemap' ? 'tile' : k === 'camera' ? 'camera' : k);
  return `Keys from a ${name(from.kind)} layer can only go on a ${name(from.kind)} layer. Pick one.`;
}

/** A pixel drawing fitted to another art grid (kept at the top left, cut at the edge), for layers with another pixel size. */
export function fitPixelDrawing(d: PixelDrawing, from: { width: number; height: number }, to: { width: number; height: number }): PixelDrawing {
  if (from.width === to.width && from.height === to.height) return d;
  const grid = resizePixels(gridPixels(d, from.width, from.height), from.width, from.height, to.width, to.height);
  const out: PixelDrawing = { id: d.id, kind: 'pixel', width: 0, height: 0, pixels: new Uint8ClampedArray(0) };
  setGridPixels(out, grid, to.width, to.height);
  return out;
}

/** True when pasting at `at` would land on frames that already hold drawings on any target layer. */
export function landsOnKeys(clip: FrameClip, layers: Layer[], at: number): boolean {
  for (const it of clip.items) {
    const l = layers[it.layer];
    const s = at + it.offset;
    if (l?.cels.some((c) => c.start < s + it.length && end(c) > s)) return true;
  }
  return false;
}

/**
 * Puts the new cels in a layer and moves what was already there out of their way: pushed later (insert) or cut back
 * (cover). A drawing that runs into the start of a pasted one is cut short where it starts.
 */
function settle(layer: Layer, placed: Set<Cel>, clash: Clash): void {
  const fixed = layer.cels.filter((c) => placed.has(c)).sort((a, b) => a.start - b.start);
  const others = layer.cels.filter((c) => !placed.has(c)).sort((a, b) => a.start - b.start);
  const taken: Cel[] = [...fixed];
  const kept: Cel[] = [];
  for (const c of others) {
    let gone = false;
    for (let guard = 0; guard < 10000; guard++) {
      // Running into the start of a pasted drawing: cut short there.
      const into = fixed.find((p) => c.start < p.start && p.start < end(c));
      if (into) c.length = into.start - c.start;
      const hit = taken.find((o) => o.start < end(c) && end(o) > c.start);
      if (!hit) break;
      if (clash === 'push') c.start = end(hit);
      else {
        const cut = end(hit) - c.start;
        if (cut >= c.length) {
          gone = true;
          break;
        }
        c.start = end(hit);
        c.length -= cut;
      }
    }
    if (gone) continue;
    kept.push(c);
    taken.push(c);
  }
  layer.cels = [...fixed, ...kept].sort((a, b) => a.start - b.start);
}

export interface PasteResult {
  /** The new cels, as layer and cel ids (for picking them afterwards). */
  made: { layerId: Id; celId: Id }[];
  /** How many drawings were converted to another kind of layer, by the kind they came from and went to. */
  converted: { from: LayerKind; to: LayerKind; count: number }[];
  /** Keys left out because they couldn't be converted. */
  left: number;
}

/**
 * Pastes the clip with its first key at `at`, on `layers` (one per clip layer, from `targetLayers` or `sourceLayers`).
 * Changes `doc`. Nothing is checked about locks here (the caller does that).
 */
export function pasteClip(doc: Doc, clip: FrameClip, layers: Layer[], at: number, clash: Clash, convert?: Convert): PasteResult {
  const result: PasteResult = { made: [], converted: [], left: 0 };
  const made = new Map<string, Drawing>();
  const placedBy = new Map<Layer, Set<Cel>>();
  const tally = new Map<string, number>();
  const drawingFor = (di: number, from: ClipLayer, to: Layer): Drawing | null => {
    const key = `${di}:${to.id}`;
    const have = made.get(key);
    if (have) return have;
    let d: Drawing | null = null;
    if (from.kind === to.kind) {
      const src = clip.drawings[di];
      d = src.kind === 'pixel' && from.grid && to.kind === 'pixel' ? fitPixelDrawing(src, from.grid, pixelGrid(doc, to)) : src;
      d = cloneDrawing(d);
    } else {
      const c = convert?.(clip, di, from, to);
      if (c) {
        d = c.drawing;
        if (c.symbols) Object.assign((doc.symbols ??= {}), c.symbols);
        for (const x of c.drawings ?? []) doc.drawings[x.id] = x;
        const k = `${from.kind}>${to.kind}`;
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
    }
    if (d) {
      made.set(key, d);
      doc.drawings[d.id] = d;
    }
    return d;
  };
  const newCels = new Map<ClipItem, Cel>();
  for (const it of clip.items) {
    const to = layers[it.layer];
    const from = clip.layers[it.layer];
    if (!to || !from) continue;
    const d = drawingFor(it.drawing, from, to);
    if (!d) {
      result.left++;
      continue;
    }
    const cel: Cel = { id: uid('c'), start: Math.max(0, at + it.offset), length: it.length, drawingId: d.id };
    newCels.set(it, cel);
    to.cels.push(cel);
    if (!placedBy.has(to)) placedBy.set(to, new Set());
    placedBy.get(to)!.add(cel);
    result.made.push({ layerId: to.id, celId: cel.id });
  }
  // Tweens come along where the key they run to did too.
  for (const [it, cel] of newCels) {
    if (!it.tween) continue;
    const next = clip.items.find((o) => o.layer === it.layer && o.offset === it.offset + it.length);
    if (next && newCels.has(next)) cel.tween = structuredClone(it.tween);
  }
  for (const [layer, placed] of placedBy) settle(layer, placed, clash);
  for (const [k, count] of tally) {
    const [from, to] = k.split('>') as [LayerKind, LayerKind];
    result.converted.push({ from, to, count });
  }
  let furthest = 0;
  for (const layer of placedBy.keys()) {
    const last = layer.cels[layer.cels.length - 1];
    if (last) furthest = Math.max(furthest, end(last));
  }
  ensureLength(doc, furthest);
  pruneDrawings(doc);
  return result;
}

/** The words for a paste: "3 keys", "1 key". */
export const keysWords = (n: number): string => `${n} ${n === 1 ? 'key' : 'keys'}`;

/** "frame 12" or "frames 12 to 17", 1-based, for where a paste landed. */
export function framesWords(start: number, length: number): string {
  return length <= 1 ? `frame ${start + 1}` : `frames ${start + 1} to ${start + length}`;
}
