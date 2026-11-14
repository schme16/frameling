// Pixels into shapes. The contour maths is the tracer the app already has (src/geometry/trace.ts, marching squares with
// holes and 4-way connectivity) and the curve fitting is the one text and the paint bucket use (src/geometry/bezier.ts).
// What is added here is the colour separation, the stacking of colours, keeping stair steps exactly, and turning loops
// into fill shapes. Pure: pixels in, shapes out.
//
// Curves are made from the exact pixel outline: its corners are cut (so steps become smooth) and the result is fitted with
// the same curve fitter the paint bucket uses. The tracer's own soft-edge mode is for anti-aliased pictures (text); here
// the picture is hard-edged pixels, so there is no edge to follow to a fraction of a pixel.
import type { FillShape, PathPoint, SubPath } from '../core/format';
import { DEFAULT_LOOP, fitClosedLoop, type V } from '../geometry/bezier';
import { ringArea2 } from '../geometry/raster';
import { traceMask } from '../geometry/trace';
import { hexOf, separateColours, type Separated } from './separate';

export type TraceEdges = 'hug' | 'smooth';
export type TraceLayering = 'stacked' | 'pieces';
export type TraceSplit = 'colour' | 'blob';

export interface TraceOptions {
  /** The most colours (so the most shapes with `split: 'colour'`) to make. */
  colours: number;
  /** Keep every stair step exactly, or round them into curves. */
  edges: TraceEdges;
  /** Stacked: each colour's shape also covers the colours above it, so there are no hairline gaps. Pieces: each shape is only its own colour. */
  layering: TraceLayering;
  /** One shape per colour, or one per separate blob. */
  split: TraceSplit;
  /** 0 to 1, for smooth edges: how much to round and simplify. */
  smooth: number;
  /** Bits smaller than this many art pixels are left out. */
  speck: number;
}

export const DEFAULT_TRACE: TraceOptions = { colours: 32, edges: 'hug', layering: 'stacked', split: 'colour', smooth: 0.5, speck: 1 };

/** Most colours the dialog offers. */
export const MAX_TRACE_COLOURS = 64;
export const MIN_TRACE_COLOURS = 2;

export interface TraceResult {
  shapes: FillShape[];
  /** Colours used. */
  colours: number;
  /** Colours the picture really had (a rough figure when there were very many). */
  distinct: number;
  /** Every colour was kept exactly. */
  exact: boolean;
  /** Corners and curve points over every shape. */
  points: number;
  /** Painted pixels looked at. */
  solid: number;
}

/**
 * The tracer's loops cut every corner (its points sit half way along pixel edges). For a loop that should keep its
 * stair steps, each cut is put back: the cut joins a point on a vertical pixel edge to one on a horizontal pixel edge,
 * and the corner it cut off is the two whole-number coordinates of that pair. Returns a flat list of corners.
 */
export function exactCorners(loop: ArrayLike<number>): number[] {
  const n = loop.length >> 1;
  const out: number[] = [];
  // A point is on a vertical edge when its x is a whole number (the other kind has a whole y).
  const onVertical = (i: number) => Math.abs(loop[i * 2] - Math.round(loop[i * 2])) < 1e-6;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = onVertical(i);
    const b = onVertical(j);
    if (a === b) continue;
    const v = a ? i : j;
    const h = a ? j : i;
    out.push(Math.round(loop[v * 2]), Math.round(loop[h * 2 + 1]));
  }
  return out;
}

/** Drops corners that sit on a straight line between their neighbours, and doubled-up points. */
export function dropStraight(flat: number[]): number[] {
  let n = flat.length >> 1;
  let p = flat.slice();
  let changed = true;
  while (changed && n >= 3) {
    changed = false;
    const keep: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n;
      const b = (i + 1) % n;
      const cross = (p[i * 2] - p[a * 2]) * (p[b * 2 + 1] - p[i * 2 + 1]) - (p[i * 2 + 1] - p[a * 2 + 1]) * (p[b * 2] - p[i * 2]);
      if (Math.abs(cross) < 1e-9) {
        changed = true;
        continue;
      }
      keep.push(p[i * 2], p[i * 2 + 1]);
    }
    p = keep;
    n = p.length >> 1;
  }
  return p;
}

/** Cuts every corner of a closed loop a quarter of the way in, `rounds` times, so square steps turn into smooth curves. Flat list in, flat list out. */
export function roundCorners(flat: number[], rounds: number): number[] {
  let p = flat;
  for (let r = 0; r < rounds; r++) {
    const n = p.length >> 1;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push(0.75 * p[i * 2] + 0.25 * p[j * 2], 0.75 * p[i * 2 + 1] + 0.25 * p[j * 2 + 1], 0.25 * p[i * 2] + 0.75 * p[j * 2], 0.25 * p[i * 2 + 1] + 0.75 * p[j * 2 + 1]);
    }
    p = out;
  }
  return p;
}

function inRing(x: number, y: number, ring: ArrayLike<number>): boolean {
  let inside = false;
  const n = ring.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Groups loops into blobs, as indexes: each outer loop with the holes inside it (a hole goes with the smallest outer loop around it). */
export function blobsOf(loops: number[][]): number[][] {
  const areas = loops.map((l) => ringArea2(l));
  const outers = loops.map((_, i) => i).filter((i) => areas[i] > 0);
  const groups = new Map<number, number[]>();
  for (const o of outers) groups.set(o, [o]);
  loops.forEach((l, i) => {
    if (areas[i] > 0) return;
    let home = -1;
    for (const o of outers) if (inRing(l[0], l[1], loops[o]) && (home < 0 || areas[o] < areas[home])) home = o;
    if (home >= 0) groups.get(home)!.push(i);
  });
  return [...groups.values()];
}

function toPath(flat: number[], scale: number, curves: { simplify: number; tolerance: number; cornerAngle: number } | null): SubPath | null {
  if (!curves) {
    const c = dropStraight(flat);
    if (c.length < 6) return null;
    const points: PathPoint[] = [];
    for (let i = 0; i < c.length; i += 2) points.push({ x: c[i] * scale, y: c[i + 1] * scale });
    return { points, closed: true };
  }
  // The pixel outline with its corners cut, then fitted with curves (a few points where there were many steps).
  const round = roundCorners(dropStraight(flat), 2);
  const pts: V[] = [];
  for (let i = 0; i < round.length; i += 2) pts.push({ x: round[i], y: round[i + 1] });
  const sp = fitClosedLoop(pts, { ...DEFAULT_LOOP, ...curves });
  if (!sp) return null;
  const f = (p: V): V => ({ x: p.x * scale, y: p.y * scale });
  return {
    closed: true,
    points: sp.points.map((p) => {
      const q: PathPoint = { ...f(p) };
      if (p.c1 && p.c2) {
        q.c1 = f(p.c1);
        q.c2 = f(p.c2);
      }
      return q;
    }),
  };
}

/** How the smooth slider (0 to 1) sets the curve fit, in art pixels. */
export function curveFit(smooth: number): { simplify: number; tolerance: number; cornerAngle: number } {
  const s = Math.max(0, Math.min(1, smooth));
  return { simplify: 0.05 + s * 0.4, tolerance: 0.06 + s * 0.5, cornerAngle: 100 };
}

/**
 * Traces a grid of pixels (`w` x `h` RGBA) into flat colour shapes. `scale` is page pixels per art pixel, so the shapes
 * land where the pixels are drawn. With `mask` only the pixels it marks are traced. Shapes come back bottom first.
 */
export function pixelsToShapes(pixels: ArrayLike<number>, w: number, h: number, scale: number, opts: TraceOptions, newId: () => string, mask?: ArrayLike<number> | null, sep?: Separated): TraceResult {
  const s = sep ?? separateColours(pixels, w, h, Math.max(MIN_TRACE_COLOURS, Math.min(MAX_TRACE_COLOURS, opts.colours)), mask);
  const shapes: FillShape[] = [];
  let points = 0;
  const curves = opts.edges === 'smooth' ? curveFit(opts.smooth) : null;
  const m = new Uint8Array(w * h);
  for (let c = 0; c < s.colours.length; c++) {
    m.fill(0);
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = s.index[y * w + x];
        // Stacked: this colour and every colour that sits above it. Pieces: only this colour.
        if (v < 0 || (opts.layering === 'stacked' ? v < c : v !== c)) continue;
        m[y * w + x] = 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) continue;
    const raw = traceMask(m, w, h, { x0, y0, x1, y1 });
    // Size is judged on the exact pixel outline, since the tracer's loops cut every corner (a single pixel is half its area).
    const exact = raw.map((l) => exactCorners(l));
    const keepIt = raw.map((l, i) => l.length >= 6 && Math.abs(ringArea2(exact[i])) >= opts.speck * 2);
    const loops = raw.filter((_, i) => keepIt[i]);
    if (!loops.length) continue;
    const fixed = exact.filter((_, i) => keepIt[i]);
    const groups = opts.split === 'blob' ? blobsOf(loops).map((g) => g.map((i) => fixed[i])) : [fixed];
    for (const g of groups) {
      const paths: SubPath[] = [];
      for (const l of g) {
        const sp = toPath(l, scale, curves);
        if (sp) paths.push(sp);
      }
      if (!paths.length) continue;
      points += paths.reduce((n, p) => n + p.points.length, 0);
      shapes.push({ id: newId(), type: 'fill', paths, color: hexOf(s.colours[c]), opacity: 1 });
    }
  }
  return { shapes, colours: s.colours.length, distinct: s.distinct, exact: s.exact, points, solid: s.solid };
}

/** What a trace will cost, in plain words, or null when it is nothing to worry about. A photo has thousands of colours and tracing it makes a mess. */
export function traceAdvice(r: Pick<TraceResult, 'distinct' | 'exact' | 'points' | 'shapes'>): { level: 'mess' | 'heavy' | 'many'; words: string } | null {
  if (r.distinct > 1024) {
    return { level: 'mess', words: `This picture has thousands of colours, so it looks like a photo. Tracing a photo makes a heap of small shapes that look like a mosaic and are slow to edit. Frameling works best on flat colours: pixel art, logos, drawings.` };
  }
  if (r.shapes.length > 400 || r.points > 30000) {
    return { level: 'heavy', words: `This makes ${r.shapes.length.toLocaleString()} shapes with ${r.points.toLocaleString()} points, which will be slow to edit. Fewer colours, a bigger "ignore bits smaller than", or smoother edges will make fewer.` };
  }
  if (!r.exact && r.distinct > 64) {
    return { level: 'many', words: `This picture has about ${r.distinct.toLocaleString()} colours, so some shades are merged. Soft shading and gradients turn into flat steps.` };
  }
  return null;
}

/** What a trace should start on for this picture: exact colours for flat art, 16 for the rest, and steps or curves by what the picture is. */
export function suggestTrace(o: { pixelSize: number; width: number; height: number; distinct: number }, pref: { edges: 'follow' | TraceEdges }): { colours: number; edges: TraceEdges; speck: number; photo: boolean; smooth: number } {
  const photo = o.distinct > 1024;
  const flat = o.distinct <= MAX_TRACE_COLOURS;
  const colours = flat ? Math.max(MIN_TRACE_COLOURS, o.distinct) : 16;
  const chunky = o.pixelSize >= 2 || (flat && o.width * o.height <= 256 * 256);
  const edges: TraceEdges = pref.edges === 'follow' ? (chunky ? 'hug' : 'smooth') : pref.edges;
  // Small pictures have little to spare: every pixel is a feature, so they start with the lightest rounding.
  const smooth = Math.max(o.width, o.height) <= 64 ? 0.1 : 0.5;
  return { colours, edges, speck: photo ? 6 : 1, photo, smooth };
}
