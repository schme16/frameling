/**
 * Mouths on a layer: finding the layer that holds a mouth symbol, writing a run of guessed mouths onto it as keys, and
 * changing one frame by hand. Everything here is a plain function on a document (a draft inside `store().update`, or
 * a plain object in tests), so it is one undo step wherever it is called from.
 *
 * A "mouth layer" is a layer whose drawings hold an instance of a symbol that has frame labels (a mouth chart). Each
 * key shows one mouth: its instance plays 'single' with `firstFrame` set to the labelled frame.
 */
import type { Cel, Doc, Drawing, Id, InstanceShape, Layer, SymbolDef, VectorDrawing } from '../core/format';
import { celAt, findLayer, pruneDrawings, uid } from '../core/doc';
import { symbolFrame } from '../core/symbols';
import { cloneDrawing } from '../timeline/edit-core';
import { frameForMouth, type Mouth } from './chart';

const labelled = (def: SymbolDef | undefined): def is SymbolDef => !!def?.frameLabels?.some((l) => l.trim());

/** The first instance in a drawing whose symbol has frame labels. */
export function mouthInstance(doc: Doc, d: Drawing | undefined): InstanceShape | undefined {
  if (!d || d.kind !== 'vector') return undefined;
  for (const s of d.shapes) if (s.type === 'instance' && labelled(doc.symbols?.[s.symbolId])) return s;
  return undefined;
}

/** True when any drawing on the layer holds a mouth symbol. */
export function isMouthLayer(doc: Doc, layer: Layer | undefined): boolean {
  if (!layer || layer.kind !== 'vector') return false;
  return layer.cels.some((c) => !!mouthInstance(doc, doc.drawings[c.drawingId]));
}

/** Every mouth layer, top of the stack first. */
export function mouthLayers(doc: Doc): Layer[] {
  return doc.layers.filter((l) => isMouthLayer(doc, l)).reverse();
}

/** The layer to work on: the active one if it holds a mouth, else the topmost mouth layer. */
export function pickMouthLayer(doc: Doc, activeId: Id | null | undefined): Layer | undefined {
  const active = findLayer(doc, activeId);
  return active && isMouthLayer(doc, active) ? active : mouthLayers(doc)[0];
}

/** The labels of the mouth symbol a layer uses (the first one it finds). */
export function layerLabels(doc: Doc, layer: Layer): string[] {
  for (const c of layer.cels) {
    const inst = mouthInstance(doc, doc.drawings[c.drawingId]);
    if (inst) return doc.symbols![inst.symbolId].frameLabels!;
  }
  return [];
}

/** The mouth symbol a layer uses (the first one it finds), for pictures of each mouth. */
export function layerMouthSymbol(doc: Doc, layer: Layer): Id | undefined {
  for (const c of layer.cels) {
    const inst = mouthInstance(doc, doc.drawings[c.drawingId]);
    if (inst) return inst.symbolId;
  }
  return undefined;
}

/** Which frame of the mouth symbol shows on a layer at `frame` (-1 when no mouth shows). */
export function mouthFrameAt(doc: Doc, layer: Layer, frame: number): number {
  const cel = celAt(layer, frame);
  const inst = cel ? mouthInstance(doc, doc.drawings[cel.drawingId]) : undefined;
  if (!cel || !inst) return -1;
  const def = doc.symbols![inst.symbolId];
  return symbolFrame(inst, frame - cel.start, def.length);
}

function setMouthFrame(doc: Doc, d: VectorDrawing, index: number): void {
  const inst = mouthInstance(doc, d);
  if (!inst) return;
  for (const s of d.shapes) {
    if (s.type === 'instance' && s.symbolId === inst.symbolId) {
      s.play = 'single';
      s.firstFrame = index;
    }
  }
}

/** A drawing to copy for a new key: the layer's drawing nearest to `frame` that holds a mouth. */
function templateFor(doc: Doc, layer: Layer, frame: number): VectorDrawing | undefined {
  let best: { d: VectorDrawing; dist: number } | undefined;
  for (const c of layer.cels) {
    const d = doc.drawings[c.drawingId];
    if (!d || d.kind !== 'vector' || !mouthInstance(doc, d)) continue;
    const dist = frame < c.start ? c.start - frame : frame >= c.start + c.length ? frame - (c.start + c.length - 1) : 0;
    if (!best || dist < best.dist) best = { d, dist };
  }
  return best?.d;
}

function newMouthDrawing(doc: Doc, template: VectorDrawing, index: number): Cel['drawingId'] {
  const d = cloneDrawing(template) as VectorDrawing;
  setMouthFrame(doc, d, index);
  doc.drawings[d.id] = d;
  return d.id;
}

/** Runs of the same mouth: where each starts (counting from 0) and how long it is. */
export function mouthRuns(mouths: readonly Mouth[]): { mouth: Mouth; start: number; length: number }[] {
  const runs: { mouth: Mouth; start: number; length: number }[] = [];
  for (let i = 0; i < mouths.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.mouth === mouths[i]) last.length++;
    else runs.push({ mouth: mouths[i], start: i, length: 1 });
  }
  return runs;
}

/**
 * Writes one key per run of the same mouth onto a layer, starting at frame `start`, over whatever was there. Keys
 * before and after keep their place (a key that straddles the range is cut). Frames past the end of the animation
 * are left out. Returns how many keys were written (0 when the layer is not a mouth layer or nothing fits).
 */
export function applyMouths(doc: Doc, layerId: Id, start: number, mouths: readonly Mouth[]): number {
  const layer = findLayer(doc, layerId);
  if (!layer || layer.kind !== 'vector') return 0;
  const first = Math.max(0, start);
  const lastEnd = Math.min(doc.length, start + mouths.length);
  if (lastEnd <= first) return 0;
  const template = templateFor(doc, layer, first);
  if (!template) return 0;
  const labels = layerLabels(doc, layer);
  const wanted = mouths.slice(first - start, lastEnd - start);

  // Make room: cut keys back at both ends of the range, drop the ones inside it.
  const kept: Cel[] = [];
  for (const c of layer.cels) {
    const end = c.start + c.length;
    if (end <= first || c.start >= lastEnd) {
      kept.push(c);
      continue;
    }
    if (c.start < first) kept.push({ ...c, length: first - c.start });
    if (end > lastEnd) kept.push({ ...c, id: c.start < first ? uid('c') : c.id, start: lastEnd, length: end - lastEnd });
  }
  for (const r of mouthRuns(wanted)) {
    kept.push({ id: uid('c'), start: first + r.start, length: r.length, drawingId: newMouthDrawing(doc, template, frameForMouth(labels, r.mouth)) });
  }
  kept.sort((a, b) => a.start - b.start);
  layer.cels = kept;
  pruneDrawings(doc);
  return mouthRuns(wanted).length;
}

/** What identifies a key's look, so two touching keys that look the same can become one. */
function look(d: Drawing | undefined): string {
  return d?.kind === 'vector' ? JSON.stringify(d.shapes, (k, v) => (k === 'id' ? undefined : v)) : '';
}

/** Joins touching keys around `index` that show the same thing (and have no in-betweens between them). */
function mergeAround(doc: Doc, layer: Layer, id: Id): void {
  for (let pass = 0; pass < 2; pass++) {
    const i = layer.cels.findIndex((c) => c.id === id);
    if (i < 0) return;
    for (const [a, b] of [[i - 1, i], [i, i + 1]]) {
      const x = layer.cels[a];
      const y = layer.cels[b];
      if (!x || !y || x.start + x.length !== y.start || x.tween) continue;
      if (look(doc.drawings[x.drawingId]) !== look(doc.drawings[y.drawingId])) continue;
      // Keep the earlier cel and let it run on.
      x.length += y.length;
      layer.cels.splice(b, 1);
      if (y.id === id) id = x.id;
      break;
    }
  }
}

/**
 * Shows frame `index` of the mouth symbol at one frame of the animation, splitting the key it sits in (and joining
 * it to a neighbour that already looks the same). Returns false when nothing needed to change.
 */
export function setMouthAt(doc: Doc, layerId: Id, frame: number, index: number): boolean {
  const layer = findLayer(doc, layerId);
  if (!layer || layer.kind !== 'vector' || frame < 0 || frame >= doc.length) return false;
  const template = templateFor(doc, layer, frame);
  if (!template) return false;
  if (mouthFrameAt(doc, layer, frame) === index) return false;
  const cel = celAt(layer, frame);
  let mid: Cel;
  if (!cel) {
    mid = { id: uid('c'), start: frame, length: 1, drawingId: newMouthDrawing(doc, template, index) };
    layer.cels.push(mid);
  } else {
    const src = doc.drawings[cel.drawingId] as VectorDrawing | undefined;
    const base = src && mouthInstance(doc, src) ? src : template;
    const end = cel.start + cel.length;
    if (cel.start === frame) {
      // The first frame of a key: the key keeps its start and becomes this one frame, the rest carries on after it.
      if (end > frame + 1) layer.cels.push({ id: uid('c'), start: frame + 1, length: end - frame - 1, drawingId: newMouthDrawing(doc, base, mouthFrameAt(doc, layer, frame + 1)), ...(cel.tween ? { tween: cel.tween } : {}) });
      cel.length = 1;
      delete cel.tween;
      cel.drawingId = newMouthDrawing(doc, base, index);
      mid = cel;
    } else {
      mid = { id: uid('c'), start: frame, length: 1, drawingId: newMouthDrawing(doc, base, index) };
      const after = end > frame + 1 ? ({ id: uid('c'), start: frame + 1, length: end - frame - 1, drawingId: newMouthDrawing(doc, base, mouthFrameAt(doc, layer, frame)) } as Cel) : null;
      // The part before keeps its drawing; in-betweens only made sense up to the key that follows it.
      cel.length = frame - cel.start;
      layer.cels.push(mid);
      if (after) layer.cels.push(after);
    }
  }
  layer.cels.sort((a, b) => a.start - b.start);
  mergeAround(doc, layer, mid.id);
  pruneDrawings(doc);
  return true;
}
