/**
 * The follower on a motion path: positions and headings by distance along the line, exact for curves. Each curve gets a
 * length table made by adaptive subdivision (Gauss-Legendre per piece, split until the two halves agree with the
 * whole), so distance maps back to the curve by a short solve instead of walking straight steps. Headings come from the
 * curve's own tangent. Everything that follows a path (the canvas, playback, every exporter that samples frames) goes
 * through here, and so does cutting a path in two.
 */
import type { MotionPath, PathPoint } from './format';

interface Node {
  t: number;
  /** Distance along this curve at `t`. */
  s: number;
}
interface Curve {
  a: PathPoint;
  q: PathPoint;
  bez: boolean;
  len: number;
  /** Where this curve starts along the whole path. */
  start: number;
  nodes: Node[];
}
export interface PathTable {
  curves: Curve[];
  total: number;
}
export interface Located {
  /** Index of the curve (it runs from points[curve] to points[curve + 1]). */
  curve: number;
  /** 0..1 along that curve's own parameter (a straight piece: along the line). */
  t: number;
  x: number;
  y: number;
  /** Heading in degrees. */
  angle: number;
}

const RAD = Math.PI / 180;
// 5-point Gauss-Legendre on 0..1.
const GX = [0.04691007703066802, 0.23076534494715845, 0.5, 0.7692346550528415, 0.9530899229693319];
const GW = [0.11846344252809454, 0.23931433524968324, 0.28444444444444444, 0.23931433524968324, 0.11846344252809454];

const bezAt = (a: PathPoint, q: PathPoint, t: number): { x: number; y: number } => {
  const c1 = q.c1!;
  const c2 = q.c2!;
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.y,
  };
};
const bezDeriv = (a: PathPoint, q: PathPoint, t: number): { x: number; y: number } => {
  const c1 = q.c1!;
  const c2 = q.c2!;
  const u = 1 - t;
  return {
    x: 3 * (u * u * (c1.x - a.x) + 2 * u * t * (c2.x - c1.x) + t * t * (q.x - c2.x)),
    y: 3 * (u * u * (c1.y - a.y) + 2 * u * t * (c2.y - c1.y) + t * t * (q.y - c2.y)),
  };
};
const speed = (a: PathPoint, q: PathPoint, t: number): number => {
  const d = bezDeriv(a, q, t);
  return Math.hypot(d.x, d.y);
};
/** Length of the curve between two parameters. */
const gl = (a: PathPoint, q: PathPoint, t0: number, t1: number): number => {
  const h = t1 - t0;
  let sum = 0;
  for (let i = 0; i < 5; i++) sum += GW[i] * speed(a, q, t0 + h * GX[i]);
  return sum * h;
};

function buildCurve(a: PathPoint, q: PathPoint, start: number): Curve {
  if (!(q.c1 && q.c2)) return { a, q, bez: false, len: Math.hypot(q.x - a.x, q.y - a.y), start, nodes: [] };
  const nodes: Node[] = [{ t: 0, s: 0 }];
  let run = 0;
  const piece = (t0: number, t1: number, whole: number, depth: number) => {
    const tm = (t0 + t1) / 2;
    const l1 = gl(a, q, t0, tm);
    const l2 = gl(a, q, tm, t1);
    if (depth >= 16 || Math.abs(l1 + l2 - whole) <= 1e-9 * (1 + whole)) {
      run += l1 + l2;
      nodes.push({ t: t1, s: run });
    } else {
      piece(t0, tm, l1, depth + 1);
      piece(tm, t1, l2, depth + 1);
    }
  };
  // Start from eight pieces so a lucky single estimate can't pass a curve that wiggles.
  const N = 8;
  for (let i = 0; i < N; i++) piece(i / N, (i + 1) / N, gl(a, q, i / N, (i + 1) / N), 0);
  return { a, q, bez: true, len: run, start, nodes };
}

export function buildPathTable(points: readonly PathPoint[]): PathTable {
  const curves: Curve[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const c = buildCurve(points[i - 1], points[i], total);
    curves.push(c);
    total += c.len;
  }
  return { curves, total };
}

const tables = new WeakMap<MotionPath, PathTable>();
/** The table for a motion path, made once per path object. */
export function tableOf(p: MotionPath): PathTable {
  let t = tables.get(p);
  if (!t) {
    t = buildPathTable(p.points);
    tables.set(p, t);
  }
  return t;
}

/** The curve parameter `s` along a curve (0..len). */
function paramAt(c: Curve, s: number): number {
  if (!c.bez) return c.len ? s / c.len : 0;
  const n = c.nodes;
  let lo = 0;
  let hi = n.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (n[m].s < s) lo = m;
    else hi = m;
  }
  const a = n[lo];
  const b = n[hi];
  const span = b.s - a.s;
  if (span <= 0) return a.t;
  // Newton from the straight guess, kept inside the piece.
  let t = a.t + ((s - a.s) / span) * (b.t - a.t);
  let tl = a.t;
  let th = b.t;
  for (let k = 0; k < 12; k++) {
    const f = a.s + gl(c.a, c.q, a.t, t) - s;
    if (Math.abs(f) < 1e-10) break;
    if (f > 0) th = t;
    else tl = t;
    const d = speed(c.a, c.q, t);
    let nt = d > 1e-12 ? t - f / d : (tl + th) / 2;
    if (nt <= tl || nt >= th) nt = (tl + th) / 2;
    t = nt;
  }
  return t;
}

/** Heading (radians) of a curve at `t`, from its tangent; nudged inside when the tangent vanishes at a point. */
function headingAt(c: Curve, t: number): number {
  if (!c.bez) return Math.atan2(c.q.y - c.a.y, c.q.x - c.a.x);
  let u = t;
  for (let k = 0; k < 6; k++) {
    const d = bezDeriv(c.a, c.q, u);
    if (Math.hypot(d.x, d.y) > 1e-9) return Math.atan2(d.y, d.x);
    u = u < 0.5 ? u + 1e-4 * 10 ** k : u - 1e-4 * 10 ** k;
    u = Math.max(0, Math.min(1, u));
  }
  return Math.atan2(c.q.y - c.a.y, c.q.x - c.a.x);
}

const posAt = (c: Curve, t: number) => (c.bez ? bezAt(c.a, c.q, t) : { x: c.a.x + (c.q.x - c.a.x) * t, y: c.a.y + (c.q.y - c.a.y) * t });

/**
 * Where the follower is after `s` of the line's length (`s` may run past either end: it keeps going straight along the
 * end's heading). Null when the line has no length.
 */
export function locate(tab: PathTable, s: number): Located | null {
  const { curves, total } = tab;
  if (!curves.length || !(total > 0)) return null;
  if (s <= 0 || s >= total) {
    const first = s <= 0;
    let k = first ? 0 : curves.length - 1;
    // Skip zero-length pieces at the end we are leaving along.
    while (curves[k].len <= 0 && k > 0 && k < curves.length - 1) k += first ? 1 : -1;
    const c = curves[k];
    const t = first ? 0 : 1;
    const h = headingAt(c, t);
    const p = posAt(c, t);
    const over = first ? s : s - total;
    return { curve: k, t, x: p.x + Math.cos(h) * over, y: p.y + Math.sin(h) * over, angle: h / RAD };
  }
  let k = 0;
  while (k < curves.length - 1 && (curves[k].len <= 0 || curves[k].start + curves[k].len < s)) k++;
  const c = curves[k];
  const t = paramAt(c, s - c.start);
  const p = posAt(c, t);
  return { curve: k, t, x: p.x, y: p.y, angle: headingAt(c, t) / RAD };
}
