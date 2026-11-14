/**
 * Combining shapes you have already made: Join (union), Cut out (subtract), Keep the overlap (intersect) and Punch a
 * hole (exclude). Pure geometry, no DOM. The clipping is the same polygon-clipping merge drawing uses (merge.ts); this
 * adds what merge drawing doesn't need: shapes that stay shapes (a path with curves you can still edit), and a say in
 * whose colours the result keeps.
 *
 * Every operand is turned into the area it covers, the operation is run on those areas, and the result is written back
 * as ONE path shape (curves fitted again, corners kept sharp) wearing the look of one of the shapes that went in.
 */
import type { Pair } from 'polygon-clipping';
import type { Id, PathPoint, PathShape, Shape, SubPath } from '../core/format';
import { fitCurve, rdp, type Cubic, type V } from './bezier';
import { areaOfPaths, difference, flattenRing, geomArea, intersection, lineArea, ringArea, shapeParts, union, xor, type Geom } from './merge';

export type CombineOp = 'join' | 'cut' | 'overlap' | 'punch';
/** Whose colours and outline the result wears when shapes of different looks go in. */
export type LookFrom = 'bottom' | 'top';

export const COMBINE_OPS: readonly CombineOp[] = ['join', 'cut', 'overlap', 'punch'];

/** Plain words first, the industry term second. */
export const COMBINE_WORDS: Record<CombineOp, { label: string; term: string; did: string }> = {
  join: { label: 'Join', term: 'union', did: 'Joined' },
  cut: { label: 'Cut out', term: 'subtract', did: 'Cut out' },
  overlap: { label: 'Keep the overlap', term: 'intersect', did: 'Kept the overlap of' },
  punch: { label: 'Punch a hole', term: 'exclude', did: 'Punched a hole through' },
};

/** Pieces smaller than this (square document pixels) are slivers, not shapes. */
const MIN_AREA = 0.75;
/** Closed outlines are simplified this much before fitting: invisible, and it drops the points a straight edge doesn't need. */
const FLAT = 0.02;
/** How far (document pixels) a fitted curve may stray from the clipped outline. */
const FIT = 0.12;
/** A turn sharper than this many degrees is a corner and stays sharp. */
const CORNER = 38;
/** An edge longer than this (document pixels) is a straight side, not a piece of a flattened curve. */
const LONG = 3.2;

/** Shapes that can be combined: lines, fills and outlined shapes. Symbols, text and particles have no outline to cut. */
export const combinable = (s: Shape): boolean => s.type === 'stroke' || s.type === 'fill' || s.type === 'path';

// ---------------------------------------------------------------- the area a shape covers

/**
 * What a shape covers when it is combined. A fill is its area and a brush line its outline. A path is its inside (its
 * outline is a style the result gets again), except an open line, which has no inside, so it is the strip it draws.
 */
export function coverOf(s: Shape): Geom {
  if (s.type === 'fill' || s.type === 'stroke') return shapeParts(s)[0]?.geom ?? [];
  if (s.type !== 'path') return [];
  const closedAll = !!s.fill;
  const inside = s.paths.filter((sp) => (closedAll || sp.closed) && sp.points.length >= 3);
  const parts: Geom[] = [];
  const a = areaOfPaths(inside.map((sp) => ({ ...sp, closed: true })));
  if (a.length) parts.push(a);
  if (!closedAll && s.stroke && s.stroke.width > 0) {
    for (const sp of s.paths) {
      if (sp.closed || sp.points.length < 2) continue;
      const g = lineArea(flattenRing({ ...sp, closed: false }), false, s.stroke.width, s.stroke.join, s.stroke.cap);
      if (g.length) parts.push(g);
    }
  }
  if (!parts.length) return [];
  return parts.length === 1 ? parts[0] : (union(parts[0], ...parts.slice(1)) ?? parts[0]);
}

// ---------------------------------------------------------------- polygons back to a path with curves

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: V): V => {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
const turnDeg = (a: V, b: V, c: V): number => {
  const u = sub(b, a);
  const v = sub(c, b);
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (lu < 1e-9 || lv < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)))) * (180 / Math.PI);
};

/**
 * A clipped outline (a closed ring of points) as a subpath with the curves put back: runs of short edges are fitted
 * with beziers, long edges stay straight, and sharp turns stay sharp. Null when the ring is too small to be a shape.
 */
export function ringToSubPath(ring: Pair[], fit = FIT, flat = FLAT): SubPath | null {
  let p: V[] = [];
  for (const [x, y] of ring) {
    const l = p[p.length - 1];
    if (!l || Math.abs(l.x - x) > 1e-9 || Math.abs(l.y - y) > 1e-9) p.push({ x, y });
  }
  while (p.length > 1 && Math.abs(p[0].x - p[p.length - 1].x) < 1e-9 && Math.abs(p[0].y - p[p.length - 1].y) < 1e-9) p.pop();
  if (p.length < 3) return null;
  // Closed simplify: run it round the loop and drop the repeated start.
  const closed = rdp([...p, p[0]], flat);
  closed.pop();
  p = closed;
  const n = p.length;
  if (n < 3) return null;

  const at = (i: number) => p[((i % n) + n) % n];
  const edge = (i: number) => Math.hypot(at(i + 1).x - at(i).x, at(i + 1).y - at(i).y);
  const knot = new Array<boolean>(n).fill(false);
  const sharp = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = turnDeg(at(i - 1), at(i), at(i + 1));
    if (t >= CORNER) knot[i] = sharp[i] = true;
    if (edge(i) > LONG) {
      knot[i] = true;
      knot[(i + 1) % n] = true;
    }
  }
  let knots: number[] = [];
  knot.forEach((k, i) => k && knots.push(i));
  // A smooth loop with no sharp turns or straight sides: cut it in two places, opposite each other.
  if (knots.length === 0) knots = [0, Math.floor(n / 2)];
  else if (knots.length === 1) knots.push((knots[0] + Math.floor(n / 2)) % n);

  const segs: Cubic[] = [];
  for (let k = 0; k < knots.length; k++) {
    const a = knots[k];
    const b = knots[(k + 1) % knots.length];
    const count = ((b - a + n) % n || n) + 1;
    const run: V[] = [];
    for (let j = 0; j < count; j++) run.push(at(a + j));
    if (run.length === 2) {
      segs.push([run[0], run[0], run[1], run[1]]);
      continue;
    }
    // Tangents run along the curve; a smooth knot uses the line through its neighbours so the two sides agree.
    const t1 = sharp[a] ? unit(sub(run[1], run[0])) : unit(sub(at(a + 1), at(a - 1)));
    const t2 = sharp[b] ? unit(sub(run[run.length - 2], run[run.length - 1])) : unit(sub(at(b - 1), at(b + 1)));
    const fitted = fitCurve(run, fit, t1, t2);
    if (fitted.length) segs.push(...fitted);
    else segs.push([run[0], run[0], run[run.length - 1], run[run.length - 1]]);
  }
  if (!segs.length) return null;

  const pts: PathPoint[] = [{ x: segs[0][0].x, y: segs[0][0].y }];
  segs.forEach((c, i) => {
    const straight = c[1] === c[0] && c[2] === c[3];
    const last = i === segs.length - 1;
    const target: PathPoint = last ? pts[0] : { x: c[3].x, y: c[3].y };
    if (!straight) {
      target.c1 = { x: c[1].x, y: c[1].y };
      target.c2 = { x: c[2].x, y: c[2].y };
    }
    if (!last) pts.push(target);
  });
  return { points: pts, closed: true };
}

/** The subpaths of a geometry: every outline and every hole, as curves. Slivers are left out. */
export function geomToSubPaths(g: Geom, opts: { minArea?: number; fit?: number; flat?: number } = {}): SubPath[] {
  const min = opts.minArea ?? MIN_AREA;
  const out: SubPath[] = [];
  for (const poly of g) {
    if (!poly.length || Math.abs(ringArea(poly[0])) < min) continue;
    for (const ring of poly) {
      if (ring.length < 4 || Math.abs(ringArea(ring)) < min) continue;
      const sp = ringToSubPath(ring, opts.fit, opts.flat);
      if (sp) out.push(sp);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the look of the result

/** Makes the result: `look`'s colours and outline, wearing `paths`. Keeps its id, lineage and extras; leaves its group. */
export function wearLook(look: Shape, paths: SubPath[]): PathShape {
  let out: PathShape;
  if (look.type === 'path') {
    const hasInside = !!look.fill || look.paths.some((sp) => sp.closed);
    if (hasInside) {
      out = { id: look.id, type: 'path', paths, fill: look.fill, stroke: look.stroke, opacity: look.opacity };
      if (look.fillGradient) out.fillGradient = look.fillGradient;
      if (look.strokeGradient) out.strokeGradient = look.strokeGradient;
    } else {
      // An open line has no inside: the strip it drew becomes a filled shape in the line's colour.
      out = { id: look.id, type: 'path', paths, fill: look.stroke?.color ?? '#000000', stroke: null, opacity: look.opacity };
      if (look.strokeGradient) out.fillGradient = look.strokeGradient;
    }
  } else if (look.type === 'fill') {
    out = { id: look.id, type: 'path', paths, fill: look.color, stroke: null, opacity: look.opacity };
    if (look.gradient) out.fillGradient = look.gradient;
  } else {
    const s = look as Extract<Shape, { type: 'stroke' }>;
    out = { id: s.id, type: 'path', paths, fill: s.color, stroke: null, opacity: s.opacity };
  }
  if (look.origin) out.origin = look.origin;
  if (look.ext) out.ext = look.ext;
  return out;
}

const sameLook = (a: Shape, b: Shape): boolean => {
  const key = (s: Shape) => {
    if (s.type === 'path') return JSON.stringify([s.fill, s.fillGradient, s.stroke, s.strokeGradient, s.opacity]);
    if (s.type === 'fill') return JSON.stringify([s.color, s.gradient, s.opacity]);
    if (s.type === 'stroke') return JSON.stringify([s.color, s.opacity]);
    return s.type;
  };
  return key(a) === key(b);
};

/** Do the shapes that would go in disagree about colour or outline, so that choosing whose to keep matters? */
export function looksDiffer(shapes: readonly Shape[], ids: ReadonlySet<Id>): boolean {
  const picked = shapes.filter((s) => ids.has(s.id) && combinable(s));
  return picked.some((s) => !sameLook(s, picked[0]));
}

// ---------------------------------------------------------------- the operation

export type CombineProblem = 'few' | 'apart' | 'nothing-left';

export interface CombineResult {
  shapes: Shape[];
  /** Ids to leave selected afterwards. */
  ids: Id[];
  /** How many shapes went in, and how many were left out (symbols, text, particles). */
  used: number;
  skipped: number;
}

interface Operand {
  /** Members in drawing order (back to front). A group is one operand. */
  members: Shape[];
  at: number;
  cover: Geom;
}

/** The selected shapes as operands, back to front: a group counts once, however many shapes it has. */
function operandsOf(shapes: readonly Shape[], ids: ReadonlySet<Id>): { list: Operand[]; skipped: number } {
  const byGroup = new Map<Id, Operand>();
  const list: Operand[] = [];
  let skipped = 0;
  shapes.forEach((s, i) => {
    if (!ids.has(s.id)) return;
    if (!combinable(s)) {
      skipped++;
      return;
    }
    const cover = coverOf(s);
    const g = s.group;
    const found = g ? byGroup.get(g) : undefined;
    if (found) {
      found.members.push(s);
      found.cover = union(found.cover, cover) ?? found.cover;
      return;
    }
    const o: Operand = { members: [s], at: i, cover };
    if (g) byGroup.set(g, o);
    list.push(o);
  });
  return { list: list.filter((o) => o.cover.length), skipped };
}

const ungrouped = <T extends Shape>(s: T): T => {
  if (!s.group) return s;
  const c = { ...s };
  delete c.group;
  return c;
};

/**
 * Runs `op` on the selected shapes of a drawing's shape list.
 *
 * Join, Keep the overlap and Punch a hole make ONE shape from everything that goes in. It wears the look (fill, outline,
 * gradient, see-through) of the bottom shape, or the top one with `look: 'top'`, and takes its place in the stack.
 *
 * Cut out is different: the TOP shape is the cutter and goes, and every shape under it keeps its own colours and outline
 * with the cutter's area taken out. A shape the cutter doesn't touch is left exactly as it was.
 *
 * Grouped shapes count as one (a group joins and overlaps as a whole), and the result leaves the group. Symbols, text and
 * particles are left alone. Returns a problem word when nothing sensible can be done.
 */
export function combineShapes(shapes: readonly Shape[], ids: ReadonlySet<Id>, op: CombineOp, look: LookFrom = 'bottom'): CombineResult | CombineProblem {
  const { list, skipped } = operandsOf(shapes, ids);
  if (list.length < 2) return 'few';

  if (op === 'cut') return cutOut(shapes, list, skipped);

  const areas = list.map((o) => o.cover);
  let result: Geom | null;
  if (op === 'join') result = union(areas[0], ...areas.slice(1));
  else if (op === 'overlap') result = intersection(areas[0], ...areas.slice(1));
  else result = xor(areas[0], ...areas.slice(1));
  if (!result) return 'nothing-left';
  if (op === 'overlap' && geomArea(result) < MIN_AREA) return 'apart';
  const paths = geomToSubPaths(result);
  if (!paths.length) return 'nothing-left';

  const lookOp = look === 'top' ? list[list.length - 1] : list[0];
  const lookShape = look === 'top' ? lookOp.members[lookOp.members.length - 1] : lookOp.members[0];
  const made = wearLook(lookShape, paths);
  const gone = new Set(list.flatMap((o) => o.members.map((m) => m.id)));
  const out: Shape[] = [];
  for (const s of shapes) {
    if (s.id === lookShape.id) out.push(made);
    else if (!gone.has(s.id)) out.push(s);
  }
  return { shapes: out, ids: [made.id], used: gone.size, skipped };
}

function cutOut(shapes: readonly Shape[], list: Operand[], skipped: number): CombineResult | CombineProblem {
  const cutter = list[list.length - 1];
  const below = list.slice(0, -1);
  const replaced = new Map<Id, Shape | null>();
  const ids: Id[] = [];
  let touched = 0;
  for (const o of below) {
    for (const m of o.members) {
      const mine = coverOf(m);
      const hit = mine.length ? intersection(mine, cutter.cover) : null;
      if (!hit || geomArea(hit) < MIN_AREA / 4) {
        ids.push(m.id);
        continue;
      }
      touched++;
      const left = difference(mine, cutter.cover);
      if (!left) {
        ids.push(m.id);
        continue;
      }
      const paths = geomToSubPaths(left);
      if (!paths.length) {
        replaced.set(m.id, null);
        continue;
      }
      const made = ungrouped(wearLook(m, paths));
      replaced.set(m.id, made);
      ids.push(made.id);
    }
  }
  if (!touched) return 'apart';
  const gone = new Set(cutter.members.map((m) => m.id));
  const out: Shape[] = [];
  for (const s of shapes) {
    if (gone.has(s.id)) continue;
    if (replaced.has(s.id)) {
      const r = replaced.get(s.id);
      if (r) out.push(r);
    } else out.push(s);
  }
  if (!ids.length) return 'nothing-left';
  return { shapes: out, ids, used: below.reduce((n, o) => n + o.members.length, 0) + cutter.members.length, skipped };
}
