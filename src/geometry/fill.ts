/**
 * The paint bucket's core: pure, DOM-free, runs in Node.
 *
 * 1. Rasterise every wall (stroke outlines, path edges) into a binary mask, at a scale that keeps it to about 4
 *    million pixels.
 * 2. Close gaps: dilate the walls by half the gap, flood fill from the click on that fatter mask, grow the filled
 *    area back by the same amount (plus a hair), and let it tuck a pixel under the lines so there are no slivers.
 * 3. If the area touches the stage edge it leaked. If the click landed on a wall, say so.
 * 4. Trace the area's outer edge and holes (marching squares), simplify (RDP) and fit cubic beziers (Schneider), so
 *    the result is a smooth, lossless `FillShape` outline in document coordinates.
 *
 * Everything runs on runs (spans) rather than pixels where it can, which is what keeps it inside a frame budget.
 */
import type { Shape, SubPath } from '../core/format';
import { fitClosedLoop, DEFAULT_LOOP, type LoopOptions, type V } from './bezier';
import { shapesToBarrier } from './barrier';
import { floodSpans } from './flood';
import { flattenSubPath } from './hit';
import { dilate, discTable, stampSpans } from './morph';
import { fillRings, ringArea2 } from './raster';
import { traceMask } from './trace';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FillRegionOptions {
  /** Width of the biggest gap to close, in document pixels (0 = close none). */
  gap?: number;
  /** The area that counts as "the edge": the stage. A fill that reaches it has leaked. */
  bounds: Rect;
  /** Mask size budget (default 4 million pixels). */
  maxPixels?: number;
  /** Treat existing fills' edges as walls. */
  includeFills?: boolean;
  /** Outline fitting settings, in mask pixels. */
  fit?: Partial<LoopOptions>;
}

export interface FillStats {
  /** Mask pixels per document pixel. */
  scale: number;
  width: number;
  height: number;
  /** The gap radius actually used in mask pixels (it shrinks if the click is boxed into a tiny pocket). */
  radius: number;
  ms: number;
}

export type FillResult =
  | { kind: 'ok'; paths: SubPath[]; area: number; box: Rect; stats: FillStats }
  | { kind: 'leak'; stats: FillStats }
  | { kind: 'on-line'; stats: FillStats }
  | { kind: 'outside'; stats: FillStats };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** How far past the closed gap the area is grown, and how far it tucks under a wall, in mask pixels. */
const GROW_EXTRA = 1;
const TUCK = 1;

/** The mask scale for a stage size under a pixel budget. */
export function maskScale(width: number, height: number, maxPixels = 4_000_000): number {
  return Math.min(1, Math.sqrt(maxPixels / Math.max(1, width * height)));
}

/** Rasterises walls into a fresh mask. */
export function rasteriseBarrier(shapes: readonly Shape[], bounds: Rect, scale: number, includeFills = false): { mask: Uint8Array; w: number; h: number } {
  const w = Math.max(1, Math.ceil(bounds.width * scale));
  const h = Math.max(1, Math.ceil(bounds.height * scale));
  const mask = new Uint8Array(w * h);
  // A wall under a pixel and a half wide can drop out of a mask, so thin edges are given that much.
  const parts = shapesToBarrier(shapes, { thinWidth: 1.5 / scale, includeFills });
  for (const part of parts) {
    const rings = part.rings.map((ring) => {
      const out = new Float64Array(ring.length);
      for (let i = 0; i < ring.length; i += 2) {
        out[i] = (ring[i] - bounds.x) * scale;
        out[i + 1] = (ring[i + 1] - bounds.y) * scale;
      }
      return out;
    });
    fillRings(mask, w, h, rings, part.rule);
  }
  return { mask, w, h };
}

/** From a click inside the fattened walls, the nearest open pixel reachable without crossing a wall. */
function findSeed(walls: Uint8Array, fat: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): number {
  const R = Math.ceil(r) + 3;
  const S = 2 * R + 1;
  const seen = new Uint8Array(S * S);
  const idx = (x: number, y: number) => (y - cy + R) * S + (x - cx + R);
  //Queue of x, y pairs, two slots per pixel
  const q = new Int32Array(2 * S * S);
  q[0] = cx;
  q[1] = cy;
  seen[idx(cx, cy)] = 1;
  let head = 0;
  let tail = 2;
  while (head < tail) {
    const x = q[head++];
    const y = q[head++];
    if (!fat[y * w + x]) return y * w + x;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (Math.abs(nx - cx) > R || Math.abs(ny - cy) > R) continue;
      if (walls[ny * w + nx]) continue;
      const k = idx(nx, ny);
      if (seen[k]) continue;
      seen[k] = 1;
      q[tail++] = nx;
      q[tail++] = ny;
    }
  }
  return -1;
}

/**
 * Finds the area enclosed around `click` and returns it as smooth vector paths.
 * `ok` carries `paths` ready to drop into a `FillShape` (even-odd, outer edges and holes).
 */
export function fillRegion(shapes: readonly Shape[], click: V, opts: FillRegionOptions): FillResult {
  const t0 = now();
  const bounds = opts.bounds;
  const scale = maskScale(bounds.width, bounds.height, opts.maxPixels);
  const w = Math.max(1, Math.ceil(bounds.width * scale));
  const h = Math.max(1, Math.ceil(bounds.height * scale));
  const stats: FillStats = { scale, width: w, height: h, radius: 0, ms: 0 };
  const done = <T extends FillResult>(r: T): T => {
    stats.ms = now() - t0;
    return r;
  };
  const cx = Math.floor((click.x - bounds.x) * scale);
  const cy = Math.floor((click.y - bounds.y) * scale);
  if (!(cx >= 0 && cy >= 0 && cx < w && cy < h)) return done({ kind: 'outside', stats });

  const { mask: walls } = rasteriseBarrier(shapes, bounds, scale, opts.includeFills);
  if (walls[cy * w + cx]) return done({ kind: 'on-line', stats });

  // Gap closing. If the click is boxed into a pocket smaller than the gap, try half the gap, and so on.
  let r = Math.max(0, (opts.gap ?? 0) * 0.5 * scale);
  let fat = walls;
  let seed = cy * w + cx;
  for (;;) {
    fat = r >= 1 ? dilate(walls, w, h, r) : walls;
    if (!fat[cy * w + cx]) {
      seed = cy * w + cx;
      break;
    }
    seed = findSeed(walls, fat, w, h, cx, cy, r);
    if (seed >= 0) break;
    r = r > 2 ? Math.floor(r / 2) : 0;
  }
  stats.radius = r >= 1 ? r : 0;
  const sx = seed % w;
  const sy = (seed / w) | 0;

  const first = floodSpans(fat, w, h, sx, sy);
  if (first.touchesEdge) return done({ kind: 'leak', stats });

  let region = first;
  if (r >= 1) {
    // Grow back out to the walls, but only through open pixels reachable from the seed.
    const grown = first.mark.slice();
    const gr = r + GROW_EXTRA;
    stampSpans(grown, w, h, first.spans, first.spanCount, gr);
    let ymin = h;
    let ymax = 0;
    for (let i = 0; i < first.spanCount; i++) {
      const y = first.spans[3 * i];
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
    const lo = Math.max(0, Math.floor(ymin - gr) - 1);
    const hi = Math.min(h - 1, Math.ceil(ymax + gr) + 1);
    const blocked = new Uint8Array(w * h).fill(1);
    for (let i = lo * w; i < (hi + 1) * w; i++) blocked[i] = grown[i] && !walls[i] ? 0 : 1;
    region = floodSpans(blocked, w, h, sx, sy);
  }

  // Tuck a pixel under the walls, so no hairline of background shows between the paint and the line.
  const mark = region.mark;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  const hw = discTable(TUCK);
  for (let i = 0; i < region.spanCount; i++) {
    const y = region.spans[3 * i];
    const a = region.spans[3 * i + 1];
    const b = region.spans[3 * i + 2];
    if (a < x0) x0 = a;
    if (b > x1) x1 = b;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    for (let dy = -TUCK; dy <= TUCK; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      const e = hw[Math.abs(dy)];
      const xa = Math.max(0, a - e);
      const xb = Math.min(w - 1, b + e);
      for (let k = yy * w + xa, ke = yy * w + xb; k <= ke; k++) if (walls[k]) mark[k] = 1;
    }
  }
  x0 = Math.max(0, x0 - TUCK - 1);
  x1 = Math.min(w - 1, x1 + TUCK + 1);
  y0 = Math.max(0, y0 - TUCK - 1);
  y1 = Math.min(h - 1, y1 + TUCK + 1);

  const loops = traceMask(mark, w, h, { x0, y0, x1, y1 });
  const fit: LoopOptions = { ...DEFAULT_LOOP, ...opts.fit };
  const paths: SubPath[] = [];
  for (const loop of loops) {
    const a2 = ringArea2(loop);
    // Specks are noise, not shapes (a hole of a couple of pixels, or a stray corner).
    if (Math.abs(a2) < 6) continue;
    const pts: V[] = [];
    for (let i = 0; i < loop.length; i += 2) pts.push({ x: loop[i], y: loop[i + 1] });
    const sp = fitClosedLoop(pts, fit);
    if (!sp) continue;
    paths.push(toDoc(sp, bounds, scale));
  }
  if (!paths.length) return done({ kind: 'leak', stats });
  const box: Rect = {
    x: bounds.x + x0 / scale,
    y: bounds.y + y0 / scale,
    width: (x1 - x0 + 1) / scale,
    height: (y1 - y0 + 1) / scale,
  };
  return done({ kind: 'ok', paths, area: region.count / (scale * scale), box, stats });
}

function toDoc(sp: SubPath, bounds: Rect, scale: number): SubPath {
  const f = (p: V): V => ({ x: bounds.x + p.x / scale, y: bounds.y + p.y / scale });
  return {
    closed: sp.closed,
    points: sp.points.map((p) => {
      const q: SubPath['points'][number] = { ...f(p) };
      if (p.c1 && p.c2) {
        q.c1 = f(p.c1);
        q.c2 = f(p.c2);
      }
      return q;
    }),
  };
}

/**
 * How much two sets of subpaths (even-odd) cover the same ground: intersection over union, 0 to 1. The tool uses
 * it to tell "this fill is the area I just clicked" (recolour it) from "a line has since split it" (paint a new one).
 */
export function pathsOverlap(a: SubPath[], b: SubPath[], bounds: Rect, maxPixels = 1_000_000): number {
  const ra = a.map(flattenSubPath).filter((r) => r.length >= 6);
  const rb = b.map(flattenSubPath).filter((r) => r.length >= 6);
  if (!ra.length || !rb.length) return 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of [...ra, ...rb]) {
    for (let i = 0; i < r.length; i += 2) {
      x0 = Math.min(x0, r[i]);
      x1 = Math.max(x1, r[i]);
      y0 = Math.min(y0, r[i + 1]);
      y1 = Math.max(y1, r[i + 1]);
    }
  }
  x0 = Math.max(x0, bounds.x);
  y0 = Math.max(y0, bounds.y);
  x1 = Math.min(x1, bounds.x + bounds.width);
  y1 = Math.min(y1, bounds.y + bounds.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  const scale = maskScale(x1 - x0, y1 - y0, maxPixels);
  const w = Math.max(1, Math.ceil((x1 - x0) * scale));
  const h = Math.max(1, Math.ceil((y1 - y0) * scale));
  const draw = (rings: number[][]) => {
    const m = new Uint8Array(w * h);
    const t = rings.map((r) => {
      const o = new Float64Array(r.length);
      for (let i = 0; i < r.length; i += 2) {
        o[i] = (r[i] - x0) * scale;
        o[i + 1] = (r[i + 1] - y0) * scale;
      }
      return o;
    });
    fillRings(m, w, h, t, 'evenodd');
    return m;
  };
  const ma = draw(ra);
  const mb = draw(rb);
  let both = 0;
  let either = 0;
  for (let i = 0; i < ma.length; i++) {
    if (ma[i] && mb[i]) both++;
    if (ma[i] || mb[i]) either++;
  }
  return either ? both / either : 0;
}
