/**
 * Fits a few cubic beziers to a dense closed outline (Schneider's curve fitting, as in Paper.js and Inkscape), so a
 * brush stroke's outline needs a handful of points instead of one per sampled pen position. Pure.
 */
export type Pt = [number, number];

/** A cubic: start, first handle, second handle, end. */
export type Cubic = [Pt, Pt, Pt, Pt];

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};

function at(c: Cubic, t: number): Pt {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const d = 3 * s * t * t;
  const e = t * t * t;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
}

function d1(c: Cubic, t: number): Pt {
  const s = 1 - t;
  return [
    3 * (s * s * (c[1][0] - c[0][0]) + 2 * s * t * (c[2][0] - c[1][0]) + t * t * (c[3][0] - c[2][0])),
    3 * (s * s * (c[1][1] - c[0][1]) + 2 * s * t * (c[2][1] - c[1][1]) + t * t * (c[3][1] - c[2][1])),
  ];
}

function d2(c: Cubic, t: number): Pt {
  const s = 1 - t;
  return [
    6 * (s * (c[2][0] - 2 * c[1][0] + c[0][0]) + t * (c[3][0] - 2 * c[2][0] + c[1][0])),
    6 * (s * (c[2][1] - 2 * c[1][1] + c[0][1]) + t * (c[3][1] - 2 * c[2][1] + c[1][1])),
  ];
}

function chordParams(pts: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

function generate(pts: Pt[], u: number[], t1: Pt, t2: Pt): Cubic {
  const first = pts[0];
  const last = pts[pts.length - 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const s = 1 - u[i];
    const b0 = s * s * s;
    const b1 = 3 * s * s * u[i];
    const b2 = 3 * s * u[i] * u[i];
    const b3 = u[i] * u[i] * u[i];
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(pts[i], add(mul(first, b0 + b1), mul(last, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const seg = len(sub(last, first));
  let al1 = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0;
  let al2 = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0;
  const eps = 1e-6 * seg;
  if (al1 < eps || al2 < eps) al1 = al2 = seg / 3;
  return [first, add(first, mul(t1, al1)), add(last, mul(t2, al2)), last];
}

function newton(c: Cubic, p: Pt, u: number): number {
  const q = sub(at(c, u), p);
  const q1 = d1(c, u);
  const q2 = d2(c, u);
  const den = dot(q1, q1) + dot(q, q2);
  return Math.abs(den) < 1e-12 ? u : u - dot(q, q1) / den;
}

function worst(pts: Pt[], c: Cubic, u: number[]): { err: number; at: number } {
  let err = 0;
  let split = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len(sub(at(c, u[i]), pts[i]));
    if (d >= err) {
      err = d;
      split = i;
    }
  }
  return { err, at: split };
}

function fit(pts: Pt[], t1: Pt, t2: Pt, tol: number, out: Cubic[]): void {
  if (pts.length === 2) {
    const d = len(sub(pts[1], pts[0])) / 3;
    out.push([pts[0], add(pts[0], mul(t1, d)), add(pts[1], mul(t2, d)), pts[1]]);
    return;
  }
  let u = chordParams(pts);
  let c = generate(pts, u, t1, t2);
  let w = worst(pts, c, u);
  if (w.err <= tol) return void out.push(c);
  if (w.err < tol * 8) {
    for (let k = 0; k < 4; k++) {
      u = u.map((x, i) => Math.min(1, Math.max(0, newton(c, pts[i], x))));
      c = generate(pts, u, t1, t2);
      w = worst(pts, c, u);
      if (w.err <= tol) return void out.push(c);
    }
  }
  const s = w.at;
  const mid = unit(sub(pts[s - 1], pts[s + 1]));
  fit(pts.slice(0, s + 1), t1, mid, tol, out);
  fit(pts.slice(s), mul(mid, -1), t2, tol, out);
}

/**
 * Cubics through the closed polyline `pts` (the last point joins the first), each within `tol` of the points.
 * Handles are continuous at the joins, including where the loop closes.
 */
export function fitClosed(all: Pt[], tol: number): Cubic[] {
  const pts = all.filter((q, i) => i === 0 || len(sub(q, all[i - 1])) > 1e-6);
  while (pts.length > 1 && len(sub(pts[0], pts[pts.length - 1])) <= 1e-6) pts.pop();
  const n = pts.length;
  if (n < 4) return [];
  const loop = pts.concat([pts[0]]);
  const t1 = unit(sub(pts[1], pts[n - 1]));
  const out: Cubic[] = [];
  fit(loop, t1, mul(t1, -1), tol, out);
  return out;
}

/** Samples a closed quadratic spline through the midpoints of `p` (as the canvas draws brush outlines), about `step` apart. */
export function sampleMidpointSpline(p: number[][], step: number, cap = 60): Pt[] {
  const n = p.length;
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a: Pt = k === 0 ? [(p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2] : [(p[k - 1][0] + p[k][0]) / 2, (p[k - 1][1] + p[k][1]) / 2];
    const c: Pt = [p[k][0], p[k][1]];
    const b: Pt = [(p[k][0] + p[(k + 1) % n][0]) / 2, (p[k][1] + p[(k + 1) % n][1]) / 2];
    const l = len(sub(c, a)) + len(sub(b, c));
    const steps = Math.max(3, Math.min(cap, Math.ceil(l / step)));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const s = 1 - t;
      out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
    }
  }
  return out;
}
