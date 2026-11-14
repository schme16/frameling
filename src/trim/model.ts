/**
 * Making a line draw itself, as pure functions on a document (a draft inside `store().update`, or a plain doc in a
 * test). The look is in geometry/trim.ts, the blending between keys in core/trimTween.ts, the row on the timeline in
 * timeline/tracks.ts. This file is the editing: setting how much of a line shows at a frame (cutting a key there when
 * the frame is not one), and the one-step "draw it on" that makes the two keys and the glide between them.
 */
import type { Cel, Doc, Id, Layer, Shape, Trim, VectorDrawing } from '../core/format';
import { celAt, uid } from '../core/doc';
import { poseAt, nextKey } from '../core/symbols';
import { cutProblem, MORPH_CUT_WHY } from '../core/tweenCut';
import { canTrim, shapeLine, trimOf } from '../core/trimTween';
import { writeTrimOf } from '../timeline/tracks';
import { ownDrawing, splitCel } from '../timeline/propKeys';
import { cloneDrawing, MAX_LENGTH } from '../timeline/edit-core';
import { FULL_TRIM, makeTrim } from '../geometry/trim';

/** The first thing a new glide gets: gentle at both ends, like every other in-between. */
export const DRAW_EASE = 'easeInOut' as const;

/** A change to a trim: the numbers given are set, the others stay as they were. */
export interface TrimPatch {
  start?: number;
  end?: number;
  offset?: number;
  order?: NonNullable<Trim['order']>;
}

export type Why = string;

const vectorLayer = (doc: Doc, id: Id): Layer | undefined => {
  const l = doc.layers.find((x) => x.id === id);
  return l && l.kind === 'vector' ? l : undefined;
};

const keyDrawing = (doc: Doc, cel: Cel): VectorDrawing | undefined => {
  const d = doc.drawings[cel.drawingId];
  return d && d.kind === 'vector' ? d : undefined;
};

/** The lines among these shapes that can be trimmed, as the names that follow them from key to key. */
export function trimLines(shapes: readonly Shape[], ids: Iterable<Id>): string[] {
  const want = new Set(ids);
  return [...new Set(shapes.filter((s) => want.has(s.id) && canTrim(s)).map(shapeLine))];
}

/** The trim of a shape, as plain numbers. */
export const trimNumbers = (s: Shape): Trim => ({ ...FULL_TRIM, ...(trimOf(s) ?? {}) });

/** How many separate outlines a path shape is made of (a brush line is one). */
export function outlineCount(s: Shape): number {
  return s.type === 'path' ? s.paths.length : s.type === 'stroke' ? 1 : 0;
}

/** Is the shape's line a loop (a circle, a rectangle)? Loops wrap round when slid; open lines stop at their ends. */
export const isLoop = (s: Shape): boolean => s.type === 'path' && s.paths.length > 0 && s.paths.every((p) => p.closed);

function apply(s: Shape, patch: TrimPatch): void {
  const old = trimNumbers(s);
  writeTrimOf(s, { start: patch.start ?? old.start, end: patch.end ?? old.end, offset: patch.offset ?? old.offset, order: patch.order ?? trimOf(s)?.order });
}

/**
 * Sets how much of the lines shows at `frame`. On a key of its own that key changes; anywhere else a key is cut there
 * first (the picture and glide stay as they were), so the change is a key on the timeline. Returns the shapes' ids on
 * the key that took the change (cutting a key gives its shapes new ids), or why not.
 */
export function setTrimAt(doc: Doc, layerId: Id, frame: number, lines: readonly string[], patch: TrimPatch): { ids: Id[]; cut: boolean } | Why {
  const layer = vectorLayer(doc, layerId);
  if (!layer) return 'Drawing lines draw themselves on drawing layers.';
  if (layer.locked) return 'That layer is locked.';
  let cel = celAt(layer, frame);
  if (!cel) return 'There is no drawing on this frame. Pick a frame with the line on it.';
  const want = new Set(lines);
  let cut = false;
  if (frame > cel.start) {
    const next = nextKey(layer, cel);
    if (cel.tween?.kind === 'shape' && next) return MORPH_CUT_WHY;
    const why = cel.tween && next ? cutProblem(cel.tween, (frame - cel.start) / cel.length, cel.length) : null;
    if (why) return why;
    const made = splitCel(doc, layer, frame);
    if (!made) return 'A key could not be made here.';
    cel = made;
    cut = true;
  }
  ownDrawing(doc, cel);
  const d = keyDrawing(doc, cel);
  if (!d) return 'There is no drawing on this frame.';
  const ids: Id[] = [];
  for (const s of d.shapes) {
    if (!canTrim(s) || !want.has(shapeLine(s))) continue;
    apply(s, patch);
    ids.push(s.id);
  }
  return ids.length ? { ids, cut } : 'None of the picked shapes has a line to draw.';
}

/** Takes the trim off these lines on every key of the layer, so the whole line shows again. Returns how many keys changed. */
export function clearTrims(doc: Doc, layerId: Id, lines: readonly string[]): number {
  const layer = vectorLayer(doc, layerId);
  if (!layer || layer.locked) return 0;
  const want = new Set(lines);
  const seen = new Set<Id>();
  let n = 0;
  for (const c of layer.cels) {
    const d = keyDrawing(doc, c);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    let did = false;
    for (const s of d.shapes) {
      if (canTrim(s) && want.has(shapeLine(s)) && trimOf(s)) {
        writeTrimOf(s, undefined);
        did = true;
      }
    }
    if (did) n++;
  }
  return n;
}

export type DrawWay = 'on' | 'off';

/**
 * Makes the picked lines draw themselves from the key at `frame`: the line is hidden (or whole, for `off`) here and whole
 * (or gone) on the next key, with a glide between. With no next key one is made, about a second on (`frames` says how
 * many). A key that is part way through a hold is cut at `frame` first, so the line starts drawing right here.
 * Returns the frame the line has finished at, or why not.
 */
export function drawLineOn(doc: Doc, layerId: Id, frame: number, lines: readonly string[], way: DrawWay, frames: number, order?: Trim['order']): { endFrame: number; startFrame: number } | Why {
  const layer = vectorLayer(doc, layerId);
  if (!layer) return 'Drawing lines draw themselves on drawing layers.';
  if (layer.locked) return 'That layer is locked.';
  let a = celAt(layer, frame);
  if (!a) return 'There is no drawing on this frame. Pick a frame with the line on it.';
  const d0 = keyDrawing(doc, a);
  if (!d0) return 'There is no drawing on this frame.';
  const want = new Set(lines);
  if (!d0.shapes.some((s) => canTrim(s) && want.has(shapeLine(s)))) return 'None of the picked shapes has a line to draw.';
  if (a.tween?.kind === 'shape' && nextKey(layer, a)) return 'This drawing melts into the next one (a morph). Take the morph off first, or draw the line on a drawing that is not melting.';

  if (frame > a.start) {
    const why = a.tween && nextKey(layer, a) ? cutProblem(a.tween, (frame - a.start) / a.length, a.length) : null;
    if (why) return why;
    const made = splitCel(doc, layer, frame);
    if (!made) return 'A key could not be made here.';
    a = made;
  }
  const n = Math.max(2, Math.min(MAX_LENGTH, Math.round(frames)));
  let b = nextKey(layer, a);
  if (!b) {
    const after = layer.cels.find((c) => c.start >= a!.start + a!.length);
    if (after) {
      // Close the gap so the two keys touch.
      a.length = after.start - a.start;
      b = after;
    } else {
      // The line gets room to draw: held for the time it takes, then a key at the end of it.
      const end = a.start + Math.max(a.length, n + 1);
      a.length = end - a.start;
      doc.length = Math.max(doc.length, end);
      const at = a.start + n;
      const copy = cloneDrawing(doc.drawings[a.drawingId]);
      doc.drawings[copy.id] = copy;
      a.length = at - a.start;
      layer.cels.push({ id: uid('c'), start: at, length: end - at, drawingId: copy.id });
      layer.cels.sort((x, y) => x.start - y.start);
      b = layer.cels.find((c) => c.start === at)!;
    }
  }
  if (b.drawingId === a.drawingId) {
    // The same drawing on both keys can't be drawn two ways: the end key gets its own copy.
    const copy = cloneDrawing(doc.drawings[b.drawingId]);
    doc.drawings[copy.id] = copy;
    b.drawingId = copy.id;
  }
  ownDrawing(doc, a);
  ownDrawing(doc, b);
  const [from, to] = way === 'on' ? [makeTrim(0, 0), makeTrim(0, 100)] : [makeTrim(0, 100), makeTrim(100, 100)];
  const put = (cel: Cel, trim: Trim | undefined) => {
    const d = keyDrawing(doc, cel)!;
    for (const s of d.shapes) if (canTrim(s) && want.has(shapeLine(s))) writeTrimOf(s, trim ? { ...trim, ...(order === 'inOrder' ? { order } : {}) } : undefined);
  };
  put(a, from);
  put(b, to);
  // The glide between them: the easing the other in-betweens start with, or the one already there.
  a.tween = { ease: a.tween?.ease ?? DRAW_EASE, ...(a.tween?.slice ? { slice: a.tween.slice } : {}) };
  return { startFrame: a.start, endFrame: b.start };
}

/** What the panel needs to know about the picked lines at a frame. */
export interface TrimView {
  /** The lines that can be trimmed among the picked shapes (see `trimLines`). */
  lines: string[];
  /** The numbers shown right now at the frame (where a glide is under way, the in-between's). */
  now: Trim;
  /** Do the lines differ from each other, so the numbers are of the first one? */
  mixed: boolean;
  /** The frame is a key of its own (changing it changes that key); false means a key would be cut here. */
  onKey: boolean;
  /** The key at the frame glides into the next one. */
  glides: boolean;
  /** The frame the line next changes at, when it glides (for a hint), else null. */
  nextKey: number | null;
  /** How many outlines the most-divided of the picked shapes has. */
  outlines: number;
  /** All the picked shapes have a loop for an outline. */
  loops: boolean;
  /** How the several outlines are taken, when the first picked shape says. */
  order: NonNullable<Trim['order']>;
}

export function trimView(doc: Doc, layerId: Id | null, frame: number, ids: readonly Id[]): TrimView | null {
  const layer = layerId ? vectorLayer(doc, layerId) : undefined;
  if (!layer) return null;
  const cel = celAt(layer, frame);
  const d = cel ? keyDrawing(doc, cel) : undefined;
  if (!cel || !d) return null;
  const lines = trimLines(d.shapes, ids);
  if (!lines.length) return null;
  const shown = poseAt(doc, layer, frame);
  const shapes = (shown?.kind === 'vector' ? shown.shapes : d.shapes).filter((s) => canTrim(s) && lines.includes(shapeLine(s)));
  const picked = d.shapes.filter((s) => canTrim(s) && lines.includes(shapeLine(s)));
  const first = trimNumbers(shapes[0]);
  const mixed = shapes.some((s) => {
    const t = trimNumbers(s);
    return t.start !== first.start || t.end !== first.end || t.offset !== first.offset;
  });
  const next = nextKey(layer, cel);
  return {
    lines,
    now: first,
    mixed,
    onKey: frame === cel.start,
    glides: !!(cel.tween && cel.tween.kind !== 'shape' && next),
    nextKey: cel.tween && next ? next.start : null,
    outlines: Math.max(...picked.map(outlineCount)),
    loops: picked.every(isLoop),
    order: trimOf(picked[0])?.order ?? 'together',
  };
}
