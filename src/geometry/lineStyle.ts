/**
 * What a shape's outline can do beyond one plain width: dashes and dots, arrow heads on open lines, and a width that
 * changes along the line. Pure geometry, no DOM.
 *
 * `expandStroke` turns a path shape into the plain shapes every writer already knows how to draw: the line itself
 * (with its dashes left on it, for the formats that have dashes), arrow heads as small shapes of their own, and for a
 * varying width the line's whole outline as a filled shape. So the canvas, SVG, PDF and Lottie each need only a little
 * of their own code, and a file without any of this comes back as the very same shape, untouched.
 */
import type { ArrowHead, PathPoint, PathShape, PathStroke, SubPath, WidthStop } from '../core/format';
import type { Pair, Polygon } from 'polygon-clipping';
import { evalCubic, type Cubic, type V } from './bezier';
import { geomToSubPaths } from './boolean';
import { union, type Geom } from './merge';

// ---------------------------------------------------------------- the choices people make

export type DashKind = 'solid' | 'dashed' | 'dotted' | 'dashdot';
export type WidthKind = 'even' | 'swell' | 'pinch' | 'taper' | 'taperStart' | 'brush';

/** A dot is a dash this long (in line widths) with round ends. */
export const DOT = 0.01;

export const DASH_PRESETS: Record<DashKind, { label: string; dash: number[] | undefined; cap?: PathStroke['cap'] }> = {
  solid: { label: 'Solid', dash: undefined },
  dashed: { label: 'Dashed', dash: [3, 2], cap: 'butt' },
  dotted: { label: 'Dotted', dash: [DOT, 2], cap: 'round' },
  dashdot: { label: 'Dash and dot', dash: [4, 2, DOT, 2], cap: 'round' },
};

export const WIDTH_PRESETS: Record<WidthKind, { label: string; widths: WidthStop[] | undefined }> = {
  even: { label: 'Even', widths: undefined },
  swell: {
    label: 'Fat in the middle',
    widths: [
      { at: 0, w: 0.2 },
      { at: 0.5, w: 1.6 },
      { at: 1, w: 0.2 },
    ],
  },
  pinch: {
    label: 'Thin in the middle',
    widths: [
      { at: 0, w: 1.4 },
      { at: 0.5, w: 0.3 },
      { at: 1, w: 1.4 },
    ],
  },
  taper: {
    label: 'Tapers to a point',
    widths: [
      { at: 0, w: 1 },
      { at: 1, w: 0.05 },
    ],
  },
  taperStart: {
    label: 'Starts at a point',
    widths: [
      { at: 0, w: 0.05 },
      { at: 1, w: 1 },
    ],
  },
  brush: {
    label: 'Pointed at both ends',
    widths: [
      { at: 0, w: 0.05 },
      { at: 0.3, w: 1 },
      { at: 0.7, w: 1 },
      { at: 1, w: 0.05 },
    ],
  },
};

export const ARROW_HEADS: Record<ArrowHead, string> = { triangle: 'Triangle', open: 'Open', dot: 'Dot', bar: 'Bar' };

/** Which preset a dash pattern is, or null for one of its own. */
export function dashKindOf(dash: readonly number[] | undefined): DashKind | null {
  if (!dash || !dash.length) return 'solid';
  for (const k of Object.keys(DASH_PRESETS) as DashKind[]) {
    const d = DASH_PRESETS[k].dash;
    if (d && d.length === dash.length && d.every((v, i) => Math.abs(v - dash[i]) < 1e-6)) return k;
  }
  return null;
}

export function widthKindOf(widths: readonly WidthStop[] | undefined): WidthKind | null {
  if (!widths || !widths.length) return 'even';
  for (const k of Object.keys(WIDTH_PRESETS) as WidthKind[]) {
    const w = WIDTH_PRESETS[k].widths;
    if (w && w.length === widths.length && w.every((v, i) => Math.abs(v.at - widths[i].at) < 1e-6 && Math.abs(v.w - widths[i].w) < 1e-6)) return k;
  }
  return null;
}

/** What the line options (and the tool's remembered ones) say. Anything unknown counts as "plain". */
export interface LineStyleChoice {
  lineDash?: string;
  lineWidth?: string;
  arrowStart?: string;
  arrowEnd?: string;
}

const isHead = (v: unknown): v is ArrowHead => typeof v === 'string' && v in ARROW_HEADS;

/** A change to an outline's style: a key set to `undefined` takes that part away. */
export type StylePatch = Partial<Pick<PathStroke, 'dash' | 'dashOffset' | 'arrowStart' | 'arrowEnd' | 'arrowSize' | 'widths' | 'cap'>>;

/** The change a quick dash choice makes (Dotted also rounds the ends, or the dots would vanish). */
export function dashPatch(kind: DashKind): StylePatch {
  const p = DASH_PRESETS[kind];
  return { dash: p.dash ? [...p.dash] : undefined, dashOffset: undefined, ...(p.cap ? { cap: p.cap } : {}) };
}

export function widthPatch(kind: WidthKind): StylePatch {
  const w = WIDTH_PRESETS[kind].widths;
  return { widths: w ? w.map((s) => ({ ...s })) : undefined };
}

/** A new shape's outline, wearing the dash, arrow and width choices the tool has remembered. */
export function strokeWithStyle<T extends PathStroke>(base: T, c: LineStyleChoice): T {
  let out: T = { ...base };
  const dash = c.lineDash as DashKind | undefined;
  if (dash && dash !== 'solid' && DASH_PRESETS[dash]) out = applyPatch(out, dashPatch(dash));
  const wid = c.lineWidth as WidthKind | undefined;
  if (wid && wid !== 'even' && WIDTH_PRESETS[wid]) out = applyPatch(out, widthPatch(wid));
  if (isHead(c.arrowStart)) out.arrowStart = c.arrowStart;
  if (isHead(c.arrowEnd)) out.arrowEnd = c.arrowEnd;
  return out;
}

/** The outline with a patch put on it. Keys set to undefined are removed, so the saved shape stays small. */
export function applyPatch<T extends PathStroke>(st: T, patch: StylePatch): T {
  const out: T = { ...st };
  for (const k of Object.keys(patch) as (keyof StylePatch)[]) {
    const v = patch[k];
    if (v === undefined) delete out[k];
    else (out as Record<string, unknown>)[k] = v;
  }
  if (!out.arrowStart && !out.arrowEnd) delete out.arrowSize;
  if (!out.dash) delete out.dashOffset;
  return out;
}

// ---------------------------------------------------------------- reading the fields safely

/** A dash pattern as dashes and gaps in document pixels: an even number of lengths, at least one more than nothing. Null means a solid line. */
export function dashPx(st: Pick<PathStroke, 'dash' | 'width'> | null | undefined): number[] | null {
  if (!st || !st.dash || !st.dash.length || !(st.width > 0)) return null;
  let d = st.dash.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0).map((v) => v * st.width);
  if (!d.length) return null;
  if (d.length % 2) d = [...d, ...d];
  if (d.reduce((a, b) => a + b, 0) < 0.05) return null;
  return d;
}

/** The pattern's start in document pixels. */
export const dashOffsetPx = (st: Pick<PathStroke, 'dashOffset' | 'width'>): number => (typeof st.dashOffset === 'number' && Number.isFinite(st.dashOffset) ? st.dashOffset * st.width : 0);

/** Width stops that can be used: sorted, in range, at least one. Null means an even line. */
export function cleanWidths(w: readonly WidthStop[] | undefined): WidthStop[] | null {
  if (!w || !w.length) return null;
  const ok = w.filter((s) => s && Number.isFinite(s.at) && Number.isFinite(s.w)).map((s) => ({ at: Math.min(1, Math.max(0, s.at)), w: Math.min(8, Math.max(0, s.w)) }));
  if (!ok.length) return null;
  ok.sort((a, b) => a.at - b.at);
  return ok.length > 64 ? ok.slice(0, 64) : ok;
}

const ARROWS = new Set<string>(['triangle', 'open', 'dot', 'bar']);

/** A stroke with only sane style fields: bad ones are dropped, so a damaged or hand-edited file can never hang drawing. */
export function cleanStrokeStyle<T extends Pick<PathStroke, 'width'> & Partial<PathStroke>>(st: T): T {
  const out: T = { ...st };
  if (!Array.isArray(st.dash) || !dashPx({ dash: st.dash, width: 1 })) delete out.dash;
  else out.dash = st.dash.filter((v) => Number.isFinite(v) && v >= 0).slice(0, 12);
  if (!(typeof st.dashOffset === 'number' && Number.isFinite(st.dashOffset)) || !out.dash) delete out.dashOffset;
  if (!ARROWS.has(st.arrowStart as string)) delete out.arrowStart;
  if (!ARROWS.has(st.arrowEnd as string)) delete out.arrowEnd;
  if (!(typeof st.arrowSize === 'number' && Number.isFinite(st.arrowSize) && st.arrowSize > 0) || (!out.arrowStart && !out.arrowEnd)) delete out.arrowSize;
  else out.arrowSize = Math.min(30, st.arrowSize);
  const w = Array.isArray(st.widths) ? cleanWidths(st.widths) : null;
  if (w) out.widths = w;
  else delete out.widths;
  return out;
}

/** Does this outline use anything past a plain width? */
export function hasLineStyle(st: PathStroke | null | undefined): boolean {
  if (!st || !(st.width > 0)) return false;
  return !!(dashPx(st) || st.arrowStart || st.arrowEnd || cleanWidths(st.widths));
}

/** How far past the line's own width the outline can reach (in document pixels from the path), for working out where ink lands. */
export function styleReach(st: PathStroke): number {
  let r = 0;
  const widths = cleanWidths(st.widths);
  if (widths) r = (st.width / 2) * Math.max(1, ...widths.map((s) => s.w)) * 1.6;
  if (st.arrowStart || st.arrowEnd) r = Math.max(r, headLength(st) * 1.1);
  return r;
}

// ---------------------------------------------------------------- flattening

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: V) => Math.hypot(a.x, a.y);
const unit = (a: V): V => {
  const l = len(a);
  return l < 1e-12 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
};
const q = (v: number) => Math.round(v * 100) / 100;

/** The longest piece a straight run is cut into, so a width that changes along it follows smoothly. */
const PIECE = 2.5;

interface Run {
  pts: V[];
  /** Distance along the line at each point. */
  at: number[];
  closed: boolean;
  total: number;
}

/** A subpath as points about a pixel apart, corners kept as points of their own. */
function flatten(sp: SubPath): Run {
  const p = sp.points;
  const pts: V[] = [];
  const add = (v: V) => {
    const l = pts[pts.length - 1];
    if (!l || Math.abs(l.x - v.x) > 1e-6 || Math.abs(l.y - v.y) > 1e-6) pts.push({ x: v.x, y: v.y });
  };
  if (p.length) add(p[0]);
  const seg = (a: PathPoint, b: PathPoint) => {
    if (b.c1 && b.c2) {
      const cub: Cubic = [a, b.c1, b.c2, b];
      const rough = len(sub(b.c1, a)) + len(sub(b.c2, b.c1)) + len(sub(b, b.c2));
      const n = Math.max(4, Math.min(160, Math.ceil(rough / 1.2)));
      for (let j = 1; j <= n; j++) add(evalCubic(cub, j / n));
    } else {
      const d = len(sub(b, a));
      const n = Math.max(1, Math.ceil(d / PIECE));
      for (let j = 1; j <= n; j++) add({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
    }
  };
  for (let i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
  if (sp.closed && p.length > 1) seg(p[p.length - 1], { ...p[0], c1: p[0].c1, c2: p[0].c2 });
  let closed = sp.closed;
  if (closed && pts.length > 1 && len(sub(pts[0], pts[pts.length - 1])) < 1e-6) pts.pop();
  if (pts.length < 3) closed = false;
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + len(sub(pts[i], pts[i - 1])));
  let total = at[at.length - 1] ?? 0;
  if (closed && pts.length > 1) total += len(sub(pts[0], pts[pts.length - 1]));
  return { pts, at, closed, total };
}

// ---------------------------------------------------------------- dashes

/** The stretches of a line of length `total` that are inked, as [from, to] distances. A dash of no length is [a, a] (a dot). */
export function dashWindows(total: number, pattern: readonly number[], offset: number): [number, number][] {
  const cycle = pattern.reduce((a, b) => a + b, 0);
  if (!(cycle > 0.01) || !(total > 0)) return [[0, total]];
  // Too many to be worth it: a line that fine reads as solid.
  if ((total / cycle) * (pattern.length / 2) > 6000) return [[0, total]];
  let phase = ((offset % cycle) + cycle) % cycle;
  let i = 0;
  while (phase > pattern[i] || (phase >= pattern[i] && pattern[i] > 0)) {
    phase -= pattern[i];
    i = (i + 1) % pattern.length;
  }
  const out: [number, number][] = [];
  let pos = 0;
  let left = pattern[i] - phase;
  let on = i % 2 === 0;
  let guard = 0;
  while (pos < total - 1e-9 && guard++ < 50000) {
    const end = Math.min(total, pos + left);
    if (on) out.push([pos, end]);
    pos = end;
    i = (i + 1) % pattern.length;
    on = i % 2 === 0;
    left = pattern[i];
  }
  return out;
}

// ---------------------------------------------------------------- strips of variable width

const smooth = (f: number) => f * f * (3 - 2 * f);

/** The width multiplier at `t` (0 to 1) along the line. */
export function widthAt(stops: readonly WidthStop[] | null, t: number): number {
  if (!stops || !stops.length) return 1;
  if (t <= stops[0].at) return stops[0].w;
  const last = stops[stops.length - 1];
  if (t >= last.at) return last.w;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].at) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = b.at - a.at < 1e-9 ? 1 : (t - a.at) / (b.at - a.at);
      return a.w + (b.w - a.w) * smooth(f);
    }
  }
  return last.w;
}

function circlePoly(x: number, y: number, r: number): Polygon {
  const n = Math.max(8, Math.min(48, Math.ceil(r * 2)));
  const ring: Pair[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([q(x + Math.cos(a) * r), q(y + Math.sin(a) * r)]);
  }
  return [ring];
}

/** A turn at least this sharp (degrees) is a corner: the line is cut there and the join made by hand. */
const CORNER = 32;

interface Piece {
  pts: V[];
  w: number[];
}

interface Spec {
  width: number;
  join: PathStroke['join'];
  cap: PathStroke['cap'];
}

/** Points and the width at each, for the part of a run between two distances (ends interpolated). */
function slice(run: Run, from: number, to: number, widthOf: (d: number) => number): Piece {
  const pts: V[] = [];
  const w: number[] = [];
  const at = (d: number): V => {
    const n = run.pts.length;
    if (d <= 0) return run.pts[0];
    let i = 1;
    while (i < n && run.at[i] < d) i++;
    if (i >= n) {
      if (run.closed && d <= run.total) {
        const a = run.pts[n - 1];
        const b = run.pts[0];
        const f = (d - run.at[n - 1]) / Math.max(1e-9, run.total - run.at[n - 1]);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
      return run.pts[n - 1];
    }
    const a = run.pts[i - 1];
    const b = run.pts[i];
    const f = (d - run.at[i - 1]) / Math.max(1e-9, run.at[i] - run.at[i - 1]);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const push = (p: V, d: number) => {
    const l = pts[pts.length - 1];
    if (l && len(sub(l, p)) < 1e-6) return;
    pts.push(p);
    w.push(widthOf(d));
  };
  push(at(from), from);
  for (let i = 0; i < run.pts.length; i++) if (run.at[i] > from + 1e-6 && run.at[i] < to - 1e-6) push(run.pts[i], run.at[i]);
  push(at(to), to);
  return { pts, w };
}

/** The outline, as polygons, of a line of changing width along an open run of points. */
function pieceArea(piece: Piece, spec: Spec, out: Polygon[]): void {
  const { pts, w } = piece;
  const n = pts.length;
  if (n < 2) return;
  // Cut into runs at corners; each run is a strip, the corners get a join of their own.
  const dirs: V[] = [];
  for (let i = 0; i < n - 1; i++) dirs.push(unit(sub(pts[i + 1], pts[i])));
  const cuts: number[] = [0];
  for (let i = 1; i < n - 1; i++) {
    const c = Math.max(-1, Math.min(1, dirs[i - 1].x * dirs[i].x + dirs[i - 1].y * dirs[i].y));
    if (Math.acos(c) * (180 / Math.PI) >= CORNER) cuts.push(i);
  }
  cuts.push(n - 1);
  for (let k = 0; k < cuts.length - 1; k++) {
    let p = pts.slice(cuts[k], cuts[k + 1] + 1);
    let ww = w.slice(cuts[k], cuts[k + 1] + 1);
    if (p.length < 2) continue;
    // A square end reaches half a width past the point.
    if (spec.cap === 'square') {
      if (k === 0) {
        const d = dirs[0];
        p = [{ x: p[0].x - d.x * ww[0] * spec.width * 0.5, y: p[0].y - d.y * ww[0] * spec.width * 0.5 }, ...p];
        ww = [ww[0], ...ww];
      }
      if (k === cuts.length - 2) {
        const d = dirs[dirs.length - 1];
        const e = p[p.length - 1];
        const we = ww[ww.length - 1];
        p = [...p, { x: e.x + d.x * we * spec.width * 0.5, y: e.y + d.y * we * spec.width * 0.5 }];
        ww = [...ww, we];
      }
    }
    const m = p.length;
    const left: Pair[] = [];
    const right: Pair[] = [];
    for (let i = 0; i < m; i++) {
      const dPrev = i > 0 ? unit(sub(p[i], p[i - 1])) : unit(sub(p[1], p[0]));
      const dNext = i < m - 1 ? unit(sub(p[i + 1], p[i])) : dPrev;
      let nx = -(dPrev.y + dNext.y);
      let ny = dPrev.x + dNext.x;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      // On a gentle bend the offset is a little longer, so the line keeps its width.
      const cosHalf = Math.max(0.5, nx * -dPrev.y + ny * dPrev.x);
      const r = (ww[i] * spec.width) / 2 / cosHalf;
      left.push([q(p[i].x + nx * r), q(p[i].y + ny * r)]);
      right.push([q(p[i].x - nx * r), q(p[i].y - ny * r)]);
    }
    out.push([[...left, ...right.reverse()]]);
  }
  // Round ends, and a join at every corner.
  const r0 = (w[0] * spec.width) / 2;
  const r1 = (w[n - 1] * spec.width) / 2;
  if (spec.cap === 'round') {
    if (r0 > 0.05) out.push(circlePoly(pts[0].x, pts[0].y, r0));
    if (r1 > 0.05) out.push(circlePoly(pts[n - 1].x, pts[n - 1].y, r1));
  }
  for (let c = 1; c < cuts.length - 1; c++) {
    const i = cuts[c];
    const r = (w[i] * spec.width) / 2;
    if (r <= 0.05) continue;
    joinAt(pts[i], dirs[i - 1], dirs[i], r, spec.join, out);
  }
}

/** What fills the outside of a corner: a round cap, a bevel, or a miter point. */
function joinAt(p: V, a: V, b: V, r: number, join: PathStroke['join'], out: Polygon[]): void {
  if (join === 'round') {
    out.push(circlePoly(p.x, p.y, r));
    return;
  }
  const cross = a.x * b.y - a.y * b.x;
  const dot = a.x * b.x + a.y * b.y;
  const turn = Math.atan2(Math.abs(cross), dot);
  const s = cross > 0 ? -1 : 1;
  const ax = p.x - a.y * r * s;
  const ay = p.y + a.x * r * s;
  const bx = p.x - b.y * r * s;
  const by = p.y + b.x * r * s;
  const miter = 1 / Math.max(1e-6, Math.cos(turn / 2));
  if (join === 'miter' && miter <= 4) {
    const mx = (ax + bx) / 2 - p.x;
    const my = (ay + by) / 2 - p.y;
    const ml = Math.hypot(mx, my) || 1;
    out.push([[[q(p.x), q(p.y)], [q(ax), q(ay)], [q(p.x + (mx / ml) * r * miter), q(p.y + (my / ml) * r * miter)], [q(bx), q(by)]]]);
  } else out.push([[[q(p.x), q(p.y)], [q(ax), q(ay)], [q(bx), q(by)]]]);
}

/** A closed run of changing width, as a ring with a hole (or, with corners, strips). */
function ringArea(run: Run, spec: Spec, widthOf: (d: number) => number, out: Polygon[]): void {
  const pts = run.pts;
  const n = pts.length;
  const dirs: V[] = [];
  for (let i = 0; i < n; i++) dirs.push(unit(sub(pts[(i + 1) % n], pts[i])));
  const sharp: number[] = [];
  for (let i = 0; i < n; i++) {
    const d0 = dirs[(i - 1 + n) % n];
    const d1 = dirs[i];
    if (Math.acos(Math.max(-1, Math.min(1, d0.x * d1.x + d0.y * d1.y))) * (180 / Math.PI) >= CORNER) sharp.push(i);
  }
  if (!sharp.length) {
    const left: Pair[] = [];
    const right: Pair[] = [];
    for (let i = 0; i < n; i++) {
      const dPrev = dirs[(i - 1 + n) % n];
      const dNext = dirs[i];
      let nx = -(dPrev.y + dNext.y);
      let ny = dPrev.x + dNext.x;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const cosHalf = Math.max(0.5, nx * -dPrev.y + ny * dPrev.x);
      const r = (widthOf(run.at[i]) * spec.width) / 2 / cosHalf;
      left.push([q(pts[i].x + nx * r), q(pts[i].y + ny * r)]);
      right.push([q(pts[i].x - nx * r), q(pts[i].y - ny * r)]);
    }
    out.push([left, right]);
    return;
  }
  // Start at a corner and walk round: an open run that ends where it began, then the joins.
  const start = sharp[0];
  const rot: V[] = [];
  const rotAt: number[] = [];
  for (let j = 0; j <= n; j++) {
    const i = (start + j) % n;
    rot.push(pts[i]);
    rotAt.push(j === n ? run.total : run.at[i]);
  }
  const piece: Piece = { pts: rot, w: rotAt.map((d) => widthOf(d)) };
  const butt: Spec = { ...spec, cap: 'butt' };
  pieceArea(piece, butt, out);
  const i = start;
  const r = (widthOf(run.at[i]) * spec.width) / 2;
  if (r > 0.05) joinAt(pts[i], dirs[(i - 1 + n) % n], dirs[i], r, spec.join, out);
}

function dotArea(run: Run, d: number, spec: Spec, r: number, out: Polygon[]): void {
  const p = slice(run, Math.max(0, d - 0.5), Math.min(run.total, d + 0.5), () => 1);
  const at = p.pts[Math.floor(p.pts.length / 2)] ?? run.pts[0];
  if (spec.cap === 'round') out.push(circlePoly(at.x, at.y, r));
  else if (spec.cap === 'square') {
    const dir = p.pts.length > 1 ? unit(sub(p.pts[p.pts.length - 1], p.pts[0])) : { x: 1, y: 0 };
    const nx = -dir.y * r;
    const ny = dir.x * r;
    const tx = dir.x * r;
    const ty = dir.y * r;
    out.push([[[q(at.x - tx + nx), q(at.y - ty + ny)], [q(at.x + tx + nx), q(at.y + ty + ny)], [q(at.x + tx - nx), q(at.y + ty - ny)], [q(at.x - tx - nx), q(at.y - ty - ny)]]]);
  }
}

/**
 * The area a line covers when it changes width along its length and/or is dashed, as curves. Null when it can't be
 * worked out (the caller then draws the plain line).
 */
export function lineAreaStyled(paths: readonly SubPath[], st: PathStroke, bakeDashes: boolean): SubPath[] | null {
  const widths = cleanWidths(st.widths);
  const dash = bakeDashes || widths ? dashPx(st) : null;
  const polys: Polygon[] = [];
  const spec: Spec = { width: st.width, join: st.join, cap: st.cap };
  for (const sp of paths) {
    const run = flatten(sp);
    if (run.pts.length < 2 || !(run.total > 0)) continue;
    const widthOf = (d: number) => widthAt(widths, run.total > 0 ? Math.min(1, Math.max(0, d / run.total)) : 0);
    if (!dash) {
      if (run.closed) ringArea(run, spec, widthOf, polys);
      else pieceArea(slice(run, 0, run.total, widthOf), spec, polys);
      continue;
    }
    for (const [a, b] of dashWindows(run.total, dash, dashOffsetPx(st))) {
      if (b - a < 1e-6) {
        dotArea(run, a, spec, (widthOf(a) * st.width) / 2, polys);
        continue;
      }
      pieceArea(slice(run, a, b, widthOf), spec, polys);
    }
  }
  if (!polys.length) return null;
  const g: Geom | null = polys.length === 1 ? [polys[0]] : union([polys[0]], ...polys.slice(1).map((p) => [p] as Geom));
  if (!g || !g.length) return null;
  const fit = Math.min(0.12, Math.max(0.01, st.width * 0.04));
  return geomToSubPaths(g, { minArea: 0.01, fit, flat: Math.min(0.02, fit / 3) });
}

// ---------------------------------------------------------------- arrow heads

/** How long a head is, in document pixels. */
export function headLength(st: Pick<PathStroke, 'width' | 'arrowSize'>): number {
  const size = typeof st.arrowSize === 'number' && st.arrowSize > 0 ? st.arrowSize : 4;
  return Math.max(6, size * st.width);
}

/** How far a head's tip sits past where the line itself should stop. */
const TRIM: Record<ArrowHead, number> = { triangle: 0.7, open: 0, dot: 0, bar: 0 };

interface Seg {
  a: V;
  b: V;
  c1?: V;
  c2?: V;
}

function segsOf(sp: SubPath): Seg[] {
  const out: Seg[] = [];
  const p = sp.points;
  for (let i = 1; i < p.length; i++) out.push({ a: p[i - 1], b: p[i], ...(p[i].c1 && p[i].c2 ? { c1: p[i].c1, c2: p[i].c2 } : {}) });
  return out;
}

function fromSegs(segs: Seg[]): SubPath | null {
  if (!segs.length) return null;
  const pts: PathPoint[] = [{ x: segs[0].a.x, y: segs[0].a.y }];
  for (const s of segs) pts.push({ x: s.b.x, y: s.b.y, ...(s.c1 && s.c2 ? { c1: { x: s.c1.x, y: s.c1.y }, c2: { x: s.c2.x, y: s.c2.y } } : {}) });
  return { closed: false, points: pts };
}

const lerpV = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function segLength(s: Seg): number {
  if (!s.c1 || !s.c2) return len(sub(s.b, s.a));
  let l = 0;
  let prev = s.a;
  for (let i = 1; i <= 16; i++) {
    const p = evalCubic([s.a, s.c1, s.c2, s.b], i / 16);
    l += len(sub(p, prev));
    prev = p;
  }
  return l;
}

/** The path with `d` document pixels taken off its end (curves cut exactly where they are). Null when nothing is left. */
export function trimEnd(sp: SubPath, d: number): SubPath | null {
  const segs = segsOf(sp);
  let left = d;
  while (segs.length) {
    const s = segs[segs.length - 1];
    const l = segLength(s);
    if (l <= left + 1e-6) {
      left -= l;
      segs.pop();
      continue;
    }
    if (left <= 1e-9) break;
    // Find where along this segment `left` remains, by sampling its length.
    const keep = l - left;
    let t = keep / l;
    if (s.c1 && s.c2) {
      let acc = 0;
      let prev = s.a;
      t = 1;
      for (let i = 1; i <= 32; i++) {
        const p = evalCubic([s.a, s.c1, s.c2, s.b], i / 32);
        const dl = len(sub(p, prev));
        if (acc + dl >= keep) {
          t = (i - 1 + (keep - acc) / Math.max(1e-9, dl)) / 32;
          break;
        }
        acc += dl;
        prev = p;
      }
      // de Casteljau: the first part of the curve, up to t.
      const ab = lerpV(s.a, s.c1, t);
      const bc = lerpV(s.c1, s.c2, t);
      const cd = lerpV(s.c2, s.b, t);
      const abc = lerpV(ab, bc, t);
      const bcd = lerpV(bc, cd, t);
      const m = lerpV(abc, bcd, t);
      segs[segs.length - 1] = { a: s.a, c1: ab, c2: abc, b: m };
    } else segs[segs.length - 1] = { a: s.a, b: lerpV(s.a, s.b, t) };
    break;
  }
  return fromSegs(segs);
}

/** The path the other way round, curves and all. */
export function reversePath(sp: SubPath): SubPath {
  const p = sp.points;
  const n = p.length;
  const out: PathPoint[] = [];
  for (let k = 0; k < n; k++) {
    const src = p[n - 1 - k];
    const after = k >= 1 ? p[n - k] : undefined;
    out.push({ x: src.x, y: src.y, ...(after && after.c1 && after.c2 ? { c1: { ...after.c2 }, c2: { ...after.c1 } } : {}) });
  }
  return { closed: sp.closed, points: out };
}

/** Where the line is `dist` back from its end. */
function pointBack(sp: SubPath, dist: number): V {
  const run = flatten({ ...sp, closed: false });
  const target = Math.max(0, run.total - dist);
  for (let i = 1; i < run.pts.length; i++) {
    if (run.at[i] >= target) {
      const f = (target - run.at[i - 1]) / Math.max(1e-9, run.at[i] - run.at[i - 1]);
      return lerpV(run.pts[i - 1], run.pts[i], f);
    }
  }
  return run.pts[0];
}

interface Head {
  /** Painted with the line's colour as an area, or as a line of the line's width. */
  kind: 'fill' | 'line';
  paths: SubPath[];
  cap?: PathStroke['cap'];
}

function closedPoly(pts: V[]): SubPath {
  return { closed: true, points: pts.map((p) => ({ x: p.x, y: p.y })) };
}

const KAPPA = 0.5522847498307936;

/** The head for the end of `sp` (its last point is the tip). Null when the line has no direction. */
export function headFor(sp: SubPath, kind: ArrowHead, st: Pick<PathStroke, 'width' | 'arrowSize'>): Head | null {
  const n = sp.points.length;
  if (n < 2) return null;
  const tip = sp.points[n - 1];
  const L = headLength(st);
  const back = pointBack(sp, Math.max(0.5, Math.min(L * 0.6, 40)));
  const d = unit(sub(tip, back));
  if (len(sub(tip, back)) < 1e-6) return null;
  const nrm: V = { x: -d.y, y: d.x };
  const at = (along: number, side: number): V => ({ x: tip.x + d.x * along + nrm.x * side, y: tip.y + d.y * along + nrm.y * side });
  if (kind === 'triangle') return { kind: 'fill', paths: [closedPoly([at(0, 0), at(-L, L * 0.42), at(-L, -L * 0.42)])] };
  if (kind === 'open') return { kind: 'line', paths: [{ closed: false, points: [at(-L * 0.87, L * 0.5), at(0, 0), at(-L * 0.87, -L * 0.5)] }], cap: 'round' };
  if (kind === 'bar') return { kind: 'line', paths: [{ closed: false, points: [at(0, L * 0.5), at(0, -L * 0.5)] }], cap: 'butt' };
  const r = Math.max(L * 0.38, st.width * 0.9);
  const k = r * KAPPA;
  const c = tip;
  return {
    kind: 'fill',
    paths: [
      {
        closed: true,
        points: [
          { x: c.x + r, y: c.y, c1: { x: c.x + r, y: c.y - k }, c2: { x: c.x + k, y: c.y - r } },
          { x: c.x, y: c.y + r, c1: { x: c.x + r, y: c.y + k }, c2: { x: c.x + k, y: c.y + r } },
          { x: c.x - r, y: c.y, c1: { x: c.x - k, y: c.y + r }, c2: { x: c.x - r, y: c.y + k } },
          { x: c.x, y: c.y - r, c1: { x: c.x - r, y: c.y - k }, c2: { x: c.x - k, y: c.y - r } },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------- the whole outline

/** One plain shape the outline turns into, and what it is for (so a writer can match the same part from frame to frame). */
export interface StrokePart {
  role: string;
  shape: PathShape;
}

export interface ExpandOptions {
  /** Put dashes into the geometry (for a writer that can't dash a gradient line). */
  bakeDashes?: boolean;
  /** Always give the fill and the line as parts of their own, so frames with and without the style pair up. */
  split?: boolean;
}

const expandCache = new WeakMap<PathShape, Map<string, StrokePart[]>>();

/**
 * A path shape as the plain shapes that paint it. With no dashes, heads or width changes it is just the shape itself
 * (the same object), so nothing about an ordinary shape can change.
 */
export function expandStroke(s: PathShape, opts: ExpandOptions = {}): StrokePart[] {
  const st = s.stroke;
  if (!st || !hasLineStyle(st)) {
    if (!opts.split) return [{ role: 'main', shape: s }];
    return [
      ...(s.fill ? [{ role: 'fill', shape: { ...s, stroke: null } as PathShape }] : []),
      ...(st ? [{ role: 'line', shape: { ...s, id: `${s.id}~line`, fill: null, fillGradient: undefined } as PathShape }] : []),
    ];
  }
  const key = `${opts.bakeDashes ? 'b' : ''}${opts.split ? 's' : ''}`;
  let byKey = expandCache.get(s);
  if (!byKey) expandCache.set(s, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const parts = build(s, st, opts);
  byKey.set(key, parts);
  return parts;
}

function build(s: PathShape, st: PathStroke, opts: ExpandOptions): StrokePart[] {
  const parts: StrokePart[] = [];
  const widths = cleanWidths(st.widths);
  const L = headLength(st);
  const heads: { role: string; head: Head }[] = [];
  // The line stops short of a solid head, so its end doesn't poke out round the tip.
  const lined: SubPath[] = [];
  let trimmed = false;
  s.paths.forEach((sp, i) => {
    if (sp.closed || sp.points.length < 2) {
      lined.push(sp);
      return;
    }
    let line: SubPath | null = sp;
    if (st.arrowEnd) {
      const h = headFor(sp, st.arrowEnd, st);
      if (h) heads.push({ role: `e${i}`, head: h });
      const cut = TRIM[st.arrowEnd] * L;
      if (cut > 0 && line) {
        line = trimEnd(line, cut);
        trimmed = true;
      }
    }
    if (st.arrowStart && line) {
      const rev = reversePath(sp);
      const h = headFor(rev, st.arrowStart, st);
      if (h) heads.push({ role: `s${i}`, head: h });
      const cut = TRIM[st.arrowStart] * L;
      if (cut > 0) {
        line = reversePath(trimEnd(reversePath(line), cut) ?? { closed: false, points: [] });
        if (!line.points.length) line = null;
        trimmed = true;
      }
    }
    if (line) lined.push(line);
  });

  const baked = !!widths || (opts.bakeDashes && !!dashPx(st));
  const copyKeys = (to: PathShape) => {
    if (s.origin) to.origin = s.origin;
    if (s.group) to.group = s.group;
    return to;
  };
  let lineShape: PathShape | null = null;
  if (baked) {
    const area = lineAreaStyled(lined, st, !!opts.bakeDashes);
    if (area && area.length) {
      lineShape = { id: `${s.id}~line`, type: 'path', paths: area, fill: st.color, stroke: null, opacity: s.opacity };
      if (s.strokeGradient) lineShape.fillGradient = s.strokeGradient;
    } else {
      // Could not be worked out: the plain line, so nothing goes missing.
      lineShape = { ...s, id: `${s.id}~line`, paths: lined, fill: null, fillGradient: undefined, stroke: { ...st, widths: undefined } };
    }
  } else if (!trimmed && !opts.split) {
    // Dashes only: the shape as it is, the writer dashes it.
    lineShape = null;
  } else {
    lineShape = { ...s, id: `${s.id}~line`, paths: lined, fill: null, fillGradient: undefined };
  }

  if (lineShape === null) {
    parts.push({ role: 'main', shape: s });
  } else {
    if (s.fill) parts.push({ role: 'fill', shape: { ...s, stroke: null, strokeGradient: undefined } });
    parts.push({ role: 'line', shape: copyKeys(lineShape) });
  }
  for (const { role, head } of heads) {
    const base: PathShape = { id: `${s.id}~${role}`, type: 'path', paths: head.paths, fill: null, stroke: null, opacity: s.opacity };
    if (head.kind === 'fill') {
      base.fill = st.color;
      if (s.strokeGradient) base.fillGradient = s.strokeGradient;
    } else {
      base.stroke = { color: st.color, width: st.width, join: 'round', cap: head.cap ?? 'round' };
      if (s.strokeGradient) base.strokeGradient = s.strokeGradient;
    }
    parts.push({ role: `head-${role}`, shape: copyKeys(base) });
  }
  return parts;
}

// ---------------------------------------------------------------- changing shapes that already exist

/**
 * The shapes with a style change put on the outline of every selected shape that has one. A shape with no outline, a brush
 * line and anything that isn't a path are left as they were (`skipped` counts the selected ones with no outline to change).
 * Shapes that don't change keep their identity, so nothing else is redrawn.
 */
export function restyleShapes<S extends { id: string; type: string }>(shapes: readonly S[], ids: ReadonlySet<string>, patch: StylePatch | ((st: PathStroke) => StylePatch)): { shapes: S[]; changed: number; skipped: number } {
  let changed = 0;
  let skipped = 0;
  const out = shapes.map((s) => {
    if (!ids.has(s.id)) return s;
    const ps = s as unknown as PathShape;
    if (s.type !== 'path' || !ps.stroke) {
      skipped++;
      return s;
    }
    const next = applyPatch(ps.stroke, typeof patch === 'function' ? patch(ps.stroke) : patch);
    if (JSON.stringify(next) === JSON.stringify(ps.stroke)) return s;
    changed++;
    return { ...s, stroke: next } as S;
  });
  return { shapes: out, changed, skipped };
}
