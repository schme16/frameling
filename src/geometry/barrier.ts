/**
 * Turns a drawing's vector shapes into the polygons that act as walls for the paint bucket.
 *
 * - Brush strokes: the same outline the renderer paints (`strokeOutline`), flattened the same way.
 * - Path shapes: their stroke, at its real width. A path with a fill but no stroke still has a visible edge, so it
 *   gets a thin wall, and its inside stays open to be filled.
 * - Existing fills: a thin wall along their edge, except the ones that cover the click (`fillsAround`), or every
 *   fill when `includeFills` says so.
 *
 *   Why a fill's edge counts: a drawing can be outlined in paint (traced or imported art, a shape cut by the
 *   bucket), and the area inside it is closed whether the outline is a line or a fill. A path with a fill and no
 *   stroke is already treated this way.
 *
 *   Why not the fills under the click: they are the paint being filled into or recoloured, so their edge must not
 *   box in the click. That is what keeps a fill you just made, or a big background fill, from walling off the next
 *   one: a click inside either one is under it, so it is skipped, and a click outside it meets only its edge, the
 *   same as meeting any line. Only the edge is a wall, never the inside, so a fill never hides a gap in a line it
 *   sits next to.
 */
import type { Shape, SubPath } from '../core/format';
import { strokeOutlineWhole as strokeOutline } from '../core/render';
import { flattenSubPath, pathsBounds, pointInPaths } from './hit';
import { ringArea2, type FillRule } from './raster';

export interface BarrierPart {
  /** Flat document-coordinate rings that make up one shape. */
  rings: number[][];
  rule: FillRule;
}

export interface BarrierOptions {
  /** Width of the wall for edges that have no stroke of their own, in document pixels. */
  thinWidth: number;
  /** Treat every fill's edges as thin walls. */
  includeFills?: boolean;
  /** Treat fills' edges as thin walls, except the fills that cover this point (the click). */
  fillsAround?: { x: number; y: number };
  /**
   * Brush lines up to a few times `thinWidth` wide (pressure can thin them below it) get a centre line of that width added, so they do not drop out of a coarse
   * mask. Off by default: only a mask scaled down needs it, and it costs a few more rectangles.
   */
  floorStrokes?: boolean;
}

/** Flattens perfect-freehand's outline the way `outlinePath` paints it (quadratic curves through the midpoints). */
export function flattenOutline(points: number[][]): number[] {
  const n = points.length;
  const out: number[] = [];
  if (n < 2) return out;
  if (n < 4) {
    for (const p of points) out.push(p[0], p[1]);
    return out;
  }
  let cx = points[0][0];
  let cy = points[0][1];
  out.push(cx, cy);
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const ex = (a[0] + b[0]) / 2;
    const ey = (a[1] + b[1]) / 2;
    const k = Math.max(1, Math.min(6, Math.ceil(Math.hypot(ex - cx, ey - cy) / 4)));
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      const mt = 1 - t;
      out.push(mt * mt * cx + 2 * mt * t * a[0] + t * t * ex, mt * mt * cy + 2 * mt * t * a[1] + t * t * ey);
    }
    cx = ex;
    cy = ey;
  }
  return out;
}

function circle(x: number, y: number, r: number): number[] {
  const n = Math.max(8, Math.min(24, Math.ceil(r * 2)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return out;
}

/** Every ring turned the same way, so a nonzero fill unions them instead of cancelling overlaps. */
function positive(ring: number[]): number[] {
  if (ringArea2(ring) >= 0) return ring;
  const out: number[] = [];
  for (let i = (ring.length >> 1) - 1; i >= 0; i--) out.push(ring[2 * i], ring[2 * i + 1]);
  return out;
}

/** A polyline of `width` as rectangles per segment plus round joins, to be filled nonzero. */
export function thickPolyline(ring: number[], closed: boolean, width: number): number[][] {
  const n = ring.length >> 1;
  const rings: number[][] = [];
  const r = width / 2;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const x0 = ring[2 * i];
    const y0 = ring[2 * i + 1];
    const j = (i + 1) % n;
    const x1 = ring[2 * j];
    const y1 = ring[2 * j + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    const nx = (-dy / l) * r;
    const ny = (dx / l) * r;
    rings.push(positive([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny]));
  }
  // Round joins and caps only matter once the line is wide enough to show a notch.
  if (width > 2.5) for (let i = 0; i < n; i++) rings.push(positive(circle(ring[2 * i], ring[2 * i + 1], r)));
  return rings;
}

function pathWalls(paths: SubPath[], width: number, out: BarrierPart[]) {
  const rings: number[][] = [];
  for (const sp of paths) {
    const flat = flattenSubPath(sp);
    if (flat.length >= 4) rings.push(...thickPolyline(flat, sp.closed, width));
  }
  if (rings.length) out.push({ rings, rule: 'nonzero' });
}

/** Whether a fill covers a point, the way it is painted (even-odd). */
function fillCovers(paths: SubPath[], x: number, y: number): boolean {
  const b = pathsBounds(paths);
  if (!b || x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
  return pointInPaths(paths, x, y);
}

export function shapesToBarrier(shapes: readonly Shape[], opts: BarrierOptions): BarrierPart[] {
  const out: BarrierPart[] = [];
  for (const s of shapes) {
    if (s.opacity <= 0) continue;
    if (s.type === 'stroke') {
      const flat = flattenOutline(strokeOutline(s));
      if (flat.length >= 6) out.push({ rings: [flat], rule: 'nonzero' });
      if (opts.floorStrokes && s.brush.size < 4 * opts.thinWidth && s.points.length) {
        // The renderer paints the line at its real width, so this only keeps the wall from vanishing in the mask.
        const centre: number[] = [];
        for (const p of s.points) centre.push(p.x, p.y);
        const rings = thickPolyline(centre, false, opts.thinWidth);
        if (rings.length) out.push({ rings, rule: 'nonzero' });
      }
    } else if (s.type === 'path') {
      if (s.stroke) pathWalls(s.paths, Math.max(s.stroke.width, opts.thinWidth), out);
      else if (s.fill) pathWalls(s.paths, opts.thinWidth, out);
    } else if (s.type === 'fill') {
      const around = opts.fillsAround;
      if (opts.includeFills || (around && !fillCovers(s.paths, around.x, around.y))) pathWalls(s.paths, opts.thinWidth, out);
    }
  }
  return out;
}
