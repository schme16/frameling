/**
 * The placing maths for Repeat (a grid, a ring or a mirror image of a shape) and for the mirror drawing mode, as pure
 * functions on matrices. Both mirrors call `axisReflections` and `reflectAcross`, so a mirror line that is up and down
 * or sideways gives the very same copy whichever of them made it. Nothing here touches a document.
 */
import type { GridRepeat, Id, MirrorRepeat, Repeat, RingRepeat, Shape } from '../core/format';
import { about, flips, IDENTITY, rotateAbout, scaleAbout, translate, type Matrix } from './matrix';

/** The most shapes one repeat makes, the original included. A bigger ask is held to this rather than slowing the page. */
export const MAX_REPEAT = 400;
export const RING_FULL = 360;
const RAD = Math.PI / 180;

type Pt = { x: number; y: number };

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- mirrors, shared

/** A copy turned left to right across the up-and-down line at x = `ax`. */
export const reflectX = (ax: number): Matrix => scaleAbout(-1, 1, ax, 0);
/** A copy turned top to bottom across the sideways line at y = `ay`. */
export const reflectY = (ay: number): Matrix => scaleAbout(1, -1, 0, ay);
/** A copy turned through a point (a half turn, so it lands as a mirror in both directions at once). */
export const reflectThrough = (x: number, y: number): Matrix => scaleAbout(-1, -1, x, y);

/**
 * A copy flipped across the line through (`x`, `y`) at `angle` degrees (0 is sideways, 90 up and down). Straight up and
 * down, or sideways, is exactly what the mirror drawing mode makes; anything between is turned the same way.
 */
export function reflectAcross(x: number, y: number, angle: number): Matrix {
  const a = ((angle % 180) + 180) % 180;
  if (a === 90) return reflectX(x);
  if (a === 0) return reflectY(y);
  const t = 2 * a * RAD;
  return about([Math.cos(t), Math.sin(t), Math.sin(t), -Math.cos(t), 0, 0], x, y);
}

/**
 * The copies the drawing mirror makes, as matrices: left and right (`h`), top and bottom (`v`), and both together,
 * which comes third. None when neither is on.
 */
export function axisReflections(h: boolean, v: boolean, ax: number, ay: number): Matrix[] {
  const out: Matrix[] = [];
  if (h) out.push(reflectX(ax));
  if (v) out.push(reflectY(ay));
  if (h && v) out.push(reflectThrough(ax, ay));
  return out;
}

/** A copy as its own plain shape: a new id, and none of what ties it to the original (group, where it came from, a repeat of its own). */
export function copyAs<S extends Shape>(moved: S, id: Id): S {
  const copy = { ...moved, id } as S & { origin?: Id; group?: Id; repeat?: Repeat };
  delete copy.origin;
  delete copy.group;
  delete copy.repeat;
  return copy;
}

// ---------------------------------------------------------------- placing

/** How many a grid makes, held to the limit by taking rows away. */
export function gridSize(r: Pick<GridRepeat, 'cols' | 'rows'>): { cols: number; rows: number } {
  const cols = clamp(Math.round(r.cols) || 1, 1, MAX_REPEAT);
  const rows = clamp(Math.round(r.rows) || 1, 1, Math.max(1, Math.floor(MAX_REPEAT / cols)));
  return { cols, rows };
}

/** Where the degrees go between one copy of a ring and the next. A full ring spaces them evenly all the way round; a fan puts the last one at the far end. */
export function ringStep(count: number, sweep: number): number {
  if (count <= 1) return 0;
  return Math.abs(sweep) >= RING_FULL ? sweep / count : sweep / (count - 1);
}

export const ringCount = (r: Pick<RingRepeat, 'count'>): number => clamp(Math.round(r.count) || 1, 1, MAX_REPEAT);

/** How many shapes the repeat makes, the original included. */
export function repeatCount(r: Repeat): number {
  if (r.kind === 'grid') {
    const g = gridSize(r);
    return g.cols * g.rows;
  }
  if (r.kind === 'ring') return ringCount(r);
  return 2;
}

/** A mirror's line as two points, `len` apart, for drawing it and for dragging its ends. */
export function mirrorLine(r: MirrorRepeat, len = 1): { a: Pt; b: Pt } {
  const t = (r.angle ?? 90) * RAD;
  return { a: { x: r.x - Math.cos(t) * len, y: r.y - Math.sin(t) * len }, b: { x: r.x + Math.cos(t) * len, y: r.y + Math.sin(t) * len } };
}

/** The angle (degrees, 0 up to 180) of the line from `a` to `b`. */
export function lineAngle(a: Pt, b: Pt): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) / RAD + 360) % 180;
  // Snapped-to lines come out a hair off a straight angle; give them back clean.
  const near = Math.round(deg / 90) * 90;
  return Math.abs(deg - near) < 1e-9 ? near % 180 : deg;
}

/**
 * Where each copy goes, as a matrix from the original: the first is always the original itself (no change). `pivot` is
 * the middle of what is being repeated; a ring whose copies stay upright moves that point round the ring and nothing else.
 */
export function repeatMatrices(r: Repeat, pivot: Pt): Matrix[] {
  if (r.kind === 'grid') {
    const { cols, rows } = gridSize(r);
    const out: Matrix[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push(i || j ? translate(i * r.dx, j * r.dy) : IDENTITY);
    return out;
  }
  if (r.kind === 'ring') {
    const n = ringCount(r);
    const step = ringStep(n, r.sweep ?? RING_FULL);
    const upright = r.turn === false;
    const out: Matrix[] = [IDENTITY];
    for (let i = 1; i < n; i++) {
      const m = rotateAbout(i * step * RAD, r.cx, r.cy);
      if (!upright) {
        out.push(m);
        continue;
      }
      const p = { x: m[0] * pivot.x + m[2] * pivot.y + m[4], y: m[1] * pivot.x + m[3] * pivot.y + m[5] };
      out.push(translate(p.x - pivot.x, p.y - pivot.y));
    }
    return out;
  }
  return [IDENTITY, r.point ? reflectThrough(r.x, r.y) : reflectAcross(r.x, r.y, r.angle ?? 90)];
}


// ---------------------------------------------------------------- reading

/** A repeat read from a file or a plugin, with every number sane, or undefined when it makes no sense. */
export function cleanRepeat(raw: unknown): Repeat | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const pos = (v: unknown, d: number) => (fin(v) ? clamp(v, -100000, 100000) : d);
  if (r.kind === 'grid') {
    const g = gridSize({ cols: fin(r.cols) ? r.cols : 1, rows: fin(r.rows) ? r.rows : 1 });
    return { kind: 'grid', cols: g.cols, rows: g.rows, dx: pos(r.dx, 0), dy: pos(r.dy, 0) };
  }
  if (r.kind === 'ring') {
    const out: RingRepeat = { kind: 'ring', count: ringCount({ count: fin(r.count) ? r.count : 1 }), cx: pos(r.cx, 0), cy: pos(r.cy, 0) };
    if (fin(r.sweep) && r.sweep !== RING_FULL) out.sweep = clamp(r.sweep, -RING_FULL, RING_FULL);
    if (r.turn === false) out.turn = false;
    return out;
  }
  if (r.kind === 'mirror') {
    const out: MirrorRepeat = { kind: 'mirror', x: pos(r.x, 0), y: pos(r.y, 0) };
    if (r.point === true) out.point = true;
    else if (fin(r.angle) && ((r.angle % 180) + 180) % 180 !== 90) out.angle = ((r.angle % 180) + 180) % 180;
    return out;
  }
  return undefined;
}

export const sameRepeat = (a: Repeat | undefined, b: Repeat | undefined): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------------------------------------------------------------- handles

export type HandleId = 'step' | 'centre' | 'point' | 'end';

/**
 * The places a repeat can be grabbed and moved on the stage. `from` is the middle of what is being repeated and `reach` how
 * far from the point a mirror line's turning end sits. A grid's one handle sits where the next copy's middle goes.
 */
export function repeatHandles(r: Repeat, from: Pt, reach: number): { id: HandleId; at: Pt }[] {
  if (r.kind === 'grid') return [{ id: 'step', at: { x: from.x + r.dx, y: from.y + r.dy } }];
  if (r.kind === 'ring') return [{ id: 'centre', at: { x: r.cx, y: r.cy } }];
  const out: { id: HandleId; at: Pt }[] = [{ id: 'point', at: { x: r.x, y: r.y } }];
  if (!r.point) out.push({ id: 'end', at: mirrorLine(r, reach).b });
  return out;
}

/** The repeat with one handle taken to `to`: the step to where the next copy lands, the centre or line point to there, the line's end round to face it. */
export function dragRepeat(r: Repeat, id: HandleId, to: Pt, from: Pt, opts: { steps?: boolean } = {}): Repeat {
  if (r.kind === 'grid' && id === 'step') return { ...r, dx: to.x - from.x, dy: to.y - from.y };
  if (r.kind === 'ring' && id === 'centre') return { ...r, cx: to.x, cy: to.y };
  if (r.kind === 'mirror' && id === 'point') return { ...r, x: to.x, y: to.y };
  if (r.kind === 'mirror' && id === 'end') {
    if (Math.hypot(to.x - r.x, to.y - r.y) < 1e-6) return r;
    let angle = lineAngle({ x: r.x, y: r.y }, to);
    if (opts.steps) angle = (Math.round(angle / 15) * 15) % 180;
    const out: MirrorRepeat = { ...r };
    if (angle === 90) delete out.angle;
    else out.angle = angle;
    return out;
  }
  return r;
}

// ---------------------------------------------------------------- carrying a repeat along

/**
 * The repeat after the whole thing it belongs to is moved, scaled or flipped by `m` (a copy pasted somewhere else, the page
 * resized): the centre or the line goes where it goes, and a grid's steps grow and flip with it. Dragging just the shape
 * does not use this, because then the centre and the line stay where they are. A grid's rows and columns stay straight, so
 * a turn is not carried into them.
 */
export function transformRepeat(r: Repeat, m: Matrix): Repeat {
  const at = (x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  if (r.kind === 'grid') return { ...r, dx: r.dx * m[0], dy: r.dy * m[3] };
  if (r.kind === 'ring') {
    const c = at(r.cx, r.cy);
    const out: RingRepeat = { ...r, cx: c.x, cy: c.y };
    if (flips(m) && r.sweep !== undefined && Math.abs(r.sweep) < RING_FULL) out.sweep = -r.sweep;
    return out;
  }
  const p = at(r.x, r.y);
  const out: MirrorRepeat = { ...r, x: p.x, y: p.y };
  if (!r.point) {
    const t = (r.angle ?? 90) * RAD;
    const dx = m[0] * Math.cos(t) + m[2] * Math.sin(t);
    const dy = m[1] * Math.cos(t) + m[3] * Math.sin(t);
    const a = lineAngle({ x: 0, y: 0 }, { x: dx, y: dy });
    if (a === 90) delete out.angle;
    else out.angle = a;
  }
  return out;
}
