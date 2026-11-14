/**
 * "Other shapes" as snap targets: the edges, the middle and the corner points of every other shape on the visible
 * vector layers. Pure apart from reading the document, and cached per gesture (the document doesn't change while a
 * drag is in progress).
 */
import type { Doc, Shape } from '../core/format';
import { shownDrawing } from '../core/symbols';
import { shapeBounds } from './geometry';
import type { Rect } from './view';

/** Most shapes looked at, so a crowded drawing never makes dragging sluggish. */
export const MAX_SNAP_SHAPES = 300;

export interface ShapeLines {
  x: number[];
  y: number[];
}

/** Lines at the edges and middle of each shape's box, and through each path's corner points. Shapes in `exclude` are skipped. */
export function shapeLines(shapes: readonly Shape[], exclude: ReadonlySet<string>): ShapeLines {
  const x = new Set<number>();
  const y = new Set<number>();
  const r = (v: number) => Math.round(v * 100) / 100;
  let n = 0;
  for (const s of shapes) {
    if (exclude.has(s.id)) continue;
    if (++n > MAX_SNAP_SHAPES) break;
    const b = shapeBounds(s);
    if (!(b.w || b.h)) continue;
    x.add(r(b.x)).add(r(b.x + b.w / 2)).add(r(b.x + b.w));
    y.add(r(b.y)).add(r(b.y + b.h / 2)).add(r(b.y + b.h));
    if (s.type === 'path') {
      for (const sp of s.paths) {
        for (const p of sp.points) {
          x.add(r(p.x));
          y.add(r(p.y));
        }
      }
    }
  }
  return { x: [...x], y: [...y] };
}

/** Every shape on the visible vector layers at `frame` (bones layers have no shapes to snap to), or on one layer only. */
export function visibleShapes(doc: Doc, frame: number, onlyLayer: string | null = null): Shape[] {
  const out: Shape[] = [];
  for (const l of doc.layers) {
    if (l.kind !== 'vector' || !l.visible || l.rig) continue;
    if (onlyLayer && l.id !== onlyLayer) continue;
    const d = shownDrawing(doc, l, frame);
    if (d && d.kind === 'vector') out.push(...d.shapes);
  }
  return out;
}

/** The boxes of the shapes (for equal gaps). Shapes in `exclude` are skipped. */
export function shapeBoxes(shapes: readonly Shape[], exclude: ReadonlySet<string>): Rect[] {
  const out: Rect[] = [];
  for (const s of shapes) {
    if (exclude.has(s.id)) continue;
    if (out.length >= MAX_SNAP_SHAPES) break;
    const b = shapeBounds(s);
    if (b.w || b.h) out.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  }
  return out;
}

export interface OtherShapes {
  lines: ShapeLines;
  boxes: Rect[];
}

let cache: { doc: Doc; frame: number; key: string; set: OtherShapes } | null = null;

/**
 * What the other shapes offer: lines and boxes, kept while the document, frame, excluded shapes and reach stay the same.
 * `onlyLayer` limits it to one layer (null: every visible vector layer).
 */
export function otherShapes(doc: Doc, frame: number, exclude: readonly string[], onlyLayer: string | null = null): OtherShapes {
  const key = `${onlyLayer ?? '*'}#${exclude.join('|')}`;
  if (cache && cache.doc === doc && cache.frame === frame && cache.key === key) return cache.set;
  const all = visibleShapes(doc, frame, onlyLayer);
  const skip = new Set(exclude);
  const set = { lines: shapeLines(all, skip), boxes: shapeBoxes(all, skip) };
  cache = { doc, frame, key, set };
  return set;
}

/** The lines for the open drawing (see `otherShapes`). */
export const otherShapeLines = (doc: Doc, frame: number, exclude: readonly string[], onlyLayer: string | null = null): ShapeLines => otherShapes(doc, frame, exclude, onlyLayer).lines;
