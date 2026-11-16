// The width tool's maths: where along a line a pointer is, how the line's width stops are added, moved and taken away,
// and how far to drag for how fat. It edits the same `widths` a line already has (see WidthStop in format.ts and
// src/geometry/lineStyle.ts), so the presets (swell, pinch, taper) and a hand-made width are one thing. Pure, no DOM.
import type { SubPath, WidthStop } from '../core/format';
import { cleanWidths, flatten, widthAt, type Run } from './lineStyle';

export interface V {
  x: number;
  y: number;
}

/** The thinnest a line may be made, as a share of its width, and the fattest (matches `cleanWidths`). */
export const MIN_WIDTH = 0.05;
export const MAX_WIDTH = 8;

/** A place on a line: how far along (0 start to 1 end), the point there, and the unit normal (the line's left). */
export interface Spot extends V {
  t: number;
  nx: number;
  ny: number;
}

/** The nearest place on a subpath to `p`, and how far away it is. Null for a subpath that is a single point. */
export function nearestSpot(sp: SubPath, p: V): (Spot & { dist: number }) | null {
  const run = flatten(sp);
  const n = run.pts.length;
  if (n < 2 || !(run.total > 0)) return null;
  let best: (Spot & { dist: number }) | null = null;
  const segs = run.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = run.pts[i];
    const b = run.pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-12) continue;
    const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const x = a.x + dx * f;
    const y = a.y + dy * f;
    const dist = Math.hypot(p.x - x, p.y - y);
    if (!best || dist < best.dist) {
      const l = Math.sqrt(l2);
      best = { t: (run.at[i] + f * l) / run.total, x, y, nx: -dy / l, ny: dx / l, dist };
    }
  }
  return best;
}

/** The place `t` of the way along a subpath, with its normal. */
export function spotAt(sp: SubPath, t: number): Spot | null {
  return spotOnRun(flatten(sp), t);
}

function spotOnRun(run: Run, t: number): Spot | null {
  const n = run.pts.length;
  if (n < 2 || !(run.total > 0)) return null;
  const d = Math.min(1, Math.max(0, t)) * run.total;
  const segs = run.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = run.pts[i];
    const b = run.pts[(i + 1) % n];
    const start = run.at[i];
    const end = i + 1 < n ? run.at[i + 1] : run.total;
    if (d > end && i < segs - 1) continue;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-9) continue;
    const f = end - start < 1e-9 ? 0 : Math.min(1, Math.max(0, (d - start) / (end - start)));
    return { t: Math.min(1, Math.max(0, t)), x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, nx: -(b.y - a.y) / l, ny: (b.x - a.x) / l };
  }
  return null;
}

const clampW = (w: number): number => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));

/** Two stops closer than this (as a share of the line) are the same stop. */
export const SAME_SPOT = 0.015;

/** The index of the stop within `tol` of `t`, or -1. */
export function stopNear(stops: readonly WidthStop[] | undefined, t: number, tol = SAME_SPOT): number {
  const s = cleanWidths(stops) ?? [];
  let best = -1;
  let bd = tol;
  s.forEach((x, i) => {
    const d = Math.abs(x.at - t);
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** A line with no width stops yet is the same width all the way: two stops at its ends, so one more can be put in. */
const seeded = (stops: readonly WidthStop[] | undefined): WidthStop[] => cleanWidths(stops) ?? [{ at: 0, w: 1 }, { at: 1, w: 1 }];

/**
 * The stops with the width at `t` set to `w` (times the line's width): an existing stop there is changed, otherwise a new
 * one goes in. Everything else stays, so the line only changes around that place.
 */
export function setWidthAt(stops: readonly WidthStop[] | undefined, t: number, w: number): WidthStop[] {
  const s = seeded(stops).map((x) => ({ ...x }));
  const at = Math.min(1, Math.max(0, t));
  const i = stopNear(s, at);
  if (i >= 0) s[i].w = clampW(w);
  else {
    s.push({ at, w: clampW(w) });
    s.sort((a, b) => a.at - b.at);
  }
  return s;
}

/** Adds a stop at `t` that keeps the line looking just as it did there, ready to be dragged. Returns the stops and the new one's index. */
export function addStopHere(stops: readonly WidthStop[] | undefined, t: number): { stops: WidthStop[]; index: number } {
  const have = cleanWidths(stops);
  const at = Math.min(1, Math.max(0, t));
  const existing = stopNear(have ?? undefined, at);
  if (existing >= 0) return { stops: have!.map((x) => ({ ...x })), index: existing };
  const next = setWidthAt(stops, at, clampW(widthAt(have, at)));
  return { stops: next, index: stopNear(next, at, 1e-9) };
}

/** The stops with stop `i` given a new width, and (when `t` is given) slid along the line, never past its neighbours. */
export function moveStop(stops: readonly WidthStop[], i: number, w: number, t?: number): WidthStop[] {
  const s = stops.map((x) => ({ ...x }));
  if (i < 0 || i >= s.length) return s;
  s[i].w = clampW(w);
  if (t !== undefined) {
    const lo = i > 0 ? s[i - 1].at + 0.005 : 0;
    const hi = i < s.length - 1 ? s[i + 1].at - 0.005 : 1;
    // The two ends of a line stay at its ends.
    if (i !== 0 && i !== s.length - 1) s[i].at = Math.min(hi, Math.max(lo, t));
  }
  return s;
}

/** The stops without stop `i`. A line left with nothing but its own width goes back to having none (null). */
export function removeStop(stops: readonly WidthStop[], i: number): WidthStop[] | null {
  const s = stops.filter((_, k) => k !== i).map((x) => ({ ...x }));
  return isEven(s) ? null : s;
}

/** Are these stops the same as no stops: every one is the line's own width? */
export function isEven(stops: readonly WidthStop[] | undefined): boolean {
  const s = cleanWidths(stops);
  return !s || s.every((x) => Math.abs(x.w - 1) < 1e-6);
}

/**
 * Dragging the edge of a line: how many times the line's width it should be now, from where the pointer is. `grab` is how
 * far inside (or outside) the edge the pointer took hold, so the edge doesn't jump when the drag starts.
 */
export function widthFromDrag(spot: Spot, p: V, grab: number, lineWidth: number): number {
  const across = Math.abs((p.x - spot.x) * spot.nx + (p.y - spot.y) * spot.ny);
  return clampW(((across + grab) * 2) / Math.max(0.01, lineWidth));
}

/** How far the pointer is from the edge it took hold of, to hand to `widthFromDrag` (the edge sits `w * lineWidth / 2` from the centre). */
export function grabOffset(spot: Spot, p: V, w: number, lineWidth: number): number {
  const across = Math.abs((p.x - spot.x) * spot.nx + (p.y - spot.y) * spot.ny);
  return (w * lineWidth) / 2 - across;
}

/** Where a stop's two edge handles sit on a subpath: the stop's index, the point on the line, and the two edges. */
export interface StopHandle {
  index: number;
  centre: V;
  left: V;
  right: V;
  w: number;
}

export function stopHandles(sp: SubPath, stops: readonly WidthStop[] | undefined, lineWidth: number): StopHandle[] {
  const s = cleanWidths(stops);
  if (!s) return [];
  const run = flatten(sp);
  const out: StopHandle[] = [];
  s.forEach((x, index) => {
    const spot = spotOnRun(run, x.at);
    if (!spot) return;
    const r = (x.w * lineWidth) / 2;
    out.push({ index, centre: { x: spot.x, y: spot.y }, left: { x: spot.x + spot.nx * r, y: spot.y + spot.ny * r }, right: { x: spot.x - spot.nx * r, y: spot.y - spot.ny * r }, w: x.w });
  });
  return out;
}
