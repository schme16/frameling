// Pixel rectangles and ellipses on a perspective plane: the same quad or projected ellipse a vector shape gets, in
// document units, ready to be rasterised crisply (no anti-aliasing) by the pixel painter. Pure maths.
import type { SubPath } from '../core/format';
import type { Pt } from '../canvas/geometry';
import type { PxPt } from '../canvas/pixels';
import { brushReach, type Thickness } from './thick';
import { choosePlane, planeMap, projectedEllipse, projectSubPath, type PlaneChoice } from '../canvas/perspectivePlane';

export interface PixelPerspective {
  vps: Pt[];
  plane: PlaneChoice;
}

/** What a cell-to-cell drag makes on a perspective plane: the covered shape, and the path the edge is traced along. */
export interface PerspectivePixelShape {
  /** The covered shape in document units (whole cells). The fill is taken from it. */
  outline: SubPath;
  /** The same shape pulled in so the edge, stamped with the brush, ends on the outline. Null when the brush fills the shape. */
  edge: SubPath | null;
}

/**
 * The shape a cell-to-cell drag makes on a perspective plane, in document units, or null to stay flat (no vanishing
 * points, "Flat" chosen, or the drag crosses a vanishing point). `p` is the start cell and `q` the far one, as dragBox
 * gives them; the shape covers both whole cells, so a one-cell drag is still a one-cell shape. `thick` is the brush
 * that will be stamped along the edge: the edge path is inset by half of it (and by half a cell, so it runs through
 * the middle of the outermost cells), so the shape keeps the size you dragged, like a flat one.
 */
export function perspectivePixelShape(kind: 'rect' | 'ellipse', p: PxPt, q: PxPt, pixelSize: number, persp: PixelPerspective, thick?: Thickness): PerspectivePixelShape | null {
  const fwdX = q.x >= p.x;
  const fwdY = q.y >= p.y;
  const a: Pt = { x: (fwdX ? p.x : p.x + 1) * pixelSize, y: (fwdY ? p.y : p.y + 1) * pixelSize };
  const b: Pt = { x: (fwdX ? q.x + 1 : q.x) * pixelSize, y: (fwdY ? q.y + 1 : q.y) * pixelSize };
  const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  const plane = choosePlane(persp.plane, persp.vps, box);
  if (!plane) return null;
  const m = planeMap(a, b, plane);
  if (!m) return null;
  const shape = (r: { x: number; y: number; w: number; h: number }): SubPath | null => {
    if (kind === 'ellipse') return projectedEllipse(r, m.map);
    const flat: SubPath = { closed: true, points: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }] };
    return projectSubPath(flat, m.map);
  };
  const outline = shape(box);
  if (!outline) return null;
  const { before, after } = brushReach(thick?.size ?? 1);
  const x0 = box.x + (0.5 + before) * pixelSize;
  const x1 = box.x + box.w - (0.5 + after) * pixelSize;
  const y0 = box.y + (0.5 + before) * pixelSize;
  const y1 = box.y + box.h - (0.5 + after) * pixelSize;
  if (x0 > x1 || y0 > y1) return { outline, edge: null };
  return { outline, edge: shape({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }) };
}

/** Just the covered shape of {@link perspectivePixelShape}, in document units. */
export function perspectivePixelOutline(kind: 'rect' | 'ellipse', p: PxPt, q: PxPt, pixelSize: number, persp: PixelPerspective): SubPath | null {
  return perspectivePixelShape(kind, p, q, pixelSize, persp)?.outline ?? null;
}
