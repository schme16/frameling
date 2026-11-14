/**
 * Hold still at the end of a stroke and it becomes the nearest clean shape: a line, a circle or ellipse, a rectangle,
 * or a triangle or other plain polygon. Pure geometry, no DOM.
 *
 * The point of the rules below is the other direction: a stroke that is NOT meant to be a shape must be left alone. So
 * every shape has to fit tightly (the numbers are named, and each says how tight), a stroke that fits none of them
 * comes back null, and short strokes, arcs, wiggles and loops that don't close are never touched.
 */
import type { SubPath } from '../core/format';
import { rdp, type V } from './bezier';

export interface QPt {
  x: number;
  y: number;
}

export type QuickShape =
  | { kind: 'line'; a: QPt; b: QPt }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot: number }
  | { kind: 'rect'; cx: number; cy: number; w: number; h: number; rot: number }
  | { kind: 'polygon'; pts: QPt[] };

/**
 * How strict each fit is. Fractions are of the shape's own size, so a big circle and a small one are judged the same.
 * Looser snaps more things; tighter leaves more lines alone. Chosen by drawing a lot of wobbly shapes by hand.
 */
export const FIT = {
  /** A stroke shorter than this on screen (pixels) is never tidied: a dot, a tick, a hair. */
  minLengthScreen: 48,
  /** At least this many points, so one jump of the pen can't count as a shape. */
  minPoints: 6,
  /** A closed stroke ends within this fraction of its length of where it began (a circle's ends meet; a "C" does not). */
  closedGap: 0.2,
  /** A line: the pen went almost straight from start to end (chord over length), and strayed less than these from it. */
  lineStraight: 0.93,
  lineRms: 0.016,
  lineMax: 0.045,
  /** An ellipse: how far points sit from the fitted outline, as a fraction of the radius. */
  ellipseRms: 0.07,
  ellipseMax: 0.18,
  /** A rectangle: how far points sit from the nearest side as a fraction of its size, and how close the pen came to each corner. */
  rectRms: 0.05,
  rectMax: 0.14,
  rectCorner: 0.28,
  /** A polygon: no more than this many corners, none closer together than this fraction of the size, and every point this near a side. */
  polygonCorners: 6,
  polygonMinSide: 0.14,
  polygonMax: 0.045,
  /** Close enough to be exactly round, square, level or upright. */
  evenWithin: 0.09,
  levelWithinDeg: 4,
} as const;

const dist = (a: QPt, b: QPt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Points a little apart (repeats dropped). */
function dedupe(pts: readonly QPt[]): QPt[] {
  const out: QPt[] = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.abs(l.x - p.x) > 1e-6 || Math.abs(l.y - p.y) > 1e-6) out.push({ x: p.x, y: p.y });
  }
  return out;
}

export function pathLength(pts: readonly QPt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** `n` points evenly spaced along the path, first and last included. */
export function resample(pts: readonly QPt[], n: number): QPt[] {
  const total = pathLength(pts);
  if (pts.length < 2 || total <= 0) return pts.map((p) => ({ ...p }));
  const out: QPt[] = [{ ...pts[0] }];
  let seg = 1;
  let acc = 0;
  for (let k = 1; k < n - 1; k++) {
    const target = (total * k) / (n - 1);
    while (seg < pts.length - 1 && acc + dist(pts[seg - 1], pts[seg]) < target) {
      acc += dist(pts[seg - 1], pts[seg]);
      seg++;
    }
    const a = pts[seg - 1];
    const b = pts[seg];
    const f = (target - acc) / Math.max(1e-9, dist(a, b));
    out.push({ x: a.x + (b.x - a.x) * Math.min(1, f), y: a.y + (b.y - a.y) * Math.min(1, f) });
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / Math.max(1, xs.length));

// ---------------------------------------------------------------- line

function fitLine(pts: QPt[], length: number): QuickShape | null {
  const first = pts[0];
  const last = pts[pts.length - 1];
  const chord = dist(first, last);
  if (chord < 1e-6 || chord / length < FIT.lineStraight) return null;
  // Distance of every point from the line through the two ends: a pen that bowed out in the middle shows up here.
  const dx = (last.x - first.x) / chord;
  const dy = (last.y - first.y) / chord;
  const d = pts.map((p) => Math.abs((p.x - first.x) * dy - (p.y - first.y) * dx));
  if (rms(d) / chord > FIT.lineRms || Math.max(...d) / chord > FIT.lineMax) return null;
  // Level or upright when close to it.
  let a = { ...first };
  let b = { ...last };
  const deg = (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI;
  const near = (target: number) => Math.abs(((deg - target + 540) % 360) - 180) <= FIT.levelWithinDeg;
  if (near(0) || near(180)) b = { x: b.x, y: a.y };
  else if (near(90) || near(-90)) b = { x: a.x, y: b.y };
  return { kind: 'line', a, b };
}

// ---------------------------------------------------------------- closed shapes

const rot = (p: QPt, c: QPt, ang: number): QPt => {
  const s = Math.sin(ang);
  const co = Math.cos(ang);
  const x = p.x - c.x;
  const y = p.y - c.y;
  return { x: c.x + x * co - y * s, y: c.y + x * s + y * co };
};

interface BoxFit {
  ang: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** The tightest box around the points when turned by `ang`. */
function boxAt(pts: QPt[], ang: number): BoxFit {
  const o = { x: 0, y: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    const r = rot(p, o, -ang);
    x0 = Math.min(x0, r.x);
    x1 = Math.max(x1, r.x);
    y0 = Math.min(y0, r.y);
    y1 = Math.max(y1, r.y);
  }
  const mid = rot({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, o, ang);
  return { ang, cx: mid.x, cy: mid.y, w: x1 - x0, h: y1 - y0 };
}

interface Fit<T> {
  err: number;
  max: number;
  shape: T;
}

function fitEllipse(pts: QPt[]): Fit<QuickShape> | null {
  let best: Fit<QuickShape> | null = null;
  for (let deg = 0; deg < 180; deg += 5) {
    const b = boxAt(pts, (deg * Math.PI) / 180);
    const rx = b.w / 2;
    const ry = b.h / 2;
    if (rx < 1 || ry < 1) continue;
    const c = { x: b.cx, y: b.cy };
    const dev = pts.map((p) => {
      const r = rot(p, c, -b.ang);
      return Math.abs(Math.hypot((r.x - c.x) / rx, (r.y - c.y) / ry) - 1);
    });
    const err = rms(dev);
    if (!best || err < best.err) best = { err, max: Math.max(...dev), shape: { kind: 'ellipse', cx: b.cx, cy: b.cy, rx, ry, rot: b.ang } };
  }
  if (!best || best.err > FIT.ellipseRms || best.max > FIT.ellipseMax) return null;
  const e = best.shape as Extract<QuickShape, { kind: 'ellipse' }>;
  // Round enough to be a circle.
  if (Math.abs(e.rx - e.ry) / Math.max(e.rx, e.ry) < FIT.evenWithin) {
    const r = (e.rx + e.ry) / 2;
    best.shape = { kind: 'ellipse', cx: e.cx, cy: e.cy, rx: r, ry: r, rot: 0 };
  } else if (Math.min(((e.rot * 180) / Math.PI) % 180, 180 - (((e.rot * 180) / Math.PI) % 180)) < FIT.levelWithinDeg) best.shape = { ...e, rot: 0 };
  return best;
}

function fitRect(pts: QPt[]): Fit<QuickShape> | null {
  let best: { err: number; max: number; b: BoxFit } | null = null;
  // Rectangles repeat every quarter turn.
  for (let deg = -45; deg < 45; deg += 3) {
    const b = boxAt(pts, (deg * Math.PI) / 180);
    if (b.w < 1 || b.h < 1) continue;
    const size = Math.sqrt(b.w * b.h);
    const c = { x: b.cx, y: b.cy };
    const dev = pts.map((p) => {
      const r = rot(p, c, -b.ang);
      const x = Math.abs(r.x - c.x);
      const y = Math.abs(r.y - c.y);
      return Math.min(b.w / 2 - x, b.h / 2 - y) / size;
    });
    const err = rms(dev);
    if (!best || err < best.err) best = { err, max: Math.max(...dev.map(Math.abs)), b };
  }
  if (!best || best.err > FIT.rectRms || best.max > FIT.rectMax) return null;
  const { b } = best;
  // The pen has to have gone round all four corners, or it is a "U" or a bracket, not a rectangle.
  const size = Math.sqrt(b.w * b.h);
  const c = { x: b.cx, y: b.cy };
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const corner = rot({ x: c.x + (sx * b.w) / 2, y: c.y + (sy * b.h) / 2 }, c, b.ang);
    if (Math.min(...pts.map((p) => dist(p, corner))) > FIT.rectCorner * size) return null;
  }
  let { w, h } = b;
  let ang = b.ang;
  if (Math.abs(w - h) / Math.max(w, h) < FIT.evenWithin) w = h = (w + h) / 2;
  if (Math.abs((ang * 180) / Math.PI) < FIT.levelWithinDeg + 1) ang = 0;
  return { err: best.err, max: best.max, shape: { kind: 'rect', cx: b.cx, cy: b.cy, w, h, rot: ang } };
}

function fitPolygon(pts: QPt[], diag: number): QuickShape | null {
  const loop: V[] = [...pts, pts[0]].map((p) => ({ x: p.x, y: p.y }));
  const eps = FIT.polygonMax * diag * 0.9;
  const simple = rdp(loop, eps);
  simple.pop();
  // The pen began part way along a side, so the loop's first point may not be a corner: drop any point on a straight run.
  for (let i = 0; i < simple.length && simple.length > 3; ) {
    const a = simple[(i - 1 + simple.length) % simple.length];
    const b = simple[i];
    const c = simple[(i + 1) % simple.length];
    const l = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / l < eps) simple.splice(i, 1);
    else i++;
  }
  const k = simple.length;
  if (k < 3 || k > FIT.polygonCorners) return null;
  for (let i = 0; i < k; i++) if (dist(simple[i], simple[(i + 1) % k]) < FIT.polygonMinSide * diag) return null;
  // Every point of the stroke has to lie close to a side.
  for (const p of pts) {
    let near = Infinity;
    for (let i = 0; i < k; i++) {
      const a = simple[i];
      const b = simple[(i + 1) % k];
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / Math.max(1e-9, l2)));
      near = Math.min(near, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
    }
    if (near > FIT.polygonMax * diag) return null;
  }
  return { kind: 'polygon', pts: simple.map((p) => ({ x: p.x, y: p.y })) };
}

// ---------------------------------------------------------------- the whole thing

/**
 * The clean shape a stroke is trying to be, or null when it isn't clearly one. `zoom` turns document pixels into
 * screen pixels, so "too short" means short as the hand sees it.
 */
export function recogniseShape(points: readonly QPt[], zoom = 1): QuickShape | null {
  const pts = dedupe(points);
  if (pts.length < FIT.minPoints) return null;
  const length = pathLength(pts);
  if (length * zoom < FIT.minLengthScreen) return null;
  const even = resample(pts, 80);
  const gap = dist(pts[0], pts[pts.length - 1]);
  if (gap / length > FIT.closedGap) {
    // Open: a line, or nothing. Arcs, hooks and wiggles stay as drawn.
    return fitLine(even, length);
  }
  const box = boxAt(even, 0);
  const diag = Math.hypot(box.w, box.h);
  if (diag < 1e-6) return null;
  const e = fitEllipse(even);
  const r = fitRect(even);
  if (e && r) return e.err <= r.err ? e.shape : r.shape;
  if (e) return e.shape;
  if (r) return r.shape;
  return fitPolygon(even, diag);
}

/** The shape's name in plain words. */
export function quickName(q: QuickShape): string {
  if (q.kind === 'line') return 'a straight line';
  if (q.kind === 'ellipse') return q.rx === q.ry ? 'a circle' : 'an ellipse';
  if (q.kind === 'rect') return q.w === q.h ? 'a square' : 'a rectangle';
  return q.pts.length === 3 ? 'a triangle' : `a ${q.pts.length}-sided shape`;
}

const KAPPA = 0.5522847498307936;

/** The shape as a path, curves and all. */
export function quickPath(q: QuickShape): SubPath {
  if (q.kind === 'line') return { closed: false, points: [{ x: q.a.x, y: q.a.y }, { x: q.b.x, y: q.b.y }] };
  if (q.kind === 'polygon') return { closed: true, points: q.pts.map((p) => ({ x: p.x, y: p.y })) };
  const c = { x: q.cx, y: q.cy };
  const at = (x: number, y: number, ang: number) => rot({ x, y }, c, ang);
  if (q.kind === 'rect') {
    const hw = q.w / 2;
    const hh = q.h / 2;
    return { closed: true, points: [at(c.x - hw, c.y - hh, q.rot), at(c.x + hw, c.y - hh, q.rot), at(c.x + hw, c.y + hh, q.rot), at(c.x - hw, c.y + hh, q.rot)].map((p) => ({ x: p.x, y: p.y })) };
  }
  const { rx, ry } = q;
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const pt = (x: number, y: number, c1: [number, number], c2: [number, number]) => {
    const p = at(x, y, q.rot);
    const a = at(c1[0], c1[1], q.rot);
    const b = at(c2[0], c2[1], q.rot);
    return { x: p.x, y: p.y, c1: { x: a.x, y: a.y }, c2: { x: b.x, y: b.y } };
  };
  const { x: cx, y: cy } = c;
  return {
    closed: true,
    points: [
      pt(cx + rx, cy, [cx + kx, cy - ry], [cx + rx, cy - ky]),
      pt(cx, cy + ry, [cx + rx, cy + ky], [cx + kx, cy + ry]),
      pt(cx - rx, cy, [cx - kx, cy + ry], [cx - rx, cy + ky]),
      pt(cx, cy - ry, [cx - rx, cy - ky], [cx - kx, cy - ry]),
    ],
  };
}

// ---------------------------------------------------------------- dragging to change it

/** The line with its far end following the pen (Shift: in 45 degree steps). */
function dragLineEnd(q: Extract<QuickShape, { kind: 'line' }>, to: QPt, even: boolean): QuickShape {
  let b = { ...to };
  if (even) {
    const dx = to.x - q.a.x;
    const dy = to.y - q.a.y;
    const step = Math.PI / 4;
    const ang = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    b = { x: q.a.x + Math.cos(ang) * len, y: q.a.y + Math.sin(ang) * len };
  }
  return { kind: 'line', a: q.a, b };
}

/** The centre the shape grows and shrinks about. */
export function quickCentre(q: QuickShape): QPt {
  if (q.kind === 'line') return { x: (q.a.x + q.b.x) / 2, y: (q.a.y + q.b.y) / 2 };
  if (q.kind === 'polygon') return { x: q.pts.reduce((a, p) => a + p.x, 0) / q.pts.length, y: q.pts.reduce((a, p) => a + p.y, 0) / q.pts.length };
  return { x: q.cx, y: q.cy };
}

/**
 * The shape changed by dragging: a line's far end follows the pen; any other shape grows or shrinks about its centre by
 * how much further (or nearer) the pen is than where it was when the shape appeared. `even` makes it round, square or
 * a 45 degree line.
 */
export function dragQuick(q: QuickShape, from: QPt, to: QPt, even: boolean): QuickShape {
  if (q.kind === 'line') return dragLineEnd(q, to, even);
  const c = quickCentre(q);
  const d0 = Math.max(1, dist(c, from));
  const k = Math.max(0.1, dist(c, to) / d0);
  if (q.kind === 'polygon') return { kind: 'polygon', pts: q.pts.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })) };
  if (q.kind === 'ellipse') {
    const rx = q.rx * k;
    const ry = q.ry * k;
    return even ? { kind: 'ellipse', cx: q.cx, cy: q.cy, rx: Math.max(rx, ry), ry: Math.max(rx, ry), rot: 0 } : { ...q, rx, ry };
  }
  const w = q.w * k;
  const h = q.h * k;
  return even ? { kind: 'rect', cx: q.cx, cy: q.cy, w: Math.max(w, h), h: Math.max(w, h), rot: q.rot } : { ...q, w, h };
}
