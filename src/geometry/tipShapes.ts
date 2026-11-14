// What a brush tip draws, as plain shapes. A tipped line is still kept as its points (a StrokeShape with `brush.tip`);
// this turns it into ordinary fills and lines when it is drawn or exported, so every format that can draw a fill can
// draw it, as vector, with nothing to flatten:
//   chalk, charcoal  one fill with the grain cut out of it as tiny holes, and a rough edge
//   watercolour      a soft halo, a see-through body and a darker line round the edge
//   stamp            one small fill for each stamp along the line
// The grain sits on a grid fixed to the page, not to the line, so two lines over each other show the same paper.
// Pure, no DOM. The outline of the line itself comes in as a function (render.ts), which keeps this file free of it.
import polygonClipping, { type Pair } from 'polygon-clipping';
import type { BrushSettings, FillShape, PathShape, Shape, StrokeShape, SubPath } from '../core/format';
import { plainBrush, resolveTip, type ResolvedTip } from './tip';
import { alongShapes, bristleShapes, edgedShapes, nibShapes } from './tipRibbon';

/** The outline polygon of a line drawn with this brush (the line's own, whatever tip it has). */
export type OutlineFn = (s: StrokeShape, b: BrushSettings) => number[][];

type V = [number, number];

/** Most stamps on one line, and most grain holes in one line. Bigger lines get fewer, bigger ones instead. */
export const MAX_STAMPS = 3000;
export const MAX_HOLES = 12000;
const MAX_CELLS = 300000;

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- random numbers that stay put

/** A steady number from 0 up to 1 for three whole numbers. */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth noise from 0 up to 1: steady numbers on a grid, blended between. */
export function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, seed);
  const b = hash3(ix + 1, iy, seed);
  const c = hash3(ix, iy + 1, seed);
  const d = hash3(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------- outlines

/** The line's outline as a ring of points, drawn the way the canvas draws it (quadratic curves through the midpoints). */
export function ringFrom(o: number[][], per = 2): V[] {
  const n = o.length;
  if (n < 3) return [];
  if (n < 4) return o.map((p) => [p[0], p[1]]);
  const out: V[] = [[o[0][0], o[0][1]]];
  let cx = o[0][0];
  let cy = o[0][1];
  for (let i = 0; i < n; i++) {
    const a = o[i];
    const b = o[(i + 1) % n];
    const ex = (a[0] + b[0]) / 2;
    const ey = (a[1] + b[1]) / 2;
    for (let k = 1; k <= per; k++) {
      const t = k / per;
      const mt = 1 - t;
      out.push([mt * mt * cx + 2 * mt * t * a[0] + t * t * ex, mt * mt * cy + 2 * mt * t * a[1] + t * t * ey]);
    }
    cx = ex;
    cy = ey;
  }
  return out;
}

/** A closed ring with its points `step` apart (the first point stays). */
export function resample(ring: readonly V[], step: number): V[] {
  const n = ring.length;
  const out: V[] = [];
  if (n < 2) return ring.map((p) => [p[0], p[1]]);
  let next = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next < len - 1e-9 && out.length < 200000) {
      const t = len ? next / len : 0;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      next += step;
    }
    next -= len;
  }
  return out;
}

/** Pushes a ring's points in and out along the edge, by noise tied to where they are on the page (so the edge is steady). */
export function roughen(ring: readonly V[], amp: number, scale: number, seed: number): V[] {
  const n = ring.length;
  if (n < 3 || amp <= 0) return ring.map((p) => [p[0], p[1]]);
  return ring.map((p, i) => {
    const a = ring[(i + n - 1) % n];
    const b = ring[(i + 1) % n];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const d = (vnoise(p[0] / scale, p[1] / scale, seed) - 0.5) * 2 * amp + (vnoise(p[0] / (scale * 0.35) + 11, p[1] / (scale * 0.35), seed + 1) - 0.5) * amp * 0.8;
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

// ---------------------------------------------------------------- which grid cells are inside

interface Cover {
  g: number;
  /** The grid's first cell, in whole cells from the page's corner. */
  gx0: number;
  gy0: number;
  nx: number;
  ny: number;
  /** 1 where the middle of the cell is inside. */
  inside: Uint8Array;
  /** The most rings that lie over each other anywhere (2 or more means the line crosses itself). */
  maxWind: number;
}

/** Which cells of a page-fixed grid have their middle inside the rings. `evenOdd` false counts overlaps as inside (as the canvas does). */
export function cover(rings: readonly (readonly V[])[], g0: number, evenOdd: boolean): Cover | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings) for (const p of r) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  if (!(x1 > x0) || !(y1 > y0)) return null;
  let g = g0;
  const cells = ((x1 - x0) / g + 2) * ((y1 - y0) / g + 2);
  if (cells > MAX_CELLS) g *= Math.sqrt(cells / MAX_CELLS);
  const gx0 = Math.floor(x0 / g);
  const gy0 = Math.floor(y0 / g);
  const nx = Math.ceil(x1 / g) - gx0 + 1;
  const ny = Math.ceil(y1 / g) - gy0 + 1;
  const rows: number[][] = new Array(ny);
  for (const r of rings) {
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const a = r[i];
      const b = r[(i + 1) % n];
      if (a[1] === b[1]) continue;
      const dir = b[1] > a[1] ? 1 : -1;
      const lo = Math.min(a[1], b[1]);
      const hi = Math.max(a[1], b[1]);
      const j0 = Math.max(0, Math.ceil(lo / g - 0.5 - gy0));
      const j1 = Math.min(ny - 1, Math.ceil(hi / g - 0.5 - gy0) - 1);
      for (let j = j0; j <= j1; j++) {
        const yc = (gy0 + j + 0.5) * g;
        const x = a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        (rows[j] ??= []).push(x, dir);
      }
    }
  }
  const inside = new Uint8Array(nx * ny);
  let maxWind = 0;
  for (let j = 0; j < ny; j++) {
    const ev = rows[j];
    if (!ev) continue;
    const idx: number[] = [];
    for (let k = 0; k < ev.length; k += 2) idx.push(k);
    idx.sort((p, q) => ev[p] - ev[q]);
    let w = 0;
    let e = 0;
    for (let i = 0; i < nx; i++) {
      const cx = (gx0 + i + 0.5) * g;
      while (e < idx.length && ev[idx[e]] <= cx) w += ev[idx[e++] + 1];
      const aw = Math.abs(w);
      if (aw > maxWind) maxWind = aw;
      inside[j * nx + i] = (evenOdd ? aw % 2 === 1 : aw > 0) ? 1 : 0;
    }
  }
  return { g, gx0, gy0, nx, ny, inside, maxWind };
}

// ---------------------------------------------------------------- chalk and charcoal

const toPath = (ring: readonly V[]): SubPath => ({ closed: true, points: ring.map((p) => ({ x: r2(p[0]), y: r2(p[1]) })) });

/** The rings of an outline with its overlaps joined (a line that crosses itself would otherwise show holes where it does). */
function joined(ring: V[]): V[][] {
  const pairs = ring.map((p): Pair => [p[0], p[1]]);
  pairs.push(pairs[0]);
  let geom: ReturnType<typeof polygonClipping.union> = [];
  try {
    geom = polygonClipping.union([[pairs]]);
  } catch {
    return [ring];
  }
  const out: V[][] = [];
  for (const poly of geom) for (const r of poly) if (r.length > 3) out.push(r.slice(0, -1).map((p): V => [p[0], p[1]]));
  return out.length ? out : [ring];
}

interface Grain {
  /** Grid cell size and how hard the edge is pushed about, in document pixels. */
  g: number;
  edge: number;
  /** How big the clumps in the grain are, in cells. */
  clump: number;
}

function grainFor(kind: 'chalk' | 'charcoal', t: ResolvedTip, size: number): Grain {
  const base = Math.max(1.2, Math.min(4.5 * t.grain, size * 0.32));
  return kind === 'chalk' ? { g: base, edge: 0.3 * base, clump: 5 } : { g: base, edge: 0.7 * base, clump: 3 };
}

function grainShape(s: StrokeShape, outline: number[][], kind: 'chalk' | 'charcoal', t: ResolvedTip): Shape[] | null {
  const size = s.brush.size;
  const gr = grainFor(kind, t, size);
  const base = ringFrom(outline, 2);
  if (base.length < 4) return null;
  // Join the outline's overlaps, when it has any.
  const first = cover([base], gr.g, false);
  if (!first) return null;
  const clean = first.maxWind >= 2 ? joined(base) : [base];
  // A rough edge, with points close enough together to show it.
  const step = Math.max(0.7, gr.g * 0.6);
  const rough = clean.map((r) => roughen(resample(r, step), gr.edge, gr.g * 2.5, kind === 'chalk' ? 3 : 5));
  const paths: SubPath[] = rough.filter((r) => r.length >= 3).map(toPath);
  const holes = grainHoles(rough, gr, t.amount, kind);
  for (const h of holes) paths.push(h);
  const fill: FillShape = { id: `${s.id}~t`, type: 'fill', paths, color: s.color, opacity: s.opacity };
  return [fill];
}

function grainHoles(rings: readonly V[][], gr: Grain, amount: number, kind: 'chalk' | 'charcoal'): SubPath[] {
  // A finer grid than the grain's own says what is inside, so a hole can sit right up to the edge without crossing it.
  const fine = cover(rings, gr.g / 3, true);
  if (!fine) return [];
  const inside = (x: number, y: number): boolean => {
    const i = Math.floor(x / fine.g) - fine.gx0;
    const j = Math.floor(y / fine.g) - fine.gy0;
    return i >= 0 && j >= 0 && i < fine.nx && j < fine.ny && fine.inside[j * fine.nx + i] === 1;
  };
  const g = Math.max(gr.g, fine.g * 3);
  const gx0 = Math.floor((fine.gx0 * fine.g) / g);
  const gy0 = Math.floor((fine.gy0 * fine.g) / g);
  const gx1 = Math.ceil(((fine.gx0 + fine.nx) * fine.g) / g);
  const gy1 = Math.ceil(((fine.gy0 + fine.ny) * fine.g) / g);
  const nx = gx1 - gx0;
  const seed = kind === 'chalk' ? 17 : 29;
  // A bigger line has more cells than it can keep holes for: thin them evenly rather than stopping part way.
  let candidates = 0;
  for (let gy = gy0; gy < gy1; gy++) for (let gx = gx0; gx < gx1; gx++) if (inside((gx + 0.5) * g, (gy + 0.5) * g)) candidates++;
  const keep = Math.min(1, MAX_HOLES / Math.max(1, candidates * Math.max(0.05, amount)));
  const out: SubPath[] = [];
  const used = new Set<number>();
  const make = (cx: number, cy: number, rad: number, gx: number, gy: number, k0: number): SubPath | null => {
    const n = hash3(gx, gy, seed + k0) < 0.5 ? 5 : 6;
    const rot = hash3(gx, gy, seed + k0 + 1) * Math.PI * 2;
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + (hash3(gx, gy, seed + k0 + 10 + k) - 0.5) * 0.8;
      const r = rad * (0.75 + 0.5 * hash3(gx, gy, seed + k0 + 20 + k));
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      // Inside with room to spare on every side, so the hole never reaches the edge.
      const m = fine.g * 0.75;
      if (!inside(x, y) || !inside(x + m, y) || !inside(x - m, y) || !inside(x, y + m) || !inside(x, y - m)) return null;
      pts.push({ x: r2(x), y: r2(y) });
    }
    return { closed: true, points: pts };
  };
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const at = (gy - gy0) * nx + (gx - gx0);
      if (used.has(at) || !inside((gx + 0.5) * g, (gy + 0.5) * g)) continue;
      const clump = vnoise(gx / gr.clump, gy / gr.clump, seed);
      const p = Math.min(0.95, amount * (kind === 'chalk' ? 2.1 : 2.2) * (0.25 + 1.1 * clump));
      if (hash3(gx, gy, seed + 2) >= p) continue;
      if (keep < 1 && hash3(gx, gy, seed + 9) >= keep) continue;
      // Now and then a bigger gap, over four cells, where the grain is thick.
      if (clump > 0.45 && hash3(gx, gy, seed + 3) < 0.25 && !used.has(at + 1) && !used.has(at + nx) && !used.has(at + nx + 1)) {
        const big = make((gx + 1 + (hash3(gx, gy, seed + 4) - 0.5) * 0.2) * g, (gy + 1 + (hash3(gx, gy, seed + 5) - 0.5) * 0.2) * g, g * (0.45 + 0.2 * hash3(gx, gy, seed + 6)), gx, gy, 30);
        if (big) {
          used.add(at).add(at + 1).add(at + nx).add(at + nx + 1);
          out.push(big);
          continue;
        }
      }
      const small = make((gx + 0.5 + (hash3(gx, gy, seed + 4) - 0.5) * 0.4) * g, (gy + 0.5 + (hash3(gx, gy, seed + 5) - 0.5) * 0.4) * g, g * (0.26 + 0.18 * hash3(gx, gy, seed + 6)), gx, gy, 60);
      if (small) out.push(small);
    }
  }
  return out;
}

// ---------------------------------------------------------------- watercolour

function watercolourShapes(s: StrokeShape, outline: number[][], t: ResolvedTip): Shape[] | null {
  const b = s.brush;
  const plain = plainBrush(b);
  const ring0 = ringFrom(outline, 2);
  if (ring0.length < 4) return null;
  // Where the line crosses itself the edge goes round the whole shape, not through the middle of it.
  const probe = cover([ring0], Math.max(1.5, b.size * 0.2), false);
  const rings = probe && probe.maxWind >= 2 ? joined(ring0) : [ring0];
  const k = 0.4 + t.amount;
  // A soft halo just past the edge, the body, and a darker line along the edge where the paint gathers.
  const halo: StrokeShape = { ...s, id: `${s.id}~w0`, brush: { ...plain, size: b.size * 1.28 }, opacity: s.opacity * 0.14 * k };
  const body: StrokeShape = { ...s, id: `${s.id}~w1`, brush: plain, opacity: s.opacity * 0.5 };
  const wob = rings.map((r) => roughen(resample(r, Math.max(1.2, b.size * 0.12)), b.size * 0.035, b.size * 1.5, 41));
  const rim: PathShape = {
    id: `${s.id}~w2`,
    type: 'path',
    paths: wob.map(toPath),
    fill: null,
    stroke: { color: s.color, width: Math.max(0.8, b.size * 0.09 * k), join: 'round', cap: 'round' },
    opacity: Math.min(1, s.opacity * 0.6 * k),
  };
  return [halo, body, rim];
}

// ---------------------------------------------------------------- stamps

const circle = (n: number): number[] => {
  const o: number[] = [];
  for (let i = 0; i < n; i++) o.push(Math.cos((i / n) * Math.PI * 2) * 0.5, Math.sin((i / n) * Math.PI * 2) * 0.5);
  return o;
};

function leaf(): number[] {
  const o: number[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    o.push(-0.5 + t, -0.27 * Math.pow(Math.sin(Math.PI * t), 0.85));
  }
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    o.push(-0.5 + t, 0.27 * Math.pow(Math.sin(Math.PI * t), 0.85));
  }
  return o;
}

function star(): number[] {
  const o: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.2 : 0.5;
    o.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return o;
}

function heart(): number[] {
  const o: number[] = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    o.push((x / 34) * 1, (y / 34) * 1 + 0.03);
  }
  return o;
}

function dash(): number[] {
  const o: number[] = [];
  const r = 0.11;
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI;
    o.push(0.5 - r + Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI / 2 + (i / 6) * Math.PI;
    o.push(-0.5 + r + Math.cos(a) * r, Math.sin(a) * r);
  }
  return o;
}

/** An ellipse as a closed outline, turned by `rot` radians. `top` below 1 squashes the upper half (a pad with a fuller bottom). */
function oval(cx: number, cy: number, rx: number, ry: number, rot: number, n: number, top = 1): number[] {
  const o: number[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = rx * Math.cos(a);
    const sy = Math.sin(a);
    const y = ry * sy * (sy < 0 ? top : 1);
    o.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return o;
}

/** A paw print: a main pad and four toes, toes at the top. Five outlines, so it comes back as a list. */
function pawRings(): number[][] {
  return [oval(0, 0.2, 0.27, 0.23, 0, 24, 0.8), oval(-0.38, -0.03, 0.1, 0.15, -0.35, 14), oval(-0.14, -0.3, 0.11, 0.155, -0.1, 14), oval(0.14, -0.3, 0.11, 0.155, 0.1, 14), oval(0.38, -0.03, 0.1, 0.15, 0.35, 14)];
}

const BUILT_IN: Record<string, () => number[]> = {
  dot: () => circle(16),
  leaf,
  star,
  diamond: () => [-0.5, 0, 0, -0.3, 0.5, 0, 0, 0.3],
  dash,
  heart,
};
const builtCache = new Map<string, number[]>();
let pawCache: number[][] | undefined;

/** The outlines of a stamp, 1 unit across and centred on 0, as flat lists of x, y. */
export function stampRings(shape: string, custom: number[][]): number[][] {
  if (shape === 'custom' && custom.length) return custom;
  if (shape === 'paw') return (pawCache ??= pawRings());
  let r = builtCache.get(shape);
  if (!r) {
    r = (BUILT_IN[shape] ?? BUILT_IN.leaf)();
    builtCache.set(shape, r);
  }
  return [r];
}

/** The pressure at a point as a share of the full width (a pen's, or 1 when nothing varied). */
function widthAt(p: number, thinning: number): number {
  return Math.max(0.15, 2 * (0.5 - thinning * (0.5 - p)));
}

/** Where along a line to put stamps: points `step` apart with the way the line runs and the pressure there. */
export function stampSites(points: readonly { x: number; y: number; p: number }[], step: number, smooth: number): { x: number; y: number; ang: number; p: number; d: number; len: number }[] {
  const pts: { x: number; y: number; p: number }[] = [];
  for (const q of points) {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(q.x - l.x, q.y - l.y) > 0.25) pts.push({ x: q.x, y: q.y, p: q.p });
  }
  if (pts.length < 2) return pts.length ? [{ x: pts[0].x, y: pts[0].y, ang: 0, p: pts[0].p, d: 0, len: 0 }] : [];
  for (let pass = 0; pass < smooth; pass++) {
    const nxt = pts.map((p) => ({ ...p }));
    for (let i = 1; i < pts.length - 1; i++) {
      nxt[i].x = (pts[i - 1].x + 2 * pts[i].x + pts[i + 1].x) / 4;
      nxt[i].y = (pts[i - 1].y + 2 * pts[i].y + pts[i + 1].y) / 4;
    }
    for (let i = 0; i < pts.length; i++) pts[i] = nxt[i];
  }
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const L = cum[cum.length - 1];
  if (L <= 0) return [{ x: pts[0].x, y: pts[0].y, ang: 0, p: pts[0].p, d: 0, len: 0 }];
  let st = Math.max(0.5, step);
  if (L / st + 1 > MAX_STAMPS) st = L / (MAX_STAMPS - 1);
  const at = (d: number): { x: number; y: number; p: number } => {
    let k = 1;
    while (k < cum.length - 1 && cum[k] < d) k++;
    const seg = cum[k] - cum[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[k - 1]) / seg));
    return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t, p: pts[k - 1].p + (pts[k].p - pts[k - 1].p) * t };
  };
  const out: { x: number; y: number; ang: number; p: number; d: number; len: number }[] = [];
  const n = Math.floor(L / st) + 1;
  const look = Math.min(st * 0.75, L / 2);
  for (let i = 0; i < n; i++) {
    const d = i * st;
    const a = at(Math.max(0, d - look));
    const b = at(Math.min(L, d + look));
    const c = at(d);
    out.push({ x: c.x, y: c.y, ang: Math.atan2(b.y - a.y, b.x - a.x), p: c.p, d, len: L });
  }
  return out;
}

function stampShapes(s: StrokeShape, t: ResolvedTip): Shape[] | null {
  const b = s.brush;
  const pts = s.points;
  if (!pts.length) return null;
  const rings = stampRings(t.shape, t.custom);
  const flat = !s.realPressure && pts.every((p) => p.p === 0.5);
  const sites = stampSites(pts, t.spacing * b.size, Math.round(b.streamline * 3));
  const out: FillShape[] = [];
  const seed = t.seed;
  sites.forEach((q, i) => {
    let k = flat || t.fixedSize ? 1 : widthAt(q.p, b.thinning);
    k *= 1 - t.jitter * 0.7 * hash3(seed, i, 1);
    if (b.taperStart > 0) k *= 0.12 + 0.88 * Math.min(1, (q.d + b.size * 0.25) / b.taperStart);
    if (b.taperEnd > 0) k *= 0.12 + 0.88 * Math.min(1, (q.len - q.d + b.size * 0.25) / b.taperEnd);
    const D = b.size * k;
    if (D < 0.3) return;
    let ang = t.angle === 'follow' ? q.ang + (hash3(seed, i, 2) - 0.5) * t.jitter * 0.8 : t.angle === 'random' ? hash3(seed, i, 2) * Math.PI * 2 : (hash3(seed, i, 2) - 0.5) * t.jitter * 0.5;
    // Shapes drawn upright (a heart, a paw, anything you made) have their top at the front when they follow the line.
    if ((t.shape === 'heart' || t.shape === 'paw' || t.shape === 'custom') && t.angle === 'follow') ang += Math.PI / 2;
    if (t.turn > 0) ang += (hash3(seed, i, 4) - 0.5) * 2 * Math.PI * t.turn;
    const off = (hash3(seed, i, 3) - 0.5) * 2 * t.scatter * b.size;
    // The gap between stamps varies by sliding each one along the line.
    const slide = t.gapVary > 0 ? (hash3(seed, i, 5) - 0.5) * t.gapVary * t.spacing * b.size * 0.9 : 0;
    const ox = q.x - Math.sin(q.ang) * off + Math.cos(q.ang) * slide;
    const oy = q.y + Math.cos(q.ang) * off + Math.sin(q.ang) * slide;
    const co = Math.cos(ang) * D;
    const si = Math.sin(ang) * D;
    const paths: SubPath[] = rings.map((r) => {
      const points: { x: number; y: number }[] = [];
      for (let m = 0; m < r.length; m += 2) points.push({ x: r2(ox + r[m] * co - r[m + 1] * si), y: r2(oy + r[m] * si + r[m + 1] * co) });
      return { closed: true, points };
    });
    out.push({ id: `${s.id}~s${i}`, type: 'fill', paths, color: s.color, opacity: s.opacity });
  });
  if (!out.length) return null;
  // See-through stamps would show darker where they overlap, which no single brush mark does: join them.
  if (s.opacity < 1 && rings.length === 1 && out.length > 1) return joinedStamps(s, out);
  return out;
}

function joinedStamps(s: StrokeShape, stamps: FillShape[]): Shape[] {
  try {
    const polys = stamps.map((f): Pair[][] => [[...f.paths[0].points.map((p): Pair => [p.x, p.y]), [f.paths[0].points[0].x, f.paths[0].points[0].y] as Pair]]);
    const geom = polygonClipping.union(polys[0], ...polys.slice(1));
    const paths: SubPath[] = [];
    for (const poly of geom) for (const ring of poly) if (ring.length > 3) paths.push({ closed: true, points: ring.slice(0, -1).map((p) => ({ x: r2(p[0]), y: r2(p[1]) })) });
    return paths.length ? [{ id: `${s.id}~s`, type: 'fill', paths, color: s.color, opacity: s.opacity } as FillShape] : stamps;
  } catch {
    return stamps;
  }
}

// ---------------------------------------------------------------- the front door

/** True when this line has a tip that turns it into other shapes. */
export const hasTip = (s: StrokeShape): boolean => !!s.brush.tip;

/**
 * The plain shapes a tipped line is made of, or null when it has no tip (or too little to draw): draw it the usual
 * way then. `outlineOf` gives the outline of the line for a brush (render.ts).
 */
export function tipShapes(s: StrokeShape, outlineOf: OutlineFn): Shape[] | null {
  const tip = s.brush.tip;
  if (!tip) return null;
  const t = resolveTip(tip);
  if (t.kind === 'stamp') return stampShapes(s, t);
  if (t.kind === 'nib') return nibShapes(s, t);
  if (t.kind === 'along') return alongShapes(s, t);
  if (t.kind === 'edged') return edgedShapes(s, t);
  if (t.kind === 'bristle') return bristleShapes(s, t);
  const o = outlineOf(s, s.brush);
  if (o.length < 3) return null;
  return t.kind === 'watercolour' ? watercolourShapes(s, o, t) : grainShape(s, o, t.kind, t);
}
