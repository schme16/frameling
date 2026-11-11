// Grid and perspective maths: where the lines go and what a point snaps to. Pure, so it's easy to test.
import type { Pt } from './view';

/** How tall an isometric diamond is for its width. */
export function isoRatio(style: '2:1' | '30'): number {
  return style === '2:1' ? 0.5 : Math.tan(Math.PI / 6);
}

/** Square grid lines across a page, every `size` pixels from the top-left corner (edges included). */
export function squareLines(size: number, w: number, h: number): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  if (!(size > 0)) return { x, y };
  for (let v = 0; v <= w + 1e-6; v += size) x.push(v);
  for (let v = 0; v <= h + 1e-6; v += size) y.push(v);
  return { x, y };
}

/** The nearest square grid corner. */
export function snapSquare(p: Pt, size: number): Pt {
  return { x: Math.round(p.x / size) * size, y: Math.round(p.y / size) * size };
}

/**
 * The nearest isometric grid corner. The diamonds are `size` wide and `size * ratio` tall, with a corner at the
 * page's top-left. Corners sit at (i * size / 2, j * height / 2) where i and j are both even or both odd.
 */
export function snapIso(p: Pt, size: number, ratio: number): Pt {
  const hx = size / 2;
  const hy = (size * ratio) / 2;
  const fi = p.x / hx;
  const fj = p.y / hy;
  let best: Pt = { x: 0, y: 0 };
  let bd = Infinity;
  for (const i of [Math.floor(fi), Math.ceil(fi)]) {
    for (const j of [Math.floor(fj), Math.ceil(fj)]) {
      if ((((i + j) % 2) + 2) % 2 !== 0) continue;
      const q = { x: i * hx, y: j * hy };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}

/** One isometric family of parallel lines across a w x h page, as segments clipped to the page. */
export function isoLines(size: number, ratio: number, w: number, h: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  if (!(size > 0)) return out;
  const t = size * ratio;
  const m = ratio; // slope: (t / 2) / (size / 2)
  // y = m x + k t (rising to the right, going down the page) and y = -m x + k t.
  for (const sign of [1, -1]) {
    const kMin = Math.floor(Math.min(0, -sign * m * w) / t) - 1;
    const kMax = Math.ceil(Math.max(h, h - sign * m * w) / t) + 1;
    for (let k = kMin; k <= kMax; k++) {
      const seg = clipLine(sign * m, k * t, w, h);
      if (seg) out.push(seg);
    }
  }
  return out;
}

/** The part of y = m x + c inside the page, or null. */
function clipLine(m: number, c: number, w: number, h: number): [Pt, Pt] | null {
  const pts: Pt[] = [];
  const add = (x: number, y: number) => {
    if (x >= -1e-6 && x <= w + 1e-6 && y >= -1e-6 && y <= h + 1e-6 && !pts.some((q) => Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6)) pts.push({ x, y });
  };
  add(0, c);
  add(w, m * w + c);
  if (m !== 0) {
    add(-c / m, 0);
    add((h - c) / m, h);
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.x - b.x);
  return [pts[0], pts[pts.length - 1]];
}

/** How many grid cells to step per drawn line, so lines stay at least `minPx` apart on screen. */
export function gridStep(size: number, zoom: number, minPx = 6): number {
  const px = size * zoom;
  return px >= minPx ? 1 : Math.ceil(minPx / Math.max(px, 1e-6));
}

// ---------------------------------------------------------------- perspective

/** Where new vanishing points go: one in the middle, or two on the horizon near the page's sides. */
export function defaultVanishing(count: 1 | 2, w: number, h: number): Pt[] {
  const y = Math.round(h * 0.42);
  return count === 1 ? [{ x: Math.round(w / 2), y }] : [{ x: Math.round(w * 0.08), y }, { x: Math.round(w * 0.92), y }];
}

/**
 * Points around the page's edge, evenly spaced, that the rays from a vanishing point aim at. `count` points in all,
 * starting at the top-left corner and going clockwise.
 */
export function rayTargets(w: number, h: number, count: number): Pt[] {
  const per = 2 * (w + h);
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    let d = (i / count) * per;
    if (d < w) out.push({ x: d, y: 0 });
    else if ((d -= w) < h) out.push({ x: w, y: d });
    else if ((d -= h) < w) out.push({ x: w - d, y: h });
    else out.push({ x: 0, y: h - (d - w) });
  }
  return out;
}

/**
 * Moving one vanishing point. With two, the horizon stays level: moving one up or down moves the other with it,
 * unless `free` (Shift), which tilts the horizon.
 */
export function moveVanishing(points: Pt[], index: number, to: Pt, free: boolean): Pt[] {
  return points.map((p, i) => {
    if (i === index) return { x: to.x, y: to.y };
    return free ? p : { x: p.x, y: to.y };
  });
}

/** `b` moved onto the line through `a` with angle `ang` (radians): its nearest point on that line. */
function onLine(a: Pt, b: Pt, ang: number): Pt {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const t = (b.x - a.x) * ux + (b.y - a.y) * uy;
  return { x: a.x + ux * t, y: a.y + uy * t };
}

/** The angles (radians) of the lines from `a` towards each vanishing point; null where `a` sits on the point. */
export function vanishingAngles(a: Pt, points: Pt[]): (number | null)[] {
  return points.map((vp) => (Math.hypot(vp.x - a.x, vp.y - a.y) < 1e-6 ? null : Math.atan2(vp.y - a.y, vp.x - a.x)));
}

/**
 * The end of a line from `a` pulled onto a vanishing point's direction when `b` comes within `tol` of that line.
 * Returns the snapped end and which point it follows, or null.
 */
export function snapToVanishing(a: Pt, b: Pt, points: Pt[], tol: number): { pt: Pt; index: number } | null {
  let best: { pt: Pt; index: number } | null = null;
  let bd = tol;
  vanishingAngles(a, points).forEach((ang, index) => {
    if (ang === null) return;
    const pt = onLine(a, b, ang);
    const d = Math.hypot(pt.x - b.x, pt.y - b.y);
    if (d <= bd) {
      bd = d;
      best = { pt, index };
    }
  });
  return best;
}

/**
 * Shift on a line with perspective guides: the nearest of the 45 degree steps and the vanishing point directions.
 * `index` says which vanishing point won (null for a 45 degree step).
 */
export function constrainWithVanishing(a: Pt, b: Pt, points: Pt[]): { pt: Pt; index: number | null } {
  const dir = Math.atan2(b.y - a.y, b.x - a.x);
  // Lines run both ways, so angles compare modulo half a turn.
  const off = (ang: number) => {
    const d = Math.abs((((dir - ang) % Math.PI) + Math.PI) % Math.PI);
    return Math.min(d, Math.PI - d);
  };
  let best = Math.round(dir / (Math.PI / 4)) * (Math.PI / 4);
  let index: number | null = null;
  let bd = off(best);
  vanishingAngles(a, points).forEach((ang, i) => {
    if (ang === null) return;
    const d = off(ang);
    if (d < bd - 1e-9) {
      bd = d;
      best = ang;
      index = i;
    }
  });
  return { pt: onLine(a, b, best), index };
}
