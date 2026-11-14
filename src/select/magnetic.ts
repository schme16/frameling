/**
 * The magnetic select: a lasso that clings to the edge your drawing already has, so tracing roughly round something
 * lands on its outline. Pure and free of the DOM, so the edge finding is easy to test.
 *
 * On a pixel layer an edge is exact. It is a line between two neighbouring pixels of different colour, so the lines
 * of the pixel grid are the only places an outline can run. The pointer snaps to the corner of the strongest edge
 * near it, and between two corners the outline walks along edges (a small A* search over the grid lines).
 *
 * On a vector layer the edges are the outlines of the shapes. The pointer snaps to the nearest point on one.
 *
 * Everything that follows takes and gives document pixels, except `PixelEdges` and its helpers, which work on
 * the grid of art pixels (cells).
 */
import type { Pt } from '../canvas/geometry';

/** A colour change smaller than this (0 to 1) is not an edge: it is noise, or the same colour. */
export const MIN_EDGE = 0.06;

// ---------------------------------------------------------------- pixel edges

/** How different two pixels are, 0 (the same) to 1 (see-through against solid, or opposite colours). `a` and `b` are byte offsets. */
export function pixelDiff(px: ArrayLike<number>, a: number, b: number): number {
  const aa = px[a + 3];
  const ab = px[b + 3];
  if (aa === 0 && ab === 0) return 0;
  let d = Math.abs(aa - ab);
  // Colour only matters where both pixels can be seen.
  if (aa && ab) d = Math.max(d, Math.abs(px[a] - px[b]), Math.abs(px[a + 1] - px[b + 1]), Math.abs(px[a + 2] - px[b + 2]));
  return d / 255;
}

/**
 * The edges of a grid of pixels (RGBA). Edges live on the grid lines: a vertex (i, j) is the corner at the top left of
 * pixel (i, j), and runs from 0 to the width and the height. The side of the picture is not an edge, so a trace
 * does not get pulled onto the border of the canvas.
 */
export class PixelEdges {
  constructor(
    readonly pixels: ArrayLike<number>,
    readonly width: number,
    readonly height: number,
  ) {}

  /** How much the pixel at (x, y) differs from the one at (u, v). The side of the picture is not an edge. */
  diff(x: number, y: number, u: number, v: number): number {
    const inA = x >= 0 && y >= 0 && x < this.width && y < this.height;
    const inB = u >= 0 && v >= 0 && u < this.width && v < this.height;
    if (!inA || !inB) return 0;
    return pixelDiff(this.pixels, (y * this.width + x) * 4, (v * this.width + u) * 4);
  }

  /** The edge running right from vertex (i, j) to (i + 1, j): the line between the pixels above and below it. */
  h(i: number, j: number): number {
    return this.diff(i, j - 1, i, j);
  }

  /** The edge running down from vertex (i, j) to (i, j + 1): the line between the pixels left and right of it. */
  v(i: number, j: number): number {
    return this.diff(i - 1, j, i, j);
  }

  /** The strongest of the four edges meeting at vertex (i, j). */
  strength(i: number, j: number): number {
    return Math.max(this.h(i - 1, j), this.h(i, j), this.v(i, j - 1), this.v(i, j));
  }
}

/**
 * The corner of an edge nearest `p` (cells), looking no further than `reach` (cells). Strong edges win over faint
 * ones, and nearer ones over farther ones: a clear outline a little way off beats a faint shading line right
 * under the pointer. Null when nothing there is an edge.
 */
export function snapToVertex(e: PixelEdges, p: Pt, reach: number): Pt | null {
  const r = Math.max(1, reach);
  const r2 = r * r;
  const i0 = Math.max(0, Math.floor(p.x - r));
  const i1 = Math.min(e.width, Math.ceil(p.x + r));
  const j0 = Math.max(0, Math.floor(p.y - r));
  const j1 = Math.min(e.height, Math.ceil(p.y + r));
  let best: Pt | null = null;
  let bestScore = 0;
  let bestD = Infinity;
  for (let j = j0; j <= j1; j++) {
    const dy = j - p.y;
    for (let i = i0; i <= i1; i++) {
      const dx = i - p.x;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const s = e.strength(i, j);
      if (s < MIN_EDGE) continue;
      const score = s * s * (1 - d2 / r2);
      if (score > bestScore || (score === bestScore && d2 < bestD)) {
        bestScore = score;
        bestD = d2;
        best = { x: i, y: j };
      }
    }
  }
  return best;
}

/** Most grid lines across a search box. Anything wider is drawn straight rather than searched. */
const MAX_SPAN = 96;
/** How far past the two corners the search may stray (cells). */
const MARGIN = 4;

const gScore = new Float32Array(MAX_SPAN * MAX_SPAN);
const came = new Int32Array(MAX_SPAN * MAX_SPAN);
const done = new Uint8Array(MAX_SPAN * MAX_SPAN);
const heapId = new Int32Array(MAX_SPAN * MAX_SPAN * 4 + 16);
const heapKey = new Float32Array(MAX_SPAN * MAX_SPAN * 4 + 16);

const isCorner = (p: Pt): boolean => Math.abs(p.x - Math.round(p.x)) < 1e-6 && Math.abs(p.y - Math.round(p.y)) < 1e-6;

/**
 * The corners to walk from corner `a` to corner `b` (cells) along edges, both included, with the straight runs
 * reduced to their ends. Null when the two are not joined by an unbroken edge near each other, or are too far apart
 * to search; the caller draws a straight line then.
 */
export function wireAlong(e: PixelEdges, a: Pt, b: Pt): Pt[] | null {
  if (!isCorner(a) || !isCorner(b)) return null;
  const ax = Math.round(a.x);
  const ay = Math.round(a.y);
  const bx = Math.round(b.x);
  const by = Math.round(b.y);
  if (ax === bx && ay === by) return [{ x: ax, y: ay }];
  const x0 = Math.max(0, Math.min(ax, bx) - MARGIN);
  const x1 = Math.min(e.width, Math.max(ax, bx) + MARGIN);
  const y0 = Math.max(0, Math.min(ay, by) - MARGIN);
  const y1 = Math.min(e.height, Math.max(ay, by) + MARGIN);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw > MAX_SPAN || bh > MAX_SPAN) return null;
  const n = bw * bh;
  gScore.fill(Infinity, 0, n);
  done.fill(0, 0, n);
  const id = (i: number, j: number) => (j - y0) * bw + (i - x0);
  const start = id(ax, ay);
  const goal = id(bx, by);
  let size = 0;
  const push = (node: number, key: number) => {
    let k = size++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heapKey[parent] <= key) break;
      heapId[k] = heapId[parent];
      heapKey[k] = heapKey[parent];
      k = parent;
    }
    heapId[k] = node;
    heapKey[k] = key;
  };
  const pop = (): number => {
    const top = heapId[0];
    const node = heapId[--size];
    const key = heapKey[size];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= size) break;
      if (c + 1 < size && heapKey[c + 1] < heapKey[c]) c++;
      if (heapKey[c] >= key) break;
      heapId[k] = heapId[c];
      heapKey[k] = heapKey[c];
      k = c;
    }
    heapId[k] = node;
    heapKey[k] = key;
    return top;
  };
  const heur = (i: number, j: number) => Math.abs(i - bx) + Math.abs(j - by);
  gScore[start] = 0;
  came[start] = -1;
  push(start, heur(ax, ay));
  let found = false;
  while (size) {
    const cur = pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    const ci = x0 + (cur % bw);
    const cj = y0 + Math.floor(cur / bw);
    const g = gScore[cur];
    // The four lines out of this corner, each walkable only if it really is an edge.
    for (let k = 0; k < 4; k++) {
      const ni = k === 0 ? ci + 1 : k === 1 ? ci - 1 : ci;
      const nj = k === 2 ? cj + 1 : k === 3 ? cj - 1 : cj;
      if (ni < x0 || ni > x1 || nj < y0 || nj > y1) continue;
      const s = k === 0 ? e.h(ci, cj) : k === 1 ? e.h(ci - 1, cj) : k === 2 ? e.v(ci, cj) : e.v(ci, cj - 1);
      if (s < MIN_EDGE) continue;
      const next = id(ni, nj);
      if (done[next]) continue;
      // A stronger edge costs a little less, so the walk prefers the clearer line where two run side by side.
      const cost = 1 + 0.5 * (1 - Math.min(1, s));
      if (g + cost < gScore[next]) {
        gScore[next] = g + cost;
        came[next] = cur;
        push(next, g + cost + heur(ni, nj));
      }
    }
  }
  if (!found) return null;
  const out: Pt[] = [];
  for (let at = goal; at !== -1; at = came[at]) out.push({ x: x0 + (at % bw), y: y0 + Math.floor(at / bw) });
  out.reverse();
  return straighten(out);
}

/** Drops the corners that sit in the middle of a straight run. */
export function straighten(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    if ((b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x)) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------------------------------------------------------------- vector edges

/** A line a shape is drawn along. */
export interface Ring {
  pts: readonly Pt[];
  closed: boolean;
}

/**
 * The nearest point on any of the lines to `p`, within `reach`, or null. A point within a third of the reach of a
 * line's corner lands on the corner, so a trace round a square comes out square.
 */
export function snapToRings(rings: readonly Ring[], p: Pt, reach: number): Pt | null {
  let best: Pt | null = null;
  let bestD = reach;
  let bestA: Pt | null = null;
  let bestB: Pt | null = null;
  let bestT = 0;
  for (const ring of rings) {
    const pts = ring.pts;
    const n = pts.length;
    if (n < 2) continue;
    const last = ring.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + t * dx;
      const qy = a.y + t * dy;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (d <= bestD) {
        bestD = d;
        best = { x: qx, y: qy };
        bestA = a;
        bestB = b;
        bestT = t;
      }
    }
  }
  if (!best || !bestA || !bestB) return null;
  const corner = reach / 3;
  const len = Math.hypot(bestB.x - bestA.x, bestB.y - bestA.y);
  if (len * bestT <= corner) return { x: bestA.x, y: bestA.y };
  if (len * (1 - bestT) <= corner) return { x: bestB.x, y: bestB.y };
  return best;
}

// ---------------------------------------------------------------- the trace

/** Where the edges come from: pixels, or shape outlines. All in document pixels. */
export interface EdgeSource {
  /** The point on an edge nearest `p` within `reach`, or null when there is none. */
  snap(p: Pt, reach: number): Pt | null;
  /** The points to walk from `from` (left out) to `to` (kept) along the edge. `via` is where the pointer clung on the way. */
  link(from: Pt, to: Pt, via: readonly Pt[]): Pt[];
}

/** Pixels as an edge source. `size` is how many document pixels one art pixel covers. */
export function pixelSource(edges: PixelEdges, size: number): EdgeSource {
  return {
    snap(p, reach) {
      const v = snapToVertex(edges, { x: p.x / size, y: p.y / size }, reach / size);
      return v && { x: v.x * size, y: v.y * size };
    },
    link(from, to) {
      const w = wireAlong(edges, { x: from.x / size, y: from.y / size }, { x: to.x / size, y: to.y / size });
      return w ? w.slice(1).map((v) => ({ x: v.x * size, y: v.y * size })) : [to];
    },
  };
}

/** Shape outlines as an edge source. `near` gives the lines of the shapes close to a point. */
export function ringSource(near: (p: Pt, reach: number) => readonly Ring[]): EdgeSource {
  return {
    snap: (p, reach) => snapToRings(near(p, reach), p, reach),
    link: (_from, to, via) => {
      const last = via[via.length - 1];
      return last && last.x === to.x && last.y === to.y ? [...via] : [...via, to];
    },
  };
}

/** The screen distance (px) the pointer has to travel along an edge before the trace fastens a point there by itself. */
const FASTEN_PX = 70;
/** Snapped points closer together than this (screen px) are not both kept while tracing a vector outline. */
const TRAIL_PX = 3;

const gap = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

function pathLength(from: Pt, pts: readonly Pt[]): number {
  let len = 0;
  let at = from;
  for (const p of pts) {
    len += gap(at, p);
    at = p;
  }
  return len;
}

/**
 * One magnetic trace. `begin` it at the first click, `move` it with every pointer move, `place` a point by hand with a
 * click, take the last point `back`, and ask for the `outline` to close it. Points are fastened as you go (every so
 * often along an edge, and on every click), and `back` takes away the last fastened stretch.
 */
export class MagneticTrace {
  /** The points fastened so far, in order. Always the same array, so a caller can keep hold of it. */
  readonly pts: Pt[] = [];
  /** The stretch from the last point to the pointer, which is not fastened yet. */
  tail: Pt[] = [];
  /** The point on an edge the pointer has clung to, or null when it is off on its own. */
  target: Pt | null = null;
  private cuts: number[] = [];
  private via: Pt[] = [];
  private key: [number, number, number, number, number] | null = null;

  constructor(private src: EdgeSource) {}

  /** Starts at the first click. `reach` is in document pixels, as are all the points. */
  begin(p: Pt, reach: number): void {
    this.pts.length = 0;
    this.cuts = [];
    this.reset();
    this.pts.push(this.src.snap(p, reach) ?? { x: p.x, y: p.y });
    this.cuts.push(1);
  }

  /** The pointer is at `p`. `zoom` turns screen distances into document ones. */
  move(p: Pt, reach: number, zoom: number): void {
    const from = this.pts[this.pts.length - 1];
    if (!from) return;
    const t = this.src.snap(p, reach);
    this.target = t;
    if (!t) {
      this.tail = [{ x: p.x, y: p.y }];
      this.via.length = 0;
      this.key = null;
      return;
    }
    const lv = this.via[this.via.length - 1] ?? from;
    if (gap(lv, t) > reach * 6) this.via.length = 0;
    else if (gap(lv, t) >= TRAIL_PX / zoom && this.via.length < 400) this.via.push(t);
    const k = this.key;
    if (!k || k[0] !== t.x || k[1] !== t.y || k[2] !== from.x || k[3] !== from.y || k[4] !== this.via.length) {
      this.tail = this.src.link(from, t, this.via);
      this.key = [t.x, t.y, from.x, from.y, this.via.length];
    }
    if (pathLength(from, this.tail) >= FASTEN_PX / zoom) this.fasten();
  }

  /** A click at `p`: fastens a point there (on the edge it clings to), ahead of the stretch since the last one. */
  place(p: Pt, reach: number, zoom: number): void {
    const before = this.pts.length;
    this.move(p, reach, zoom);
    // The move already fastened a point on the edge, which is what this click was asking for.
    if (this.pts.length !== before) return;
    if (!this.target) this.tail = [{ x: p.x, y: p.y }];
    this.fasten();
  }

  /** Takes the last fastened stretch back. False when only the start is left, so there is nothing to take back. */
  back(): boolean {
    if (this.cuts.length <= 1) return false;
    this.cuts.pop();
    this.pts.length = this.cuts[this.cuts.length - 1];
    this.reset();
    return true;
  }

  /** How many stretches are fastened, the start included. */
  get fastened(): number {
    return this.cuts.length;
  }

  /**
   * The outline once closed: the points, the stretch to the pointer when it is clinging to an edge, and the way back
   * to the start along the edge when there is one. The straight line from the end to the start is left implicit.
   */
  outline(): Pt[] {
    const out = this.pts.slice();
    if (this.target) for (const p of this.tail) if (!same(p, out[out.length - 1])) out.push(p);
    const first = out[0];
    const last = out[out.length - 1];
    if (first && last && !same(first, last)) {
      const back = this.src.link(last, first, []);
      for (const p of back) if (!same(p, first)) out.push(p);
    }
    return out;
  }

  private fasten(): void {
    const before = this.pts.length;
    for (const p of this.tail) if (!same(p, this.pts[this.pts.length - 1])) this.pts.push(p);
    if (this.pts.length !== before) this.cuts.push(this.pts.length);
    this.reset();
  }

  private reset(): void {
    this.tail = [];
    this.via.length = 0;
    this.key = null;
    this.target = null;
  }
}
