/**
 * Paper tooth for vector lines: the dry media's paper and maths (see paper.ts and maths.ts), run on a drawn line instead of
 * a pixel layer. The line stays its points. When it is drawn, dabs go along it the way the pixel tool lays them, each as
 * wide as the line is there and as hard as the pen pressed, and every pixel takes pigment from that reach and the height of
 * the paper under it. The paper tile is held still against the page (in document pixels), so two lines over each other
 * meet the same bumps. Pure: no DOM, so it is the same in a test, the canvas and an export.
 */
import { getStrokePoints } from 'perfect-freehand';
import type { StrokePoint } from '../core/format';
import { deposit, mediumInfo, pitDepth, streakAt, type DryId } from './maths';
import { PAPERS, paperInfo, paperTile, TILE, type PaperKind } from './paper';

/** What a paper tooth effect keeps, in the units the Effects panel shows (see effects/model.ts). */
export interface ToothParams {
  /** How hard the stick is pressed, 0 to 1. A pen's pressure scales it along the line. */
  press: number;
  /** How firm the edge is, 0 (soft all the way in) to 1 (hard). */
  hardness: number;
  /** How much the paper's bumps decide where pigment lands, 0 to 1. */
  tooth: number;
  /** How gradually a pixel goes from bare to covered. */
  soft: number;
  /** The most of a pixel one pass can cover. */
  ceiling: number;
  /** How much the stick's own bumps streak the mark, 0 to 1. */
  streak: number;
  paper: PaperKind;
  /** How many document pixels one pixel of the paper tile covers (1 is the usual grain). */
  grain: number;
  /** Which stick: the streaks differ from one line to the next. */
  seed: number;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The effect's settings (percent and so on) as the numbers the maths wants. */
export function toothParams(v: Record<string, number | string>): ToothParams {
  const pct = (k: string, d: number) => Math.min(1, Math.max(0, num(Number(v[k]), d) / 100));
  const paper = PAPERS[Math.min(PAPERS.length - 1, Math.max(0, Math.round(num(Number(v.paper), 2))))].id;
  return {
    press: Math.max(0.02, pct('press', 80)),
    hardness: pct('edge', 30),
    tooth: pct('tooth', 100),
    soft: Math.max(0.03, pct('soft', 42)),
    ceiling: Math.max(0.05, pct('cover', 98)),
    streak: pct('streak', 35),
    paper,
    grain: Math.min(8, Math.max(0.25, num(Number(v.grain), 1))),
    seed: Math.round(num(Number(v.seed), 0)),
  };
}

/** The affine map from document pixels to the canvas they are drawn on, and its inverse. */
export interface View {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: View = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const scaleOf = (m: View): number => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;

/** One dab of the stick, in canvas pixels. */
export interface Dab {
  x: number;
  y: number;
  /** Radius in canvas pixels. */
  r: number;
  /** How far the stick reaches into the paper (the pressure), 0 to 1. */
  s: number;
  /** The way the stick is moving, a unit step, in canvas pixels. */
  dx: number;
  dy: number;
}

/** How much a pen's pressure changes the stick's reach: the usual (0.5) is a share of 1, light is under it, hard is over. */
export const pressureReach = (p: number): number => 0.25 + 1.5 * Math.min(1, Math.max(0, p));

/** How a line's width comes about (the brush's own settings, see core/render.ts), so the dabs are as wide as the outline is. */
export interface WidthLaw {
  size: number;
  thinning: number;
  streamline: number;
  /** Widths worked out from the speed (a mouse) rather than taken from the pen. */
  simulate: boolean;
  taperStart: number;
  taperEnd: number;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The pressure a mouse stroke is given from its speed, as perfect-freehand does it (kept in step with its `getStrokeOutlinePoints`). */
const speedPressure = (prev: number, dist: number, size: number): number => {
  const r = Math.min(1, dist / size);
  return Math.min(1, prev + (Math.min(1, 1 - r) - prev) * (r * 0.275));
};

type Sp = ReturnType<typeof getStrokePoints>;

/** The radius of the line at each of its smoothed points, in document pixels: the same law perfect-freehand draws the outline with. */
export function radiiOf(sp: Sp, w: WidthLaw): number[] {
  const total = sp[sp.length - 1].runningLength;
  const taper = (v: number): number => (v > 0 ? v : 0);
  const t0 = taper(w.taperStart);
  const t1 = taper(w.taperEnd);
  // Where the speed-made pressure starts from: the first ten points averaged.
  let prev = sp[0].pressure;
  for (const q of sp.slice(0, 10)) prev = (prev + (w.simulate ? speedPressure(prev, q.distance, w.size) : q.pressure)) / 2;
  const out: number[] = [];
  for (const q of sp) {
    let p = q.pressure;
    let r = w.size / 2;
    if (w.thinning) {
      if (w.simulate) p = speedPressure(prev, q.distance, w.size);
      r = w.size * (0.5 - w.thinning * (0.5 - p));
    }
    const s = t0 > 0 && q.runningLength < t0 ? (q.runningLength / t0) * (2 - q.runningLength / t0) : 1;
    const e = t1 > 0 && total - q.runningLength < t1 ? (() => { const u = (total - q.runningLength) / t1 - 1; return u * u * u + 1; })() : 1;
    out.push(Math.max(0.01, r * Math.min(s, e)));
    prev = p;
  }
  return out;
}

/** How many points per document pixel the stick's bumps are worked out at. */
const STREAK_RES = 8;

/** The most dabs a line gets, so a very long line spaces them a little further apart rather than taking a second to draw. */
export const MAX_DABS = 2500;

/**
 * The dabs that make a line: along its middle at a spacing of a tenth of the width there, each as wide as the line is
 * there and as hard as the pressure at that point. `points` are the line's points (after any trim), `m` how the page
 * lands on the canvas.
 */
export function strokeDabs(points: readonly StrokePoint[], w: WidthLaw, press: number, m: View = IDENTITY): Dab[] {
  if (!points.length) return [];
  const sp = getStrokePoints(
    points.map((p) => [p.x, p.y, p.p]),
    { size: w.size, streamline: w.streamline, last: true },
  );
  if (!sp.length) return [];
  const rad = radiiOf(sp, w);
  const k = scaleOf(m);
  const px = (i: number) => sp[i].point[0] * m.a + sp[i].point[1] * m.c + m.e;
  const py = (i: number) => sp[i].point[0] * m.b + sp[i].point[1] * m.d + m.f;
  // The whole length, to cap the dab count.
  let total = 0;
  for (let i = 1; i < sp.length; i++) total += Math.hypot(px(i) - px(i - 1), py(i) - py(i - 1));
  const out: Dab[] = [];
  let hx = 1;
  let hy = 0;
  let owed = 0;
  const stepMin = Math.max(0, total / MAX_DABS);
  const put = (x: number, y: number, p: number, r: number, dx: number, dy: number): number => {
    const rc = Math.max(0.5, r * k);
    // Turn toward the new heading a little at a time, so a corner does not make the streaks jump.
    if (dx !== 0 || dy !== 0) {
      hx += (dx - hx) * 0.35;
      hy += (dy - hy) * 0.35;
      const n = Math.hypot(hx, hy) || 1;
      hx /= n;
      hy /= n;
    }
    out.push({ x, y, r: rc, s: Math.min(1, press * pressureReach(p)), dx: hx, dy: hy });
    return Math.max(stepMin, rc * 0.3, 0.5);
  };
  let step = put(px(0), py(0), sp[0].pressure, rad[0], 0, 0);
  for (let i = 1; i < sp.length; i++) {
    const x0 = px(i - 1);
    const y0 = py(i - 1);
    const x1 = px(i);
    const y1 = py(i);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    let at = step - owed;
    while (at <= len) {
      const t = at / len;
      step = put(mix(x0, x1, t), mix(y0, y1, t), mix(sp[i - 1].pressure, sp[i].pressure, t), mix(rad[i - 1], rad[i], t), dx, dy);
      at += step;
    }
    owed = len - (at - step);
  }
  // The very end of the line always gets a dab, so a taper or a cap is not cut short.
  const last = sp.length - 1;
  put(px(last), py(last), sp[last].pressure, rad[last], 0, 0);
  return out;
}

/** A picture of pigment: straight RGBA bytes for the box at (x, y), w by h canvas pixels. */
export interface ToothPicture {
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/** The paper's height at a point of the page (document pixels), 0 to 1, mixed from the four tile pixels round it. */
export function paperAtPoint(tile: Uint8Array, u: number, v: number): number {
  const fx = u - 0.5;
  const fy = v - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const wx = fx - ix;
  const wy = fy - iy;
  const x0 = ((ix % TILE) + TILE) % TILE;
  const y0 = ((iy % TILE) + TILE) % TILE;
  const x1 = (x0 + 1) % TILE;
  const y1 = (y0 + 1) % TILE;
  const a = tile[y0 * TILE + x0];
  const b = tile[y0 * TILE + x1];
  const c = tile[y1 * TILE + x0];
  const d = tile[y1 * TILE + x1];
  return (a + (b - a) * wx + (c - a) * wy + (a - b - c + d) * wx * wy) / 255;
}

/** The inverse of a view (a plain affine inverse), for turning a canvas pixel back into a page point. */
export function invert(m: View): View {
  const det = m.a * m.d - m.b * m.c || 1;
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

/** The one pixel's pigment: how much of it the paper lets the stick cover at this reach. */
export function pigment(p: ToothParams, height: number, reach: number): number {
  return deposit(reach, pitDepth(height, paperInfo(p.paper).tooth, p.tooth), 0, { soft: p.soft, ceiling: p.ceiling, lift: 0 });
}

/**
 * The finished picture of a line: every pixel the dabs reach takes pigment from the deepest dab there and the paper's
 * height at that point of the page. `clip` keeps the box inside the canvas (so a huge zoom does not make a huge box).
 * Returns null when nothing is drawn.
 */
export function toothStroke(dabs: readonly Dab[], p: ToothParams, rgb: readonly [number, number, number], opacity: number, m: View = IDENTITY, clip?: { w: number; h: number }): ToothPicture | null {
  if (!dabs.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of dabs) {
    x0 = Math.min(x0, d.x - d.r - 1);
    y0 = Math.min(y0, d.y - d.r - 1);
    x1 = Math.max(x1, d.x + d.r + 1);
    y1 = Math.max(y1, d.y + d.r + 1);
  }
  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  x1 = Math.ceil(x1);
  y1 = Math.ceil(y1);
  if (clip) {
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(clip.w, x1);
    y1 = Math.min(clip.h, y1);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 1 || h < 1) return null;
  const k = scaleOf(m);
  const reach = new Float32Array(w * h);
  // How the stick's bumps vary across the line, worked out once on a fine row of points (the dabs only ever ask for these).
  let widest = 0;
  for (const d of dabs) widest = Math.max(widest, d.r);
  const half = Math.ceil((widest + 2) / k);
  const bump = new Float32Array(2 * half * STREAK_RES + 2);
  if (p.streak > 0) for (let i = 0; i < bump.length; i++) bump[i] = 1 - p.streak * streakAt(i / STREAK_RES - half, p.seed);
  else bump.fill(1);
  for (const d of dabs) {
    const r = d.r;
    // The same soft edge as the pixel tool's dab (falloff in soft/maths.ts), written out so a dab costs little.
    const edge = Math.max((1 - p.hardness) * r, 0.75);
    const inner = Math.max(0, r - edge);
    const inner2 = inner * inner;
    const r2 = r * r;
    const ya = Math.max(y0, Math.floor(d.y - r - 1));
    const yb = Math.min(y1 - 1, Math.ceil(d.y + r + 1));
    for (let y = ya; y <= yb; y++) {
      const oy = y + 0.5 - d.y;
      const rest = r2 - oy * oy;
      if (rest <= 0) continue;
      const span = Math.sqrt(rest);
      const xa = Math.max(x0, Math.ceil(d.x - span - 0.5));
      const xb = Math.min(x1 - 1, Math.floor(d.x + span - 0.5));
      const row = (y - y0) * w - x0;
      for (let x = xa; x <= xb; x++) {
        const ox = x + 0.5 - d.x;
        const q = ox * ox + oy * oy;
        let cov = 1;
        if (q > inner2) {
          const t = (Math.sqrt(q) - inner) / edge;
          cov = t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
          if (cov <= 0) continue;
        }
        // How far this pixel is to the side of the line's middle decides how much of the stick's bumps it feels.
        const across = (oy * d.dx - ox * d.dy) / k;
        const v = cov * d.s * bump[Math.round((across + half) * STREAK_RES)];
        const at = row + x;
        if (v > reach[at]) reach[at] = v > 1 ? 1 : v;
      }
    }
  }
  const inv = invert(m);
  const tile = paperTile(p.paper);
  const data = new Uint8ClampedArray(w * h * 4);
  const [cr, cg, cb] = rgb;
  let any = false;
  // A page that is not turned reads the paper along a row and a column, so the tile positions are worked out once for each.
  const axis = inv.b === 0 && inv.c === 0;
  const colAt = axis ? new Int32Array(w * 2) : null;
  const colW = axis ? new Float32Array(w) : null;
  if (axis) {
    for (let x = 0; x < w; x++) {
      const f = ((x0 + x + 0.5) * inv.a + inv.e) / p.grain - 0.5;
      const i = Math.floor(f);
      colW![x] = f - i;
      colAt![x * 2] = ((i % TILE) + TILE) % TILE;
      colAt![x * 2 + 1] = (((i + 1) % TILE) + TILE) % TILE;
    }
  }
  for (let y = 0; y < h; y++) {
    let rowA = 0;
    let rowB = 0;
    let wy = 0;
    if (axis) {
      const f = ((y0 + y + 0.5) * inv.d + inv.f) / p.grain - 0.5;
      const j = Math.floor(f);
      wy = f - j;
      rowA = (((j % TILE) + TILE) % TILE) * TILE;
      rowB = ((((j + 1) % TILE) + TILE) % TILE) * TILE;
    }
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      const rc = reach[at];
      if (rc <= 0) continue;
      let height: number;
      if (axis) {
        const wx = colW![x];
        const xa = colAt![x * 2];
        const xb = colAt![x * 2 + 1];
        const ta = tile[rowA + xa];
        const tb = tile[rowA + xb];
        const tc = tile[rowB + xa];
        const td = tile[rowB + xb];
        height = (ta + (tb - ta) * wx + (tc - ta) * wy + (ta - tb - tc + td) * wx * wy) / 255;
      } else {
        const cx = x0 + x + 0.5;
        const cy = y0 + y + 0.5;
        height = paperAtPoint(tile, (cx * inv.a + cy * inv.c + inv.e) / p.grain, (cx * inv.b + cy * inv.d + inv.f) / p.grain);
      }
      const a = pigment(p, height, rc) * opacity;
      if (a <= 0) continue;
      const o = at * 4;
      data[o] = cr;
      data[o + 1] = cg;
      data[o + 2] = cb;
      data[o + 3] = Math.round(a * 255);
      any = true;
    }
  }
  return any ? { x: x0, y: y0, w, h, data } : null;
}

/**
 * Paper tooth on any picture (a fill, a layer, a whole canvas): the drawing's own see-through (alpha) says how far the
 * stick reaches, so a solid fill is pressed hard and its soft or half-see-through parts catch only the paper's peaks.
 * `bytes` are straight RGBA (a canvas's pixels) and are changed in place. (`ox`, `oy`) is where the picture's top left
 * sits on the canvas, so the paper stays put against the page.
 */
export function toothBytes(bytes: Uint8ClampedArray, w: number, h: number, p: ToothParams, m: View = IDENTITY): void {
  const inv = invert(m);
  const tile = paperTile(p.paper);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const a = bytes[o + 3];
      if (a === 0) continue;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const u = (cx * inv.a + cy * inv.c + inv.e) / p.grain;
      const v = (cx * inv.b + cy * inv.d + inv.f) / p.grain;
      bytes[o + 3] = Math.round(pigment(p, paperAtPoint(tile, u, v), Math.min(1, (a / 255) * p.press)) * 255);
    }
  }
}

/**
 * The settings a new Paper tooth effect starts with for a dry medium (vine charcoal, chalk and so on), in the units the
 * Effects panel shows. `grain` is the paper's grain size, `seed` picks which stick (the streaks) and `streak` (0 to 1)
 * overrides how much the stick's own bumps streak the mark (a dry brush drags long streaks, a crayon barely does).
 */
export function toothValues(id: DryId, grain = 1, seed = 0, streak?: number, paper: PaperKind = 'medium'): Record<string, number> {
  const m = mediumInfo(id);
  return {
    press: Math.round(m.press * 100),
    tooth: Math.round(m.tooth * 100),
    edge: Math.round(m.hardness * 100),
    soft: Math.round(m.soft * 100),
    cover: Math.round(m.ceiling * 100),
    streak: Math.round((streak ?? m.streak) * 100),
    paper: Math.max(0, PAPERS.findIndex((p) => p.id === paper)),
    grain,
    seed,
  };
}
