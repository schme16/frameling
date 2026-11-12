// Shapes on a perspective plane: where a dragged box lands when its edges follow the vanishing points, and the
// projection that carries a flat rectangle or ellipse onto it. Pure maths (homogeneous coordinates), so it's testable.
import type { PathPoint, SubPath } from '../core/format';
import type { Pt, Rect } from './geometry';

/** Which plane a rectangle or ellipse lies on. Auto guesses from where the drag is. */
export type PlaneChoice = 'auto' | 'flat' | 'floor' | 'wall' | 'left' | 'right';

type H3 = [number, number, number];

/** A plane's two edge families: where the box's horizontal-looking edges head, and its vertical-looking ones. */
export interface Plane {
  h: H3;
  v: H3;
}

const INF_H: H3 = [1, 0, 0];
const INF_V: H3 = [0, 1, 0];
const vp = (p: Pt): H3 => [p.x, p.y, 1];
const cross = (a: H3, b: H3): H3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const line = (p: Pt, d: H3): H3 => cross([p.x, p.y, 1], d);

function toPt(h: H3): Pt | null {
  const m = Math.max(1, Math.abs(h[0]), Math.abs(h[1]));
  if (Math.abs(h[2]) < 1e-9 * m) return null;
  return { x: h[0] / h[2], y: h[1] / h[2] };
}

/**
 * The plane for a drag box. With one vanishing point: floor (or ceiling) when the box sits wholly above or below the
 * horizon, otherwise a wall. With two: a wall facing the nearer point, or the floor between them. Null = stay flat.
 */
export function choosePlane(choice: PlaneChoice, vps: Pt[], box: Rect): Plane | null {
  if (choice === 'flat' || !vps.length) return null;
  if (vps.length === 1) {
    const p = vp(vps[0]);
    const floor = choice === 'floor' || (choice === 'auto' && (box.y + box.h <= vps[0].y || box.y >= vps[0].y));
    return floor ? { h: INF_H, v: p } : { h: p, v: INF_V };
  }
  const [l, r] = [...vps].sort((a, b) => a.x - b.x);
  if (choice === 'floor') return { h: vp(l), v: vp(r) };
  if (choice === 'left') return { h: vp(l), v: INF_V };
  if (choice === 'right') return { h: vp(r), v: INF_V };
  const cx = box.x + box.w / 2;
  return { h: vp(Math.abs(cx - l.x) <= Math.abs(cx - r.x) ? l : r), v: INF_V };
}

export type Mat3 = number[];

/** The projective map taking four points onto four others (null if they're degenerate). */
export function homography(src: Pt[], dst: Pt[]): Mat3 | null {
  // Eight equations for the eight unknowns h0..h7 (h8 = 1).
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let best = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[best][c])) best = r;
    if (Math.abs(A[best][c]) < 1e-12) return null;
    [A[c], A[best]] = [A[best], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function applyHomography(h: Mat3, x: number, y: number): Pt | null {
  const w = h[6] * x + h[7] * y + h[8];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

/** True for a four-cornered shape that turns the same way at every corner and has some area. */
export function isConvexQuad(q: Pt[]): boolean {
  let sign = 0;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2 >= 1;
}

/**
 * The quad a drag from corner `p` to the opposite corner `q` makes on `plane`: `p` and `q` stay put, the other two
 * corners are where the plane's edge lines through them cross. `map` carries the flat box (same corners) onto it.
 * Null when the edges never meet or the result would fold over itself (the drag crosses a vanishing point).
 */
export function planeMap(p: Pt, q: Pt, plane: Plane): { quad: [Pt, Pt, Pt, Pt]; map: Mat3 } | null {
  const hc = toPt(cross(line(p, plane.h), line(q, plane.v)));
  const vc = toPt(cross(line(p, plane.v), line(q, plane.h)));
  if (!hc || !vc) return null;
  const quad: [Pt, Pt, Pt, Pt] = [p, hc, q, vc];
  if (!isConvexQuad(quad)) return null;
  const map = homography([p, { x: q.x, y: p.y }, q, { x: p.x, y: q.y }], quad);
  return map ? { quad, map } : null;
}

/** A flat outline carried through the projection (curve handles too, which is close enough for rounded corners). */
export function projectSubPath(sp: SubPath, map: Mat3): SubPath | null {
  const out: PathPoint[] = [];
  for (const pt of sp.points) {
    const a = applyHomography(map, pt.x, pt.y);
    if (!a) return null;
    const next: PathPoint = { x: a.x, y: a.y };
    if (pt.c1) {
      const c = applyHomography(map, pt.c1.x, pt.c1.y);
      if (!c) return null;
      next.c1 = c;
    }
    if (pt.c2) {
      const c = applyHomography(map, pt.c2.x, pt.c2.y);
      if (!c) return null;
      next.c2 = c;
    }
    out.push(next);
  }
  return { closed: sp.closed, points: out };
}

const ELLIPSE_PARTS = 16;

/**
 * The ellipse inscribed in `box`, seen through the projection: an ellipse again. Sixteen curves, each with its handles
 * taken from the exact tangent of the projected circle, so it stays true even when the perspective is strong.
 */
export function projectedEllipse(box: Rect, map: Mat3): SubPath | null {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2;
  const ry = box.h / 2;
  const dt = (Math.PI * 2) / ELLIPSE_PARTS;
  const at = (t: number): { p: Pt; d: Pt } | null => {
    const x = cx + rx * Math.cos(t);
    const y = cy + ry * Math.sin(t);
    const dx = -rx * Math.sin(t);
    const dy = ry * Math.cos(t);
    const X = map[0] * x + map[1] * y + map[2];
    const Y = map[3] * x + map[4] * y + map[5];
    const W = map[6] * x + map[7] * y + map[8];
    if (Math.abs(W) < 1e-12) return null;
    const dX = map[0] * dx + map[1] * dy;
    const dY = map[3] * dx + map[4] * dy;
    const dW = map[6] * dx + map[7] * dy;
    return { p: { x: X / W, y: Y / W }, d: { x: (dX * W - X * dW) / (W * W), y: (dY * W - Y * dW) / (W * W) } };
  };
  const nodes: { p: Pt; d: Pt }[] = [];
  for (let i = 0; i < ELLIPSE_PARTS; i++) {
    const n = at(i * dt);
    if (!n) return null;
    nodes.push(n);
  }
  const k = dt / 3;
  const points: PathPoint[] = nodes.map((n, i) => {
    const prev = nodes[(i + ELLIPSE_PARTS - 1) % ELLIPSE_PARTS];
    return {
      x: n.p.x,
      y: n.p.y,
      c1: { x: prev.p.x + prev.d.x * k, y: prev.p.y + prev.d.y * k },
      c2: { x: n.p.x - n.d.x * k, y: n.p.y - n.d.y * k },
    };
  });
  return { closed: true, points };
}
