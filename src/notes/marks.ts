// Marks drawn over the picture: the plain logic. What a mark is made of, reading them back from a file, which show on a
// frame, how an arrowhead and a scribble are worked out, and what a click lands on. Nothing here draws or touches the
// store, so it is easy to test. `withoutNotes` in model.ts takes marks out of every export, the same as notes.
import type { CanvasMark, Doc, Id } from '../core/format';
import { onOpenBoard, shownAt, type NotePin } from './model';

export type MarkKind = CanvasMark['kind'];

/** Limits so a damaged or hand-made file can't hold a scribble the size of a book. */
export const MAX_MARKS = 2000;
export const MAX_POINTS = 2000;
export const MAX_MARK_TEXT = 500;
export const MIN_W = 1;
export const MAX_W = 16;
export const DEFAULT_W = 3;

/** The pens on offer. The first is the default. Marks keep whatever colour they were drawn in. */
export const MARK_COLORS: readonly { value: string; name: string }[] = [
  { value: '#ff3b5c', name: 'Red' },
  { value: '#ff9f1c', name: 'Orange' },
  { value: '#ffd60a', name: 'Yellow' },
  { value: '#2ec27e', name: 'Green' },
  { value: '#3b82f6', name: 'Blue' },
  { value: '#a855f7', name: 'Purple' },
  { value: '#1d1b26', name: 'Black' },
  { value: '#ffffff', name: 'White' },
];
export const DEFAULT_COLOR = MARK_COLORS[0].value;

export const MARK_LABELS: Record<MarkKind, string> = { arrow: 'Arrow', circle: 'Circle', scribble: 'Sketch', text: 'Words' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round1 = (n: number) => Math.round(n * 10) / 10;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** How many numbers a kind needs at least (and, for the fixed ones, exactly). */
const NEEDS: Record<MarkKind, { min: number; max: number }> = {
  arrow: { min: 4, max: 4 },
  circle: { min: 4, max: 4 },
  text: { min: 2, max: 2 },
  scribble: { min: 4, max: MAX_POINTS * 2 },
};

/** The marks of a file, keeping only well-formed ones. A mark that is odd is dropped, never repaired into something else. */
export function readMarks(raw: unknown): CanvasMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CanvasMark[] = [];
  const seen = new Set<string>();
  for (const m of raw) {
    if (!isObj(m) || typeof m.kind !== 'string' || !(m.kind in NEEDS) || !Array.isArray(m.pts)) continue;
    const kind = m.kind as MarkKind;
    const need = NEEDS[kind];
    let pts = m.pts as unknown[];
    if (pts.length % 2) pts = pts.slice(0, pts.length - 1);
    if (pts.length < need.min || pts.length > need.max || !pts.every(finite)) continue;
    if (kind === 'text' && (typeof m.text !== 'string' || !m.text.trim())) continue;
    let id = typeof m.id === 'string' && m.id ? m.id : 'm' + out.length + Math.random().toString(36).slice(2, 8);
    if (seen.has(id)) id += Math.random().toString(36).slice(2, 6);
    seen.add(id);
    const mark: CanvasMark = { id, kind, pts: pts as number[] };
    if (typeof m.color === 'string' && HEX.test(m.color) && m.color.toLowerCase() !== DEFAULT_COLOR) mark.color = m.color;
    if (finite(m.w) && m.w >= MIN_W && m.w !== DEFAULT_W) mark.w = Math.min(MAX_W, m.w);
    if (kind === 'text') mark.text = (m.text as string).slice(0, MAX_MARK_TEXT);
    if (m.pin === 'frame' && finite(m.frame) && m.frame >= 0) {
      mark.pin = 'frame';
      mark.frame = Math.round(m.frame);
    } else if (m.pin === 'layer' && typeof m.layer === 'string' && m.layer) {
      mark.pin = 'layer';
      mark.layer = m.layer;
    }
    if (typeof m.board === 'string' && m.board) mark.board = m.board;
    out.push(mark);
    if (out.length >= MAX_MARKS) break;
  }
  return out.length ? out : undefined;
}

// ---------------------------------------------------------------- where a mark shows

/**
 * The marks to show on a frame of the open artboard: page marks always, frame marks on their frame, layer marks while
 * their layer has a drawing there. None while a symbol is open, since the page is not the one they were drawn on.
 */
export function visibleMarks(doc: Doc, frame: number): CanvasMark[] {
  if (!doc.marks?.length || doc.editing?.length) return [];
  return doc.marks.filter((m) => shownAt(m, doc, frame));
}

/** How many marks the open artboard has, on every frame, and how many show on this one. */
export function countMarks(doc: Doc, frame: number): { all: number; here: number } {
  const all = doc.editing?.length ? [] : (doc.marks ?? []).filter((m) => onOpenBoard(m, doc));
  return { all: all.length, here: all.filter((m) => shownAt(m, doc, frame)).length };
}

// ---------------------------------------------------------------- making one (pure)

export interface NewMarkSpec {
  id: Id;
  kind: MarkKind;
  pts: number[];
  color?: string;
  w?: number;
  text?: string;
  pin: NotePin;
  frame: number;
  layer?: Id;
  board?: Id;
}

/** A new mark with only what differs from the defaults written down. A layer mark with no layer is a page mark. */
export function makeMark(s: NewMarkSpec): CanvasMark {
  const m: CanvasMark = { id: s.id, kind: s.kind, pts: s.pts.map(round1) };
  if (s.color && HEX.test(s.color) && s.color.toLowerCase() !== DEFAULT_COLOR) m.color = s.color;
  const w = s.w === undefined ? DEFAULT_W : Math.max(MIN_W, Math.min(MAX_W, Math.round(s.w)));
  if (w !== DEFAULT_W) m.w = w;
  if (s.kind === 'text') m.text = (s.text ?? '').slice(0, MAX_MARK_TEXT);
  if (s.pin === 'frame') {
    m.pin = 'frame';
    m.frame = Math.max(0, Math.round(s.frame));
  } else if (s.pin === 'layer' && s.layer) {
    m.pin = 'layer';
    m.layer = s.layer;
  }
  if (s.board) m.board = s.board;
  return m;
}

/** Whether a finished drag is worth keeping: a tap that never went anywhere should not leave a speck. */
export function worthKeeping(kind: MarkKind, pts: readonly number[], minLen: number): boolean {
  if (kind === 'text') return pts.length >= 2;
  const b = boundsOf(pts);
  if (kind === 'scribble') return pts.length >= 4 && Math.max(b.w, b.h) >= minLen;
  return Math.hypot(b.w, b.h) >= minLen;
}

// ---------------------------------------------------------------- shapes (pure)

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundsOf(pts: readonly number[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

/**
 * The two ends of an arrowhead's wings for an arrow from (x1, y1) to (x2, y2): `len` long, opening `spread` degrees
 * either side of the shaft. An arrow with no length has no head.
 */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, len: number, spread = 26): [number, number, number, number] | null {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return null;
  const base = Math.atan2(dy, dx);
  const a = (spread * Math.PI) / 180;
  const l = Math.min(len, d * 0.6);
  return [x2 + Math.cos(base + a) * l, y2 + Math.sin(base + a) * l, x2 + Math.cos(base - a) * l, y2 + Math.sin(base - a) * l];
}

/** The arrowhead size for a line thickness, in the same units as the thickness. */
export const headLength = (w: number): number => 9 + w * 3;

/** Ramer-Douglas-Peucker: the same stroke with fewer points, none further than `tol` from the original. */
export function simplify(pts: readonly number[], tol: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return [...pts];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let best = tol;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(pts[i * 2], pts[i * 2 + 1], pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1]);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/** Cuts a long stroke back to at most `max` points by dropping evenly spaced ones (the last point stays). */
export function capPoints(pts: readonly number[], max = MAX_POINTS): number[] {
  const n = pts.length / 2;
  if (n <= max) return [...pts];
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const at = Math.min(n - 1, Math.round((i * (n - 1)) / (max - 1)));
    out.push(pts[at * 2], pts[at * 2 + 1]);
  }
  return out;
}

/** A scribble as an SVG path: a smooth line through the midpoints of its segments, so it reads as a pen stroke. */
export function smoothPath(pts: readonly number[]): string {
  const n = pts.length / 2;
  if (n === 0) return '';
  const f = (v: number) => String(round1(v));
  if (n === 1) return `M${f(pts[0])} ${f(pts[1])}l0.01 0`;
  if (n === 2) return `M${f(pts[0])} ${f(pts[1])}L${f(pts[2])} ${f(pts[3])}`;
  let d = `M${f(pts[0])} ${f(pts[1])}`;
  for (let i = 1; i < n - 1; i++) {
    const mx = (pts[i * 2] + pts[i * 2 + 2]) / 2;
    const my = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2;
    d += `Q${f(pts[i * 2])} ${f(pts[i * 2 + 1])} ${f(mx)} ${f(my)}`;
  }
  return d + `L${f(pts[n * 2 - 2])} ${f(pts[n * 2 - 1])}`;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The width and height of a text mark's box in stage pixels, from its words and size. A rough box is enough for hit tests. */
export function textBox(m: CanvasMark, fontSize: number): Box {
  const lines = (m.text ?? '').split('\n');
  const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
  return { x: m.pts[0], y: m.pts[1], w: Math.max(1, longest) * fontSize * 0.58, h: lines.length * fontSize * 1.25 };
}

/** The type size of a text mark in stage pixels for its line thickness: thicker pens write bigger. */
export const textSize = (m: Pick<CanvasMark, 'w'>): number => 18 + (m.w ?? DEFAULT_W) * 4;

/**
 * Whether a point (stage pixels) lands on a mark, within `tol` stage pixels of its line (a circle counts on its edge,
 * a text mark anywhere in its box). Used by the eraser.
 */
export function hitMark(m: CanvasMark, x: number, y: number, tol: number): boolean {
  const p = m.pts;
  if (m.kind === 'text') {
    const b = textBox(m, textSize(m));
    return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
  }
  if (m.kind === 'circle') {
    const cx = (p[0] + p[2]) / 2;
    const cy = (p[1] + p[3]) / 2;
    const rx = Math.abs(p[2] - p[0]) / 2;
    const ry = Math.abs(p[3] - p[1]) / 2;
    if (rx < 1e-6 || ry < 1e-6) return Math.hypot(x - cx, y - cy) <= tol + Math.max(rx, ry);
    // Distance from the edge, worked out on the unit circle and scaled back by the smaller radius: close enough for a click.
    const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return Math.abs(k - 1) * Math.min(rx, ry) <= tol;
  }
  for (let i = 0; i + 3 < p.length; i += 2) if (distToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= tol) return true;
  return p.length === 2 ? Math.hypot(x - p[0], y - p[1]) <= tol : false;
}

/** The topmost mark under a point: the last drawn wins. */
export function markAt(marks: readonly CanvasMark[], x: number, y: number, tol: number): CanvasMark | undefined {
  for (let i = marks.length - 1; i >= 0; i--) if (hitMark(marks[i], x, y, tol)) return marks[i];
  return undefined;
}

/** A colour that shows up behind a mark's line, so it reads on dark art and light art alike: dark behind light pens, light behind dark ones. */
export function haloFor(color: string): string {
  const h = color.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return 'rgba(255,255,255,0.8)';
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.62 ? 'rgba(20,18,30,0.75)' : 'rgba(255,255,255,0.8)';
}
