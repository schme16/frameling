// The brush tips you build yourself, as plain shapes: a pen nib swept along the line, your own drawing stretched or
// repeated along it (and the edged version with separate ends and corners), and a bunch of bristles. Like every tip they are
// worked out from the line's points when drawing and exporting, and come out as ordinary fills and lines, so SVG, PDF and
// every other vector format carry them as they are. Pure, no DOM.
import polygonClipping, { type Pair } from 'polygon-clipping';
import type { FillShape, PathShape, Shape, StrokeShape, SubPath } from '../core/format';
import { rdp } from './bezier';
import type { ResolvedTip } from './tip';
import { hash3, stampSites, vnoise } from './tipShapes';

type V = [number, number];
type Site = ReturnType<typeof stampSites>[number];

const r2 = (v: number) => Math.round(v * 100) / 100;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Most nib positions along one line; a longer line has them further apart. */
export const MAX_NIB_SITES = 260;
/** Most tiles of a repeated or edged brush on one line, and most points one mapped tile keeps. */
export const MAX_TILES = 400;
const MAX_TILE_EDGE = 40;

/** The pressure at a point as a share of the full width. */
const widthAt = (p: number, thinning: number): number => Math.max(0.15, 2 * (0.5 - thinning * (0.5 - p)));

/** How wide the brush is at a point: pressure (when the pen gave any) and the pointy ends. 1 = full size. */
function widthFactor(s: StrokeShape, q: Site, ignorePressure: boolean): number {
  const b = s.brush;
  const flat = ignorePressure || (!s.realPressure && s.points.every((p) => p.p === 0.5));
  let k = flat ? 1 : widthAt(q.p, b.thinning);
  if (b.taperStart > 0) k *= 0.12 + 0.88 * Math.min(1, (q.d + b.size * 0.25) / b.taperStart);
  if (b.taperEnd > 0) k *= 0.12 + 0.88 * Math.min(1, (q.len - q.d + b.size * 0.25) / b.taperEnd);
  return k;
}

/** The sites along the line, no more than `max` of them. */
function sitesFor(s: StrokeShape, step: number, max: number): Site[] {
  const smooth = Math.round(s.brush.streamline * 3);
  let sites = stampSites(s.points, step, smooth);
  if (sites.length > max && sites[0].len > 0) sites = stampSites(s.points, sites[0].len / (max - 1), smooth);
  return sites;
}

// ---------------------------------------------------------------- the pen nib

function hull(pts: V[]): V[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: V, a: V, b: V) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: V[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/** An oval at a point: `a` across its long way, `b` its short way, turned by `ang`. */
function oval(x: number, y: number, a: number, b: number, ang: number, n = 14): V[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const out: V[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = Math.cos(t) * a;
    const ey = Math.sin(t) * b;
    out.push([x + ex * c - ey * s, y + ex * s + ey * c]);
  }
  return out;
}

/** The nib's angle at a site: fixed on the page (counting up from flat, anticlockwise), or measured from the way the line runs. */
export const nibRotation = (t: ResolvedTip, lineAngle: number): number => (t.angle === 'upright' ? -rad(t.nibAngle) : lineAngle + rad(t.nibAngle));

/** One fill: the path of an oval nib along the line, every step joined into one shape (no seams, no darker overlaps). */
export function nibShapes(s: StrokeShape, t: ResolvedTip): Shape[] | null {
  const b = s.brush;
  if (!s.points.length) return null;
  const sites = sitesFor(s, Math.max(0.8, b.size * 0.22), MAX_NIB_SITES);
  if (!sites.length) return null;
  const ovals: V[][] = [];
  for (const q of sites) {
    const D = b.size * widthFactor(s, q, false);
    if (D < 0.3) continue;
    ovals.push(oval(q.x, q.y, D / 2, Math.max(0.15, (D / 2) * t.roundness), nibRotation(t, q.ang)));
  }
  if (!ovals.length) return null;
  const pieces: Pair[][][] = [];
  const ring = (r: V[]): Pair[][] => [[...r.map((p): Pair => [p[0], p[1]]), [r[0][0], r[0][1]] as Pair]];
  if (ovals.length === 1) pieces.push(ring(ovals[0]));
  for (let i = 1; i < ovals.length; i++) pieces.push(ring(hull([...ovals[i - 1], ...ovals[i]])));
  let paths: SubPath[];
  try {
    const geom = pieces.length > 1 ? polygonClipping.union(pieces[0], ...pieces.slice(1)) : pieces;
    paths = [];
    for (const poly of geom) for (const r of poly) if (r.length > 3) paths.push({ closed: true, points: r.slice(0, -1).map((p) => ({ x: r2(p[0]), y: r2(p[1]) })) });
  } catch {
    // The join failed: keep the pieces side by side, which only looks wrong on a see-through line.
    paths = pieces.map((p) => ({ closed: true, points: p[0].slice(0, -1).map((q) => ({ x: r2(q[0]), y: r2(q[1]) })) }));
  }
  if (!paths.length) return null;
  const fill: FillShape = { id: `${s.id}~n`, type: 'fill', paths, color: s.color, opacity: s.opacity };
  return [fill];
}

// ---------------------------------------------------------------- the line as something to measure along

interface Spine {
  len: number;
  step: number;
  sites: Site[];
  /** Where the line is `d` along it, the way it runs there, how wide it is as a share of full size. */
  at(d: number): { x: number; y: number; ang: number; k: number };
}

function spineFor(s: StrokeShape, widthK: (q: Site) => number): Spine | null {
  const sites = sitesFor(s, Math.max(1, s.brush.size * 0.12), 1200);
  if (sites.length < 2) return null;
  const step = sites[1].d - sites[0].d;
  if (!(step > 0)) return null;
  const len = sites[0].len;
  const ks = sites.map(widthK);
  return {
    len,
    step,
    sites,
    at(d: number) {
      const f = Math.min(sites.length - 1, Math.max(0, d / step));
      const i = Math.min(sites.length - 2, Math.floor(f));
      const u = f - i;
      const a = sites[i];
      const c = sites[i + 1];
      // Blend the direction as a vector, so a turn past a half circle doesn't swing the wrong way.
      const dx = Math.cos(a.ang) * (1 - u) + Math.cos(c.ang) * u;
      const dy = Math.sin(a.ang) * (1 - u) + Math.sin(c.ang) * u;
      return { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u, ang: Math.atan2(dy, dx), k: ks[i] + (ks[i + 1] - ks[i]) * u };
    },
  };
}

// ---------------------------------------------------------------- a drawing as a tile

interface Tile {
  rings: number[][];
  x0: number;
  x1: number;
  /** The middle of its height, and how tall it is. */
  yc: number;
  h: number;
}

/** A tile's measure: the box its outlines fill. Null when it has no height or length to lay along a line. */
export function tileOf(rings: readonly number[][] | undefined): Tile | null {
  if (!rings || !rings.length) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const r of rings) {
    for (let i = 0; i + 1 < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
  }
  if (!(x1 - x0 > 1e-4) || !(y1 - y0 > 1e-4)) return null;
  return { rings: rings as number[][], x0, x1, yc: (y0 + y1) / 2, h: y1 - y0 };
}

/** How long a tile is when its height is the brush size (its natural length, in document pixels). */
export const naturalLength = (t: Tile, size: number): number => ((t.x1 - t.x0) * size) / t.h;

/** A ring with extra points on its edges, so it bends smoothly when it is wrapped along a curve. */
function densify(r: number[], maxEdge: number): number[] {
  const out: number[] = [];
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = r[i * 2];
    const ay = r[i * 2 + 1];
    const bx = r[((i + 1) % n) * 2];
    const by = r[((i + 1) % n) * 2 + 1];
    const parts = Math.min(MAX_TILE_EDGE, Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / maxEdge)));
    for (let k = 0; k < parts; k++) out.push(ax + ((bx - ax) * k) / parts, ay + ((by - ay) * k) / parts);
  }
  return out;
}

/** The tile bent along the line, from `d0` to `d1` along it, as outlines. The tile's top sits on the left of the way the line runs. */
function bendTile(tile: Tile, spine: Spine, d0: number, d1: number, size: number): SubPath[] {
  const w = tile.x1 - tile.x0;
  // Points about every 3 pixels along the line, and no more than that across.
  const maxEdge = Math.max(w / MAX_TILE_EDGE, (w * 3) / Math.max(3, d1 - d0));
  const out: SubPath[] = [];
  const scale = size / tile.h;
  for (const ring of tile.rings) {
    const dense = densify(ring, maxEdge);
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < dense.length; i += 2) {
      const u = (dense[i] - tile.x0) / w;
      const c = spine.at(d0 + u * (d1 - d0));
      const v = (dense[i + 1] - tile.yc) * scale * c.k;
      points.push({ x: r2(c.x - Math.sin(c.ang) * v), y: r2(c.y + Math.cos(c.ang) * v) });
    }
    if (points.length >= 3) out.push({ closed: true, points });
  }
  return out;
}

/** The tile placed as it is, not bent, with its middle at (cx, cy) and turned by `ang`. For a corner. */
function placeTile(tile: Tile, cx: number, cy: number, ang: number, size: number, k: number): SubPath[] {
  const scale = size / tile.h;
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const mx = (tile.x0 + tile.x1) / 2;
  return tile.rings.map((ring) => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < ring.length; i += 2) {
      const lx = (ring[i] - mx) * scale * k;
      const ly = (ring[i + 1] - tile.yc) * scale * k;
      points.push({ x: r2(cx + lx * c - ly * sn), y: r2(cy + lx * sn + ly * c) });
    }
    return { closed: true as const, points };
  });
}

/** One fill for each tile, so tiles that fold over each other on a tight bend show solid, not as holes (a see-through line shows the overlap darker). */
const fillsOf = (s: StrokeShape, tiles: SubPath[][], suffix: string): Shape[] | null => {
  const out: FillShape[] = [];
  tiles.forEach((paths, i) => {
    if (paths.length) out.push({ id: `${s.id}~${suffix}${i}`, type: 'fill', paths, color: s.color, opacity: s.opacity });
  });
  return out.length ? out : null;
};

// ---------------------------------------------------------------- along the line

/** Your drawing down the line: stretched over the whole length, or copies end to end that fit it exactly. */
export function alongShapes(s: StrokeShape, t: ResolvedTip): Shape[] | null {
  const tile = tileOf(t.custom);
  if (!tile) return null;
  const spine = spineFor(s, (q) => widthFactor(s, q, false));
  if (!spine) return null;
  const size = s.brush.size;
  const tiles: SubPath[][] = [];
  if (t.fit === 'repeat') {
    const count = Math.min(MAX_TILES, Math.max(1, Math.round(spine.len / Math.max(1, naturalLength(tile, size)))));
    for (let i = 0; i < count; i++) tiles.push(bendTile(tile, spine, (spine.len * i) / count, (spine.len * (i + 1)) / count, size));
  } else {
    tiles.push(bendTile(tile, spine, 0, spine.len, size));
  }
  return fillsOf(s, tiles, 'a');
}

// ---------------------------------------------------------------- the edged brush

export interface Corner {
  /** How far along the line the corner is, and where it is. */
  d: number;
  x: number;
  y: number;
  /** The way the line runs going in. */
  ang: number;
  /** True when the line turns clockwise on the screen (the drawing's top is then on the outside of the turn). */
  right: boolean;
}

/** The corners of the line: where it turns sharply (about 55 to 135 degrees) between long enough straight runs. */
export function findCorners(spine: Pick<Spine, 'sites' | 'step'>, reach: number): Corner[] {
  const pts = spine.sites.map((q) => ({ x: q.x, y: q.y }));
  if (pts.length < 4) return [];
  const simple = rdp(pts, Math.max(1.5, reach * 0.35));
  const out: Corner[] = [];
  let last = -Infinity;
  for (let i = 1; i < simple.length - 1; i++) {
    const a = simple[i - 1];
    const b = simple[i];
    const c = simple[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (l1 < reach || l2 < reach) continue;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = a2 - a1;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if ((Math.abs(turn) * 180) / Math.PI < 40) continue;
    // Which site is this corner at?
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const dd = Math.hypot(pts[k].x - b.x, pts[k].y - b.y);
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    }
    // A corner turns within a short way (a tight curve takes longer): measure the turn a little each side of it.
    const m = Math.max(2, Math.round((reach * 0.4) / Math.max(0.5, spine.step)));
    const p0 = pts[Math.max(0, best - m)];
    const p1 = pts[best];
    const p2 = pts[Math.min(pts.length - 1, best + m)];
    let local = Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x);
    while (local > Math.PI) local -= Math.PI * 2;
    while (local < -Math.PI) local += Math.PI * 2;
    const deg = (Math.abs(local) * 180) / Math.PI;
    if (deg < 55 || deg > 135 || Math.sign(local) !== Math.sign(turn)) continue;
    const d = spine.sites[best].d;
    if (d - last < reach * 2) continue;
    last = d;
    out.push({ d, x: b.x, y: b.y, ang: a1, right: turn > 0 });
  }
  return out;
}

/** A run of line between two points along it: ends and sides are laid in it. */
interface Run {
  d0: number;
  d1: number;
  first: boolean;
  last: boolean;
}

/** The edged brush: sides repeated to fit, an end drawing at each end and a corner drawing at each corner, where you made them. */
export function edgedShapes(s: StrokeShape, t: ResolvedTip): Shape[] | null {
  const side = tileOf(t.custom);
  if (!side) return null;
  const spine = spineFor(s, (q) => widthFactor(s, q, false));
  if (!spine) return null;
  const size = s.brush.size;
  const start = tileOf(t.pieces.start);
  const end = tileOf(t.pieces.end);
  const inner = tileOf(t.pieces.inner);
  const outer = tileOf(t.pieces.outer);
  const tiles: SubPath[][] = [];
  let runs: Run[] = [{ d0: 0, d1: spine.len, first: true, last: true }];
  if (inner || outer) {
    // Corners are looked for on the line as drawn: smoothing round off the very thing being looked for.
    const raw = stampSites(s.points, Math.max(1, size * 0.12), 0);
    const corners = findCorners({ sites: raw, step: raw.length > 1 ? raw[1].d - raw[0].d : 1 }, size).map((c) => {
      let bestD = c.d;
      let bd = Infinity;
      for (const q of spine.sites) {
        const dd = Math.hypot(q.x - c.x, q.y - c.y);
        if (dd < bd) {
          bd = dd;
          bestD = q.d;
        }
      }
      return { ...c, d: bestD };
    });
    const placed: { c: Corner; tile: Tile }[] = [];
    for (const c of corners) {
      const tile = c.right ? outer : inner;
      if (tile) placed.push({ c, tile });
    }
    runs = [];
    let from = 0;
    for (let i = 0; i < placed.length; i++) {
      const { c, tile } = placed[i];
      const half = naturalLength(tile, size) / 2;
      runs.push({ d0: from, d1: Math.max(from, c.d - half), first: i === 0, last: false });
      from = Math.min(spine.len, c.d + half);
      const k = spine.at(c.d).k;
      tiles.push(placeTile(tile, c.x, c.y, c.ang, size, k));
    }
    runs.push({ d0: from, d1: spine.len, first: placed.length === 0, last: true });
  }
  let used = 0;
  for (const run of runs) {
    let a = run.d0;
    let b = run.d1;
    const len = b - a;
    if (len < size * 0.05) continue;
    const ls = run.first && start ? naturalLength(start, size) : 0;
    const le = run.last && end ? naturalLength(end, size) : 0;
    // Too short for both ends: the sides' room matters more, so the ends are left out.
    const room = ls + le < len * 0.9;
    if (room && ls && start) {
      tiles.push(bendTile(start, spine, a, a + ls, size));
      a += ls;
    }
    if (room && le && end) {
      tiles.push(bendTile(end, spine, b - le, b, size));
      b -= le;
    }
    const mid = b - a;
    if (mid < size * 0.05) continue;
    const count = Math.min(MAX_TILES - used, Math.max(1, Math.round(mid / Math.max(1, naturalLength(side, size)))));
    used += count;
    for (let i = 0; i < count; i++) tiles.push(bendTile(side, spine, a + (mid * i) / count, a + (mid * (i + 1)) / count, size));
  }
  return fillsOf(s, tiles, 'e');
}

// ---------------------------------------------------------------- bristles

/** Many thin lines side by side: they thin to the pen's pressure, wander when floppy and drop out where the brush runs dry. Two path shapes (finer and coarser hairs). */
export function bristleShapes(s: StrokeShape, t: ResolvedTip): Shape[] | null {
  const b = s.brush;
  const spine = spineFor(s, (q) => widthFactor(s, q, false));
  if (!spine) return null;
  const n = Math.max(3, Math.min(60, t.count));
  // Hairs a little wider than their gap, so the row has body but still shows the lines.
  const lineW = Math.max(0.5, (b.size / n) * 1.2);
  const seed = t.seed;
  const floppy = 1 - t.stiffness;
  const step = Math.max(1, Math.min(6, b.size * 0.12));
  const fine: SubPath[] = [];
  const coarse: SubPath[] = [];
  for (let k = 0; k < n; k++) {
    const slot = (k + 0.5) / n - 0.5;
    // Each bristle sits a little off its slot, so the row isn't a comb.
    const home = slot + (hash3(seed, k, 1) - 0.5) * (0.6 / n);
    const into = hash3(seed, k, 2) < 0.45 ? fine : coarse;
    let run: { x: number; y: number }[] = [];
    const flush = () => {
      if (run.length >= 2) into.push({ closed: false, points: run });
      else if (run.length === 1) into.push({ closed: false, points: [run[0], { x: run[0].x + 0.01, y: run[0].y }] });
      run = [];
    };
    for (let d = 0; d <= spine.len + 1e-6; d += step) {
      const c = spine.at(Math.min(d, spine.len));
      // Dry gaps: a slow noise along the bristle, more of it as `amount` goes up and where the pen is light.
      const dry = t.amount * (0.9 + 0.5 * (1 - Math.min(1, c.k)));
      if (vnoise(d / (b.size * 0.9 + 4), k * 9.3, seed + 7) < dry * 0.75) {
        flush();
        continue;
      }
      const wander = floppy * b.size * 0.16 * (vnoise(d / (b.size * 1.6 + 6) + k * 5.1, k * 3.7, seed + 3) - 0.5) * 2;
      const v = (home * b.size + wander) * c.k;
      run.push({ x: r2(c.x - Math.sin(c.ang) * v), y: r2(c.y + Math.cos(c.ang) * v) });
    }
    flush();
  }
  const out: Shape[] = [];
  const make = (paths: SubPath[], w: number, id: string): void => {
    if (!paths.length) return;
    const shape: PathShape = { id: `${s.id}~${id}`, type: 'path', paths, fill: null, stroke: { color: s.color, width: r2(w), join: 'round', cap: 'round' }, opacity: s.opacity };
    out.push(shape);
  };
  make(coarse, lineW * 1.15, 'b0');
  make(fine, lineW * 0.7, 'b1');
  return out.length ? out : null;
}
