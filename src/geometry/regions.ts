/**
 * The Shape builder's maths: cut a set of overlapping shapes into the separate regions they make (the lens where two
 * circles cross, each crescent either side), find the region under a point, and build a new set of shapes from the
 * regions a drag crossed. Pure geometry, no DOM.
 *
 * It adds no clipping of its own. Every area comes from the same polygon-clipping calls Join and Cut out use
 * (merge.ts), a shape's covered area is coverOf, and a region goes back to a shape through wearLook and geomToSubPaths,
 * so a built shape is the same kind of path with curves that Join makes.
 */
import type { Id, Shape } from '../core/format';
import { uid } from '../core/doc';
import { combinable, coverOf, geomToSubPaths, looksDiffer, wearLook } from './boolean';
import { difference, geomArea, geomBox, intersection, shapeBox, union, type Box, type Geom } from './merge';

/** Whose colours and outline the joined shape wears: the region you started the drag in, or the lowest shape in it. */
export type BuildLook = 'dragged' | 'bottom';

/** More shapes than this and the regions stop being worth working out one by one: pick fewer first. */
export const MAX_SHAPES = 40;
/** Pieces smaller than this (square document pixels) are slivers from touching edges, not regions. */
const MIN_AREA = 0.75;

export interface Region {
  /** Its place in the arrangement's list, and what a plan refers to it by. */
  id: number;
  /** The shapes (indices into `shapes`, back to front) that cover it. The last one is the one you see. */
  members: number[];
  /** One polygon, with its holes. */
  geom: Geom;
  box: Box;
  area: number;
}

export interface Arrangement {
  /** The shapes that went in, back to front. */
  shapes: Shape[];
  regions: Region[];
}

const boxesTouch = (a: Box, b: Box): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

interface Cell {
  members: number[];
  geom: Geom;
  box: Box;
}

const cellOf = (members: number[], geom: Geom): Cell | null => {
  const box = geomBox(geom);
  return box && geomArea(geom) >= MIN_AREA ? { members, geom, box } : null;
};

/**
 * The regions a set of shapes makes between them. Shapes that cannot be combined (symbols, text, particles) are left
 * out, and so are any past MAX_SHAPES. A region is one connected piece with one set of shapes over it, so a crescent
 * that a third shape cuts in two is two regions.
 */
export function buildRegions(shapes: readonly Shape[]): Arrangement {
  const kept = shapes.filter(combinable).slice(0, MAX_SHAPES);
  let cells: Cell[] = [];
  kept.forEach((s, i) => {
    const cover = coverOf(s);
    const cb = geomBox(cover);
    if (!cb) return;
    const next: Cell[] = [];
    const inside: Geom[] = [];
    for (const c of cells) {
      if (!boxesTouch(c.box, cb)) {
        next.push(c);
        continue;
      }
      const hit = intersection(c.geom, cover);
      const inPart = hit && hit.length ? cellOf([...c.members, i], hit) : null;
      const out = inPart ? difference(c.geom, cover) : c.geom;
      if (inPart) {
        next.push(inPart);
        inside.push(inPart.geom);
      }
      if (out && out.length) {
        const rest = inPart ? cellOf(c.members, out) : c;
        if (rest) next.push(rest);
      }
    }
    // What the new shape covers that no earlier shape did.
    const fresh = inside.length ? difference(cover, ...inside) : cover;
    const own = fresh && fresh.length ? cellOf([i], fresh) : null;
    if (own) next.push(own);
    cells = next;
  });
  // One region per separate piece, in a steady order (top to bottom, then left to right) so ids don't jump about.
  const regions: Region[] = [];
  for (const c of cells)
    for (const poly of c.geom) {
      const geom: Geom = [poly];
      const area = geomArea(geom);
      const box = geomBox(geom);
      if (box && area >= MIN_AREA) regions.push({ id: 0, members: c.members, geom, box, area });
    }
  regions.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0 || a.area - b.area);
  regions.forEach((r, i) => (r.id = i));
  return { shapes: kept, regions };
}

// ---------------------------------------------------------------- what is under a point

/** Is the point inside the polygon's outline and outside all its holes? */
export function pointInGeom(g: Geom, x: number, y: number): boolean {
  const inRing = (ring: readonly (readonly [number, number])[]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  for (const poly of g) if (poly.length && inRing(poly[0]) && !poly.slice(1).some(inRing)) return true;
  return false;
}

/**
 * The region at a point, or null. `near` is the region the last point was in: a pointer mostly stays in the region it
 * was in, so that one is tried first and most moves cost one polygon test.
 */
export function regionAt(a: Arrangement, x: number, y: number, near?: number | null): Region | null {
  const tryOne = (r: Region | undefined) => (r && x >= r.box.x0 && x <= r.box.x1 && y >= r.box.y0 && y <= r.box.y1 && pointInGeom(r.geom, x, y) ? r : null);
  const first = near === null || near === undefined ? null : tryOne(a.regions[near]);
  if (first) return first;
  for (const r of a.regions) {
    const hit = tryOne(r);
    if (hit) return hit;
  }
  return null;
}

/** Points along a move from a to b, about `step` apart, so a quick drag can't skip over a thin region. Ends at b. */
export function along(a: { x: number; y: number }, b: { x: number; y: number }, step: number, cap = 96): { x: number; y: number }[] {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.min(cap, Math.ceil(d / Math.max(step, 0.01))));
  const out: { x: number; y: number }[] = [];
  for (let i = 1; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  return out;
}

// ---------------------------------------------------------------- which shapes to work on

/**
 * With nothing picked, the shapes to cut into regions for a point: whatever is under it, and then whatever those touch
 * (by their boxes, which is quick), and so on outward, up to MAX_SHAPES. Back to front, as they are in the drawing.
 * Empty when nothing is under the point.
 */
export function clusterAt(shapes: readonly Shape[], x: number, y: number): Shape[] {
  const cand = shapes.filter(combinable).map((s) => ({ s, box: shapeBox(s) })).filter((c): c is { s: Shape; box: Box } => !!c.box);
  const seeds = cand.filter((c) => x >= c.box.x0 && x <= c.box.x1 && y >= c.box.y0 && y <= c.box.y1 && pointInGeom(coverOf(c.s), x, y));
  if (!seeds.length) return [];
  const chosen = new Set(seeds.map((c) => c.s.id));
  let frontier = seeds;
  while (frontier.length && chosen.size < MAX_SHAPES) {
    const next: typeof cand = [];
    for (const c of cand) {
      if (chosen.has(c.s.id) || chosen.size >= MAX_SHAPES) continue;
      if (frontier.some((f) => boxesTouch(f.box, c.box))) {
        chosen.add(c.s.id);
        next.push(c);
      }
    }
    frontier = next;
  }
  return cand.filter((c) => chosen.has(c.s.id)).map((c) => c.s);
}

// ---------------------------------------------------------------- building from a drag

export interface BuildPlan {
  /** Regions to make into one shape, in the order the drag crossed them. */
  join: number[];
  /** Regions to take away. */
  remove: number[];
}

export interface BuildResult {
  shapes: Shape[];
  /** The joined shape, when there was one. */
  made: Id | null;
  /** What to leave selected afterwards. */
  ids: Id[];
  /** How many regions went into the joined shape, and how many were taken away. */
  joined: number;
  removed: number;
}

const topOf = (a: Arrangement, r: Region): Shape => a.shapes[r.members[r.members.length - 1]];

/** The shape whose colours and outline the joined regions wear. */
export function lookFor(a: Arrangement, join: readonly number[], look: BuildLook): Shape {
  const rs = join.map((id) => a.regions[id]);
  if (look === 'dragged') return topOf(a, rs[0]);
  let low = Infinity;
  for (const r of rs) low = Math.min(low, r.members[0]);
  return a.shapes[low];
}

/** Would "the one you dragged from" and "the lowest shape" give the joined shape different colours? Only then is it worth asking. */
export function lookMatters(a: Arrangement, join: readonly number[]): boolean {
  if (join.length < 2) return false;
  const one = lookFor(a, join, 'dragged');
  const other = lookFor(a, join, 'bottom');
  return one.id !== other.id && looksDiffer([one, other], new Set([one.id, other.id]));
}

/** True when the plan would leave the drawing as it is: a single region that is a whole shape already, being joined. */
export function plansNothing(a: Arrangement, plan: BuildPlan): boolean {
  if (plan.remove.length) return false;
  if (plan.join.length !== 1) return plan.join.length === 0;
  const r = a.regions[plan.join[0]];
  return !!r && r.members.length === 1 && a.regions.filter((x) => x.members.includes(r.members[0])).length === 1;
}

/** Looks the plan up in the shape list and makes the new one: the joined shape, the other regions as shapes of their own, the removed ones gone. */
export function applyBuild(shapes: readonly Shape[], a: Arrangement, plan: BuildPlan, look: BuildLook = 'dragged', newId: () => Id = uid): BuildResult | 'nothing' {
  const join = [...new Set(plan.join)].filter((id) => a.regions[id]);
  const remove = new Set(plan.remove.filter((id) => a.regions[id] && !join.includes(id)));
  if (!join.length && !remove.size) return 'nothing';
  if (plansNothing(a, { join, remove: [...remove] })) return 'nothing';

  const touched = new Set<number>([...join, ...remove]);
  // A shape that overlaps nothing and isn't touched stays exactly as it was, not rebuilt as a path.
  const regionsOf = new Map<number, Region[]>();
  a.regions.forEach((r) => r.members.forEach((m) => (regionsOf.get(m) ?? regionsOf.set(m, []).get(m)!).push(r)));
  const alone = new Set<number>();
  a.shapes.forEach((_, i) => {
    const rs = regionsOf.get(i) ?? [];
    if (rs.length && rs.every((r) => r.members.length === 1 && !touched.has(r.id))) alone.add(i);
  });

  const used = new Set<Id>();
  const take = (preferred: Id): Id => {
    if (!used.has(preferred)) {
      used.add(preferred);
      return preferred;
    }
    const id = newId();
    used.add(id);
    return id;
  };
  const emit = new Map<number, Shape[]>();
  const put = (at: number, s: Shape) => (emit.get(at) ?? emit.set(at, []).get(at)!).push(s);
  const pieces: Id[] = [];
  const ofShape = (r: Region, from: Shape) => {
    const paths = geomToSubPaths(r.geom);
    if (!paths.length) return null;
    const made = wearLook(from, paths);
    const t = { ...made, id: take(made.id) };
    delete (t as { group?: Id }).group;
    return t;
  };

  let made: Id | null = null;
  const ids: Id[] = [];
  if (join.length > 1) {
    const rs = join.map((id) => a.regions[id]);
    const merged = union(rs[0].geom, ...rs.slice(1).map((r) => r.geom));
    if (!merged || !merged.length) return 'nothing';
    const paths = geomToSubPaths(merged);
    if (!paths.length) return 'nothing';
    const from = lookFor(a, join, look);
    const shape = wearLook(from, paths);
    const s = { ...shape, id: take(shape.id) };
    delete (s as { group?: Id }).group;
    made = s.id;
    pieces.push(s.id);
    put(Math.max(...rs.map((r) => r.members[r.members.length - 1])), s);
  }
  for (const r of a.regions) {
    if (remove.has(r.id) || (join.length > 1 && join.includes(r.id))) continue;
    const top = r.members[r.members.length - 1];
    if (r.members.length === 1 && alone.has(top)) continue;
    const s = ofShape(r, topOf(a, r));
    if (!s) continue;
    if (join.length === 1 && join[0] === r.id) made = s.id;
    pieces.push(s.id);
    put(top, s);
  }

  const inSet = new Map<Id, number>();
  a.shapes.forEach((s, i) => inSet.set(s.id, i));
  const out: Shape[] = [];
  for (const s of shapes) {
    const i = inSet.get(s.id);
    if (i === undefined) out.push(s);
    else if (alone.has(i)) out.push(s);
    else for (const piece of emit.get(i) ?? []) out.push(piece);
  }
  return { shapes: out, made, ids: made ? [made] : pieces, joined: join.length, removed: remove.size };
}
