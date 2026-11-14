/**
 * Align and Spread out: the maths, kept pure. Each takes the boxes of the selected shapes (page pixels) and says how far
 * every shape has to move, as a Map from the shape's id to a shift. A shape that is already where it should be is left out,
 * so "nothing to do" is an empty Map and no undo step is made for it.
 *
 * Align lines the shapes up on one edge or middle of a target box. The target is the selection's own box (the box round
 * everything picked), or the page. With only one shape picked its own box is nothing to line up with, so the page is
 * the target (see alignTarget).
 *
 * Spread out makes the gaps between neighbouring shapes the same, along one direction.
 */
import type { Id } from '../core/format';
import type { Rect } from '../canvas/geometry';

export type AlignKind = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';
export type AlignTo = 'selection' | 'page';
export type Axis = 'across' | 'down';

export interface Boxed {
  id: Id;
  box: Rect;
}

export interface Shift {
  dx: number;
  dy: number;
}

const EPS = 1e-6;
const near = (v: number): boolean => Math.abs(v) < EPS;

/** The box round all of them, or null when there is nothing. */
export function unionBox(boxes: Boxed[]): Rect | null {
  if (!boxes.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { box } of boxes) {
    x0 = Math.min(x0, box.x);
    y0 = Math.min(y0, box.y);
    x1 = Math.max(x1, box.x + box.w);
    y1 = Math.max(y1, box.y + box.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** What the shapes line up to: what the person asked for, except that one shape alone can only line up to the page. */
export function alignTarget(count: number, wanted: AlignTo): AlignTo {
  return count < 2 ? 'page' : wanted;
}

/** Shifts that put each box on `kind` of the target. */
export function alignShifts(boxes: Boxed[], kind: AlignKind, target: Rect): Map<Id, Shift> {
  const out = new Map<Id, Shift>();
  for (const { id, box } of boxes) {
    let dx = 0;
    let dy = 0;
    switch (kind) {
      case 'left':
        dx = target.x - box.x;
        break;
      case 'centre':
        dx = target.x + target.w / 2 - (box.x + box.w / 2);
        break;
      case 'right':
        dx = target.x + target.w - (box.x + box.w);
        break;
      case 'top':
        dy = target.y - box.y;
        break;
      case 'middle':
        dy = target.y + target.h / 2 - (box.y + box.h / 2);
        break;
      case 'bottom':
        dy = target.y + target.h - (box.y + box.h);
        break;
    }
    if (!near(dx) || !near(dy)) out.set(id, { dx: near(dx) ? 0 : dx, dy: near(dy) ? 0 : dy });
  }
  return out;
}

/** The fewest shapes that can be spread out: with two there is one gap, and nothing to even up. */
export const MIN_SPREAD = 3;

/**
 * Shifts that make the gaps between neighbours equal, going across (left to right) or down (top to bottom).
 *
 * Neighbours are taken in order of their near edge. Without `gap`, the first and the last stay where they are and the
 * ones between share out what room is left, so the whole run keeps its length. With `gap` (page pixels, may be 0 or
 * negative to overlap) the first stays and each one after it sits exactly that far from the one before.
 * Gaps are measured edge to edge, not middle to middle, so a wide shape beside a narrow one still looks evenly spaced.
 */
export function spreadShifts(boxes: Boxed[], axis: Axis, gap?: number | null): Map<Id, Shift> {
  const out = new Map<Id, Shift>();
  if (boxes.length < MIN_SPREAD) return out;
  const across = axis === 'across';
  const near0 = (b: Rect) => (across ? b.x : b.y);
  const size = (b: Rect) => (across ? b.w : b.h);
  const order = [...boxes].sort((a, b) => near0(a.box) - near0(b.box) || near0(a.box) + size(a.box) / 2 - (near0(b.box) + size(b.box) / 2));
  const start = near0(order[0].box);
  let g: number;
  if (gap !== undefined && gap !== null && Number.isFinite(gap)) {
    g = gap;
  } else {
    const end = Math.max(...order.map((o) => near0(o.box) + size(o.box)));
    const total = order.reduce((n, o) => n + size(o.box), 0);
    g = (end - start - total) / (order.length - 1);
  }
  let at = start;
  for (const o of order) {
    const d = at - near0(o.box);
    if (!near(d)) out.set(o.id, across ? { dx: d, dy: 0 } : { dx: 0, dy: d });
    at += size(o.box) + g;
  }
  return out;
}

/** The gaps between neighbours now, in order, for saying "the gaps are already even". */
export function gapsOf(boxes: Boxed[], axis: Axis): number[] {
  const across = axis === 'across';
  const near0 = (b: Rect) => (across ? b.x : b.y);
  const size = (b: Rect) => (across ? b.w : b.h);
  const order = [...boxes].sort((a, b) => near0(a.box) - near0(b.box));
  const gaps: number[] = [];
  for (let i = 1; i < order.length; i++) gaps.push(near0(order[i].box) - (near0(order[i - 1].box) + size(order[i - 1].box)));
  return gaps;
}

/**
 * Where a pixel selection's top left goes to line up with the page, in whole pixels of the art (a middle that falls
 * between two pixels goes to the pixel before it, so nothing is ever blended). x or y is null when `kind` doesn't move that way.
 */
export function alignPixelsTo(box: { x0: number; y0: number; x1: number; y1: number }, kind: AlignKind, width: number, height: number): { x: number | null; y: number | null } {
  const w = box.x1 - box.x0 + 1;
  const h = box.y1 - box.y0 + 1;
  switch (kind) {
    case 'left':
      return { x: 0, y: null };
    case 'centre':
      return { x: Math.floor((width - w) / 2), y: null };
    case 'right':
      return { x: width - w, y: null };
    case 'top':
      return { x: null, y: 0 };
    case 'middle':
      return { x: null, y: Math.floor((height - h) / 2) };
    case 'bottom':
      return { x: null, y: height - h };
  }
}
