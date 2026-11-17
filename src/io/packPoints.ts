/**
 * Points as plain numbers in the file.
 *
 * A drawn line and a curve are almost all of a big document's text. One stroke point written the obvious way,
 * `{"x":1,"y":2,"p":0.5}`, is seven things for the parser to make: an object, three key strings and three numbers.
 * Written as `1,2,0.5` in a flat list it is three, and a curve point drops from seventeen to seven. The coordinates
 * themselves are untouched: every number is written exactly as it was, so the drawing that comes back is the drawing
 * that was saved, to the last decimal place. It is the same numbers with the packaging taken off.
 *
 * The reader takes both shapes, so every file ever saved still opens: a point list whose first item is a number is
 * packed, anything else is the older list of objects. A file that holds packed points is saved as
 * `PACKED_POINTS_FORMAT_VERSION`, so an older Frameling says it needs updating instead of reading the numbers as
 * points and drawing nonsense.
 *
 * Only the points in a drawing's shapes are packed: a stroke's line, the subpaths of a fill or a path, and the curve
 * words follow. Plain data in and out, no DOM: see src/io/file.ts for where it is used.
 */
import type { Doc, PathPoint, Shape, StrokePoint, SubPath } from '../core/format';

/** A packed point list: numbers, not objects. */
const isPacked = (v: unknown): v is number[] => Array.isArray(v) && typeof v[0] === 'number';

/** True when this list is worth packing (a list of point objects with something in it). */
const packable = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null;

/** A stroke's points as a flat list: x, y, pressure, x, y, pressure... */
export function packStroke(points: readonly StrokePoint[]): number[] {
  const out: number[] = new Array(points.length * 3);
  let i = 0;
  for (const p of points) {
    out[i++] = p.x;
    out[i++] = p.y;
    out[i++] = p.p ?? 0.5;
  }
  return out;
}

/** The other way: a flat list back to stroke points. A trailing part-point is left off. */
export function unpackStroke(flat: readonly number[]): StrokePoint[] {
  const n = Math.floor(flat.length / 3);
  const out: StrokePoint[] = new Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) out[i] = { x: +flat[j], y: +flat[j + 1], p: +flat[j + 2] };
  return out;
}

/**
 * A curve's points as a flat list. Each point starts with which control points it has (0 none, 1 just `c1`, 2 just
 * `c2`, 3 both), then its own x and y, then the controls it said it has. A straight point costs three numbers and a
 * curve point seven, and nothing has to be guessed on the way back.
 */
export function packPath(points: readonly PathPoint[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    const tag = (p.c1 ? 1 : 0) | (p.c2 ? 2 : 0);
    out.push(tag, p.x, p.y);
    if (p.c1) out.push(p.c1.x, p.c1.y);
    if (p.c2) out.push(p.c2.x, p.c2.y);
  }
  return out;
}

/** The other way. Stops where the numbers stop making sense, so a damaged list loses its tail rather than everything. */
export function unpackPath(flat: readonly number[]): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i < flat.length; ) {
    const tag = flat[i];
    if (tag !== 0 && tag !== 1 && tag !== 2 && tag !== 3) break;
    const need = 3 + (tag & 1 ? 2 : 0) + (tag & 2 ? 2 : 0);
    if (i + need > flat.length) break;
    const p: PathPoint = { x: +flat[i + 1], y: +flat[i + 2] };
    let at = i + 3;
    if (tag & 1) {
      p.c1 = { x: +flat[at], y: +flat[at + 1] };
      at += 2;
    }
    if (tag & 2) {
      p.c2 = { x: +flat[at], y: +flat[at + 1] };
      at += 2;
    }
    out.push(p);
    i = at;
  }
  return out;
}

/** The curve a text shape's words follow, when it has one. */
const curveOf = (s: Record<string, any>): Record<string, any> | undefined => {
  const c = s.onPath?.curve;
  return c && typeof c === 'object' ? c : undefined;
};

/** True when saving this shape would write packed points (so the file needs the newer version). */
export function shapeHasPoints(s: Shape): boolean {
  const r = s as unknown as Record<string, any>;
  if (packable(r.points)) return true;
  if (Array.isArray(r.paths)) for (const p of r.paths) if (p && packable(p.points)) return true;
  const c = curveOf(r);
  return !!c && packable(c.points);
}

/** The shape as the file writes it: the same shape, with its point lists packed. Unchanged when it has no points. */
export function packShape(s: Shape): unknown {
  if (!shapeHasPoints(s)) return s;
  const r = s as unknown as Record<string, any>;
  const out: Record<string, any> = { ...r };
  if (packable(r.points)) out.points = s.type === 'stroke' ? packStroke(r.points as StrokePoint[]) : packPath(r.points as PathPoint[]);
  if (Array.isArray(r.paths)) out.paths = (r.paths as SubPath[]).map((p) => (p && packable(p.points) ? { ...p, points: packPath(p.points) } : p));
  const c = curveOf(r);
  if (c && packable(c.points)) out.onPath = { ...r.onPath, curve: { ...c, points: packPath(c.points) } };
  return out;
}

/** The shapes a drawing writes, with every point list packed. Shapes of a kind this build does not know go through as they are. */
export function packShapes(shapes: readonly unknown[]): unknown[] {
  return shapes.map((s) => (s && typeof s === 'object' && typeof (s as any).type === 'string' ? packShape(s as Shape) : s));
}

/**
 * Turns a shape straight out of the file back into one with point objects, in place (the parsed JSON is thrown away
 * afterwards, and this saves copying the whole shape). A shape written the older way is left exactly as it was.
 */
export function unpackRawShape(s: Record<string, any>): void {
  if (isPacked(s.points)) s.points = s.type === 'stroke' ? unpackStroke(s.points) : unpackPath(s.points);
  if (Array.isArray(s.paths)) for (const p of s.paths) if (p && typeof p === 'object' && isPacked(p.points)) p.points = unpackPath(p.points);
  const c = curveOf(s);
  if (c && isPacked(c.points)) c.points = unpackPath(c.points);
}

/**
 * True when saving this document would pack any points, which is what decides the file's version. Stops at the first
 * one it finds, so it costs nothing on a document that has any.
 */
export function usesPackedPoints(doc: Pick<Doc, 'drawings'>): boolean {
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'vector') continue;
    for (const s of d.shapes) if (shapeHasPoints(s)) return true;
  }
  return false;
}
