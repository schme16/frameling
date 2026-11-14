/**
 * Shape geometry for selecting and editing: bounds, hit testing and moving shapes about with a matrix.
 * All pure functions on the document types (no DOM), in document pixels unless a name says screen.
 */
import type { Doc, FillShape, Gradient, InstanceShape, Layer, PathPoint, PathShape, Shape, StrokeShape, SubPath, Transform2D } from '../core/format';
import { strokeOutlineWhole as strokeOutline } from '../core/render';
import { mapGradient } from '../core/gradient';
import { store } from '../core/store';
import { decompose, invert, symbolContent, transformMatrix } from '../core/symbols';
import type { Pt, Rect } from './view';
import { kindOf } from '../core/shapeKinds';

export type { Pt, Rect } from './view';

// ---------------------------------------------------------------- matrices

/** [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f (the same layout as canvas setTransform). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Applies `b` first, then `a`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export const translate = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
export const scaleBy = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];
export const rotateBy = (rad: number): Matrix => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
};

/** Runs a matrix around a fixed point instead of the origin. */
export function about(m: Matrix, cx: number, cy: number): Matrix {
  return multiply(translate(cx, cy), multiply(m, translate(-cx, -cy)));
}
export const scaleAbout = (sx: number, sy: number, cx: number, cy: number): Matrix => about(scaleBy(sx, sy), cx, cy);
export const rotateAbout = (rad: number, cx: number, cy: number): Matrix => about(rotateBy(rad), cx, cy);

export function apply(m: Matrix, x: number, y: number): Pt {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** How much a matrix scales lengths on average (the square root of its area change). Used for line widths. */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

// ---------------------------------------------------------------- rectangles

export function rectFromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function inflateRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function rectContainsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function rectCentre(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// ---------------------------------------------------------------- flattening

const CURVE_STEPS = 14;

function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** A subpath as straight segments (curves sampled). The closing segment of a closed path is left implicit. */
export function flattenSubPath(sp: SubPath): Pt[] {
  const pts = sp.points;
  const out: Pt[] = [];
  if (!pts.length) return out;
  out.push({ x: pts[0].x, y: pts[0].y });
  const seg = (from: PathPoint, to: PathPoint) => {
    if (to.c1 && to.c2) {
      for (let i = 1; i <= CURVE_STEPS; i++) out.push(cubicAt(from, to.c1, to.c2, to, i / CURVE_STEPS));
    } else {
      out.push({ x: to.x, y: to.y });
    }
  };
  for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
  if (sp.closed && pts[0].c1 && pts[0].c2) {
    seg(pts[pts.length - 1], pts[0]);
    out.pop(); // the last sample is the start point again
  }
  return out;
}

// ---------------------------------------------------------------- bounds

function boundsOfPoints(pts: ArrayLike<ArrayLike<number> | Pt>): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as ArrayLike<number> & Pt;
    const x = p.x ?? p[0];
    const y = p.y ?? p[1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x0 > x1 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Shapes are immutable, so the object is a safe cache key.
const boundsCache = new WeakMap<Shape, Rect>();
const ringsCache = new WeakMap<FillShape | PathShape, { pts: Pt[]; closed: boolean }[]>();

// ---------------------------------------------------------------- symbol instances

// Instances measure against the symbol they show, which lives in the document. Tools always work on the store's
// document, so that's where they're looked up (tests can point it elsewhere).
let docSource: () => Doc = () => store().get().doc;
export function setGeometryDoc(fn: (() => Doc) | null): void {
  docSource = fn ?? (() => store().get().doc);
}

const symBounds = new WeakMap<Layer[], { drawings: Doc['drawings']; symbols: Doc['symbols']; r: Rect | null }>();
let boundsDepth = 0;

/** The box a symbol covers over its whole timeline, in symbol space (null when it's empty). */
export function symbolBounds(doc: Doc, id: string): Rect | null {
  const c = symbolContent(doc, id);
  if (!c || boundsDepth > 8) return null;
  const hit = symBounds.get(c.layers);
  if (hit && hit.drawings === doc.drawings && hit.symbols === doc.symbols) return hit.r;
  const rects: Rect[] = [];
  boundsDepth++;
  try {
    for (const l of c.layers)
      for (const cel of l.cels) {
        const d = doc.drawings[cel.drawingId];
        if (!d) continue;
        if (d.kind === 'vector') {
          const b = unionRects(d.shapes.map((s) => (s.type === 'instance' ? instanceBoundsIn(doc, s) : shapeBounds(s))).filter((r): r is Rect => !!r));
          if (b) rects.push(b);
        } else if (d.kind === 'pixel' && l.kind === 'pixel') {
          if (d.width > 0 && d.height > 0) rects.push({ x: (d.x ?? 0) * l.pixelSize, y: (d.y ?? 0) * l.pixelSize, w: d.width * l.pixelSize, h: d.height * l.pixelSize });
        }
      }
  } finally {
    boundsDepth--;
  }
  const r = unionRects(rects);
  symBounds.set(c.layers, { drawings: doc.drawings, symbols: doc.symbols, r });
  return r;
}

function instanceBoundsIn(doc: Doc, s: InstanceShape): Rect | null {
  const c = symbolContent(doc, s.symbolId);
  const r = symbolBounds(doc, s.symbolId);
  if (!c || !r) return null;
  const m = transformMatrix(s.transform, c.def.origin);
  return boundsOfPoints([apply(m, r.x, r.y), apply(m, r.x + r.w, r.y), apply(m, r.x + r.w, r.y + r.h), apply(m, r.x, r.y + r.h)]);
}

/** An instance's box on the stage (a small box at its position when its symbol is empty or missing). */
export function instanceBounds(s: InstanceShape, doc: Doc = docSource()): Rect {
  return instanceBoundsIn(doc, s) ?? { x: s.transform.x - 4, y: s.transform.y - 4, w: 8, h: 8 };
}

function hitInstance(s: InstanceShape, x: number, y: number, tol: number): boolean {
  const doc = docSource();
  const c = symbolContent(doc, s.symbolId);
  const r = symbolBounds(doc, s.symbolId);
  if (!c || !r) return rectContainsPoint(inflateRect(instanceBounds(s, doc), tol), x, y);
  const m = transformMatrix(s.transform, c.def.origin);
  const p = apply(invert(m), x, y);
  const k = Math.max(1e-6, Math.min(Math.abs(s.transform.scaleX), Math.abs(s.transform.scaleY)));
  return rectContainsPoint(inflateRect(r, tol / k), p.x, p.y);
}

function transformInstance(s: InstanceShape, m: Matrix): InstanceShape {
  const c = symbolContent(docSource(), s.symbolId);
  const origin = c?.def.origin ?? { x: 0, y: 0 };
  const next = multiply(m, transformMatrix(s.transform, origin));
  return { ...s, transform: decompose(next, origin) };
}

function rings(s: FillShape | PathShape): { pts: Pt[]; closed: boolean }[] {
  let r = ringsCache.get(s);
  if (!r) {
    r = s.paths.map((p) => ({ pts: flattenSubPath(p), closed: p.closed }));
    ringsCache.set(s, r);
  }
  return r;
}

const outlinesCache = new WeakMap<Shape, { pts: Pt[]; closed: boolean }[]>();

/**
 * The lines a shape is drawn along, for things that cling to them (the magnetic select). Fills and paths give their
 * rings, a brush stroke its outline, and anything else (a symbol, text) the box round it.
 */
export function shapeOutlines(s: Shape): { pts: Pt[]; closed: boolean }[] {
  if (s.type === 'fill' || s.type === 'path') return rings(s);
  let o = outlinesCache.get(s);
  if (!o) {
    if (s.type === 'stroke') {
      const line = strokeOutline(s);
      o = line.length > 1 ? [{ pts: line.map((p) => ({ x: p[0], y: p[1] })), closed: true }] : [{ pts: s.points.map((p) => ({ x: p.x, y: p.y })), closed: false }];
    } else {
      const b = shapeBounds(s);
      o = [
        {
          pts: [
            { x: b.x, y: b.y },
            { x: b.x + b.w, y: b.y },
            { x: b.x + b.w, y: b.y + b.h },
            { x: b.x, y: b.y + b.h },
          ],
          closed: true,
        },
      ];
    }
    // An instance's box moves with its symbol, so it is worked out again each time.
    if (s.type !== 'instance') outlinesCache.set(s, o);
  }
  return o;
}

/** The box a shape covers, line width included. */
export function shapeBounds(s: Shape): Rect {
  // Not cached: the symbol behind an instance can change while the instance stays the same object.
  if (s.type === 'instance') return instanceBounds(s);
  if (s.type !== 'stroke' && s.type !== 'fill' && s.type !== 'path') return kindOf(s)?.bounds(s) ?? { x: 0, y: 0, w: 0, h: 0 };
  let b = boundsCache.get(s);
  if (b) return b;
  if (s.type === 'stroke') {
    const o = strokeOutline(s);
    b = (o.length ? boundsOfPoints(o) : null) ?? (boundsOfPoints(s.points) ? inflateRect(boundsOfPoints(s.points)!, s.brush.size / 2) : null) ?? { x: 0, y: 0, w: 0, h: 0 };
  } else {
    const all: Pt[] = [];
    for (const r of rings(s)) all.push(...r.pts);
    b = boundsOfPoints(all) ?? { x: 0, y: 0, w: 0, h: 0 };
    if (s.type === 'path' && s.stroke) b = inflateRect(b, s.stroke.width / 2);
  }
  boundsCache.set(s, b);
  return b;
}

export function shapesBounds(shapes: Shape[]): Rect | null {
  return unionRects(shapes.map(shapeBounds));
}

// ---------------------------------------------------------------- hit testing

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance from a point to a polyline (or to the closed loop of it). */
export function distToPolyline(pts: ArrayLike<ArrayLike<number> | Pt>, x: number, y: number, closed: boolean): number {
  const n = pts.length;
  if (!n) return Infinity;
  const get = (i: number) => {
    const p = pts[i] as ArrayLike<number> & Pt;
    return [p.x ?? p[0], p.y ?? p[1]] as const;
  };
  if (n === 1) {
    const [a, b] = get(0);
    return Math.hypot(x - a, y - b);
  }
  let best = Infinity;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [ax, ay] = get(i);
    const [bx, by] = get((i + 1) % n);
    const d = distToSegment(x, y, ax, ay, bx, by);
    if (d < best) best = d;
  }
  return best;
}

/** Even-odd containment across any number of rings (so holes work). Open rings count as closed. */
export function pointInRings(ringList: ArrayLike<ArrayLike<number> | Pt>[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of ringList) {
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = ring[i] as ArrayLike<number> & Pt;
      const b = ring[j] as ArrayLike<number> & Pt;
      const ax = a.x ?? a[0];
      const ay = a.y ?? a[1];
      const bx = b.x ?? b[0];
      const by = b.y ?? b[1];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
  }
  return inside;
}

/**
 * Is the point on the shape? `tol` is how far off still counts, in document pixels (pass screen pixels / zoom so it
 * feels the same at every zoom). Unfilled outlines only hit on their line.
 */
export function hitShape(s: Shape, x: number, y: number, tol: number): boolean {
  if (!rectContainsPoint(inflateRect(shapeBounds(s), tol), x, y)) return false;
  if (s.type === 'instance') return hitInstance(s, x, y, tol);
  if (s.type !== 'stroke' && s.type !== 'fill' && s.type !== 'path') return kindOf(s)?.hit(s, x, y, tol) ?? false;
  if (s.type === 'stroke') {
    const o = strokeOutline(s);
    if (o.length > 2 && pointInRings([o], x, y)) return true;
    if (o.length) return distToPolyline(o, x, y, true) <= tol;
    return distToPolyline(s.points, x, y, false) <= tol + s.brush.size / 2;
  }
  const rs = rings(s);
  if ((s.type === 'fill' || s.fill) && pointInRings(rs.map((r) => r.pts), x, y)) return true;
  const reach = (s.type === 'path' && s.stroke ? s.stroke.width / 2 : 0) + tol;
  for (const r of rs) if (distToPolyline(r.pts, x, y, r.closed) <= reach) return true;
  return false;
}

/** The topmost shape under a point (shapes are listed back to front), or undefined. */
export function topShapeAt(shapes: Shape[], x: number, y: number, tol: number): Shape | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitShape(shapes[i], x, y, tol)) return shapes[i];
  return undefined;
}

// ---------------------------------------------------------------- transforming

function mapPoint(m: Matrix, p: PathPoint): PathPoint {
  const q = apply(m, p.x, p.y);
  const out: PathPoint = { x: q.x, y: q.y };
  if (p.c1) out.c1 = apply(m, p.c1.x, p.c1.y);
  if (p.c2) out.c2 = apply(m, p.c2.x, p.c2.y);
  return out;
}

function mapPaths(m: Matrix, paths: SubPath[]): SubPath[] {
  return paths.map((sp) => ({ closed: sp.closed, points: sp.points.map((p) => mapPoint(m, p)) }));
}

/** A shape that sits by a transform of its own (text, an emitter) moved about by the matrix: the transform takes it. */
export function transformPlaced<S extends { transform: Transform2D }>(s: S, m: Matrix): S {
  return { ...s, transform: decompose(multiply(m, transformMatrix(s.transform, { x: 0, y: 0 })), { x: 0, y: 0 }) };
}

/** A new shape moved about by the matrix (same id). Widths and brush sizes scale with it. */
export function transformShape<S extends Shape>(s: S, m: Matrix): S {
  if (s.type === 'instance') return transformInstance(s, m) as S;
  if (s.type !== 'stroke' && s.type !== 'fill' && s.type !== 'path') return (kindOf(s)?.transform(s, m) ?? s) as S;
  const k = matrixScale(m);
  if (s.type === 'stroke') {
    const st = s as StrokeShape;
    const out: StrokeShape = {
      ...st,
      points: st.points.map((p) => {
        const q = apply(m, p.x, p.y);
        return { x: q.x, y: q.y, p: p.p };
      }),
      brush: { ...st.brush, size: st.brush.size * k, taperStart: st.brush.taperStart * k, taperEnd: st.brush.taperEnd * k },
    };
    return out as S;
  }
  const mg = (gr: Gradient | undefined) => gr && mapGradient(gr, (p) => apply(m, p.x, p.y));
  if (s.type === 'fill') {
    const fs = s as FillShape;
    return { ...fs, paths: mapPaths(m, fs.paths), ...(fs.gradient ? { gradient: mg(fs.gradient) } : {}) } as S;
  }
  const ps = s as PathShape;
  const out: PathShape = { ...ps, paths: mapPaths(m, ps.paths), stroke: ps.stroke ? { ...ps.stroke, width: ps.stroke.width * k } : null };
  if (ps.fillGradient) out.fillGradient = mg(ps.fillGradient);
  if (ps.strokeGradient) out.strokeGradient = mg(ps.strokeGradient);
  return out as S;
}

export function transformShapes(shapes: Shape[], m: Matrix): Shape[] {
  return shapes.map((s) => transformShape(s, m));
}

/** A deep copy under a new id. A copy under a new id is a shape of its own, so it does not keep the `origin`. */
export function cloneShape<S extends Shape>(s: S, id: string): S {
  const out = { ...transformShape(s, IDENTITY), id } as S;
  if (id !== s.id) delete out.origin;
  return out;
}

// ---------------------------------------------------------------- selection handles

export type HandleId = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';

/** How close (screen pixels) the pointer must be to grab a handle, and how far the rotate handle floats above the box. */
export const HANDLE_GRAB = 9;
export const ROTATE_OFFSET = 28;

export function handlePoints(b: Rect, zoom: number): Record<HandleId, Pt> {
  return {
    nw: { x: b.x, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    se: { x: b.x + b.w, y: b.y + b.h },
    sw: { x: b.x, y: b.y + b.h },
    rotate: { x: b.x + b.w / 2, y: b.y - ROTATE_OFFSET / zoom },
  };
}

export function hitHandle(b: Rect, x: number, y: number, zoom: number): HandleId | null {
  const hp = handlePoints(b, zoom);
  const order: HandleId[] = ['rotate', 'nw', 'ne', 'se', 'sw'];
  for (const id of order) if (Math.hypot(hp[id].x - x, hp[id].y - y) * zoom <= HANDLE_GRAB) return id;
  return null;
}

const OPPOSITE: Record<'nw' | 'ne' | 'se' | 'sw', 'nw' | 'ne' | 'se' | 'sw'> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

/**
 * The matrix for dragging a corner handle to (px, py). The opposite corner stays put (or the centre, with
 * `fromCentre`). `keepAspect` keeps proportions. Dragging past the opposite side flips the shapes, the way you'd expect.
 */
export function scaleMatrixForHandle(b: Rect, handle: 'nw' | 'ne' | 'se' | 'sw', px: number, py: number, keepAspect: boolean, fromCentre: boolean): Matrix {
  const hp = handlePoints(b, 1);
  const anchor = fromCentre ? rectCentre(b) : hp[OPPOSITE[handle]];
  const h = hp[handle];
  const ox = h.x - anchor.x;
  const oy = h.y - anchor.y;
  let sx = Math.abs(ox) < 1e-9 ? 1 : (px - anchor.x) / ox;
  let sy = Math.abs(oy) < 1e-9 ? 1 : (py - anchor.y) / oy;
  const floor = 0.001;
  if (Math.abs(sx) < floor) sx = sx < 0 ? -floor : floor;
  if (Math.abs(sy) < floor) sy = sy < 0 ? -floor : floor;
  if (keepAspect) {
    const k = Math.max(Math.abs(sx), Math.abs(sy));
    sx = (sx < 0 ? -1 : 1) * k;
    sy = (sy < 0 ? -1 : 1) * k;
  }
  return scaleAbout(sx, sy, anchor.x, anchor.y);
}

/** The matrix for turning a box about its centre by dragging the rotate handle from `startAngle` to the pointer. */
export function rotateMatrixForHandle(b: Rect, startAngle: number, px: number, py: number, snap: boolean): Matrix {
  const c = rectCentre(b);
  let delta = Math.atan2(py - c.y, px - c.x) - startAngle;
  if (snap) {
    const step = Math.PI / 12;
    delta = Math.round(delta / step) * step;
  }
  return rotateAbout(delta, c.x, c.y);
}

/** Angle from a box's centre to a point, in radians. */
export function angleFromCentre(b: Rect, x: number, y: number): number {
  const c = rectCentre(b);
  return Math.atan2(y - c.y, x - c.x);
}

/** Flip a box's contents across its vertical or horizontal middle. */
export function flipMatrix(b: Rect, axis: 'h' | 'v'): Matrix {
  const c = rectCentre(b);
  return axis === 'h' ? scaleAbout(-1, 1, c.x, c.y) : scaleAbout(1, -1, c.x, c.y);
}
