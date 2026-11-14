/**
 * The maths of the Transform box. Pure, no DOM and no store, so every handle and every modifier can be tested alone.
 *
 * A **frame** is the box round what is selected: `r0` is the selection's box when the session began, and `m` is the whole
 * change so far, as one matrix that is always applied to the ORIGINAL shapes (or pixels). So however many drags a session
 * takes, the document only ever sees one matrix, and nothing is resampled twice. The box on screen is `r0` carried
 * through `m`: a turned, stretched, slanted box. `pivot` is where turning happens, kept in the original box's own
 * coordinates so it travels with the box.
 *
 * Every drag works from the frame as it was when the pointer went down (`f0`) and gives the new whole matrix, so
 * letting the pointer wander back puts things back exactly.
 *
 * The typed numbers (src/select/numbers.ts) and these drags build their matrices with the same functions
 * (`turnBoxBy`, `slantBoxBy`, `scaleAbout`), so a typed turn and a dragged turn agree to the last digit.
 */
import { apply, multiply, rectCentre, scaleAbout, translate, HANDLE_GRAB, IDENTITY, ROTATE_OFFSET, type Matrix, type Pt, type Rect } from '../canvas/geometry';
import { decompose, invert } from '../core/symbols';
import { MAX_SLANT, slantBoxBy, turnBoxBy } from '../select/numbers';

export type CornerHandle = 'nw' | 'ne' | 'se' | 'sw';
export type EdgeHandle = 'n' | 'e' | 's' | 'w';
export type BoxHandle = CornerHandle | EdgeHandle;
/** What a pointer can land on: a handle, the turn knob, the pivot, or the middle of the box (to move it). */
export type BoxHit = BoxHandle | 'rotate' | 'pivot' | 'move';

export interface Frame {
  /** The selection's box when the session began (document pixels). */
  r0: Rect;
  /** The whole change so far, applied to the original shapes. */
  m: Matrix;
  /** The turning point, in `r0`'s own coordinates. */
  pivot: Pt;
}

export const frameOf = (r0: Rect): Frame => ({ r0, m: IDENTITY, pivot: rectCentre(r0) });

const EPS = 1e-9;

/** Turns snap to this many degrees with Shift, and skews do too. */
export const SNAP_DEGREES = 15;

/** The matrix that undoes `m`, or null when `m` has squashed everything flat. */
export function inverse(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < EPS) return null;
  return invert(m) as unknown as Matrix;
}

export const isIdentity = (m: Matrix): boolean => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);

/** The nine points of a box that handles and the pivot sit on, in the box's own coordinates. */
export function localPoints(r: Rect): Record<BoxHandle | 'centre', Pt> {
  const { x, y, w, h } = r;
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
    centre: { x: x + w / 2, y: y + h / 2 },
  };
}

/** Where a point of the original box is now (document pixels). */
export const place = (f: Frame, p: Pt): Pt => apply(f.m, p.x, p.y);

/** The four corners of the box as it is now, clockwise from the top left corner of the original. */
export function corners(f: Frame): Pt[] {
  const L = localPoints(f.r0);
  return [place(f, L.nw), place(f, L.ne), place(f, L.se), place(f, L.sw)];
}

export const pivotPoint = (f: Frame): Pt => place(f, f.pivot);

/** The turn knob: out past the middle of the top edge, along the way the box's top faces. */
export function rotateKnob(f: Frame, zoom: number): { stem: Pt; knob: Pt } {
  const L = localPoints(f.r0);
  const top = place(f, L.n);
  const mid = place(f, L.centre);
  let dx = top.x - mid.x;
  let dy = top.y - mid.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) [dx, dy] = [0, -1];
  else [dx, dy] = [dx / len, dy / len];
  const off = ROTATE_OFFSET / zoom;
  return { stem: top, knob: { x: top.x + dx * off, y: top.y + dy * off } };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function nearOnSegment(a: Pt, b: Pt, p: Pt): { d: number; t: number } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return { d: Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y), t };
}

/** True when the point is inside the four corners, however the box has been turned or flipped. */
export function insideQuad(q: Pt[], p: Pt): boolean {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross > 0) pos++;
    else if (cross < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

const CORNERS: CornerHandle[] = ['nw', 'ne', 'se', 'sw'];
const EDGES: EdgeHandle[] = ['n', 'e', 's', 'w'];

/**
 * What is under the pointer. The pivot first (it sits on top), then the turn knob, the corners, the edges (the whole
 * length of one, not just its little square), and last the inside, which moves. On a tiny box the grab zones shrink so
 * the middle stays reachable.
 */
export function hitBox(f: Frame, x: number, y: number, zoom: number): BoxHit | null {
  const p = { x, y };
  const grab = HANDLE_GRAB / zoom;
  const q = corners(f);
  const L = localPoints(f.r0);
  const shortest = Math.min(dist(q[0], q[1]), dist(q[1], q[2]));
  // The pivot sits in the middle to begin with, so its grab is small enough to leave the rest of the middle for moving.
  if (dist(pivotPoint(f), p) <= Math.min(grab * 0.75, shortest / 5)) return 'pivot';
  if (dist(rotateKnob(f, zoom).knob, p) <= grab) return 'rotate';
  // A box only a few pixels across would be all handle; the grab zones shrink so its middle stays a middle.
  const g = Math.min(grab, shortest / 3);
  for (let i = 0; i < 4; i++) if (dist(q[i], p) <= g) return CORNERS[i];
  let best: { h: EdgeHandle; d: number } | null = null;
  for (let i = 0; i < 4; i++) {
    const near = nearOnSegment(q[i], q[(i + 1) % 4], p);
    // The middle square always grabs; along the rest of the edge a thinner strip does.
    const d = dist(place(f, L[EDGES[i]]), p) <= g ? 0 : near.d <= g * 0.6 && near.t > 0.12 && near.t < 0.88 ? near.d : Infinity;
    if (d < (best?.d ?? Infinity)) best = { h: EDGES[i], d };
  }
  if (best) return best.h;
  return insideQuad(q, p) ? 'move' : null;
}

// ---------------------------------------------------------------- dragging

/** Sizes never go through zero in one step: past it the shape flips, which is what dragging over the far side means. */
const FLOOR = 0.001;

function ratio(to: number, from: number, handle: number): number {
  const d = handle - from;
  if (Math.abs(d) < EPS) return 1;
  const r = (to - from) / d;
  return Math.abs(r) < FLOOR ? (r < 0 ? -FLOOR : FLOOR) : r;
}

const OPPOSITE: Record<BoxHandle, BoxHandle> = { nw: 'se', se: 'nw', ne: 'sw', sw: 'ne', n: 's', s: 'n', e: 'w', w: 'e' };

/** The pointer in the original box's own coordinates (so a turned or slanted box is dragged along its own sides). */
function localOf(f0: Frame, p: Pt): Pt | null {
  const inv = inverse(f0.m);
  return inv ? apply(inv, p.x, p.y) : null;
}

/**
 * Dragging a corner or an edge to `p`. The side or corner opposite stays put, or the pivot with `alt` (the middle,
 * until it is moved). A corner stretches both ways; with `shift` it keeps its proportions. An edge squashes or stretches
 * one way only; with `shift` the other way follows, to keep proportions.
 */
export function stretchBox(f0: Frame, handle: BoxHandle, p: Pt, o: { shift?: boolean; alt?: boolean } = {}): Matrix {
  const q = localOf(f0, p);
  if (!q) return f0.m;
  const L = localPoints(f0.r0);
  const h = L[handle];
  const opp = L[OPPOSITE[handle]];
  const anchor = o.alt ? f0.pivot : opp;
  let sx = 1;
  let sy = 1;
  if (handle.length === 2) {
    sx = ratio(q.x, anchor.x, h.x);
    sy = ratio(q.y, anchor.y, h.y);
    if (o.shift) {
      const k = Math.max(Math.abs(sx), Math.abs(sy));
      sx = (sx < 0 ? -1 : 1) * k;
      sy = (sy < 0 ? -1 : 1) * k;
    }
  } else if (handle === 'e' || handle === 'w') {
    sx = ratio(q.x, anchor.x, h.x);
    if (o.shift) sy = sx;
  } else {
    sy = ratio(q.y, anchor.y, h.y);
    if (o.shift) sx = sy;
  }
  // The other way of an edge drag scales about the middle (or the pivot), so the shape stays level with itself.
  const ax = handle === 'n' || handle === 's' ? (o.alt ? f0.pivot.x : L.centre.x) : anchor.x;
  const ay = handle === 'e' || handle === 'w' ? (o.alt ? f0.pivot.y : L.centre.y) : anchor.y;
  return multiply(f0.m, scaleAbout(sx, sy, ax, ay));
}

/**
 * Dragging an edge to `p` as a skew: the edge slides along itself and the opposite edge stays put (the pivot, with
 * `alt`). The angle is worked out and built by `slantBoxBy`, the same as the Slant number. `snap` rounds it to steps.
 */
export function skewBox(f0: Frame, handle: EdgeHandle, p: Pt, o: { alt?: boolean; snap?: boolean } = {}): Matrix {
  const q = localOf(f0, p);
  if (!q) return f0.m;
  const L = localPoints(f0.r0);
  const h = L[handle];
  const across = handle === 'n' || handle === 's';
  const from = o.alt ? f0.pivot : L[OPPOSITE[handle]];
  const run = across ? h.y - from.y : h.x - from.x;
  if (Math.abs(run) < EPS) return f0.m;
  const slide = across ? q.x - h.x : q.y - h.y;
  let deg = (Math.atan(slide / run) * 180) / Math.PI;
  if (o.snap) deg = Math.round(deg / SNAP_DEGREES) * SNAP_DEGREES;
  deg = Math.max(-MAX_SLANT, Math.min(MAX_SLANT, deg));
  const local = slantBoxBy(f0.r0, deg, from, across ? 'x' : 'y');
  return local ? multiply(f0.m, local) : f0.m;
}

/** The angle (radians) of a point from the pivot, as it is in the document. Call when a turn begins. */
export function angleFromPivot(f: Frame, p: Pt): number {
  const c = pivotPoint(f);
  return Math.atan2(p.y - c.y, p.x - c.x);
}

/** How far the box is turned (radians, clockwise on screen): the direction its top-left to top-right side points. */
export function boxAngle(m: Matrix): number {
  return Math.atan2(m[1], m[0]);
}

/**
 * Dragging the turn knob to `p`, from where it was picked up (`start`, from `angleFromPivot`). The turn is about the
 * pivot. With `snap` the box's own angle (not just this drag's) lands on whole steps, so a box that started crooked
 * snaps to the straight angles rather than staying crooked.
 */
export function turnBox(f0: Frame, start: number, p: Pt, snap = false): Matrix {
  const pv = pivotPoint(f0);
  let delta = Math.atan2(p.y - pv.y, p.x - pv.x) - start;
  if (snap) {
    const step = (SNAP_DEGREES * Math.PI) / 180;
    const at = boxAngle(f0.m);
    delta = Math.round((at + delta) / step) * step - at;
  }
  const rot = turnBoxBy(f0.r0, (delta * 180) / Math.PI, pv);
  return rot ? multiply(rot, f0.m) : f0.m;
}

/** Moving the whole box by an amount (document pixels). */
export const moveBox = (f0: Frame, dx: number, dy: number): Matrix => (dx || dy ? multiply(translate(dx, dy), f0.m) : f0.m);

/** The way an arrow key nudges (one step right, left, down or up), or null for any other key. */
export function arrowStep(key: string): { dx: number; dy: number } | null {
  if (key === 'ArrowLeft') return { dx: -1, dy: 0 };
  if (key === 'ArrowRight') return { dx: 1, dy: 0 };
  if (key === 'ArrowUp') return { dx: 0, dy: -1 };
  if (key === 'ArrowDown') return { dx: 0, dy: 1 };
  return null;
}

/** Where the pivot goes when dragged to `p`: it clings to the handles and the middle when close, and is otherwise free. */
export function movePivot(f: Frame, p: Pt, zoom: number, cling = true): Pt {
  const q = localOf(f, p);
  if (!q) return f.pivot;
  if (!cling) return q;
  const L = localPoints(f.r0);
  const reach = (HANDLE_GRAB * 0.9) / zoom;
  let best: Pt | null = null;
  let bd = reach;
  for (const k of Object.keys(L) as (keyof typeof L)[]) {
    const d = dist(place(f, L[k]), p);
    if (d <= bd) {
      bd = d;
      best = L[k];
    }
  }
  return best ?? q;
}

// ---------------------------------------------------------------- reading it back

/** The box in numbers a person would say: how wide and tall it is now, how far turned and how slanted. */
export function readout(f: Frame): { w: number; h: number; turn: number; slant: number } {
  const t = decompose(f.m, { x: 0, y: 0 });
  const tidy = (v: number) => Math.round(v * 100) / 100 || 0;
  return { w: tidy(f.r0.w * Math.abs(t.scaleX)), h: tidy(f.r0.h * Math.abs(t.scaleY)), turn: tidy(t.rotation), slant: tidy(t.skew) };
}

/** The same box as the part of a document pixel grid it covers (art pixels), for a pixel layer of this pixel size. */
export function toArt(m: Matrix, size: number): Matrix {
  // x_art = x_doc / size, so the matrix works on art pixels: S^-1 * M * S.
  return [m[0], m[1], m[2], m[3], m[4] / size, m[5] / size];
}
