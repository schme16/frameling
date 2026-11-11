/**
 * Snapping: shapes, selections and new shapes pull onto guide lines and onto the page's edges and middle when they
 * come within a few screen pixels. The maths is pure; the little bit of state is which lines just snapped, so the
 * overlay can flash them.
 */
import type { Doc, Guide } from '../core/format';
import type { Pt, Rect } from './view';

/** How close (screen pixels) something has to come before it snaps. */
export const SNAP_PX = 6;

export interface SnapTargets {
  /** Up-and-down lines, by x. */
  x: number[];
  /** Sideways lines, by y. */
  y: number[];
}

export interface SnapLine {
  axis: 'x' | 'y';
  at: number;
}

/** What things snap to: the guides (when shown) and the page's edges and middle. */
export function snapTargets(doc: Pick<Doc, 'width' | 'height' | 'guides'>, useGuides = true): SnapTargets {
  const x = [0, doc.width / 2, doc.width];
  const y = [0, doc.height / 2, doc.height];
  if (useGuides) for (const g of doc.guides ?? []) (g.axis === 'x' ? x : y).push(g.at);
  return { x, y };
}

/** The nearest target within `tol`, or null. */
export function nearest(v: number, targets: number[], tol: number): number | null {
  let best: number | null = null;
  let bd = tol;
  for (const t of targets) {
    const d = Math.abs(t - v);
    if (d <= bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** One value pulled onto the nearest target. */
export function snapValue(v: number, targets: number[], tol: number): { v: number; hit: number | null } {
  const hit = nearest(v, targets, tol);
  return { v: hit ?? v, hit };
}

/** A point pulled onto the nearest lines, each way on its own. */
export function snapPoint(p: Pt, t: SnapTargets, tol: number): { x: number; y: number; lines: SnapLine[] } {
  const sx = snapValue(p.x, t.x, tol);
  const sy = snapValue(p.y, t.y, tol);
  const lines: SnapLine[] = [];
  if (sx.hit !== null) lines.push({ axis: 'x', at: sx.hit });
  if (sy.hit !== null) lines.push({ axis: 'y', at: sy.hit });
  return { x: sx.v, y: sy.v, lines };
}

/** The best nudge (smallest) that puts one of `edges` on a target, or null. */
function bestNudge(edges: number[], targets: number[], tol: number): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null;
  for (const e of edges) {
    const hit = nearest(e, targets, tol);
    if (hit === null) continue;
    const d = hit - e;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, at: hit };
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
    lines.push({ axis: 'x', at: nx.at });
  }
  if (ny) {
    dy += ny.d;
    lines.push({ axis: 'y', at: ny.at });
  }
  return { dx, dy, lines };
}

// ---------------------------------------------------------------- the lines that just snapped

let shown: SnapLine[] = [];

export function setSnapLines(lines: SnapLine[]): void {
  shown = lines;
}
export function getSnapLines(): readonly SnapLine[] {
  return shown;
}

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
