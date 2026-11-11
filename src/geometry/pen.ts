/**
 * Points and handles: the pen tool and Edit points work on outlines as a list of anchors, each with an optional
 * handle going in (towards the previous point) and coming out (towards the next). The document stores the same curve
 * as SubPath points with c1/c2 on the point a curve arrives at; these convert between the two and do the edits.
 * Pure maths, no DOM.
 */
import type { PathPoint, SubPath } from '../core/format';

export interface P {
  x: number;
  y: number;
}

export interface Anchor {
  x: number;
  y: number;
  /** Handle on the side of the previous point. */
  hin?: P;
  /** Handle on the side of the next point. */
  hout?: P;
}

const near = (a: P, b: P, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
const copy = (p: P | undefined): P | undefined => (p ? { x: p.x, y: p.y } : undefined);

/** A subpath as anchors. Handles that sit on their own point count as no handle. */
export function toAnchors(sp: SubPath): Anchor[] {
  const pts = sp.points;
  const out: Anchor[] = pts.map((p) => ({ x: p.x, y: p.y }));
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const q = pts[i];
    if (!q.c1 || !q.c2) continue;
    if (i === 0 && !sp.closed) continue;
    const prev = out[(i - 1 + n) % n];
    if (!near(q.c1, prev)) prev.hout = copy(q.c1);
    if (!near(q.c2, q)) out[i].hin = copy(q.c2);
  }
  return out;
}

/** Anchors back to a subpath. A segment with a handle at either end becomes a curve. */
export function fromAnchors(anchors: Anchor[], closed: boolean): SubPath {
  const n = anchors.length;
  const points: PathPoint[] = anchors.map((a, i) => {
    const p: PathPoint = { x: a.x, y: a.y };
    if (i === 0 && !closed) return p;
    const prev = anchors[(i - 1 + n) % n];
    if (prev.hout || a.hin) {
      p.c1 = copy(prev.hout) ?? { x: prev.x, y: prev.y };
      p.c2 = copy(a.hin) ?? { x: a.x, y: a.y };
    }
    return p;
  });
  return { closed, points };
}

/** A corner has no handles; a smooth point has handles in a straight line through it. */
export const isSmooth = (a: Anchor): boolean => !!(a.hin || a.hout);

function cubicAt(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** The four points of segment `i` (from anchor i to the next). */
export function segment(anchors: Anchor[], i: number): [P, P, P, P] {
  const a = anchors[i];
  const b = anchors[(i + 1) % anchors.length];
  return [a, a.hout ?? a, b.hin ?? b, b];
}

/** How many segments a path has. */
export const segmentCount = (anchors: Anchor[], closed: boolean) => (anchors.length < 2 ? 0 : closed ? anchors.length : anchors.length - 1);

/** The point on the outline nearest to `p`: which segment, how far along it (0 to 1), and how far away. */
export function nearestOnPath(anchors: Anchor[], closed: boolean, p: P): { seg: number; t: number; dist: number; at: P } | null {
  let best: { seg: number; t: number; dist: number; at: P } | null = null;
  const segs = segmentCount(anchors, closed);
  for (let s = 0; s < segs; s++) {
    const [a, b, c, d] = segment(anchors, s);
    const steps = 32;
    let bt = 0;
    let bd = Infinity;
    for (let k = 0; k <= steps; k++) {
      const q = cubicAt(a, b, c, d, k / steps);
      const dd = Math.hypot(q.x - p.x, q.y - p.y);
      if (dd < bd) {
        bd = dd;
        bt = k / steps;
      }
    }
    // A few rounds of narrowing in on the nearest spot.
    let lo = Math.max(0, bt - 1 / steps);
    let hi = Math.min(1, bt + 1 / steps);
    for (let r = 0; r < 12; r++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      const q1 = cubicAt(a, b, c, d, m1);
      const q2 = cubicAt(a, b, c, d, m2);
      if (Math.hypot(q1.x - p.x, q1.y - p.y) < Math.hypot(q2.x - p.x, q2.y - p.y)) hi = m2;
      else lo = m1;
    }
    const t = (lo + hi) / 2;
    const at = cubicAt(a, b, c, d, t);
    const dist = Math.hypot(at.x - p.x, at.y - p.y);
    if (!best || dist < best.dist) best = { seg: s, t, dist, at };
  }
  return best;
}

/** Adds a point on segment `seg` at `t`, without changing the outline's shape (de Casteljau). */
export function insertPoint(anchors: Anchor[], seg: number, t: number): Anchor[] {
  const out: Anchor[] = anchors.map((a) => {
    const c: Anchor = { x: a.x, y: a.y };
    if (a.hin) c.hin = copy(a.hin);
    if (a.hout) c.hout = copy(a.hout);
    return c;
  });
  const i = seg;
  const j = (seg + 1) % out.length;
  const a = out[i];
  const b = out[j];
  const curved = !!(a.hout || b.hin);
  const [p0, p1, p2, p3] = segment(out, seg);
  const lerp = (u: P, v: P): P => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
  const q0 = lerp(p0, p1);
  const q1 = lerp(p1, p2);
  const q2 = lerp(p2, p3);
  const r0 = lerp(q0, q1);
  const r1 = lerp(q1, q2);
  const s = lerp(r0, r1);
  const mid: Anchor = { x: s.x, y: s.y };
  if (curved) {
    a.hout = q0;
    b.hin = q2;
    mid.hin = r0;
    mid.hout = r1;
  }
  out.splice(i + 1, 0, mid);
  return out;
}

/** Takes a point out. The neighbours keep their own handles, so the outline stays as close as it can. */
export function deletePoint(anchors: Anchor[], i: number): Anchor[] {
  return anchors.filter((_, k) => k !== i).map((a) => ({ ...a }));
}

/**
 * Corner to smooth (handles along the line through its neighbours, a third of the way to each), or smooth to corner
 * (handles taken away).
 */
export function toggleSmooth(anchors: Anchor[], i: number, closed: boolean): Anchor[] {
  const out = anchors.map((a) => ({ ...a }));
  const a = out[i];
  if (isSmooth(a)) {
    delete a.hin;
    delete a.hout;
    return out;
  }
  const n = out.length;
  const prev = i > 0 || closed ? out[(i - 1 + n) % n] : null;
  const next = i < n - 1 || closed ? out[(i + 1) % n] : null;
  const from = prev ?? a;
  const to = next ?? a;
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return out;
  dx /= len;
  dy /= len;
  const lin = prev ? Math.hypot(a.x - prev.x, a.y - prev.y) / 3 : 0;
  const lout = next ? Math.hypot(next.x - a.x, next.y - a.y) / 3 : 0;
  if (prev && lin > 0) a.hin = { x: a.x - dx * lin, y: a.y - dy * lin };
  if (next && lout > 0) a.hout = { x: a.x + dx * lout, y: a.y + dy * lout };
  return out;
}

/** Moves a point, its handles coming along. */
export function moveAnchor(anchors: Anchor[], i: number, to: P): Anchor[] {
  const out = anchors.map((a) => ({ ...a }));
  const a = out[i];
  const dx = to.x - a.x;
  const dy = to.y - a.y;
  out[i] = { x: to.x, y: to.y, ...(a.hin ? { hin: { x: a.hin.x + dx, y: a.hin.y + dy } } : {}), ...(a.hout ? { hout: { x: a.hout.x + dx, y: a.hout.y + dy } } : {}) };
  return out;
}

/**
 * Moves one handle. With `mirror` (a smooth point), the other handle turns to stay in line, keeping its own length;
 * without it the point becomes a corner with two independent handles.
 */
export function moveHandle(anchors: Anchor[], i: number, which: 'hin' | 'hout', to: P, mirror: boolean): Anchor[] {
  const out = anchors.map((a) => ({ ...a }));
  const a = out[i];
  a[which] = { x: to.x, y: to.y };
  const other = which === 'hin' ? 'hout' : 'hin';
  const o = a[other];
  if (mirror && o) {
    const len = Math.hypot(o.x - a.x, o.y - a.y);
    const dx = a.x - to.x;
    const dy = a.y - to.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-9) a[other] = { x: a.x + (dx / d) * len, y: a.y + (dy / d) * len };
  }
  return out;
}

/** Are a smooth point's two handles in a straight line (so dragging one should turn the other)? */
export function handlesInLine(a: Anchor): boolean {
  if (!a.hin || !a.hout) return false;
  const ax = a.hin.x - a.x;
  const ay = a.hin.y - a.y;
  const bx = a.hout.x - a.x;
  const by = a.hout.y - a.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return true;
  return (ax * bx + ay * by) / (la * lb) < -0.995;
}

/** A pen drag: handles pulled out symmetrically from the point, the out handle following the pointer. */
export function dragHandles(at: P, pointer: P): { hin: P; hout: P } {
  return { hout: { x: pointer.x, y: pointer.y }, hin: { x: 2 * at.x - pointer.x, y: 2 * at.y - pointer.y } };
}
