// A brush stroke as a shape with a few smooth points, so it can be reshaped with Edit points. The stroke's own outline
// (which already carries its width, taper and round or flat ends) is fitted with cubic curves; the Smoothness chosen is
// how far the curves may stray from that outline. Pure.
import type { PathPoint, PathShape, Shape, StrokeShape } from '../core/format';
import { strokeOutlineWhole as strokeOutline } from '../core/render';
import { fitClosed, sampleMidpointSpline, type Cubic } from '../export/curve-fit';

/** The smoothest setting is this fraction of the brush width: past that a line stops looking like the one drawn. */
const MAX_STRAY = 0.35;
/** The least a curve may stray, so even "closest" has a handful of points to work with rather than hundreds. */
const MIN_STRAY = 0.05;

/** How far (document pixels) the curves may stray from the drawn outline, for a Smoothness from 0 (closest) to 1 (smoothest). */
export function strayFor(smoothness: number, brushSize: number): number {
  const s = Math.max(0, Math.min(1, Number.isFinite(smoothness) ? smoothness : 0));
  return Math.max(MIN_STRAY, brushSize * MAX_STRAY * s * s);
}

/** Cubics to path points: each point keeps the curve that arrives at it, and the first holds the one that closes the loop. */
function pointsOf(c: Cubic[]): PathPoint[] {
  const n = c.length;
  return c.map((cu, k) => {
    const prev = c[(k + n - 1) % n];
    return { x: cu[0][0], y: cu[0][1], c1: { x: prev[1][0], y: prev[1][1] }, c2: { x: prev[2][0], y: prev[2][1] } };
  });
}

/**
 * The stroke as a filled shape with curves, keeping its id, lineage, group, colour and see-through. Null when the outline
 * is too small to fit. A short stroke or a dot comes out as the few points it needs.
 */
export function strokeToPath(s: StrokeShape, smoothness: number): PathShape | null {
  const outline = strokeOutline(s);
  if (outline.length < 4) return null;
  const cubics = fitClosed(sampleMidpointSpline(outline, 0.75), strayFor(smoothness, s.brush.size));
  if (cubics.length < 2) return null;
  const out: PathShape = { id: s.id, type: 'path', paths: [{ closed: true, points: pointsOf(cubics) }], fill: s.color, stroke: null, opacity: s.opacity };
  if (s.origin) out.origin = s.origin;
  if (s.group) out.group = s.group;
  if (s.ext) out.ext = s.ext;
  return out;
}

/** How many points a shape has to edit. */
export const pointCount = (s: Shape): number => (s.type === 'path' ? s.paths.reduce((n, p) => n + p.points.length, 0) : s.type === 'stroke' ? s.points.length : 0);

/** The shapes with every brush stroke among `ids` turned into a curve shape; the rest as they were. `changed` says how many were. */
export function turnStrokes(shapes: readonly Shape[], ids: ReadonlySet<string>, smoothness: number): { shapes: Shape[]; changed: number } {
  let changed = 0;
  const out = shapes.map((s) => {
    if (s.type !== 'stroke' || !ids.has(s.id)) return s;
    const p = strokeToPath(s, smoothness);
    if (!p) return s;
    changed++;
    return p;
  });
  return { shapes: out, changed };
}
