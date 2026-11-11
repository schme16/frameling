/**
 * Turns a drawing's vector shapes into the polygons that act as walls for the paint bucket.
 *
 * - Brush strokes: the same outline the renderer paints (`strokeOutline`), flattened the same way.
 * - Path shapes: their stroke, at its real width. A path with a fill but no stroke still has a visible edge, so it
 *   gets a thin wall, and its inside stays open to be filled.
 * - Existing fills: not walls (a fill is paint, not a line), unless `includeFills` asks for their thin edge.
 */
import type { Shape, SubPath } from '../core/format';
import { strokeOutline } from '../core/render';
import { flattenSubPath } from './hit';
import { ringArea2, type FillRule } from './raster';

export interface BarrierPart {
  /** Flat document-coordinate rings that make up one shape. */
  rings: number[][];
  rule: FillRule;
}

export interface BarrierOptions {
  /** Width of the wall for edges that have no stroke of their own, in document pixels. */
  thinWidth: number;
  /** Treat fills' edges as thin walls too. */
  includeFills?: boolean;
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

export function shapesToBarrier(shapes: readonly Shape[], opts: BarrierOptions): BarrierPart[] {
  const out: BarrierPart[] = [];
  for (const s of shapes) {
    if (s.opacity <= 0) continue;
    if (s.type === 'stroke') {
      const flat = flattenOutline(strokeOutline(s));
      if (flat.length >= 6) out.push({ rings: [flat], rule: 'nonzero' });
    } else if (s.type === 'path') {
      if (s.stroke) pathWalls(s.paths, Math.max(s.stroke.width, opts.thinWidth), out);
      else if (s.fill) pathWalls(s.paths, opts.thinWidth, out);
    } else if (opts.includeFills) {
      pathWalls(s.paths, opts.thinWidth, out);
    }
  }
  return out;
}
