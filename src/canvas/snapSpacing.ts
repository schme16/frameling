/**
 * Equal gaps: where to put a box so the gap to a neighbour matches a gap already between two other shapes, or so it
 * sits in the middle of the gap between two. Pure. Ported from the way Interactives does it.
 */
import type { Rect } from './view';

/** A gap to draw: it runs from `from` to `to` along `axis`, at `at` on the other axis, with its size as the label. */
export interface Gap {
  axis: 'x' | 'y';
  from: number;
  to: number;
  at: number;
  label: number;
}

/** Gaps this close (art pixels) count as the same size. */
const SAME = 0.5;
const near = (a: number, b: number) => Math.abs(a - b) < SAME;
const round1 = (v: number) => Math.round(v * 10) / 10;

export interface SpacingHit {
  /** How far to move along the axis. */
  d: number;
  gaps: Gap[];
}

/**
 * One axis. Only shapes that share the box's row (for x) or column (for y) count as neighbours. Returns the smallest
 * move for the box's start edge inside `tol`, or null.
 */
export function spacingAxis(m: Rect, axis: 'x' | 'y', others: readonly Rect[], tol: number): SpacingHit | null {
  const pos = axis === 'x' ? 'x' : 'y';
  const size = axis === 'x' ? 'w' : 'h';
  const cross = axis === 'x' ? 'y' : 'x';
  const crossSize = axis === 'x' ? 'h' : 'w';
  const start = m[pos];
  const len = m[size];
  const mid = m[cross] + m[crossSize] / 2;
  const row = others.filter((r) => r[cross] < m[cross] + m[crossSize] && r[cross] + r[crossSize] > m[cross]).sort((p, q) => p[pos] - q[pos]);
  if (!row.length) return null;
  const pairs: { l: Rect; r: Rect; g: number }[] = [];
  for (let i = 0; i + 1 < row.length; i++) {
    const l = row[i];
    const r = row[i + 1];
    const g = r[pos] - (l[pos] + l[size]);
    if (g > SAME) pairs.push({ l, r, g });
  }
  // Each distinct gap once, at its real size (gaps within half a pixel count as the same).
  const mates: { g: number; mate: (typeof pairs)[number] }[] = [];
  for (const p of pairs) if (!mates.some((m) => near(m.g, p.g))) mates.push({ g: p.g, mate: p });
  const gap = (from: number, to: number): Gap => ({ axis, from, to, at: mid, label: round1(to - from) });
  const cands: { at: number; show: Gap[] }[] = [];
  for (const r of row) {
    for (const { g, mate } of mates) {
      const mateGap = gap(mate.l[pos] + mate.l[size], mate.r[pos]);
      const after = r[pos] + r[size] + g;
      cands.push({ at: after, show: [gap(r[pos] + r[size], after), mateGap] });
      const before = r[pos] - g - len;
      cands.push({ at: before, show: [gap(before + len, r[pos]), mateGap] });
    }
  }
  // Centred between two shapes, the same gap each side.
  for (const p of pairs) {
    if (p.g <= len) continue;
    const at = p.l[pos] + p.l[size] + (p.g - len) / 2;
    cands.push({ at, show: [gap(p.l[pos] + p.l[size], at), gap(at + len, p.r[pos])] });
  }
  let best: (typeof cands)[number] | null = null;
  for (const c of cands) if (Math.abs(c.at - start) <= tol && (!best || Math.abs(c.at - start) < Math.abs(best.at - start))) best = c;
  return best ? { d: best.at - start, gaps: best.show } : null;
}

export interface SpacingResult {
  x: SpacingHit | null;
  y: SpacingHit | null;
}

/** Both axes for a box (a point is a box with no size). */
export function spacingFor(box: Rect, others: readonly Rect[], tol: number): SpacingResult {
  if (!others.length) return { x: null, y: null };
  return { x: spacingAxis(box, 'x', others, tol), y: spacingAxis(box, 'y', others, tol) };
}
