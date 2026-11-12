/**
 * Snapping: shapes, selections and new shapes pull onto guide lines, the page's edges and middle, the grid and other
 * shapes when they come within a few screen pixels. The maths is pure; the little bit of state is which lines just
 * snapped (and to what kind of thing), so the overlay can flash them and say what they snapped to.
 */
import type { Doc, Guide } from '../core/format';
import type { SnapTarget } from './snapModel';
import type { Pt, Rect } from './view';

/** How close (screen pixels) something has to come before it snaps. */
export const SNAP_PX = 6;

export interface SnapTargets {
  /** Up-and-down lines, by x. */
  x: number[];
  /** Sideways lines, by y. */
  y: number[];
  /** What each line is (same order as x and y), so a snap can say what it landed on. Missing = not tracked. */
  kx?: SnapTarget[];
  ky?: SnapTarget[];
}

export interface SnapLine {
  axis: 'x' | 'y';
  at: number;
  kind?: SnapTarget;
}

/** What things snap to: the guides (when shown) and the page's edges and middle. */
export function snapTargets(doc: Pick<Doc, 'width' | 'height' | 'guides'>, useGuides = true): SnapTargets {
  const x = [0, doc.width / 2, doc.width];
  const y = [0, doc.height / 2, doc.height];
  if (useGuides) for (const g of doc.guides ?? []) (g.axis === 'x' ? x : y).push(g.at);
  return { x, y };
}

/** An empty set of lines to add to. */
export const noTargets = (): SnapTargets => ({ x: [], y: [], kx: [], ky: [] });

/** Adds lines of one kind (to a set made by `noTargets`). */
export function addLines(t: SnapTargets, kind: SnapTarget, x: readonly number[], y: readonly number[]): void {
  t.x.push(...x);
  t.y.push(...y);
  t.kx?.push(...x.map(() => kind));
  t.ky?.push(...y.map(() => kind));
}

/** Index of the nearest target within `tol`, or -1. */
function nearestAt(v: number, targets: readonly number[], tol: number): number {
  let best = -1;
  let bd = tol;
  for (let i = 0; i < targets.length; i++) {
    const d = Math.abs(targets[i] - v);
    if (d <= bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** The nearest target within `tol`, or null. */
export function nearest(v: number, targets: number[], tol: number): number | null {
  const i = nearestAt(v, targets, tol);
  return i < 0 ? null : targets[i];
}

/** One value pulled onto the nearest target. */
export function snapValue(v: number, targets: number[], tol: number): { v: number; hit: number | null } {
  const hit = nearest(v, targets, tol);
  return { v: hit ?? v, hit };
}

const lineOf = (axis: 'x' | 'y', at: number, kinds: readonly SnapTarget[] | undefined, i: number): SnapLine => (kinds ? { axis, at, kind: kinds[i] } : { axis, at });

/** A point pulled onto the nearest lines, each way on its own. */
export function snapPoint(p: Pt, t: SnapTargets, tol: number): { x: number; y: number; lines: SnapLine[] } {
  const ix = nearestAt(p.x, t.x, tol);
  const iy = nearestAt(p.y, t.y, tol);
  const lines: SnapLine[] = [];
  if (ix >= 0) lines.push(lineOf('x', t.x[ix], t.kx, ix));
  if (iy >= 0) lines.push(lineOf('y', t.y[iy], t.ky, iy));
  return { x: ix >= 0 ? t.x[ix] : p.x, y: iy >= 0 ? t.y[iy] : p.y, lines };
}

/** The best nudge (smallest) that puts one of `edges` on a target, or null. */
function bestNudge(edges: number[], targets: number[], tol: number): { d: number; i: number } | null {
  let best: { d: number; i: number } | null = null;
  for (const e of edges) {
    const i = nearestAt(e, targets, tol);
    if (i < 0) continue;
    const d = targets[i] - e;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, i };
  }
  return best;
}

/**
 * A box being moved by (dx, dy): its left, middle or right (and top, middle or bottom) pulled onto the nearest
 * target. Returns the snapped move and the lines it landed on.
 */
export function snapBox(box: Rect, dx: number, dy: number, t: SnapTargets, tol: number): { dx: number; dy: number; lines: SnapLine[] } {
  const lines: SnapLine[] = [];
  const nx = bestNudge([box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx], t.x, tol);
  const ny = bestNudge([box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy], t.y, tol);
  if (nx) {
    dx += nx.d;
    lines.push(lineOf('x', t.x[nx.i], t.kx, nx.i));
  }
  if (ny) {
    dy += ny.d;
    lines.push(lineOf('y', t.y[ny.i], t.ky, ny.i));
  }
  return { dx, dy, lines };
}

// ---------------------------------------------------------------- the lines that just snapped

let shown: SnapLine[] = [];
let notes: SnapTarget[] = [];
let version = 0;
const listeners = new Set<() => void>();

export function setSnapLines(lines: SnapLine[]): void {
  shown = lines;
}
export function getSnapLines(): readonly SnapLine[] {
  return shown;
}

/** What else just snapped without a line to draw (a perspective direction, an angle step). */
export function setSnapNotes(next: SnapTarget[]): void {
  if (next.length === notes.length && next.every((k, i) => k === notes[i])) return;
  notes = next;
}

/** What the last snap landed on, in order, without repeats (empty when nothing snapped). */
export function snappedKinds(): SnapTarget[] {
  const kinds = [...shown.map((l) => l.kind).filter((k): k is SnapTarget => !!k), ...notes];
  return [...new Set(kinds)];
}

/** Tells the little "Snapped to" note something changed. */
export function bumpSnap(): void {
  version++;
  for (const fn of listeners) fn();
}
export const subscribeSnap = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const snapVersion = (): number => version;

// ---------------------------------------------------------------- guide edits (pure)

/** Where a guide dragged to `at` ends up: null when it was dropped back on the ruler or off the page side. */
export function guideDrop(at: number, onRuler: boolean): number | null {
  if (onRuler || !Number.isFinite(at)) return null;
  return Math.round(at * 100) / 100;
}

/** The guides with one added, moved (same id) or taken away (at = null). */
export function withGuide(guides: Guide[] | undefined, g: Guide, at: number | null): Guide[] {
  const rest = (guides ?? []).filter((x) => x.id !== g.id);
  return at === null ? rest : [...rest, { ...g, at }];
}
