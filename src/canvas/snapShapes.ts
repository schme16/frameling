/**
 * "Other shapes" as snap targets: the edges, the middle and the corner points of every other shape on the visible
 * vector layers. Pure apart from reading the document, and cached per gesture (the document doesn't change while a
 * drag is in progress).
 */
import type { Doc, Shape } from '../core/format';
import { shownDrawing } from '../core/symbols';
import { shapeBounds } from './geometry';

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

/** Every shape on the visible vector layers at `frame` (bones layers have no shapes to snap to). */
export function visibleShapes(doc: Doc, frame: number): Shape[] {
  const out: Shape[] = [];
  for (const l of doc.layers) {
    if (l.kind !== 'vector' || !l.visible || l.rig) continue;
    const d = shownDrawing(doc, l, frame);
    if (d && d.kind === 'vector') out.push(...d.shapes);
  }
  return out;
}

let cache: { doc: Doc; frame: number; key: string; lines: ShapeLines } | null = null;

/** The lines for the open drawing, kept while the document, frame and excluded shapes stay the same. */
export function otherShapeLines(doc: Doc, frame: number, exclude: readonly string[]): ShapeLines {
  const key = exclude.join('|');
  if (cache && cache.doc === doc && cache.frame === frame && cache.key === key) return cache.lines;
  const lines = shapeLines(visibleShapes(doc, frame), new Set(exclude));
  cache = { doc, frame, key, lines };
  return lines;
}
