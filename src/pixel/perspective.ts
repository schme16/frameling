// Pixel rectangles and ellipses on a perspective plane: the same quad or projected ellipse a vector shape gets, in
// document units, ready to be rasterised crisply (no anti-aliasing) by the pixel painter. Pure maths.
import type { SubPath } from '../core/format';
import type { Pt } from '../canvas/geometry';
import type { PxPt } from '../canvas/pixels';
import { choosePlane, planeMap, projectedEllipse, projectSubPath, type PlaneChoice } from '../canvas/perspectivePlane';

export interface PixelPerspective {
  vps: Pt[];
  plane: PlaneChoice;
}

/**
 * The shape a cell-to-cell drag makes on a perspective plane, in document units, or null to stay flat (no vanishing
 * points, "Flat" chosen, or the drag crosses a vanishing point). `p` is the start cell and `q` the far one, as dragBox
 * gives them; the shape covers both whole cells, so a one-cell drag is still a one-cell shape. The painter fills the
 * cells whose middle is inside it and draws the outline as a ring of those cells, so nothing lands outside the shape.
 */
export function perspectivePixelOutline(kind: 'rect' | 'ellipse', p: PxPt, q: PxPt, pixelSize: number, persp: PixelPerspective): SubPath | null {
  const fwdX = q.x >= p.x;
  const fwdY = q.y >= p.y;
  const a: Pt = { x: (fwdX ? p.x : p.x + 1) * pixelSize, y: (fwdY ? p.y : p.y + 1) * pixelSize };
  const b: Pt = { x: (fwdX ? q.x + 1 : q.x) * pixelSize, y: (fwdY ? q.y + 1 : q.y) * pixelSize };
  const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  const plane = choosePlane(persp.plane, persp.vps, box);
  if (!plane) return null;
  const m = planeMap(a, b, plane);
  if (!m) return null;
  if (kind === 'ellipse') return projectedEllipse(box, m.map);
  const flat: SubPath = { closed: true, points: [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }] };
  return projectSubPath(flat, m.map);
}
