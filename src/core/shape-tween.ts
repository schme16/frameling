/**
 * Shape tweens: morphing one key's drawing into the next one's. Pure functions on the format (no DOM).
 *
 * Shapes pair up by their order in the drawing. Each pair is turned into matching outlines once (a "plan"), which
 * the in-betweens then just blend:
 * - Outlines become rings of cubic segments. The one with fewer segments has its longest ones split until both have
 *   the same number, then the start point and direction are picked so the points travel the shortest way.
 * - Shape hints pin points: the point nearest `from` on the start drawing goes to the point nearest `to` on the end
 *   one. Each stretch between two hints is matched on its own, so hints untwist a morph.
 * - Different numbers of holes or pieces: a spare piece shrinks away to its middle (or grows from it).
 * - Brush strokes morph with strokes (point by point). A stroke meeting a filled shape morphs as its outline.
 * - Colours, see-through, line widths and symbol copies blend too.
 * - Text pairs with text and particle emitters with emitters (in order): position, turn, size, colour and see-through
 *   blend. A spare one fades out (or in). Things that can't blend (the words, how many particles) are listed by
 *   `morphNotes` so the panel can say so.
 */
import { blendGradient } from './gradient';
import type { Color, FillShape, Gradient, InstanceShape, ParticlesShape, PathPoint, PathShape, Shape, ShapeHint, StrokePoint, StrokeShape, SubPath, TextShape, Transform2D, VectorDrawing } from './format';
import { strokeOutline } from './render';

type P = { x: number; y: number };
/** One cubic segment: a to d, with controls b and c. */
interface Seg {
  a: P;
  b: P;
  c: P;
  d: P;
  /** Set on the segment that starts at a hint's point. */
  hint?: string;
}
/** A matched pair of rings with the same number of segments. */
interface RingPair {
  from: Seg[];
  to: Seg[];
  closed: boolean;
}

interface Style {
  fill: Color | null;
  stroke: PathShape['stroke'];
  opacity: number;
  /** Which kind of shape it came from, so a pair of fills stays a fill. */
  type: 'fill' | 'path';
  group?: string;
  fillGradient?: Gradient;
  strokeGradient?: Gradient;
}

type Plan =
  | { kind: 'area'; id: string; rings: RingPair[]; a: Style; b: Style }
  | { kind: 'stroke'; id: string; from: StrokeShape; to: StrokeShape; pa: StrokePoint[]; pb: StrokePoint[] }
  | { kind: 'instance'; a: InstanceShape; b: InstanceShape | undefined }
  // Text and emitters: a on the start key, b on the end key. A missing one is a spare that fades in or out.
  | { kind: 'text'; a: TextShape | undefined; b: TextShape | undefined }
  | { kind: 'particles'; a: ParticlesShape | undefined; b: ParticlesShape | undefined };

/** Shapes made of outlines, the ones a shape tween can morph. */
const morphable = (s: Shape): boolean => s.type !== 'instance' && s.type !== 'text' && s.type !== 'particles';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lp = (p: P, q: P, t: number): P => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
const d2 = (p: P, q: P) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;

// ---------------------------------------------------------------- colours

function parseHex(c: string | null | undefined): [number, number, number, number] | null {
  if (!c) return null;
  const h = c.replace('#', '');
  const v = h.length === 3 || h.length === 4 ? h.split('').map((x) => x + x).join('') : h;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) return null;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), v.length === 8 ? parseInt(v.slice(6, 8), 16) : 255];
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/**
 * Blends two colours, alpha included. A missing colour (no fill) counts as the other one fully see-through, so a fill
 * fades in or out instead of flashing black.
 */
export function mixColors(a: Color | null, b: Color | null, t: number): Color | null {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x && !y) return null;
  const p = x ?? [y![0], y![1], y![2], 0];
  const q = y ?? [x![0], x![1], x![2], 0];
  const u = Math.max(0, Math.min(1, t));
  const m = p.map((v, i) => lerp(v, q[i], u));
  if (m[3] <= 0.5) return null;
  return '#' + hex2(m[0]) + hex2(m[1]) + hex2(m[2]) + (Math.round(m[3]) >= 255 ? '' : hex2(m[3]));
}

// ---------------------------------------------------------------- outlines as rings of cubics

function lineSeg(a: P, d: P): Seg {
  return { a, b: lp(a, d, 1 / 3), c: lp(a, d, 2 / 3), d };
}

/** A subpath as cubic segments. Closed ones get their closing segment. */
export function toSegs(sp: SubPath): Seg[] {
  const pts = sp.points;
  const out: Seg[] = [];
  const seg = (from: PathPoint, to: PathPoint): Seg => (to.c1 && to.c2 ? { a: { x: from.x, y: from.y }, b: { ...to.c1 }, c: { ...to.c2 }, d: { x: to.x, y: to.y } } : lineSeg({ x: from.x, y: from.y }, { x: to.x, y: to.y }));
  for (let i = 1; i < pts.length; i++) out.push(seg(pts[i - 1], pts[i]));
  if (sp.closed && pts.length > 1) out.push(seg(pts[pts.length - 1], pts[0]));
  return out;
}

/** Rings back to a subpath. */
export function fromSegs(segs: Seg[], closed: boolean): SubPath {
  if (!segs.length) return { points: [], closed };
  const point = (s: Seg): PathPoint => ({ x: s.d.x, y: s.d.y, c1: { ...s.b }, c2: { ...s.c } });
  if (closed) {
    const last = segs[segs.length - 1];
    return { points: [point(last), ...segs.slice(0, -1).map(point)], closed: true };
  }
  return { points: [{ x: segs[0].a.x, y: segs[0].a.y }, ...segs.map(point)], closed: false };
}

function splitSeg(s: Seg, t: number): [Seg, Seg] {
  const ab = lp(s.a, s.b, t);
  const bc = lp(s.b, s.c, t);
  const cd = lp(s.c, s.d, t);
  const abc = lp(ab, bc, t);
  const bcd = lp(bc, cd, t);
  const m = lp(abc, bcd, t);
  return [
    { a: s.a, b: ab, c: abc, d: m, ...(s.hint ? { hint: s.hint } : {}) },
    { a: m, b: bcd, c: cd, d: s.d },
  ];
}

const segLen = (s: Seg) => Math.sqrt(d2(s.a, s.b)) + Math.sqrt(d2(s.b, s.c)) + Math.sqrt(d2(s.c, s.d));

/** Splits the longest segments until there are `n` (never fewer than now). */
function growTo(segs: Seg[], n: number): Seg[] {
  if (!segs.length) return segs;
  const out = segs.slice();
  while (out.length < n) {
    let k = 0;
    let best = -1;
    for (let i = 0; i < out.length; i++) {
      const L = segLen(out[i]);
      if (L > best) {
        best = L;
        k = i;
      }
    }
    const [x, y] = splitSeg(out[k], 0.5);
    out.splice(k, 1, x, y);
  }
  return out;
}

function pointAt(s: Seg, t: number): P {
  const u = 1 - t;
  return {
    x: u * u * u * s.a.x + 3 * u * u * t * s.b.x + 3 * u * t * t * s.c.x + t * t * t * s.d.x,
    y: u * u * u * s.a.y + 3 * u * u * t * s.b.y + 3 * u * t * t * s.c.y + t * t * t * s.d.y,
  };
}

/** The segment and position along it nearest to `p`. */
function nearestOn(segs: Seg[], p: P): { i: number; t: number; dist: number } {
  let best = { i: 0, t: 0, dist: Infinity };
  for (let i = 0; i < segs.length; i++) {
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const q = pointAt(segs[i], t);
      const dd = d2(p, q);
      if (dd < best.dist) best = { i, t, dist: dd };
    }
  }
  // Refine around the best sample.
  let { i, t } = best;
  let step = 1 / 48;
  for (let r = 0; r < 12; r++) {
    for (const cand of [t - step, t + step]) {
      if (cand < 0 || cand > 1) continue;
      const dd = d2(p, pointAt(segs[i], cand));
      if (dd < best.dist) best = { i, t: (t = cand), dist: dd };
    }
    step /= 2;
  }
  return best;
}

/** Puts a hint mark on the ring at the point nearest `p` (splitting a segment if needed). */
function markHint(segs: Seg[], p: P, id: string): void {
  const n = nearestOn(segs, p);
  if (n.t < 1e-3) segs[n.i] = { ...segs[n.i], hint: id };
  else if (n.t > 1 - 1e-3) {
    const j = (n.i + 1) % segs.length;
    segs[j] = { ...segs[j], hint: id };
  } else {
    const [x, y] = splitSeg(segs[n.i], n.t);
    segs.splice(n.i, 1, x, { ...y, hint: id });
  }
}

function reverseRing(segs: Seg[]): Seg[] {
  // Each segment flips, and a hint stays on the segment that now starts at its point.
  const out: Seg[] = segs.map((s) => ({ a: s.d, b: s.c, c: s.b, d: s.a })).reverse();
  const n = segs.length;
  segs.forEach((s, i) => {
    if (!s.hint) return;
    // The point segs[i].a is now the end of reversed segment (n-1-i), so the start of the one after it.
    const k = (n - i) % n;
    out[k] = { ...out[k], hint: s.hint };
  });
  return out;
}

const rotate = <T>(arr: T[], k: number): T[] => arr.slice(k).concat(arr.slice(0, k));

function centroid(segs: Seg[]): P {
  if (!segs.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const s of segs) {
    x += s.a.x;
    y += s.a.y;
  }
  return { x: x / segs.length, y: y / segs.length };
}

/** Sum of squared distances between matching points (both rings moved to their middles first). */
function cost(a: Seg[], b: Seg[], k: number): number {
  const ca = centroid(a);
  const cb = centroid(b);
  const n = a.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = a[i].a;
    const q = b[(i + k) % n].a;
    s += (p.x - ca.x - (q.x - cb.x)) ** 2 + (p.y - ca.y - (q.y - cb.y)) ** 2;
  }
  return s;
}

/** Matches two closed rings with no hints: same count, best start point and direction. */
function matchFree(a: Seg[], b: Seg[]): [Seg[], Seg[]] {
  const n = Math.max(a.length, b.length);
  const A = growTo(a, n);
  const B0 = growTo(b, n);
  let best = { cost: Infinity, ring: B0 };
  for (const B of [B0, reverseRing(B0)]) {
    for (let k = 0; k < n; k++) {
      const c = cost(A, B, k);
      if (c < best.cost) best = { cost: c, ring: rotate(B, k) };
    }
  }
  return [A, best.ring];
}

/** Matches two open lines: same count, either way round. */
function matchOpen(a: Seg[], b: Seg[]): [Seg[], Seg[]] {
  const n = Math.max(a.length, b.length);
  const A = growTo(a, n);
  const B = growTo(b, n);
  const R = reverseRing(B);
  const c = (x: Seg[]) => x.reduce((s, seg, i) => s + d2(seg.a, A[i].a) + d2(seg.d, A[i].d), 0);
  return c(R) < c(B) ? [A, R] : [A, B];
}

/** Matches two closed rings that carry the same hints: stretch by stretch between them. */
function matchHinted(a: Seg[], b: Seg[], order: string[]): [Seg[], Seg[]] {
  const idx = (r: Seg[], id: string) => r.findIndex((s) => s.hint === id);
  // The ring b, turned so its hints come in the same order as a's (flipping it if that's what it takes).
  const inOrder = (r: Seg[]) => {
    const pos = order.map((id) => idx(r, id));
    const start = pos[0];
    const rel = pos.map((p) => (p - start + r.length) % r.length);
    return rel.every((v, i) => i === 0 || v > rel[i - 1]);
  };
  let B = b;
  if (order.length > 1 && !inOrder(B) && inOrder(reverseRing(B))) B = reverseRing(B);
  const A = rotate(a, idx(a, order[0]));
  B = rotate(B, idx(B, order[0]));
  const cutsA = order.map((id) => idx(A, id));
  const cutsB = order.map((id) => idx(B, id));
  const outA: Seg[] = [];
  const outB: Seg[] = [];
  for (let h = 0; h < order.length; h++) {
    const sa = A.slice(cutsA[h], h + 1 < order.length ? cutsA[h + 1] : A.length);
    const sb = B.slice(cutsB[h], h + 1 < order.length ? cutsB[h + 1] : B.length);
    const n = Math.max(sa.length, sb.length, 1);
    outA.push(...growTo(sa, n));
    outB.push(...growTo(sb, n));
  }
  return [outA, outB];
}

/** A ring of `n` segments all sitting on one point (a piece that shrinks away or grows from nothing). */
function pointRing(p: P, n: number): Seg[] {
  return Array.from({ length: Math.max(1, n) }, () => ({ a: { ...p }, b: { ...p }, c: { ...p }, d: { ...p } }));
}

function ringsOf(paths: SubPath[]): { segs: Seg[]; closed: boolean }[] {
  return paths.map((sp) => ({ segs: toSegs(sp), closed: sp.closed })).filter((r) => r.segs.length > 0);
}

function boundsCentre(rings: { segs: Seg[] }[]): P {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (const s of r.segs)
      for (const p of [s.a, s.d]) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
  return Number.isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: 0, y: 0 };
}

/**
 * Pairs and matches the pieces (subpaths) of two outlines. Hints go to the pieces nearest them; pieces pair up with
 * the nearest one on the other side (relative to each outline's middle), and spare pieces shrink to nothing.
 */
export function matchOutlines(fromPaths: SubPath[], toPaths: SubPath[], hints: ShapeHint[] = []): RingPair[] {
  const A = ringsOf(fromPaths);
  const B = ringsOf(toPaths);
  const ca = boundsCentre(A);
  const cb = boundsCentre(B);
  // Pair pieces greedily, nearest middles first.
  const pairs: [number, number][] = [];
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const cand: { i: number; j: number; d: number }[] = [];
  A.forEach((ra, i) =>
    B.forEach((rb, j) => {
      const pa = centroid(ra.segs);
      const pb = centroid(rb.segs);
      cand.push({ i, j, d: (pa.x - ca.x - (pb.x - cb.x)) ** 2 + (pa.y - ca.y - (pb.y - cb.y)) ** 2 + (ra.closed !== rb.closed ? 1e12 : 0) });
    }),
  );
  cand.sort((x, y) => x.d - y.d);
  for (const c of cand) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue;
    usedA.add(c.i);
    usedB.add(c.j);
    pairs.push([c.i, c.j]);
  }
  pairs.sort((x, y) => x[0] - y[0]);

  // Each hint belongs to the pair whose start piece is nearest its `from` point.
  const hintsFor = new Map<number, ShapeHint[]>();
  for (const h of hints) {
    let best = -1;
    let bd = Infinity;
    pairs.forEach(([i], k) => {
      const dd = nearestOn(A[i].segs, h.from).dist;
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    });
    if (best >= 0) hintsFor.set(best, [...(hintsFor.get(best) ?? []), h]);
  }

  const out: RingPair[] = [];
  pairs.forEach(([i, j], k) => {
    const closed = A[i].closed || B[j].closed;
    const a = A[i].segs.slice();
    const b = B[j].segs.slice();
    const hs = closed ? (hintsFor.get(k) ?? []) : [];
    if (hs.length) {
      for (const h of hs) {
        markHint(a, h.from, h.id);
        markHint(b, h.to, h.id);
      }
      // Hints in the order they come round the start piece; ones that cross the others are left out.
      const order = hs
        .map((h) => h.id)
        .filter((id) => a.some((s) => s.hint === id) && b.some((s) => s.hint === id))
        .sort((x, y) => a.findIndex((s) => s.hint === x) - a.findIndex((s) => s.hint === y));
      const kept = keepUncrossed(order, b);
      if (kept.length) {
        const [ma, mb] = matchHinted(a, b, kept);
        out.push({ from: ma, to: mb, closed });
        return;
      }
    }
    const [ma, mb] = closed ? matchFree(a, b) : matchOpen(a, b);
    out.push({ from: ma, to: mb, closed });
  });
  // Spare pieces shrink to (or grow from) their own middle, moved along with the rest of the shape.
  A.forEach((r, i) => {
    if (usedA.has(i)) return;
    const c = centroid(r.segs);
    out.push({ from: r.segs, to: pointRing({ x: c.x + cb.x - ca.x, y: c.y + cb.y - ca.y }, r.segs.length), closed: r.closed });
  });
  B.forEach((r, j) => {
    if (usedB.has(j)) return;
    const c = centroid(r.segs);
    out.push({ from: pointRing({ x: c.x + ca.x - cb.x, y: c.y + ca.y - cb.y }, r.segs.length), to: r.segs, closed: r.closed });
  });
  return out;
}

/** Indices of a longest strictly increasing run in `seq`. */
function longestIncreasing(seq: number[]): number[] {
  const len = seq.map(() => 1);
  const prev = seq.map(() => -1);
  for (let i = 0; i < seq.length; i++)
    for (let j = 0; j < i; j++)
      if (seq[j] < seq[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
  let k = len.indexOf(Math.max(0, ...len));
  const out: number[] = [];
  while (k >= 0) {
    out.unshift(k);
    k = prev[k];
  }
  return out;
}

/** The most hints that come round both rings in the same order (either way round on the end one). */
export function keepUncrossed(order: string[], b: Seg[]): string[] {
  if (order.length < 3) return order;
  let best: string[] = [];
  for (const ring of [b, reverseRing(b)]) {
    const pos = order.map((id) => ring.findIndex((s) => s.hint === id));
    for (let s = 0; s < order.length; s++) {
      const ids = [...order.slice(s), ...order.slice(0, s)];
      const seq = ids.map((_, k) => (pos[(s + k) % order.length] - pos[s] + ring.length) % ring.length);
      const run = longestIncreasing(seq).map((k) => ids[k]);
      if (run.length > best.length) best = run;
    }
  }
  return order.filter((id) => best.includes(id));
}

function blendRing(p: RingPair, t: number): SubPath {
  const segs: Seg[] = p.from.map((s, i) => {
    const q = p.to[i];
    return { a: lp(s.a, q.a, t), b: lp(s.b, q.b, t), c: lp(s.c, q.c, t), d: lp(s.d, q.d, t) };
  });
  return fromSegs(segs, p.closed);
}

// ---------------------------------------------------------------- strokes

/** Points along a stroke at even spacing, `n` of them. */
export function resampleStroke(points: StrokePoint[], n: number): StrokePoint[] {
  if (!points.length) return [];
  if (points.length === 1 || n <= 1) return Array.from({ length: Math.max(1, n) }, () => ({ ...points[0] }));
  const acc = [0];
  for (let i = 1; i < points.length; i++) acc.push(acc[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = acc[acc.length - 1];
  const out: StrokePoint[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = total ? (k / (n - 1)) * total : 0;
    while (j < points.length - 1 && acc[j] < s) j++;
    const seg = acc[j] - acc[j - 1] || 1;
    const u = Math.max(0, Math.min(1, (s - acc[j - 1]) / seg));
    const p = points[j - 1];
    const q = points[j];
    out.push({ x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), p: lerp(p.p, q.p, u) });
  }
  return out;
}

function strokeAsFill(s: StrokeShape): FillShape {
  const o = strokeOutline(s);
  return { id: s.id, type: 'fill', paths: [{ points: o.map(([x, y]) => ({ x, y })), closed: true }], color: s.color, opacity: s.opacity, ...(s.group ? { group: s.group } : {}) };
}

function styleOf(s: FillShape | PathShape): Style {
  if (s.type === 'fill') return { fill: s.color, stroke: null, opacity: s.opacity, type: 'fill', group: s.group, fillGradient: s.gradient };
  return { fill: s.fill, stroke: s.stroke, opacity: s.opacity, type: 'path', group: s.group, fillGradient: s.fillGradient, strokeGradient: s.strokeGradient };
}

// ---------------------------------------------------------------- plans

/** A shape with nothing left: shrunk to its middle and fully see-through (for spare shapes). */
function vanished(s: Shape): Shape {
  if (s.type === 'instance') return { ...s, opacity: 0, transform: { ...s.transform, scaleX: 0.001, scaleY: 0.001 } };
  if (s.type === 'text' || s.type === 'particles') return { ...s, opacity: 0 };
  if (s.type === 'stroke') {
    const c = s.points.reduce((m, p) => ({ x: m.x + p.x / s.points.length, y: m.y + p.y / s.points.length }), { x: 0, y: 0 });
    return { ...s, opacity: 0, points: s.points.map((p) => ({ x: c.x, y: c.y, p: p.p })) };
  }
  const c = boundsCentre(ringsOf(s.paths));
  return { ...s, opacity: 0, paths: s.paths.map((sp) => ({ closed: sp.closed, points: sp.points.map(() => ({ x: c.x, y: c.y })) })) };
}

function planPair(a: Shape, b: Shape, hints: ShapeHint[]): Plan {
  if (a.type === 'instance' || b.type === 'instance') {
    // A symbol copy only blends with another symbol copy. Anything else swaps halfway (handled as two spares).
    return { kind: 'instance', a: a.type === 'instance' ? a : (b as InstanceShape), b: a.type === 'instance' && b.type === 'instance' ? b : undefined };
  }
  if (a.type === 'stroke' && b.type === 'stroke') {
    const n = Math.max(2, a.points.length, b.points.length);
    return { kind: 'stroke', id: a.id, from: a, to: b, pa: resampleStroke(a.points, n), pb: resampleStroke(b.points, n) };
  }
  // Only outline shapes get here (text, emitters and symbol copies are planned on their own).
  const fa = a.type === 'stroke' ? strokeAsFill(a) : (a as FillShape | PathShape);
  const fb = b.type === 'stroke' ? strokeAsFill(b) : (b as FillShape | PathShape);
  return { kind: 'area', id: a.id, rings: matchOutlines(fa.paths, fb.paths, hints), a: styleOf(fa), b: styleOf(fb) };
}

/** Plans for a drawing pair, made once. Hints go to the pair whose start shape is nearest. */
function planDrawings(from: VectorDrawing, to: VectorDrawing, hints: ShapeHint[]): Plan[] {
  const A = from.shapes;
  const B = to.shapes;
  const plans: Plan[] = [];
  // Symbol copies pair with symbol copies, other shapes with other shapes, each in order.
  const ai = A.filter((s) => s.type === 'instance') as InstanceShape[];
  const bi = B.filter((s) => s.type === 'instance') as InstanceShape[];
  const ao = A.filter(morphable) as (StrokeShape | FillShape | PathShape)[];
  const bo = B.filter(morphable) as (StrokeShape | FillShape | PathShape)[];
  const bt = B.filter((s) => s.type === 'text') as TextShape[];
  const bp = B.filter((s) => s.type === 'particles') as ParticlesShape[];
  let ti = 0;
  let pj = 0;
  const hintOwner = new Map<string, number>();
  for (const h of hints) {
    let best = -1;
    let bd = Infinity;
    ao.forEach((s, k) => {
      const paths = s.type === 'stroke' ? strokeAsFill(s).paths : s.paths;
      for (const r of ringsOf(paths)) {
        const dd = nearestOn(r.segs, h.from).dist;
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      }
    });
    if (best >= 0) hintOwner.set(h.id, best);
  }
  const n = Math.max(ao.length, bo.length);
  for (let k = 0; k < n; k++) {
    const a = ao[k] ?? vanished(bo[k]);
    const b = bo[k] ?? vanished(ao[k]);
    plans.push(planPair(a, b, hints.filter((h) => hintOwner.get(h.id) === k)));
  }
  // Instances keep their place in the stacking order: put them back where they were in the start drawing.
  const instPlans: Plan[] = ai.map((s, i) => ({ kind: 'instance' as const, a: s, b: bi[i] }));
  const ordered: Plan[] = [];
  let pi = 0;
  let ii = 0;
  for (const s of A) {
    if (s.type === 'instance') ordered.push(instPlans[ii++]);
    else if (s.type === 'text') ordered.push({ kind: 'text', a: s, b: bt[ti++] });
    else if (s.type === 'particles') ordered.push({ kind: 'particles', a: s, b: bp[pj++] });
    else ordered.push(plans[pi++]);
  }
  while (pi < plans.length) ordered.push(plans[pi++]);
  for (let i = ai.length; i < bi.length; i++) ordered.push({ kind: 'instance', a: vanished(bi[i]) as InstanceShape, b: bi[i] });
  // Text and emitters only on the end key fade in.
  for (; ti < bt.length; ti++) ordered.push({ kind: 'text', a: undefined, b: bt[ti] });
  for (; pj < bp.length; pj++) ordered.push({ kind: 'particles', a: undefined, b: bp[pj] });
  return ordered;
}

const planCache = new WeakMap<VectorDrawing, WeakMap<VectorDrawing, Map<string, Plan[]>>>();

function plansFor(from: VectorDrawing, to: VectorDrawing, hints: ShapeHint[]): Plan[] {
  let m = planCache.get(from);
  if (!m) planCache.set(from, (m = new WeakMap()));
  let byHints = m.get(to);
  if (!byHints) m.set(to, (byHints = new Map()));
  const key = hints.map((h) => `${h.id}:${h.from.x},${h.from.y}>${h.to.x},${h.to.y}`).join('|');
  let p = byHints.get(key);
  if (!p) {
    p = planDrawings(from, to, hints);
    byHints.set(key, p);
    if (byHints.size > 8) byHints.delete(byHints.keys().next().value!);
  }
  return p;
}

/** How a symbol copy blends; supplied by the caller (classic tween maths lives with symbols). */
export type InstanceBlend = (a: InstanceShape, b: InstanceShape | undefined, t: number) => InstanceShape;

/** How a position and turn blend (the same maths as symbol copies, with extra spins and motion paths). */
export type TransformBlend = (a: Transform2D, b: Transform2D, t: number) => Transform2D;

const plainBlend: TransformBlend = (a, b, t) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  scaleX: lerp(a.scaleX, b.scaleX, t),
  scaleY: lerp(a.scaleY, b.scaleY, t),
  rotation: lerp(a.rotation, b.rotation, t),
  skew: lerp(a.skew, b.skew, t),
});

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The words and look of a text shape that can't be blended: when these differ the two crossfade instead. */
const sameWords = (a: TextShape, b: TextShape) => a.text === b.text && a.font === b.font;

function blendText(a: TextShape, b: TextShape, t: number, tf: TransformBlend): TextShape {
  const late = t >= 0.5;
  const out: TextShape = {
    ...a,
    size: Math.max(1, lerp(a.size, b.size, t)),
    weight: Math.round(lerp(a.weight, b.weight, t) / 100) * 100,
    italic: late ? b.italic : a.italic,
    align: late ? b.align : a.align,
    lineHeight: lerp(a.lineHeight ?? 1.2, b.lineHeight ?? 1.2, t),
    letterSpacing: lerp(a.letterSpacing ?? 0, b.letterSpacing ?? 0, t),
    color: mixColors(a.color, b.color, t) ?? (late ? b.color : a.color),
    opacity: clamp01(lerp(a.opacity, b.opacity, t)),
    transform: tf(a.transform, b.transform, t),
  };
  if (late) {
    if (b.animators) out.animators = b.animators;
    else delete out.animators;
  }
  if (!a.lineHeight && !b.lineHeight) delete out.lineHeight;
  if (!a.letterSpacing && !b.letterSpacing) delete out.letterSpacing;
  return out;
}

/** Emitter settings that blend smoothly. The rest (how many, how long they live, the seed, the sprite) stay as the start key's. */
const EMITTER_NUMBERS = ['width', 'height', 'speed', 'direction', 'spread', 'gravity', 'wind', 'drag', 'sizeStart', 'sizeEnd', 'opacityStart', 'opacityEnd', 'spin'] as const;
const EMITTER_HELD = ['emitter', 'rate', 'burst', 'emitFor', 'prewarm', 'life', 'variance', 'sprite', 'symbolId', 'seed', 'max', 'colorBy'] as const;

function blendParticles(a: ParticlesShape, b: ParticlesShape, t: number, tf: TransformBlend): ParticlesShape {
  const out: ParticlesShape = { ...a, opacity: clamp01(lerp(a.opacity, b.opacity, t)), transform: tf(a.transform, b.transform, t) };
  for (const k of EMITTER_NUMBERS) out[k] = lerp(a[k], b[k], t);
  if (a.wobble !== undefined || b.wobble !== undefined) out.wobble = lerp(a.wobble ?? 0, b.wobble ?? 0, t);
  out.colorStart = mixColors(a.colorStart, b.colorStart, t) ?? a.colorStart;
  out.colorEnd = mixColors(a.colorEnd, b.colorEnd, t) ?? a.colorEnd;
  return out;
}

/** Plain-words notes on what a morph between two drawings can't do with text and particles (empty when nothing is lost). */
export function morphNotes(from: VectorDrawing, to: VectorDrawing): string[] {
  const notes: string[] = [];
  const ta = from.shapes.filter((s) => s.type === 'text') as TextShape[];
  const tb = to.shapes.filter((s) => s.type === 'text') as TextShape[];
  const pa = from.shapes.filter((s) => s.type === 'particles') as ParticlesShape[];
  const pb = to.shapes.filter((s) => s.type === 'particles') as ParticlesShape[];
  const n = Math.min(ta.length, tb.length);
  if (ta.length !== tb.length) notes.push('Text with no partner on the other key fades out or in.');
  if (ta.slice(0, n).some((s, i) => !sameWords(s, tb[i]))) notes.push('Text with different words or a different font crossfades instead of morphing its letters.');
  if (ta.slice(0, n).some((s, i) => JSON.stringify(s.animators ?? []) !== JSON.stringify(tb[i].animators ?? []))) notes.push('Text animators switch to the last key\'s halfway through.');
  const m = Math.min(pa.length, pb.length);
  if (pa.length !== pb.length) notes.push('A particle emitter with no partner on the other key fades out or in.');
  if (pa.slice(0, m).some((s, i) => EMITTER_HELD.some((k) => s[k] !== pb[i][k]))) notes.push('Particles keep the first key\'s count, lifetime, seed and sprite. Position, direction, speed, size and colour still blend.');
  return notes;
}

/**
 * The drawing `t` of the way from `from` to `to` (t is already eased; overshoot easings can take it past 0..1).
 * Instances are blended by `blend`, text and particle positions by `tf`.
 */
export function morphShapes(from: VectorDrawing, to: VectorDrawing, t: number, hints: ShapeHint[] = [], blend: InstanceBlend, tf: TransformBlend = plainBlend): Shape[] {
  const out: Shape[] = [];
  for (const p of plansFor(from, to, hints)) {
    if (p.kind === 'text' || p.kind === 'particles') {
      const a = p.a as TextShape | ParticlesShape | undefined;
      const b = p.b as TextShape | ParticlesShape | undefined;
      if (a && !b) out.push({ ...a, opacity: clamp01(lerp(a.opacity, 0, t)) });
      else if (!a && b) out.push({ ...b, opacity: clamp01(lerp(0, b.opacity, t)) });
      else if (a && b && p.kind === 'text') {
        const ca = a as TextShape;
        const cb = b as TextShape;
        if (sameWords(ca, cb)) out.push(blendText(ca, cb, t, tf));
        else {
          // Different words: both ride the blended move, one fading out as the other fades in.
          const at = blendText(ca, ca, t, tf);
          const bt = blendText(cb, cb, t, tf);
          at.transform = bt.transform = tf(ca.transform, cb.transform, t);
          at.opacity = clamp01(lerp(ca.opacity, 0, t));
          bt.opacity = clamp01(lerp(0, cb.opacity, t));
          out.push(at, { ...bt, id: `${cb.id}~in` });
        }
      } else if (a && b) out.push(blendParticles(a as ParticlesShape, b as ParticlesShape, t, tf));
      continue;
    }
    if (p.kind === 'instance') {
      out.push(blend(p.a, p.b, t));
      continue;
    }
    if (p.kind === 'stroke') {
      const a = p.from;
      const b = p.to;
      const br = { ...a.brush };
      for (const k of ['size', 'thinning', 'smoothing', 'streamline', 'taperStart', 'taperEnd'] as const) br[k] = lerp(a.brush[k], b.brush[k], t);
      if (t >= 0.5) {
        br.capStart = b.brush.capStart;
        br.capEnd = b.brush.capEnd;
      }
      br.size = Math.max(0.1, br.size);
      out.push({
        id: p.id,
        type: 'stroke',
        ...(a.group ? { group: a.group } : {}),
        points: p.pa.map((q, i) => ({ x: lerp(q.x, p.pb[i].x, t), y: lerp(q.y, p.pb[i].y, t), p: Math.max(0, Math.min(1, lerp(q.p, p.pb[i].p, t))) })),
        brush: br,
        color: mixColors(a.color, b.color, t) ?? a.color,
        opacity: Math.max(0, Math.min(1, lerp(a.opacity, b.opacity, t))),
      });
      continue;
    }
    const paths = p.rings.map((r) => blendRing(r, t));
    const opacity = Math.max(0, Math.min(1, lerp(p.a.opacity, p.b.opacity, t)));
    const group = p.a.group ? { group: p.a.group } : {};
    if (p.a.type === 'fill' && p.b.type === 'fill') {
      const gradient = blendGradient(p.a.fillGradient, p.b.fillGradient, t);
      out.push({ id: p.id, type: 'fill', ...group, paths, color: mixColors(p.a.fill, p.b.fill, t) ?? p.a.fill ?? '#000000', opacity, ...(gradient ? { gradient } : {}) });
      continue;
    }
    const sa = p.a.stroke;
    const sb = p.b.stroke;
    let stroke: PathShape['stroke'] = null;
    if (sa || sb) {
      const base = (t < 0.5 ? (sa ?? sb) : (sb ?? sa))!;
      const color = mixColors(sa?.color ?? null, sb?.color ?? null, t);
      const width = lerp(sa?.width ?? 0, sb?.width ?? 0, t);
      if (color && width > 0.01) stroke = { ...base, color, width };
    }
    const fillGradient = blendGradient(p.a.fillGradient, p.b.fillGradient, t);
    const strokeGradient = blendGradient(p.a.strokeGradient, p.b.strokeGradient, t);
    out.push({ id: p.id, type: 'path', ...group, paths, fill: mixColors(p.a.fill, p.b.fill, t), stroke, opacity, ...(fillGradient ? { fillGradient } : {}), ...(strokeGradient ? { strokeGradient } : {}) });
  }
  return out;
}

/** Where hints sit on screen for each key: snapped to the outlines, for drawing the markers. */
export function snapHint(d: VectorDrawing, p: P): P {
  let best: P = p;
  let bd = Infinity;
  for (const s of d.shapes) {
    if (s.type === 'instance' || s.type === 'text' || s.type === 'particles') continue;
    const paths = s.type === 'stroke' ? strokeAsFill(s).paths : s.paths;
    for (const r of ringsOf(paths)) {
      const n = nearestOn(r.segs, p);
      if (n.dist < bd) {
        bd = n.dist;
        best = pointAt(r.segs[n.i], n.t);
      }
    }
  }
  return best;
}

/** The letter a hint shows: a, b, c... */
export function hintLetter(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}
