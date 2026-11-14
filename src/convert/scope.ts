// How many frames a conversion reaches, and which drawings that means. Pure: layers and frame numbers in, a list out.
import type { Cel, Clip, Id, Layer } from '../core/format';

export type FramesWhere = 'this' | 'clip' | 'all';

/** One drawing to convert: the stretch of frames it will hold on the new layer, and the frame to look at it on. */
export interface Bake {
  /** The first frame it holds on the new layer. */
  start: number;
  length: number;
  /** The frame the picture is taken at (the key itself, or the frame of an in-between). */
  frame: number;
  /** The drawing it comes from. */
  drawingId: Id;
  /** Bakes with the same key give the same picture, so it is worked out once (a drawing held on two keys, say). */
  key: string;
}

/**
 * The drawings a conversion makes, per key of the layer. A vector key that tweens into the next one is baked frame by
 * frame, since each in-between is a different picture. `clip` limits it to the frames of a clip (the part of a key
 * inside the clip is kept).
 */
export function bakesFor(layer: Layer, where: FramesWhere, frame: number, clip: Pick<Clip, 'start' | 'end'> | null): Bake[] {
  const out: Bake[] = [];
  const perFrame = (c: Cel) => layer.kind === 'vector' && !!c.tween;
  const push = (c: Cel, from: number, to: number) => {
    // `from` to `to` are the frames of this key to bake, inclusive.
    if (perFrame(c)) {
      for (let f = from; f <= to; f++) out.push({ start: f, length: 1, frame: f, drawingId: c.drawingId, key: `${c.drawingId}@${f}` });
    } else out.push({ start: from, length: to - from + 1, frame: c.start, drawingId: c.drawingId, key: c.drawingId });
  };
  if (where === 'this') {
    const c = layer.cels.find((x) => frame >= x.start && frame < x.start + x.length);
    if (!c) return [];
    if (perFrame(c)) push(c, frame, frame);
    else push(c, c.start, c.start + c.length - 1);
    return out;
  }
  for (const c of layer.cels) {
    const a = where === 'clip' ? Math.max(c.start, clip?.start ?? 0) : c.start;
    const b = where === 'clip' ? Math.min(c.start + c.length - 1, clip?.end ?? -1) : c.start + c.length - 1;
    if (b >= a) push(c, a, b);
  }
  return out;
}

/** The clip a frame is in (the clicked one when it holds the frame), or null. */
export function clipAround(clips: readonly Clip[], frame: number, clickedId?: Id | null): Clip | null {
  const clicked = clickedId ? clips.find((c) => c.id === clickedId) : undefined;
  if (clicked && frame >= clicked.start && frame <= clicked.end) return clicked;
  return clips.find((c) => frame >= c.start && frame <= c.end) ?? null;
}

/** How many different pictures a list of bakes makes. */
export const pictureCount = (bakes: readonly Bake[]): number => new Set(bakes.map((b) => b.key)).size;

/** Every key of the layer is in the bakes, whole. When it is, the layer is wholly converted. */
export function coversLayer(layer: Layer, bakes: readonly Bake[]): boolean {
  const total = layer.cels.reduce((n, c) => n + c.length, 0);
  return total > 0 && bakes.reduce((n, b) => n + b.length, 0) >= total;
}
