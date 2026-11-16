/**
 * Trim: showing only part of a line, so a line can draw itself. Pure geometry, no DOM.
 *
 * A `Trim` is a window along the line's length in percents (start, end, offset). `trimSubPaths` cuts a shape's outlines
 * down to the window exactly (curves are split where they are, not flattened), and `trimStrokePoints` does the same for
 * the points of a brush line. Both give back the very same object when the window shows everything.
 *
 * A closed outline (a circle, a rectangle) wraps round: a window that runs past the end carries on from the start, so
 * Offset spins a progress ring. An open line slides and stops at its ends.
 */
import type { PathPoint, StrokePoint, SubPath, Trim } from '../core/format';
import { evalCubic, type Cubic, type V } from './bezier';

export const FULL_TRIM: Readonly<Trim> = { start: 0, end: 100, offset: 0 };

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const EPS = 1e-9;

/** The window's ends as fractions, smaller first. */
function span(t: Trim): { lo: number; hi: number; off: number } {
  const s = clamp(t.start, 0, 100) / 100;
  const e = clamp(t.end, 0, 100) / 100;
  return { lo: Math.min(s, e), hi: Math.max(s, e), off: t.offset / 100 };
}

/** Does this trim hide anything or move the window? (False for missing, and for 0, 100, 0.) */
export function trimActive(t: Trim | undefined | null): t is Trim {
  if (!t || !fin(t.start) || !fin(t.end)) return false;
  const { lo, hi } = span(t);
  return hi - lo < 1 - EPS || (fin(t.offset) && Math.abs(t.offset) > EPS);
}

/** A trim with sane numbers, or undefined when it is the plain whole line (so a saved file stays small). */
export function cleanTrim(raw: unknown): Trim | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: Trim = {
    start: fin(r.start) ? clamp(r.start, 0, 100) : 0,
    end: fin(r.end) ? clamp(r.end, 0, 100) : 100,
    offset: fin(r.offset) ? clamp(r.offset, -1000, 1000) : 0,
  };
  if (r.order === 'inOrder') out.order = 'inOrder';
  return trimActive(out) ? out : undefined;
}

/** A trim by its three numbers (and how several lines are taken), left out when it is the whole line. */
export function makeTrim(start: number, end: number, offset = 0, order?: Trim['order']): Trim | undefined {
  return cleanTrim({ start, end, offset, order });
}

export const sameTrim = (a: Trim | undefined, b: Trim | undefined): boolean => {
  const x = a ?? FULL_TRIM;
  const y = b ?? FULL_TRIM;
  return Math.abs(x.start - y.start) < 1e-6 && Math.abs(x.end - y.end) < 1e-6 && Math.abs(x.offset - y.offset) < 1e-6 && (x.order ?? 'together') === (y.order ?? 'together');
};

/** The trim a fraction of the way from one to another (a missing one counts as the whole line). */
export function lerpTrim(a: Trim | undefined, b: Trim | undefined, t: number): Trim | undefined {
  if (!a && !b) return undefined;
  const x = a ?? FULL_TRIM;
  const y = b ?? FULL_TRIM;
  const m = (p: number, q: number) => p + (q - p) * t;
  return makeTrim(m(x.start, y.start), m(x.end, y.end), m(x.offset, y.offset), (a ?? b)!.order);
}

/**
 * The stretches of the line that show, as [from, to] fractions of its length. A closed line can give two, one ending at
 * the end and one starting at the start, when the window runs past the end (they join up round the loop).
 */
export function trimWindows(t: Trim, closed: boolean): [number, number][] {
  const { lo, hi, off } = span(t);
  if (hi - lo >= 1 - EPS) return closed ? [[0, 1]] : slide(0, 1, off);
  if (hi - lo <= EPS) return [];
  if (!closed) return slide(lo, hi, off);
  let a = lo + off;
  let b = hi + off;
  const k = Math.floor(a + EPS);
  a -= k;
  b -= k;
  if (b <= 1 + EPS) return [[a, Math.min(1, b)]];
  return [
    [a, 1],
    [0, b - 1],
  ];
}

function slide(lo: number, hi: number, off: number): [number, number][] {
  const a = clamp(lo + off, 0, 1);
  const b = clamp(hi + off, 0, 1);
  return b - a > EPS ? [[a, b]] : [];
}

// ---------------------------------------------------------------- outlines

interface Seg {
  a: V;
  b: V;
  c1?: V;
  c2?: V;
  len: number;
  /** Length so far at each of TABLE equal steps of t (curves only). */
  tab?: number[];
}

const TABLE = 24;
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const lerpV = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function mkSeg(a: V, b: V, c1?: V, c2?: V): Seg {
  if (!c1 || !c2) return { a, b, len: dist(a, b) };
  const tab = [0];
  let prev: V = a;
  for (let i = 1; i <= TABLE; i++) {
    const p = evalCubic([a, c1, c2, b], i / TABLE);
    tab.push(tab[i - 1] + dist(prev, p));
    prev = p;
  }
  return { a, b, c1, c2, len: tab[TABLE], tab };
}

/** The segments of a subpath, with the one that closes it. */
function segsOf(sp: SubPath): Seg[] {
  const p = sp.points;
  const out: Seg[] = [];
  const add = (a: PathPoint, b: PathPoint) => out.push(mkSeg(a, b, b.c1 && b.c2 ? b.c1 : undefined, b.c1 && b.c2 ? b.c2 : undefined));
  for (let i = 1; i < p.length; i++) add(p[i - 1], p[i]);
  if (sp.closed && p.length > 1) add(p[p.length - 1], p[0]);
  return out;
}

/** The curve parameter at `d` along a segment. */
function tAt(s: Seg, d: number): number {
  if (!s.tab) return s.len < EPS ? 0 : clamp(d / s.len, 0, 1);
  if (d <= 0) return 0;
  if (d >= s.len) return 1;
  let i = 1;
  while (i < TABLE && s.tab[i] < d) i++;
  const w = s.tab[i] - s.tab[i - 1];
  return (i - 1 + (w < EPS ? 0 : (d - s.tab[i - 1]) / w)) / TABLE;
}

/** The part of a curve from parameter t0 to t1 (de Casteljau, twice). */
function cutCubic(c: Cubic, t0: number, t1: number): Cubic {
  const split = (q: Cubic, t: number): [Cubic, Cubic] => {
    const ab = lerpV(q[0], q[1], t);
    const bc = lerpV(q[1], q[2], t);
    const cd = lerpV(q[2], q[3], t);
    const abc = lerpV(ab, bc, t);
    const bcd = lerpV(bc, cd, t);
    const m = lerpV(abc, bcd, t);
    return [
      [q[0], ab, abc, m],
      [m, bcd, cd, q[3]],
    ];
  };
  const right = t0 > 0 ? split(c, t0)[1] : c;
  return t1 >= 1 ? right : split(right, t0 >= 1 ? 1 : (t1 - t0) / (1 - t0))[0];
}

/** The segments of `segs` between two distances along them, cut exactly. */
function range(segs: Seg[], from: number, to: number): Seg[] {
  const out: Seg[] = [];
  let at = 0;
  for (const s of segs) {
    const s0 = at;
    const s1 = at + s.len;
    at = s1;
    if (s1 <= from + EPS) continue;
    if (s0 >= to - EPS) break;
    const d0 = Math.max(0, from - s0);
    const d1 = Math.min(s.len, to - s0);
    if (d1 - d0 < EPS) continue;
    if (d0 <= EPS && d1 >= s.len - EPS) {
      out.push(s);
      continue;
    }
    if (!s.tab) {
      out.push(mkSeg(lerpV(s.a, s.b, d0 / s.len), lerpV(s.a, s.b, d1 / s.len)));
      continue;
    }
    const c = cutCubic([s.a, s.c1!, s.c2!, s.b], tAt(s, d0), tAt(s, d1));
    out.push(mkSeg(c[0], c[3], c[1], c[2]));
  }
  return out;
}

function toSubPath(segs: Seg[]): SubPath | null {
  if (!segs.length) return null;
  const pts: PathPoint[] = [{ x: segs[0].a.x, y: segs[0].a.y }];
  for (const s of segs) pts.push({ x: s.b.x, y: s.b.y, ...(s.c1 && s.c2 ? { c1: { x: s.c1.x, y: s.c1.y }, c2: { x: s.c2.x, y: s.c2.y } } : {}) });
  return { closed: false, points: pts };
}

const total = (segs: Seg[]) => segs.reduce((n, s) => n + s.len, 0);

/**
 * The outlines cut down to the trim's window, as open lines. Several outlines are each cut the same way (`together`), or
 * taken as one long line, one after the other (`inOrder`). Gives back `paths` itself when nothing is hidden.
 */
export function trimSubPaths(paths: readonly SubPath[], trim: Trim | undefined): readonly SubPath[] {
  if (!trimActive(trim)) return paths;
  const items = paths.map((sp) => ({ sp, closed: sp.closed && sp.points.length > 2, segs: segsOf(sp) }));
  const out: SubPath[] = [];
  const push = (segs: Seg[]) => {
    const sp = total(segs) > EPS ? toSubPath(segs) : null;
    if (sp) out.push(sp);
  };

  if (trim.order === 'inOrder' && items.length > 1) {
    const all = items.reduce((n, it) => n + total(it.segs), 0);
    if (all < EPS) return [];
    let base = 0;
    const wins = trimWindows(trim, false);
    for (const it of items) {
      const len = total(it.segs);
      for (const [a, b] of wins) {
        const from = Math.max(a * all, base) - base;
        const to = Math.min(b * all, base + len) - base;
        if (to - from > EPS) push(range(it.segs, from, to));
      }
      base += len;
    }
    return out;
  }

  for (const it of items) {
    const len = total(it.segs);
    if (len < EPS) continue;
    const wins = trimWindows(trim, it.closed);
    if (wins.length === 1 && wins[0][0] <= EPS && wins[0][1] >= 1 - EPS) {
      out.push(it.sp);
      continue;
    }
    if (wins.length === 2) {
      // Past the end of a loop: the stretch to the end and the stretch from the start are one piece.
      push([...range(it.segs, wins[0][0] * len, len), ...range(it.segs, 0, wins[1][1] * len)]);
      continue;
    }
    for (const [a, b] of wins) push(range(it.segs, a * len, b * len));
  }
  return out;
}

// ---------------------------------------------------------------- brush lines

export interface TrimmedPoints {
  points: StrokePoint[];
  /** The window starts partway along (so the start is a cut, not the line's own start). */
  cutStart: boolean;
  /** The window ends partway along. */
  cutEnd: boolean;
}

/** The points of a brush line cut down to the window (ends worked out between points, pressure too), or null when none show. */
export function trimStrokePoints(points: readonly StrokePoint[], trim: Trim | undefined): TrimmedPoints | null {
  if (!trimActive(trim)) return { points: points as StrokePoint[], cutStart: false, cutEnd: false };
  if (!points.length) return null;
  const win = trimWindows(trim, false)[0];
  if (!win) return null;
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + dist(points[i], points[i - 1]));
  const all = at[at.length - 1];
  // A dot has no length to cut: it shows whenever any of the line does.
  if (all < EPS) return { points: points as StrokePoint[], cutStart: false, cutEnd: false };
  const from = win[0] * all;
  const to = win[1] * all;
  const pick = (d: number): StrokePoint => {
    let i = 1;
    while (i < points.length - 1 && at[i] < d) i++;
    const a = points[i - 1];
    const b = points[i];
    const f = at[i] - at[i - 1] < EPS ? 0 : clamp((d - at[i - 1]) / (at[i] - at[i - 1]), 0, 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, p: a.p + (b.p - a.p) * f };
  };
  const out: StrokePoint[] = [pick(from)];
  for (let i = 0; i < points.length; i++) if (at[i] > from + EPS && at[i] < to - EPS) out.push(points[i]);
  out.push(pick(to));
  return { points: out, cutStart: win[0] > EPS, cutEnd: win[1] < 1 - EPS };
}

/** The line's own length, for working out how long a draw-on takes to be seen. */
export function pointsLength(points: readonly StrokePoint[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += dist(points[i], points[i - 1]);
  return n;
}

/** The length of a shape's outlines, curves measured. */
export function outlineLength(paths: readonly SubPath[]): number {
  return paths.reduce((n, sp) => n + total(segsOf(sp)), 0);
}

/** A short plain description of a trim for tooltips: "draws 0% to 60%". */
export function trimWords(t: Trim | undefined): string {
  if (!trimActive(t)) return 'the whole line';
  const { lo, hi } = span(t);
  const r = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const slide = Math.abs(t.offset) > EPS ? `, slid ${Math.round(t.offset * 10) / 10}%` : '';
  return hi - lo <= EPS ? 'nothing yet' : `${r(lo)} to ${r(hi)}${slide}`;
}
