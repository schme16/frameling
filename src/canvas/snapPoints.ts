/**
 * Line ends and path points as snap targets, and the pull the pen, pencil and brush use on a stroke's start and end.
 * All pure apart from reading the document.
 *
 * A drawing can hold thousands of strokes, so the ends are kept in a grid of buckets (`PointIndex`): a question
 * ("what is near here?") looks at a handful of buckets, not at every point. Each shape's own ends are remembered by the
 * shape object itself (immer keeps unchanged shapes as they were), so after an edit only the new shapes are walked.
 */
import type { Doc, Guide, Shape } from '../core/format';
import type { SnapLine } from './snap';
import type { SnapTarget } from './snapModel';
import { visibleShapes } from './snapShapes';
import type { Pt } from './view';

/** Most points one index holds, so a crowded drawing never makes the first touch of a stroke slow. */
export const MAX_SNAP_POINTS = 120_000;

const ends = new WeakMap<Shape, readonly Pt[]>();

/**
 * The places on a shape another line can meet: a stroke's two ends, every point of a path. Stroke bodies are not
 * targets (there are hundreds of points along a stroke and none of them is a place anyone aimed at). Shapes of other
 * kinds (text, fills, symbol instances) have none.
 */
export function endsOf(s: Shape): readonly Pt[] {
  const hit = ends.get(s);
  if (hit) return hit;
  let out: Pt[] = [];
  if (s.type === 'stroke') {
    const n = s.points.length;
    if (n) out = n === 1 ? [{ x: s.points[0].x, y: s.points[0].y }] : [{ x: s.points[0].x, y: s.points[0].y }, { x: s.points[n - 1].x, y: s.points[n - 1].y }];
  } else if (s.type === 'path') {
    for (const sp of s.paths) for (const p of sp.points) out.push({ x: p.x, y: p.y });
  }
  ends.set(s, out);
  return out;
}

/** Points in buckets: the nearest to a spot within a distance, looking only at the buckets around it. */
export class PointIndex {
  readonly size: number;
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly minX: number;
  private readonly minY: number;
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  /** Where each bucket's points start in `order` (one more than the buckets, so a bucket ends where the next starts). */
  private readonly start: Int32Array;
  private readonly order: Int32Array;

  constructor(points: readonly Pt[]) {
    const n = points.length;
    this.size = n;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const { x, y } = points[i];
      this.xs[i] = x;
      this.ys[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!n) {
      minX = minY = maxX = maxY = 0;
    }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    // About one point to a bucket, and never more buckets than a few per point.
    let cell = Math.max(Math.sqrt((w * h) / Math.max(n, 1)), 4);
    while ((Math.floor(w / cell) + 1) * (Math.floor(h / cell) + 1) > 4 * n + 16) cell *= 1.5;
    this.minX = minX;
    this.minY = minY;
    this.cell = cell;
    this.cols = Math.floor(w / cell) + 1;
    this.rows = Math.floor(h / cell) + 1;
    this.start = new Int32Array(this.cols * this.rows + 1);
    const slot = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      slot[i] = this.bucketOf(this.xs[i], this.ys[i]);
      this.start[slot[i] + 1]++;
    }
    for (let b = 0; b < this.cols * this.rows; b++) this.start[b + 1] += this.start[b];
    const fill = this.start.slice(0, this.cols * this.rows);
    this.order = new Int32Array(n);
    for (let i = 0; i < n; i++) this.order[fill[slot[i]]++] = i;
  }

  private col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
  }
  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.cell)));
  }
  private bucketOf(x: number, y: number): number {
    return this.row(y) * this.cols + this.col(x);
  }

  /** The nearest point within `tol` of (x, y), or null. */
  nearest(x: number, y: number, tol: number): Pt | null {
    const n = this.size;
    if (!n) return null;
    let best = -1;
    let bd = tol * tol;
    const c0 = this.col(x - tol);
    const c1 = this.col(x + tol);
    const r0 = this.row(y - tol);
    const r1 = this.row(y + tol);
    // Outside the points' box by more than the reach: nothing can be near.
    if (x + tol < this.minX || y + tol < this.minY || x - tol > this.minX + this.cols * this.cell || y - tol > this.minY + this.rows * this.cell) return null;
    const look = (i: number) => {
      const dx = this.xs[i] - x;
      const dy = this.ys[i] - y;
      const d = dx * dx + dy * dy;
      if (d <= bd) {
        bd = d;
        best = i;
      }
    };
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > n) {
      // A reach wider than the whole drawing is cheaper as one pass.
      for (let i = 0; i < n; i++) look(i);
    } else {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const b = r * this.cols + c;
          for (let k = this.start[b]; k < this.start[b + 1]; k++) look(this.order[k]);
        }
      }
    }
    return best < 0 ? null : { x: this.xs[best], y: this.ys[best] };
  }
}

/** The index for a list of shapes (shapes in `exclude` are left out). */
export function indexShapes(shapes: readonly Shape[], exclude: ReadonlySet<string> = new Set()): PointIndex {
  const pts: Pt[] = [];
  for (const s of shapes) {
    if (exclude.has(s.id)) continue;
    for (const p of endsOf(s)) pts.push(p);
    if (pts.length >= MAX_SNAP_POINTS) break;
  }
  return new PointIndex(pts);
}

let cache: { doc: Doc; frame: number; key: string; index: PointIndex } | null = null;

/**
 * The ends and points of the other shapes on the visible vector layers (or the open layer only), kept while the
 * document, frame, excluded shapes and reach stay the same, so a whole stroke is one build.
 */
export function pointIndexFor(doc: Doc, frame: number, exclude: readonly string[], onlyLayer: string | null = null): PointIndex {
  const key = `${onlyLayer ?? '*'}#${exclude.join('|')}`;
  if (cache && cache.doc === doc && cache.frame === frame && cache.key === key) return cache.index;
  const index = indexShapes(visibleShapes(doc, frame, onlyLayer), new Set(exclude));
  cache = { doc, frame, key, index };
  return index;
}

// ---------------------------------------------------------------- lines for a stroke's start and end

/** The lines a stroke's start or end can be pulled onto. Anything left out (null or false) is not a target. */
export interface DrawLines {
  width: number;
  height: number;
  page: boolean;
  centre: boolean;
  guides: readonly Guide[] | null;
  /** The square grid's size, or null (an isometric grid pulls onto corners instead, see `snapIso`). */
  grid: number | null;
  plugins: { x: readonly number[]; y: readonly number[] } | null;
}

/** The nearest line on each way within `tol`, with what each one is. The grid is worked out, not listed. */
export function pullToLines(p: Pt, tol: number, L: DrawLines): { x: number; y: number; lines: SnapLine[] } {
  const lines: SnapLine[] = [];
  const out = { x: p.x, y: p.y };
  for (const axis of ['x', 'y'] as const) {
    const v = p[axis];
    const span = axis === 'x' ? L.width : L.height;
    let bd = tol;
    let at: number | null = null;
    let kind: SnapTarget = 'guides';
    const consider = (c: number, k: SnapTarget) => {
      const d = Math.abs(c - v);
      if (d < bd || (at === null && d <= bd)) {
        bd = d;
        at = c;
        kind = k;
      }
    };
    if (L.guides) for (const g of L.guides) if (g.axis === axis) consider(g.at, 'guides');
    if (L.page) {
      consider(0, 'page');
      consider(span, 'page');
    }
    if (L.centre) consider(span / 2, 'centre');
    if (L.plugins) for (const c of L.plugins[axis]) consider(c, 'plugins');
    if (L.grid && L.grid > 0) consider(Math.min(span, Math.max(0, Math.round(v / L.grid) * L.grid)), 'grid');
    if (at !== null) {
      out[axis] = at;
      lines.push({ axis, at, kind });
    }
  }
  return { ...out, lines };
}

/** The nearest of the candidates within `tol` (a stroke's own start is one, when it is closing a loop). */
export function nearestOf(p: Pt, tol: number, ...cands: (Pt | null | undefined)[]): Pt | null {
  let best: Pt | null = null;
  let bd = tol;
  for (const c of cands) {
    if (!c) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d <= bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * Has a stroke gone far enough to be closing a loop on its own start? Only after it has travelled well past the pull
 * distance, so a short stroke or a dot never snaps to where it began.
 */
export const farEnoughToClose = (travelled: number, tol: number): boolean => travelled > tol * 6;
