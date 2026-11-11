/**
 * Turns a traced pixel loop into a smooth vector outline: corner detection, Ramer-Douglas-Peucker simplification,
 * then Schneider's cubic bezier fitting ("An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems).
 * Pure maths on points, no DOM.
 */
import type { PathPoint, SubPath } from '../core/format';

export interface V {
  x: number;
  y: number;
}
/** A cubic bezier: start, two controls, end. */
export type Cubic = [V, V, V, V];

const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
const len = (a: V) => Math.hypot(a.x, a.y);
function norm(a: V): V {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export function evalCubic(b: Cubic, t: number): V {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const bb = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * b[0].x + bb * b[1].x + c * b[2].x + d * b[3].x, y: a * b[0].y + bb * b[1].y + c * b[2].y + d * b[3].y };
}
function evalD1(b: Cubic, t: number): V {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (b[1].x - b[0].x) + 6 * mt * t * (b[2].x - b[1].x) + 3 * t * t * (b[3].x - b[2].x),
    y: 3 * mt * mt * (b[1].y - b[0].y) + 6 * mt * t * (b[2].y - b[1].y) + 3 * t * t * (b[3].y - b[2].y),
  };
}
function evalD2(b: Cubic, t: number): V {
  const mt = 1 - t;
  return {
    x: 6 * mt * (b[2].x - 2 * b[1].x + b[0].x) + 6 * t * (b[3].x - 2 * b[2].x + b[1].x),
    y: 6 * mt * (b[2].y - 2 * b[1].y + b[0].y) + 6 * t * (b[3].y - 2 * b[2].y + b[1].y),
  };
}

// ---------------------------------------------------------------- Ramer-Douglas-Peucker

/** Simplifies an open polyline, keeping its ends, so no dropped point is further than `eps` from the result. */
export function rdp(pts: V[], eps: number): V[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const hi = stack.pop()!;
    const lo = stack.pop()!;
    const a = pts[lo];
    const b = pts[hi];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let worst = -1;
    let wd = eps;
    for (let i = lo + 1; i < hi; i++) {
      const p = pts[i];
      let d: number;
      if (l2 < 1e-18) d = Math.hypot(p.x - a.x, p.y - a.y);
      else {
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
        d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      }
      if (d > wd) {
        wd = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push(lo, worst, worst, hi);
    }
  }
  const out: V[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

// ---------------------------------------------------------------- Schneider

function chordParam(d: V[]): number[] {
  const u = [0];
  for (let i = 1; i < d.length; i++) u.push(u[i - 1] + len(sub(d[i], d[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

function generateBezier(d: V[], u: number[], t1: V, t2: V): Cubic {
  const first = d[0];
  const last = d[d.length - 1];
  const n = d.length;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < n; i++) {
    const t = u[i];
    const mt = 1 - t;
    const b0 = mt * mt * mt;
    const b1 = 3 * mt * mt * t;
    const b2 = 3 * mt * t * t;
    const b3 = t * t * t;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(d[i], add(mul(first, b0 + b1), mul(last, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const detX = c00 * x1 - c01 * x0;
  const detY = x0 * c11 - x1 * c01;
  let alpha1 = Math.abs(det) < 1e-12 ? 0 : detY / det;
  let alpha2 = Math.abs(det) < 1e-12 ? 0 : detX / det;
  const seg = len(sub(last, first));
  let path = 0;
  for (let i = 1; i < n; i++) path += len(sub(d[i], d[i - 1]));
  const eps = 1e-6 * seg;
  // Near-singular fits give handles far longer than the curve itself; fall back to the usual third-of-the-way guess.
  if (alpha1 < eps || alpha2 < eps || alpha1 > path || alpha2 > path) {
    alpha1 = alpha2 = (seg > 1e-9 ? seg : path) / 3;
  }
  return [first, add(first, mul(t1, alpha1)), add(last, mul(t2, alpha2)), last];
}

function reparam(b: Cubic, d: V[], u: number[]): number[] {
  return d.map((p, i) => {
    let t = u[i];
    const q = sub(evalCubic(b, t), p);
    const q1 = evalD1(b, t);
    const q2 = evalD2(b, t);
    const num = dot(q, q1);
    const den = dot(q1, q1) + dot(q, q2);
    if (Math.abs(den) < 1e-12) return t;
    t -= num / den;
    return Math.max(0, Math.min(1, t));
  });
}

function maxError(b: Cubic, d: V[], u: number[]): { err: number; at: number } {
  let err = 0;
  let at = Math.floor(d.length / 2);
  for (let i = 1; i < d.length - 1; i++) {
    const p = evalCubic(b, u[i]);
    const e = (p.x - d[i].x) ** 2 + (p.y - d[i].y) ** 2;
    if (e >= err) {
      err = e;
      at = i;
    }
  }
  return { err, at };
}

function fitCubic(d: V[], t1: V, t2: V, error: number, out: Cubic[]): void {
  const n = d.length;
  if (n === 2) {
    const dist = len(sub(d[1], d[0])) / 3;
    out.push([d[0], add(d[0], mul(t1, dist)), add(d[1], mul(t2, dist)), d[1]]);
    return;
  }
  let u = chordParam(d);
  let b = generateBezier(d, u, t1, t2);
  let { err, at } = maxError(b, d, u);
  if (err < error) {
    out.push(b);
    return;
  }
  if (err < error * 16) {
    for (let i = 0; i < 20; i++) {
      u = reparam(b, d, u);
      b = generateBezier(d, u, t1, t2);
      const m = maxError(b, d, u);
      if (m.err < error) {
        out.push(b);
        return;
      }
      err = m.err;
      at = m.at;
    }
  }
  at = Math.max(1, Math.min(n - 2, at));
  const tc = norm(sub(d[at - 1], d[at + 1]));
  fitCubic(d.slice(0, at + 1), t1, tc, error, out);
  fitCubic(d.slice(at), mul(tc, -1), t2, error, out);
}

/** Fits cubic beziers through an open polyline with end tangents (unit vectors pointing into the curve). */
export function fitCurve(pts: V[], tol: number, t1: V, t2: V): Cubic[] {
  const out: Cubic[] = [];
  if (pts.length < 2) return out;
  fitCubic(pts, t1, t2, tol * tol, out);
  return out;
}

// ---------------------------------------------------------------- closed loops

export interface LoopOptions {
  /** RDP tolerance, in the loop's own units. */
  simplify: number;
  /** Largest distance from the traced loop the fitted curve may stray. */
  tolerance: number;
  /** Turn sharper than this many degrees over a few samples counts as a corner. */
  cornerAngle: number;
}

export const DEFAULT_LOOP: LoopOptions = { simplify: 0.7, tolerance: 1, cornerAngle: 58 };

/** Indexes where a closed loop turns sharply. */
export function findCorners(p: V[], angleDeg: number, k = 4): number[] {
  const n = p.length;
  if (n < 3 * k) return [];
  const ang = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = sub(p[i], p[(i - k + n) % n]);
    const b = sub(p[(i + k) % n], p[i]);
    const la = len(a);
    const lb = len(b);
    ang[i] = la < 1e-9 || lb < 1e-9 ? 0 : Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb)))) * (180 / Math.PI);
  }
  const corners: number[] = [];
  for (let i = 0; i < n; i++) {
    if (ang[i] < angleDeg) continue;
    let best = true;
    for (let j = -k; j <= k && best; j++) {
      if (j === 0) continue;
      const o = (i + j + n) % n;
      if (ang[o] > ang[i] || (ang[o] === ang[i] && j < 0)) best = false;
    }
    if (best) corners.push(i);
  }
  return corners;
}

/** Tangent at index `i` looking `dir` (+1 forward, -1 backward) over a few samples. */
function tangentAt(p: V[], i: number, dir: 1 | -1, k = 4): V {
  const n = p.length;
  return norm(sub(p[(i + dir * Math.min(k, n - 1) + n * 4) % n], p[i]));
}

/**
 * Fits a closed loop of points with cubic beziers, splitting at corners. The result starts at the first corner (or
 * point 0), and the curve that closes the loop is stored on the first point, the way `subPathsToPath2D` reads it.
 */
export function fitClosedLoop(loop: V[], opts: LoopOptions = DEFAULT_LOOP): SubPath | null {
  // Drop repeated points first.
  const p: V[] = [];
  for (const q of loop) {
    const l = p[p.length - 1];
    if (!l || Math.abs(l.x - q.x) > 1e-9 || Math.abs(l.y - q.y) > 1e-9) p.push(q);
  }
  while (p.length > 1 && Math.abs(p[0].x - p[p.length - 1].x) < 1e-9 && Math.abs(p[0].y - p[p.length - 1].y) < 1e-9) p.pop();
  const n = p.length;
  if (n < 3) return null;
  const corners = findCorners(p, opts.cornerAngle);
  // Each chain is an open run of the loop from one split to the next, with end tangents taken from the raw points.
  const cubics: Cubic[] = [];
  const chain = (from: number, count: number, t1: V, t2: V) => {
    // `count` points from index `from` going forward and wrapping
    const pts: V[] = [];
    for (let j = 0; j < count; j++) pts.push(p[(from + j) % n]);
    const s = rdp(pts, opts.simplify);
    if (s.length === 2) {
      cubics.push([s[0], s[0], s[1], s[1]]);
      return;
    }
    cubics.push(...fitCurve(s, opts.tolerance, t1, t2));
  };
  if (corners.length === 0) {
    // A smooth loop: cut it at point 0 and half way round, with the same centred tangent either side of each cut.
    const half = Math.floor(n / 2);
    const k = Math.max(1, Math.min(4, Math.floor(n / 4)));
    const tcA = norm(sub(p[k % n], p[(n - k) % n]));
    const tcB = norm(sub(p[(half + k) % n], p[(half - k + n) % n]));
    chain(0, half + 1, tcA, mul(tcB, -1));
    chain(half, n - half + 1, tcB, mul(tcA, -1));
  } else {
    for (let c = 0; c < corners.length; c++) {
      const a = corners[c];
      const b = corners[(c + 1) % corners.length];
      const count = ((b - a + n) % n || n) + 1;
      const t1 = tangentAt(p, a, 1);
      const t2 = tangentAt(p, b, -1);
      chain(a, count, t1, t2);
    }
  }
  if (!cubics.length) return null;
  const pts: PathPoint[] = [{ x: cubics[0][0].x, y: cubics[0][0].y }];
  for (let i = 0; i < cubics.length; i++) {
    const [, c1, c2, e] = cubics[i];
    const straight = c1 === cubics[i][0] && c2 === e;
    const last = i === cubics.length - 1;
    if (last) {
      // Closes back on the start: the arriving curve lives on point 0.
      if (!straight) {
        pts[0].c1 = { x: c1.x, y: c1.y };
        pts[0].c2 = { x: c2.x, y: c2.y };
      }
    } else {
      const pt: PathPoint = { x: e.x, y: e.y };
      if (!straight) {
        pt.c1 = { x: c1.x, y: c1.y };
        pt.c2 = { x: c2.x, y: c2.y };
      }
      pts.push(pt);
    }
  }
  return { points: pts, closed: true };
}

/** Points along a closed subpath's curves, for tests and hit checks (`per` samples per segment). */
export function sampleSubPath(sp: SubPath, per = 16): V[] {
  const out: V[] = [];
  const pts = sp.points;
  const n = pts.length;
  const segs = sp.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (b.c1 && b.c2) {
      const cub: Cubic = [a, b.c1, b.c2, b];
      for (let j = 0; j < per; j++) out.push(evalCubic(cub, j / per));
    } else out.push({ x: a.x, y: a.y });
  }
  if (!sp.closed && n) out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
  return out;
}
