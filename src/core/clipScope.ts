// "What you are actually working on": the clip around the playhead, the distinct drawings in it, and where a clip
// ends. Pure, so the onion skin, the Drawings panel and the jump list all agree.
import type { Cel, Clip, Doc, Id, Layer } from './format';

/** A run of frames, first and last inclusive. */
export interface Span {
  start: number;
  end: number;
}

/** A clip's frames, first to last whichever way round its ends were stored. */
export function clipSpan(c: Pick<Clip, 'start' | 'end'>): Span {
  return { start: Math.min(c.start, c.end), end: Math.max(c.start, c.end) };
}

/**
 * The clip a frame is in. When clips overlap, `prefer` (the one picked on the timeline) wins if it holds the frame,
 * else the shortest, which is the most specific, else the one that starts first.
 */
export function clipAtFrame(doc: Pick<Doc, 'clips'>, frame: number, prefer?: Id | null): Clip | undefined {
  let best: Clip | undefined;
  let bestLen = Infinity;
  for (const c of doc.clips) {
    const { start, end } = clipSpan(c);
    if (frame < start || frame > end) continue;
    if (prefer && c.id === prefer) return c;
    const len = end - start;
    if (len < bestLen || (len === bestLen && best && start < clipSpan(best).start)) {
      best = c;
      bestLen = len;
    }
  }
  return best;
}

/** The clip you are working in: the one picked on the timeline, or else the one the playhead is in. */
export function workingClip(doc: Pick<Doc, 'clips'>, frame: number, picked?: Id | null): Clip | undefined {
  const p = picked ? doc.clips.find((c) => c.id === picked) : undefined;
  return p ?? clipAtFrame(doc, frame);
}

/** One drawing on one layer, with its name if it has one. */
export interface DrawingRef {
  layerId: Id;
  layerName: string;
  celId: Id;
  /** Where it starts. */
  frame: number;
  name?: string;
}

/** One picture of the clip: a frame where something new appears (any layer starts a drawing), up to the next such frame. */
export interface KeyFrame {
  /** The frame it starts on. */
  frame: number;
  /** The last frame it holds before the next picture (or the end of the span). */
  end: number;
  /** Every drawing that starts here, topmost layer first. */
  starts: DrawingRef[];
  /** The named ones among them. */
  named: DrawingRef[];
}

/** Layers whose cels make a picture: visible, and not the camera (a camera move is not a new drawing). */
function picturelayers(doc: Pick<Doc, 'layers'>): Layer[] {
  return doc.layers.filter((l) => l.visible && l.kind !== 'camera');
}

/**
 * The distinct pictures in a span, each once, however long it is held. Held frames are skipped, so a clip at 100 fps is
 * a handful of pictures and not thousands. With no span it is the whole animation. A picture that was already showing
 * when the span begins (a drawing held in from before the clip) counts as one at the first frame.
 */
export function keyFrames(doc: Pick<Doc, 'layers' | 'length'>, span?: Span): KeyFrame[] {
  const from = span ? Math.max(0, span.start) : 0;
  const to = span ? Math.min(doc.length - 1, span.end) : doc.length - 1;
  if (to < from) return [];
  const at = new Map<number, KeyFrame>();
  const layers = picturelayers(doc);
  const mark = (frame: number, layer: Layer, cel: Cel) => {
    let k = at.get(frame);
    if (!k) at.set(frame, (k = { frame, end: to, starts: [], named: [] }));
    const ref: DrawingRef = { layerId: layer.id, layerName: layer.name, celId: cel.id, frame: cel.start, ...(cel.name ? { name: cel.name } : {}) };
    k.starts.push(ref);
    if (cel.name) k.named.push(ref);
  };
  // Topmost layer first: layers are listed bottom to top.
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    let held = false;
    for (const c of layer.cels) {
      if (c.start > to) break;
      if (c.start < from) {
        if (c.start + c.length > from) held = true;
        continue;
      }
      mark(c.start, layer, c);
    }
    // Carried in from before the span: it is on screen at the first frame, so the first frame is a picture.
    if (held && !at.has(from)) at.set(from, { frame: from, end: to, starts: [], named: [] });
  }
  const list = [...at.values()].sort((a, b) => a.frame - b.frame);
  for (let i = 0; i < list.length; i++) list[i].end = i + 1 < list.length ? list[i + 1].frame - 1 : to;
  return list;
}

/** Whether a picture is on screen at `frame`. */
export function keyHolds(k: Pick<KeyFrame, 'frame' | 'end'>, frame: number): boolean {
  return frame >= k.frame && frame <= k.end;
}

/** The name to put under a picture: the active layer's drawing if it is named, else the topmost named one, else none. */
export function keyLabel(k: KeyFrame, activeLayerId?: Id | null): string {
  const mine = activeLayerId ? k.named.find((n) => n.layerId === activeLayerId) : undefined;
  return (mine ?? k.named[0])?.name ?? '';
}

/** Every named drawing in a span (or the whole animation), in time order, topmost layer first within a frame. */
export function namedDrawings(doc: Pick<Doc, 'layers' | 'length'>, span?: Span): DrawingRef[] {
  const out: DrawingRef[] = [];
  for (const k of keyFrames(doc, span)) out.push(...k.named);
  return out.sort((a, b) => a.frame - b.frame);
}

/** Whether a picture matches what was typed in the filter: every word starts a word of one of its names or layers. */
export function keyMatches(k: KeyFrame, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = k.named.flatMap((n) => [n.name ?? '', n.layerName]).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.every((w) => hay.some((h) => h.startsWith(w)));
}
