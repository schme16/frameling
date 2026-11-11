// Small questions about a document, in plain functions, so quests read like sentences and tests can build the
// documents by hand.
import { celAt, drawingAt } from '../core/doc';
import type { Doc, Drawing, Layer, Shape } from '../core/format';
import type { State } from '../core/store';

/** Does this drawing have anything on it? */
export function drawingHasInk(d: Drawing | undefined): boolean {
  if (!d) return false;
  if (d.kind === 'vector') return d.shapes.length > 0;
  if (d.kind === 'tilemap') return d.cells.some((c) => c !== 0);
  const px = d.pixels;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) return true;
  return false;
}

/** How many pixels of a pixel drawing are painted (0 for vector drawings). */
export function paintedPixels(d: Drawing | undefined): number {
  if (!d || d.kind !== 'pixel') return 0;
  let n = 0;
  for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i] > 0) n++;
  return n;
}

/** Is there anything drawn on any layer at this frame? */
export function hasInkAt(doc: Doc, frame: number): boolean {
  return doc.layers.some((l) => drawingHasInk(drawingAt(doc, l, frame)));
}

/** The first layer holding a drawing with ink at this frame. */
export function inkLayerAt(doc: Doc, frame: number): Layer | undefined {
  return doc.layers.find((l) => drawingHasInk(drawingAt(doc, l, frame)));
}

/** Is there a brush or pencil stroke at this frame? */
export function hasStrokeAt(doc: Doc, frame: number): boolean {
  return doc.layers.some((l) => {
    const d = drawingAt(doc, l, frame);
    return d?.kind === 'vector' && d.shapes.some((s) => s.type === 'stroke');
  });
}

/** Does some layer have its own drawing on `frame`, different from the one on the frame before? (Not just a hold.) */
export function ownDrawingAt(doc: Doc, frame: number): boolean {
  if (frame < 1) return false;
  return doc.layers.some((l) => {
    const a = celAt(l, frame - 1);
    const b = celAt(l, frame);
    return !!a && !!b && a.drawingId !== b.drawingId;
  });
}

const dropIds = (k: string, v: unknown) => (k === 'id' ? undefined : v);

function sameShapes(a: Shape[], b: Shape[]): boolean {
  return a.length === b.length && JSON.stringify(a, dropIds) === JSON.stringify(b, dropIds);
}

/** Do two drawings look different? Ids don't count, so a copy is "the same" until something changes. */
export function drawingsDiffer(a: Drawing | undefined, b: Drawing | undefined): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return true;
  if (a.kind === 'vector' && b.kind === 'vector') return !sameShapes(a.shapes, b.shapes);
  if (a.kind === 'pixel' && b.kind === 'pixel') {
    if (a.pixels.length !== b.pixels.length) return true;
    for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) return true;
  }
  return false;
}

/** Has the drawing on `frame` been changed from the one just before it, with both holding something? */
export function changedFromPrevious(doc: Doc, frame: number): boolean {
  if (frame < 1) return false;
  return doc.layers.some((l) => {
    const a = drawingAt(doc, l, frame - 1);
    const b = drawingAt(doc, l, frame);
    return !!a && !!b && a !== b && drawingHasInk(a) && drawingHasInk(b) && drawingsDiffer(a, b);
  });
}

/**
 * Is there a closed outline at this frame? A rectangle or ellipse (a closed path), or a hand-drawn line whose two
 * ends meet (near enough for a bucket to work, and big enough to be on purpose).
 */
export function hasClosedShapeAt(doc: Doc, frame: number): boolean {
  return doc.layers.some((l) => {
    const d = drawingAt(doc, l, frame);
    if (!d || d.kind !== 'vector') return false;
    return d.shapes.some((s) => {
      if (s.type === 'path') return s.paths.some((p) => p.closed && p.points.length >= 3);
      if (s.type !== 'stroke' || s.points.length < 8) return false;
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of s.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const size = Math.min(maxX - minX, maxY - minY);
      const gap = Math.hypot(first.x - last.x, first.y - last.y);
      return size >= 30 && gap <= Math.max(s.brush.size * 2.5, size * 0.15);
    });
  });
}

/** How many pieces of paint (bucket fills, or shapes with a fill colour) are on this frame's drawings. */
export function paintCount(doc: Doc, frame: number): number {
  let n = 0;
  for (const l of doc.layers) {
    const d = drawingAt(doc, l, frame);
    if (d?.kind !== 'vector') continue;
    for (const s of d.shapes) if (s.type === 'fill' || (s.type === 'path' && s.fill)) n++;
  }
  return n;
}

/** "start:length" of every cel on every layer, to spot a hold being changed. */
export function celSignature(doc: Doc): string {
  return doc.layers.map((l) => l.cels.map((c) => `${c.start}:${c.length}`).join(',')).join('|');
}

/** The frame where the bouncing ball squashes: the marker called contact, or frame 9 (index 8) of the template. */
export function squashFrame(doc: Doc): number {
  return doc.markers.find((m) => m.name === 'contact')?.frame ?? 8;
}

export const isBouncingBall = (s: State): boolean => s.doc.name === 'Bouncing ball' && s.doc.layers.some((l) => l.name === 'Ball');
export const hasVectorLayer = (s: State): boolean => s.doc.layers.some((l) => l.kind === 'vector');
export const hasPixelLayer = (s: State): boolean => s.doc.layers.some((l) => l.kind === 'pixel');

/** The middle of the first closed outline at this frame, in document pixels (where a bucket click will land). */
export function closedShapeCenter(doc: Doc, frame: number): { x: number; y: number } | null {
  for (const l of doc.layers) {
    const d = drawingAt(doc, l, frame);
    if (!d || d.kind !== 'vector') continue;
    for (const s of d.shapes) {
      const pts: { x: number; y: number }[] =
        s.type === 'stroke' ? s.points : s.type === 'path' && s.paths.some((p) => p.closed) ? s.paths.flatMap((p) => p.points) : [];
      if (pts.length < 3) continue;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
  }
  return null;
}

/** Painted pixels across every pixel drawing at this frame. */
export function paintedAt(doc: Doc, frame: number): number {
  let n = 0;
  for (const l of doc.layers) n += paintedPixels(drawingAt(doc, l, frame));
  return n;
}
