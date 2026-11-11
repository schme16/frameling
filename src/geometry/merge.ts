/**
 * Merge drawing: shapes on a layer that cut and join each other, like paint. Pure geometry, no DOM.
 *
 * Every shape is turned into flat polygons (curves flattened, brush strokes as their outline, path outlines as a
 * ring), run through polygon-clipping, and written back as plain FillShapes, one per separate piece. A new piece of
 * the same colour joins what it touches; a different colour cuts a hole in what it covers. Grouped shapes (`group`
 * set) are left alone.
 */
import polygonClipping, { type MultiPolygon, type Pair, type Polygon } from 'polygon-clipping';
import type { Color, FillShape, Id, PathShape, Shape, SubPath } from '../core/format';
import { strokeOutline } from '../core/render';
import { uid } from '../core/doc';
import { rdp } from './bezier';

export type Geom = MultiPolygon;
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Curves are cut into pieces about this long (document pixels). */
const CURVE_STEP = 1.5;
/** Points are snapped to this grid before clipping, which keeps the maths steady. */
const GRID = 100;
/** Output outlines are simplified this much (document pixels): invisible, but keeps files light. */
const SIMPLIFY = 0.12;
/** Pieces smaller than this (square document pixels) are slivers from touching edges, and are dropped. */
const MIN_AREA = 0.75;

const q = (v: number) => Math.round(v * GRID) / GRID;

// ---------------------------------------------------------------- shapes to polygons

/** A subpath as a ring of points, curves flattened. Open subpaths are closed. */
export function flattenRing(sp: SubPath): Pair[] {
  const pts = sp.points;
  const n = pts.length;
  const out: Pair[] = [];
  if (!n) return out;
  const push = (x: number, y: number) => {
    const p: Pair = [q(x), q(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  };
  push(pts[0].x, pts[0].y);
  const seg = (a: number, b: number) => {
    const p = pts[a];
    const c = pts[b];
    if (c.c1 && c.c2) {
      const l = Math.hypot(c.c1.x - p.x, c.c1.y - p.y) + Math.hypot(c.c2.x - c.c1.x, c.c2.y - c.c1.y) + Math.hypot(c.x - c.c2.x, c.y - c.c2.y);
      const k = Math.max(2, Math.min(96, Math.ceil(l / CURVE_STEP)));
      for (let j = 1; j <= k; j++) {
        const t = j / k;
        const mt = 1 - t;
        const w0 = mt * mt * mt;
        const w1 = 3 * mt * mt * t;
        const w2 = 3 * mt * t * t;
        const w3 = t * t * t;
        push(w0 * p.x + w1 * c.c1.x + w2 * c.c2.x + w3 * c.x, w0 * p.y + w1 * c.c1.y + w2 * c.c2.y + w3 * c.y);
      }
    } else push(c.x, c.y);
  };
  for (let i = 1; i < n; i++) seg(i - 1, i);
  if (sp.closed && pts[0].c1 && pts[0].c2) seg(n - 1, 0);
  const f = out[0];
  const l = out[out.length - 1];
  if (out.length > 1 && f[0] === l[0] && f[1] === l[1]) out.pop();
  return out;
}

/** Runs a polygon-clipping operation, retrying on a coarser grid if it trips over itself. Null when it can't. */
function safe(op: (a: Geom, ...b: Geom[]) => Geom, a: Geom, ...b: Geom[]): Geom | null {
  try {
    return op(a, ...b);
  } catch {
    const coarse = (g: Geom): Geom => g.map((poly) => poly.map((ring) => ring.map(([x, y]) => [Math.round(x * 8) / 8, Math.round(y * 8) / 8] as Pair)));
    try {
      return op(coarse(a), ...b.map(coarse));
    } catch {
      return null;
    }
  }
}

const union = (a: Geom, ...b: Geom[]) => safe(polygonClipping.union, a, ...b);
const difference = (a: Geom, ...b: Geom[]) => safe(polygonClipping.difference, a, ...b);
const intersection = (a: Geom, ...b: Geom[]) => safe(polygonClipping.intersection, a, ...b);
const xor = (a: Geom, ...b: Geom[]) => safe(polygonClipping.xor, a, ...b);

/** The area inside subpaths, even-odd like the renderer fills them. */
export function areaOfPaths(paths: SubPath[]): Geom {
  const rings = paths.map(flattenRing).filter((r) => r.length >= 3);
  if (!rings.length) return [];
  const polys: Geom = rings.map((r) => [r]);
  const out = polys.length === 1 ? union(polys) : xor([polys[0]], ...polys.slice(1).map((p) => [p]));
  return out ?? [];
}

function circle(x: number, y: number, r: number): Polygon {
  const n = Math.max(8, Math.min(40, Math.ceil(r * 1.5)));
  const ring: Pair[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([q(x + Math.cos(a) * r), q(y + Math.sin(a) * r)]);
  }
  return [ring];
}

/**
 * The area a line of `width` covers along a ring of points: a box per segment, plus joins and caps. Round joins are
 * only drawn where the line actually turns, so finely flattened curves stay cheap.
 */
export function lineArea(ring: Pair[], closed: boolean, width: number, join: 'round' | 'miter' | 'bevel' = 'round', cap: 'round' | 'butt' | 'square' = 'round'): Geom {
  const n = ring.length;
  const r = width / 2;
  if (!n || r <= 0) return [];
  if (n === 1) return cap === 'round' ? [circle(ring[0][0], ring[0][1], r)] : [];
  const parts: Polygon[] = [];
  const segs = closed ? n : n - 1;
  const dirs: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    let [x0, y0] = ring[i];
    let [x1, y1] = ring[(i + 1) % n];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) {
      dirs.push(dirs[dirs.length - 1] ?? [1, 0]);
      continue;
    }
    const ux = dx / l;
    const uy = dy / l;
    dirs.push([ux, uy]);
    if (!closed && cap === 'square') {
      if (i === 0) {
        x0 -= ux * r;
        y0 -= uy * r;
      }
      if (i === segs - 1) {
        x1 += ux * r;
        y1 += uy * r;
      }
    }
    const nx = -uy * r;
    const ny = ux * r;
    parts.push([[[q(x0 + nx), q(y0 + ny)], [q(x1 + nx), q(y1 + ny)], [q(x1 - nx), q(y1 - ny)], [q(x0 - nx), q(y0 - ny)]]]);
  }
  // Joins between segment i - 1 and segment i, at point i.
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = dirs[(i - 1 + segs) % segs];
    const b = dirs[i % segs];
    const cross = a[0] * b[1] - a[1] * b[0];
    const dot = a[0] * b[0] + a[1] * b[1];
    const turn = Math.atan2(Math.abs(cross), dot);
    if (turn < 0.02) continue;
    const [px, py] = ring[i];
    if (join === 'round' && turn > 0.25) {
      parts.push(circle(px, py, r));
      continue;
    }
    // The outer side of the turn.
    const s = cross > 0 ? -1 : 1;
    const ax = px - a[1] * r * s;
    const ay = py + a[0] * r * s;
    const bx = px - b[1] * r * s;
    const by = py + b[0] * r * s;
    const miter = 1 / Math.max(1e-6, Math.cos(turn / 2));
    if (join === 'miter' && miter <= 4) {
      // The miter tip: along the bisector of the two offset normals.
      const mx = (ax + bx) / 2 - px;
      const my = (ay + by) / 2 - py;
      const ml = Math.hypot(mx, my) || 1;
      const tx = px + (mx / ml) * r * miter;
      const ty = py + (my / ml) * r * miter;
      parts.push([[[q(px), q(py)], [q(ax), q(ay)], [q(tx), q(ty)], [q(bx), q(by)]]]);
    } else {
      parts.push([[[q(px), q(py)], [q(ax), q(ay)], [q(bx), q(by)]]]);
    }
  }
  if (!closed && cap === 'round') {
    parts.push(circle(ring[0][0], ring[0][1], r));
    parts.push(circle(ring[n - 1][0], ring[n - 1][1], r));
  }
  if (!parts.length) return [];
  return union(parts) ?? [];
}

/** One coloured area of a shape. */
export interface Part {
  color: Color;
  opacity: number;
  geom: Geom;
}

const outlineCache = new WeakMap<Shape, Part[]>();

/** The coloured areas a shape paints, back to front: a path's fill, then its outline. */
export function shapeParts(s: Shape): Part[] {
  let parts = outlineCache.get(s);
  if (parts) return parts;
  parts = [];
  if (s.type === 'fill') parts.push({ color: s.color, opacity: s.opacity, geom: areaOfPaths(s.paths) });
  else if (s.type === 'stroke') {
    const o = strokeOutline(s);
    const ring: Pair[] = o.map((p) => [q(p[0]), q(p[1])]);
    parts.push({ color: s.color, opacity: s.opacity, geom: ring.length >= 3 ? (union([[ring]]) ?? []) : [] });
  } else {
    const p = s as PathShape;
    if (p.fill) parts.push({ color: p.fill, opacity: p.opacity, geom: areaOfPaths(p.paths.map((sp) => ({ ...sp, closed: true }))) });
    if (p.stroke && p.stroke.width > 0) {
      const lines = p.paths.map((sp) => lineArea(flattenRing(sp), sp.closed, p.stroke!.width, p.stroke!.join, p.stroke!.cap)).filter((g) => g.length);
      const g = lines.length > 1 ? union(lines[0], ...lines.slice(1)) : lines[0];
      if (g?.length) parts.push({ color: p.stroke.color, opacity: p.opacity, geom: g });
    }
  }
  parts = parts.filter((x) => x.geom.length && x.opacity > 0);
  outlineCache.set(s, parts);
  return parts;
}

// ---------------------------------------------------------------- measuring

export function geomBox(g: Geom): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of g)
    for (const [x, y] of poly[0] ?? []) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

function ringArea(r: Pair[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

/** Area covered (holes taken out), in square document pixels. */
export function geomArea(g: Geom): number {
  let a = 0;
  for (const poly of g) poly.forEach((ring, i) => (a += Math.abs(ringArea(ring)) * (i === 0 ? 1 : -1)));
  return a;
}

const boxCache = new WeakMap<Shape, Box | null>();

/** The box a shape paints in, or null when it paints nothing. */
export function shapeBox(s: Shape): Box | null {
  if (boxCache.has(s)) return boxCache.get(s)!;
  let b: Box | null = null;
  for (const p of shapeParts(s)) {
    const pb = geomBox(p.geom);
    if (pb) b = b ? { x0: Math.min(b.x0, pb.x0), y0: Math.min(b.y0, pb.y0), x1: Math.max(b.x1, pb.x1), y1: Math.max(b.y1, pb.y1) } : pb;
  }
  boxCache.set(s, b);
  return b;
}

const overlaps = (a: Box | null, b: Box | null) => !!a && !!b && a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

// ---------------------------------------------------------------- polygons back to shapes

function simplifyRing(r: Pair[]): Pair[] {
  // polygon-clipping repeats the first point at the end, which suits the open-polyline simplifier.
  const closed = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]];
  const s = rdp(
    closed.map(([x, y]) => ({ x, y })),
    SIMPLIFY,
  );
  s.pop();
  return s.map((p) => [p.x, p.y]);
}

/** One FillShape per separate piece. The first piece can keep an existing id, so selections hold on to it. */
export function geomToFills(g: Geom, color: Color, opacity: number, keepId?: Id): FillShape[] {
  const out: FillShape[] = [];
  for (const poly of g) {
    if (!poly.length || Math.abs(ringArea(poly[0])) < MIN_AREA) continue;
    const paths: SubPath[] = [];
    for (const ring of poly) {
      if (ring.length < 4 || Math.abs(ringArea(ring)) < MIN_AREA) continue;
      const s = simplifyRing(ring);
      if (s.length >= 3) paths.push({ closed: true, points: s.map(([x, y]) => ({ x, y })) });
    }
    if (!paths.length) continue;
    const id = out.length === 0 && keepId ? keepId : uid('f');
    const shape: FillShape = { id, type: 'fill', paths, color, opacity };
    // The exact polygon is already known, so measuring the new shape later costs nothing.
    outlineCache.set(shape, [{ color, opacity, geom: [poly] }]);
    out.push(shape);
  }
  return out;
}

// ---------------------------------------------------------------- merging

/** Shapes that take part in merging: anything not in a group. */
export const mergeable = (s: Shape): boolean => !s.group;

const keyOf = (color: Color, opacity: number) => `${color.toLowerCase()}@${opacity}`;

/** A shape as non-overlapping fills (a path's outline cuts its own fill when they differ in colour). */
export function explode(s: Shape): FillShape[] {
  if (s.type === 'fill' && !s.group) return [s];
  const plain = { ...s, group: undefined } as Shape;
  delete (plain as { group?: Id }).group;
  // Same parts as the original, so the cached outline carries over.
  outlineCache.set(plain, shapeParts(s));
  const r = mergeShapes([], [plain]);
  const fills = r.shapes as FillShape[];
  if (fills.length) fills[0] = { ...fills[0], id: s.id };
  return fills;
}

/** Turns ungrouped strokes and paths that reach into `box` into fills, in place. */
function explodeNear(list: Shape[], box: Box | null): Shape[] {
  if (!list.some((s) => s.type !== 'fill' && mergeable(s) && overlaps(shapeBox(s), box))) return list;
  const out: Shape[] = [];
  for (const s of list) {
    if (s.type !== 'fill' && mergeable(s) && overlaps(shapeBox(s), box)) out.push(...explode(s));
    else out.push(s);
  }
  return out;
}

export interface MergeOptions {
  /** Paint goes underneath: it only covers empty ground and joins its own colour (the paint bucket). */
  under?: boolean;
  /** Where joined paint goes in the list when nothing of its colour is there (default: on top, or 0 when under). */
  at?: number;
}

export interface MergeResult {
  shapes: Shape[];
  /** Ids of the shapes holding the new paint. */
  added: Id[];
}

function mergePart(list: Shape[], part: Part, opts: MergeOptions, added: Set<Id>): Shape[] {
  const box = geomBox(part.geom);
  if (!box) return list;
  list = explodeNear(list, box);
  const key = keyOf(part.color, part.opacity);
  let g: Geom = part.geom;

  if (opts.under) {
    const others = list.filter((s) => mergeable(s) && s.type === 'fill' && keyOf(s.color, s.opacity) !== key && overlaps(shapeBox(s), box)).map((s) => shapeParts(s)[0]?.geom ?? []);
    if (others.length) g = difference(g, ...others) ?? g;
    if (!g.length) return list;
  }

  const out: Shape[] = [];
  let acc = g;
  let slot = -1;
  let keep: Id | undefined;
  for (const s of list) {
    if (!mergeable(s) || s.type !== 'fill' || !overlaps(shapeBox(s), box)) {
      out.push(s);
      continue;
    }
    const sg = shapeParts(s)[0]?.geom ?? [];
    if (keyOf(s.color, s.opacity) === key) {
      // Joins only if it touches: the union then has fewer pieces than the two had apart.
      const u = union(acc, sg);
      if (u && u.length < acc.length + sg.length) {
        acc = u;
        if (slot < 0) slot = out.length;
        keep ??= s.id;
        continue;
      }
      out.push(s);
      continue;
    }
    if (opts.under) {
      out.push(s);
      continue;
    }
    // A different colour: cut out what the new paint covers, if it covers anything.
    const hit = intersection(sg, g);
    if (!hit || geomArea(hit) < MIN_AREA / 4) {
      out.push(s);
      continue;
    }
    const left = difference(sg, g);
    if (left === null) {
      out.push(s);
      continue;
    }
    out.push(...geomToFills(left, s.color, s.opacity, s.id));
  }
  const fills = geomToFills(acc, part.color, part.opacity, keep);
  for (const f of fills) added.add(f.id);
  const at = slot >= 0 ? slot : opts.at !== undefined ? Math.min(Math.max(0, opts.at), out.length) : opts.under ? 0 : out.length;
  // `at` was an index into the list before cut pieces came and went; clamp keeps it in range.
  out.splice(Math.min(at, out.length), 0, ...fills);
  return out;
}

/**
 * Adds shapes to a drawing's shapes the merge way. Grouped shapes go on top untouched. Everything else becomes fills
 * that join the same colour and cut other colours (or, `under`, only fill empty ground).
 */
export function mergeShapes(shapes: readonly Shape[], incoming: readonly Shape[], opts: MergeOptions = {}): MergeResult {
  let list = shapes.slice();
  const added = new Set<Id>();
  for (const s of incoming) {
    if (!mergeable(s)) {
      list.push(s);
      added.add(s.id);
      continue;
    }
    const parts = shapeParts(s);
    for (const p of parts) {
      // A path's outline lands on its own fill; the fill was "new" a moment ago, but the outline must still cut it.
      list = mergePart(list, p, opts, added);
    }
  }
  const ids = new Set(list.map((s) => s.id));
  return { shapes: list, added: [...added].filter((id) => ids.has(id)) };
}

/** Takes an area out of every ungrouped shape it covers (the eraser in merge drawing). */
export function eraseArea(shapes: readonly Shape[], area: Geom): { shapes: Shape[]; changed: boolean } {
  const box = geomBox(area);
  if (!box) return { shapes: shapes.slice(), changed: false };
  const list = explodeNear(shapes.slice(), box);
  let changed = list.length !== shapes.length || list.some((s, i) => s !== shapes[i]);
  const out: Shape[] = [];
  for (const s of list) {
    if (!mergeable(s) || s.type !== 'fill' || !overlaps(shapeBox(s), box)) {
      out.push(s);
      continue;
    }
    const sg = shapeParts(s)[0]?.geom ?? [];
    const hit = intersection(sg, area);
    if (!hit || !hit.length) {
      out.push(s);
      continue;
    }
    const left = difference(sg, area);
    if (left === null) {
      out.push(s);
      continue;
    }
    changed = true;
    out.push(...geomToFills(left, s.color, s.opacity, s.id));
  }
  return { shapes: out, changed };
}

/**
 * Cuts the selected ungrouped shapes along an area, so the part inside can be lifted out. Returns the shapes with
 * each cut one replaced by its outside piece(s) followed by its inside piece(s), and the ids now selected: the
 * inside pieces, plus selected shapes wholly inside and selected groups that reach in.
 */
export function cutOut(shapes: readonly Shape[], selected: ReadonlySet<Id>, area: Geom): { shapes: Shape[]; lifted: Id[] } {
  const box = geomBox(area);
  const lifted: Id[] = [];
  if (!box) return { shapes: shapes.slice(), lifted };
  const out: Shape[] = [];
  for (const s of shapes) {
    if (!selected.has(s.id) || !overlaps(shapeBox(s), box)) {
      out.push(s);
      continue;
    }
    if (!mergeable(s)) {
      out.push(s);
      lifted.push(s.id);
      continue;
    }
    for (const f of explode(s)) {
      const sg = shapeParts(f)[0]?.geom ?? [];
      const inside = intersection(sg, area);
      if (!inside || geomArea(inside) < MIN_AREA) {
        out.push(f);
        continue;
      }
      const outside = difference(sg, area) ?? [];
      if (geomArea(outside) < MIN_AREA) {
        out.push(f);
        lifted.push(f.id);
        continue;
      }
      out.push(...geomToFills(outside, f.color, f.opacity, f.id));
      const pieces = geomToFills(inside, f.color, f.opacity);
      out.push(...pieces);
      lifted.push(...pieces.map((p) => p.id));
    }
  }
  return { shapes: out, lifted };
}

/** A polygon from points (a lasso or a box), as a geometry. */
export function polygonGeom(pts: { x: number; y: number }[]): Geom {
  const ring: Pair[] = pts.map((p) => [q(p.x), q(p.y)]);
  if (ring.length < 3) return [];
  return union([[ring]]) ?? [];
}

/** The area an eraser of `radius` sweeps between two points. */
export function sweepGeom(a: { x: number; y: number }, b: { x: number; y: number }, radius: number): Geom {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return [circle(a.x, a.y, radius)];
  return lineArea(
    [
      [q(a.x), q(a.y)],
      [q(b.x), q(b.y)],
    ],
    false,
    radius * 2,
    'round',
    'round',
  );
}

/**
 * Puts moved shapes back the merge way: the old copies come out of the list, and the moved ones are merged in on top.
 * Grouped shapes are swapped in place instead.
 */
export function placeMoved(shapes: readonly Shape[], moved: readonly Shape[]): MergeResult {
  const byId = new Map(moved.map((s) => [s.id, s]));
  const rest: Shape[] = [];
  const loose: Shape[] = [];
  const kept: Id[] = [];
  for (const s of shapes) {
    const m = byId.get(s.id);
    if (!m) rest.push(s);
    else if (!mergeable(m)) {
      rest.push(m);
      kept.push(m.id);
    } else loose.push(m);
  }
  const r = mergeShapes(rest, loose);
  return { shapes: r.shapes, added: [...kept, ...r.added] };
}

// ---------------------------------------------------------------- lasso tests

/** True when the shape paints anywhere inside the area (a lasso): any overlap counts. */
export function shapeTouchesArea(s: Shape, area: Geom): boolean {
  const ab = geomBox(area);
  if (!ab || !overlaps(shapeBox(s), ab)) return false;
  for (const p of shapeParts(s)) {
    const g = intersection(p.geom, area);
    if (g && geomArea(g) >= MIN_AREA / 4) return true;
  }
  return false;
}

/** True when everything the shape paints is inside the area (nothing pokes out). */
export function shapeInsideArea(s: Shape, area: Geom): boolean {
  for (const p of shapeParts(s)) {
    const g = difference(p.geom, area);
    if (g && geomArea(g) >= MIN_AREA) return false;
  }
  return true;
}
