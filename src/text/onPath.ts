/**
 * Text on a path: the maths of putting letters along a curve. Pure: measuring is passed in, so tests run without a canvas.
 *
 * The curve is flattened to a polyline with its running length. Each letter takes the stretch of curve its width covers:
 * its left baseline corner sits where that stretch starts, and it is turned to point from there to where it ends, so
 * both ends of the letter's baseline touch the curve. Past the end of an open line the words carry on straight.
 */
import type { PathShape, Shape, SubPath, TextOnPath, TextShape } from '../core/format';
import { rdp, sampleSubPath, type V } from '../geometry/bezier';
import { invert, type Mat } from '../core/symbols';
import type { Glyph, Measure, TextLayout } from './model';

// ---------------------------------------------------------------- the curve as a polyline

export interface Poly {
  pts: V[];
  /** Running length at each point (cum[0] = 0). */
  cum: number[];
  length: number;
  closed: boolean;
}

/** Samples per bezier segment: enough that letters follow a bend smoothly. */
const PER_SEGMENT = 24;

/** The curve as a polyline, walked backwards when `reversed`. A closed curve ends where it began. */
export function polyOf(sp: SubPath, reversed = false): Poly {
  let pts = sampleSubPath(sp, PER_SEGMENT);
  if (sp.closed && pts.length) pts.push({ x: pts[0].x, y: pts[0].y });
  // Points that sit on each other add nothing and make a zero-length step.
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-9);
  if (reversed) pts = pts.slice().reverse();
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, length: cum[cum.length - 1] ?? 0, closed: sp.closed };
}

/** The point `d` along the curve. A closed curve wraps round; an open one goes on straight past either end. */
export function pointAt(poly: Poly, d: number): V {
  const { pts, cum, length } = poly;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1 || length <= 0) return { x: pts[0].x, y: pts[0].y };
  if (poly.closed) d = ((d % length) + length) % length;
  if (d <= 0 || d >= length) {
    // Straight on past the end, along the last (or first) step.
    const first = d <= 0;
    const a = first ? pts[0] : pts[pts.length - 1];
    const b = first ? pts[1] : pts[pts.length - 2];
    const l = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    // The way on: out of the end point, away from its neighbour, by how far d is past the end.
    const beyond = first ? -d : d - length;
    return { x: a.x + ((a.x - b.x) / l) * beyond, y: a.y + ((a.y - b.y) / l) * beyond };
  }
  // Binary search for the step holding d.
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / span;
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
}

/** Twice the signed area of a closed curve. Positive reads clockwise on the screen (y runs down). */
export function areaSign(sp: SubPath): number {
  const pts = sampleSubPath(sp, 8);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** Whether the words walk the curve backwards from how it was drawn, for this side and flip. */
export function isReversed(sp: SubPath, side: 'outside' | 'inside', flip: boolean): boolean {
  let back: boolean;
  if (sp.closed) {
    const clockwise = areaSign(sp) >= 0;
    // Outside reads clockwise, inside anticlockwise, so the letters always stand with their tops on the left of the way they go.
    back = side === 'outside' ? !clockwise : clockwise;
  } else {
    // An open line reads left to right whichever way it was drawn.
    const a = sp.points[0];
    const b = sp.points[sp.points.length - 1];
    back = !!a && !!b && b.x < a.x;
  }
  return back !== flip;
}

/** The curve as the words walk it. */
export function walkOf(p: TextOnPath): Poly {
  return polyOf(p.curve, isReversed(p.curve, p.side ?? 'outside', !!p.flip));
}

/** Where the line of words should begin so it sits at the top of a closed curve (outside) or the bottom (inside), centred. Open lines start at their start. */
export function defaultStart(sp: SubPath, side: 'outside' | 'inside', flip: boolean): number {
  if (!sp.closed) return 0;
  const poly = polyOf(sp, isReversed(sp, side, flip));
  if (poly.length <= 0) return 0;
  // The top of the curve is where y is smallest (the bottom where it is largest). For a flip the letters' tops face the other way.
  const wantTop = (side === 'outside') !== flip;
  let best = 0;
  for (let i = 1; i < poly.pts.length; i++) {
    if (wantTop ? poly.pts[i].y < poly.pts[best].y : poly.pts[i].y > poly.pts[best].y) best = i;
  }
  return poly.cum[best] / poly.length;
}

// ---------------------------------------------------------------- laying the letters out along it

/** Lays a text out the normal way, as one line (`layoutText` in model.ts: passed in so the two files need not import each other). */
export type StraightLayout = (s: TextShape, measure: Measure) => TextLayout;

/** A straight layout's letters moved onto the curve. The result has the same shape as a normal layout, with `rot` on each glyph. */
export function layoutOnPath(s: TextShape, measure: Measure, straight: StraightLayout): TextLayout {
  const p = s.onPath!;
  const run = straight({ ...s, onPath: undefined, animators: undefined, text: s.text.replace(/\r?\n/g, ' '), align: 'left' }, measure);
  const poly = walkOf(p);
  const total = run.lines[0]?.w ?? 0;
  const begin = (p.start ?? 0) * poly.length - (s.align === 'center' ? total / 2 : s.align === 'right' ? total : 0);
  // Where the baseline sits: on the curve, nudged away on the letters' side, and for an open line hung under it when inside.
  const hang = !p.curve.closed && p.side === 'inside' ? -s.size * 0.72 : 0;
  const away = (p.offset ?? 0) + hang;
  const glyphs: Glyph[] = [];
  for (const g of run.glyphs) {
    const w = g.w;
    const a = pointAt(poly, begin + g.x);
    const b = pointAt(poly, begin + g.x + Math.max(w, 0.01));
    const rot = Math.atan2(b.y - a.y, b.x - a.x);
    // The letters' tops point to the left of the way the words go (up on a line that goes right).
    const nx = Math.sin(rot);
    const ny = -Math.cos(rot);
    glyphs.push({ ...g, x: a.x + nx * away, y: a.y + ny * away, line: 0, rot });
  }
  const ascent = run.ascent;
  const descent = run.descent;
  const box = boundsOfGlyphs(glyphs, ascent, descent, s.size);
  const first = glyphs[0];
  return {
    glyphs,
    lines: [{ y: first?.y ?? 0, x: first?.x ?? 0, w: total, text: run.lines[0]?.text ?? '' }],
    letters: run.letters,
    words: run.words,
    box,
    ascent,
    descent,
  };
}

/** The four corners of a glyph's box on the page: left baseline, right baseline, then the matching top and bottom. */
export function glyphCorners(g: Glyph, ascent: number, descent: number): V[] {
  const c = Math.cos(g.rot ?? 0);
  const sn = Math.sin(g.rot ?? 0);
  const at = (lx: number, ly: number): V => ({ x: g.x + lx * c - ly * sn, y: g.y + lx * sn + ly * c });
  return [at(0, -ascent), at(g.w, -ascent), at(g.w, descent), at(0, descent)];
}

function boundsOfGlyphs(glyphs: Glyph[], ascent: number, descent: number, size: number): TextLayout['box'] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of glyphs) {
    if (g.letter < 0) continue;
    for (const p of glyphCorners(g, ascent, descent)) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  if (x0 > x1) return { x: 0, y: -ascent, w: size * 0.3, h: ascent + descent };
  return { x: x0, y: y0, w: Math.max(x1 - x0, size * 0.3), h: Math.max(y1 - y0, size * 0.3) };
}

/** Is a point (in the text's space) on one of the letters? `tol` is how far off still counts. */
export function hitGlyphs(layout: TextLayout, x: number, y: number, tol: number): boolean {
  for (const g of layout.glyphs) {
    if (g.letter < 0) continue;
    const c = Math.cos(g.rot ?? 0);
    const sn = Math.sin(g.rot ?? 0);
    const dx = x - g.x;
    const dy = y - g.y;
    const lx = dx * c + dy * sn;
    const ly = -dx * sn + dy * c;
    if (lx >= -tol && lx <= g.w + tol && ly >= -layout.ascent - tol && ly <= layout.descent + tol) return true;
  }
  return false;
}

/** The centre a letter turns and scales about, on the page (a little above the baseline, in the middle of its width). */
export function glyphCentre(g: Glyph, ascent: number): V {
  const r = g.rot ?? 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const up = ascent * 0.35;
  return { x: g.x + (g.w / 2) * c + up * s, y: g.y + (g.w / 2) * s - up * c };
}

/** The matrix that puts a letter drawn with its left baseline at 0,0 where the layout wants it (turn, then move). */
export function glyphMatrix(g: Glyph): Mat {
  const c = Math.cos(g.rot ?? 0);
  const s = Math.sin(g.rot ?? 0);
  return [c, s, -s, c, g.x, g.y];
}

// ---------------------------------------------------------------- the curve out of a shape

/** How closely a drawn line is simplified before it is kept: the words won't notice, the file stays small. */
const SIMPLIFY = 0.35;
const MAX_POINTS = 600;

const round2 = (v: number) => Math.round(v * 100) / 100;

function roundPath(sp: SubPath): SubPath {
  return {
    closed: sp.closed,
    points: sp.points.map((p) => {
      const q: SubPath['points'][number] = { x: round2(p.x), y: round2(p.y) };
      if (p.c1 && p.c2) {
        q.c1 = { x: round2(p.c1.x), y: round2(p.c1.y) };
        q.c2 = { x: round2(p.c2.x), y: round2(p.c2.y) };
      }
      return q;
    }),
  };
}

/** Whether a shape can be a curve for words to follow: a drawn line, a path, or a filled shape. */
export function isCurveShape(s: Shape): boolean {
  return s.type === 'stroke' || s.type === 'path' || s.type === 'fill';
}

/** The first outline of a path or filled shape that has at least two points (the longest of them when there are several). */
function mainSubPath(paths: SubPath[]): SubPath | null {
  let best: SubPath | null = null;
  let bestLen = -1;
  for (const sp of paths) {
    if (sp.points.length < 2) continue;
    const l = polyOf(sp).length;
    if (l > bestLen) {
      best = sp;
      bestLen = l;
    }
  }
  return best;
}

/** A shape's line as a curve in the drawing's space, or null when it has none (too short, or not a line at all). */
export function curveOfShape(s: Shape): SubPath | null {
  if (s.type === 'path' || s.type === 'fill') {
    const sp = mainSubPath((s as PathShape).paths);
    return sp && polyOf(sp).length > 0 ? roundPath(sp) : null;
  }
  if (s.type === 'stroke') {
    let pts: V[] = s.points.map((p) => ({ x: p.x, y: p.y }));
    if (pts.length < 2) return null;
    if (pts.length > 3) pts = rdp(pts, SIMPLIFY);
    // A very long wobbly line is thinned further, so it cannot make the file heavy.
    for (let eps = SIMPLIFY * 2; pts.length > MAX_POINTS; eps *= 2) pts = rdp(pts, eps);
    const sp: SubPath = { closed: false, points: pts.map((p) => ({ x: p.x, y: p.y })) };
    return polyOf(sp).length > 0 ? roundPath(sp) : null;
  }
  return null;
}

/** A curve moved by a matrix (bezier controls too). */
export function curveThrough(sp: SubPath, m: readonly number[]): SubPath {
  const f = (p: V): V => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
  return {
    closed: sp.closed,
    points: sp.points.map((p) => {
      const q: SubPath['points'][number] = { ...f(p) };
      if (p.c1 && p.c2) {
        q.c1 = f(p.c1);
        q.c2 = f(p.c2);
      }
      return q;
    }),
  };
}

/** The curve in the text's own space, given the curve in the drawing's space and the text's matrix. */
export function curveInTextSpace(docCurve: SubPath, textMat: readonly number[]): SubPath {
  return roundPath(curveThrough(docCurve, invert(textMat)));
}

/** The words' curve moved onto the drawing: how the stage sees it (for tests and for drawing a guide). */
export function curveOnStage(p: TextOnPath, textMat: readonly number[]): SubPath {
  return curveThrough(p.curve, textMat);
}

/** True when two curves are the same to a fraction of a pixel. */
export function sameCurve(a: SubPath, b: SubPath, eps = 0.011): boolean {
  if (a.closed !== b.closed || a.points.length !== b.points.length) return false;
  const near = (p?: V, q?: V) => (!p && !q) || (!!p && !!q && Math.abs(p.x - q.x) <= eps && Math.abs(p.y - q.y) <= eps);
  for (let i = 0; i < a.points.length; i++) {
    const p = a.points[i];
    const q = b.points[i];
    if (!near(p, q) || !near(p.c1, q.c1) || !near(p.c2, q.c2)) return false;
  }
  return true;
}

/** Things that change how the letters sit, as one string, for caching a layout. */
const sigs = new WeakMap<TextOnPath, string>();
export function pathSignature(p: TextOnPath | undefined): string {
  if (!p) return '';
  let v = sigs.get(p);
  if (v === undefined) {
    v = JSON.stringify([p.curve, p.side ?? 'outside', !!p.flip, p.start ?? 0, p.offset ?? 0]);
    sigs.set(p, v);
  }
  return v;
}

/** A new on-path setting for a curve: the side, the flip and where the words begin worked out so they sit well. */
export function newOnPath(curve: SubPath, source: string | undefined, side: 'outside' | 'inside' = 'outside'): TextOnPath {
  return { ...(source ? { source } : {}), curve, side, start: round2(defaultStart(curve, side, false) * 1000) / 1000 };
}

/** The same words on the other side or the other way round: where they begin is worked out again so they stay in view. */
export function turnedOnPath(p: TextOnPath, change: { side?: 'outside' | 'inside'; flip?: boolean }): TextOnPath {
  const side = change.side ?? p.side ?? 'outside';
  const flip = change.flip ?? !!p.flip;
  const out: TextOnPath = { ...p, side, ...(flip ? { flip: true } : {}), start: round2(defaultStart(p.curve, side, flip) * 1000) / 1000 };
  if (!flip) delete out.flip;
  return out;
}
