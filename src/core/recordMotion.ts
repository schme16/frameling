/**
 * Record a move: turns a drag (pointer positions with times) into a handful of keys, or one smooth path with the timing
 * kept. Pure maths on points, no store and no DOM, so it can be tested on its own.
 *
 * A raw drag is a position every few milliseconds, far too many to be useful as keys. So the drag is first read off
 * once per frame (what a key can hold), then thinned: a key stays only when leaving it out would make the thing stray
 * further than a tolerance from where the hand really was, at that moment. That is the Ramer-Douglas-Peucker idea, but
 * judged on position at each frame (not just the shape of the line), so a pause or a change of speed keeps its key. Each
 * stretch between two keys also picks the easing that suits the hand best, so a slow start becomes "gentle start"
 * instead of three extra keys.
 *
 * The other way to keep a move is as a path: the line the hand drew, fitted with a few curves (the same fit that turns
 * a brush stroke into an editable line), plus one easing curve that carries the timing.
 */
import type { Easing, PathPoint } from './format';
import { fitCurve, rdp, type V } from '../geometry/bezier';

/** One pointer reading: seconds since the press, and where it was. */
export interface Sample {
  t: number;
  x: number;
  y: number;
}

/** A key of a recorded move. Positions are relative to where the move started, so (0, 0) is the first key. */
export interface MoveKey {
  /** Frames after the start. */
  frame: number;
  x: number;
  y: number;
  /** How it eases into the next key (the last key has none to give). */
  ease: Easing;
}

export type Keep = 'keys' | 'path';

export interface MovePlan {
  keep: Keep;
  /** Frames from the first key to the last. */
  frames: number;
  keys: MoveKey[];
  /** Path mode: the line to follow, relative to the start, and the easing that carries the timing along it. */
  path?: { points: PathPoint[]; ease: Easing };
}

/** The most seconds one recording can run, so a forgotten mouse button doesn't make a giant document. */
export const MAX_RECORD_SECONDS = 30;

/** Where the Detail slider starts: enough to keep the shape of a move with about a key every few frames. */
export const DEFAULT_DETAIL = 0.5;

/**
 * How far (in stage pixels) a dropped key may leave the hand's real position. Detail 0 is loose and 1 keeps every
 * frame. It falls off steeply, so the slider feels even from end to end. `scale` is the stage size over 1000, so a big
 * stage forgives bigger wobbles than a small one.
 */
export function toleranceFor(detail: number, scale = 1): number {
  const d = Math.min(1, Math.max(0, detail));
  if (d >= 0.995) return 0;
  return 60 * scale * Math.pow(0.03, d);
}

/** The whole-number scale `toleranceFor` wants, from a stage's size. */
export function stageScale(width: number, height: number): number {
  return Math.max(width, height, 1) / 1000;
}

const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);

/** The pointer readings sorted by time, with repeats of the same moment dropped. */
function cleaned(samples: Sample[]): Sample[] {
  const s = samples.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.t - b.t);
  const out: Sample[] = [];
  for (const p of s) {
    const l = out[out.length - 1];
    if (l && p.t - l.t < 1e-6) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/**
 * Reads the drag once per frame: entry k is where the pointer was k frames after the first reading, in between readings
 * by a straight line. Always at least two entries when there is any time between the first and last reading.
 */
export function resample(samples: Sample[], fps: number): V[] {
  const s = cleaned(samples);
  if (s.length < 2) return [];
  const t0 = s[0].t;
  const dur = Math.min(MAX_RECORD_SECONDS, s[s.length - 1].t - t0);
  const n = Math.max(1, Math.round(dur * fps));
  const out: V[] = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const t = t0 + Math.min(dur, k / fps);
    while (j < s.length - 2 && s[j + 1].t < t) j++;
    const a = s[j];
    const b = s[j + 1];
    const u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out.map((p) => ({ x: p.x - out[0].x, y: p.y - out[0].y }));
}

// ---------------------------------------------------------------- the easings a span can pick from

const EASES: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut'];
const easeFn = (e: Easing, t: number): number => {
  switch (e) {
    case 'easeIn':
      return t * t * t;
    case 'easeOut':
      return 1 - Math.pow(1 - t, 3);
    case 'easeInOut':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
};

/** The cubic bezier easing [x1, y1, x2, y2] at `t`, solved by bisection (the app's own copy caches by key, which a search would fill). */
function bezierEase(c: [number, number, number, number], t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = c;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let lo = 0;
  let hi = 1;
  let s = t;
  for (let i = 0; i < 30; i++) {
    const x = ((ax * s + bx) * s + cx) * s;
    if (x < t) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return ((ay * s + by) * s + cy) * s;
}

// ---------------------------------------------------------------- thinning to keys

interface Span {
  err: number;
  /** The frame that strays furthest under the chosen easing. */
  worst: number;
  ease: Easing;
}

/** How well keys at frames i and j describe what is between them, with the easing that suits best. */
function fitSpan(pts: V[], i: number, j: number): Span {
  const a = pts[i];
  const b = pts[j];
  const len = j - i;
  let linear: Span | null = null;
  let best: Span | null = null;
  for (const e of EASES) {
    let err = 0;
    let worst = i + 1;
    for (let k = i + 1; k < j; k++) {
      const u = easeFn(e, (k - i) / len);
      const d = Math.hypot(pts[k].x - (a.x + (b.x - a.x) * u), pts[k].y - (a.y + (b.y - a.y) * u));
      if (d > err) {
        err = d;
        worst = k;
      }
    }
    const here: Span = { err, worst, ease: e };
    if (!linear) linear = best = here;
    // A fancier easing has to be clearly better than steady, or plain keys win.
    else if (err < linear.err * 0.6 && err < best!.err) best = here;
  }
  return best!;
}

/**
 * Thins one reading per frame down to keys. `tol` is how far a dropped frame may stray, in stage pixels; 0 keeps every
 * frame. Returns keys at whole frames from 0 to the last, each with the easing into the next.
 */
export function thinKeys(pts: V[], tol: number): MoveKey[] {
  const n = pts.length - 1;
  if (n < 1) return [];
  const key = (frame: number, ease: Easing): MoveKey => ({ frame, x: pts[frame].x, y: pts[frame].y, ease });
  if (tol <= 0) return pts.map((_, f) => key(f, 'linear'));
  const keep = new Map<number, Easing>();
  const stack: [number, number][] = [[0, n]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const fit = j - i > 1 ? fitSpan(pts, i, j) : { err: 0, worst: i, ease: 'linear' as Easing };
    if (fit.err <= tol) {
      keep.set(i, fit.ease);
      continue;
    }
    stack.push([i, fit.worst], [fit.worst, j]);
  }
  const frames = [...keep.keys(), n].sort((a, b) => a - b);
  return frames.map((f) => key(f, keep.get(f) ?? 'linear'));
}

/** Where a set of keys puts the thing at each frame, easing and all. For checking a result against the hand. */
export function playKeys(keys: MoveKey[]): V[] {
  const out: V[] = [];
  for (let s = 0; s < keys.length - 1; s++) {
    const a = keys[s];
    const b = keys[s + 1];
    for (let f = a.frame; f < b.frame; f++) {
      const u = easeFn(a.ease, (f - a.frame) / (b.frame - a.frame));
      out[f] = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  const last = keys[keys.length - 1];
  if (last) out[last.frame] = { x: last.x, y: last.y };
  return out;
}

// ---------------------------------------------------------------- one smooth path

const norm = (v: V): V => {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-12 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};

/** The line the hand drew as a few curves (or every point, when `tol` is 0). Null when the hand hardly moved. */
export function fitPath(pts: V[], tol: number): PathPoint[] | null {
  const p: V[] = [];
  for (const q of pts) {
    const l = p[p.length - 1];
    if (!l || dist(l, q) > 1e-6) p.push(q);
  }
  if (p.length < 2) return null;
  if (p.length === 2) return [{ x: p[0].x, y: p[0].y }, { x: p[1].x, y: p[1].y }];
  if (tol <= 0) return p.map((q) => ({ x: q.x, y: q.y }));
  const flat = rdp(p, tol * 0.25);
  const k = Math.min(3, p.length - 1);
  const t1 = norm({ x: p[k].x - p[0].x, y: p[k].y - p[0].y });
  const t2 = norm({ x: p[p.length - 1 - k].x - p[p.length - 1].x, y: p[p.length - 1 - k].y - p[p.length - 1].y });
  if (flat.length === 2) return [{ x: flat[0].x, y: flat[0].y }, { x: flat[1].x, y: flat[1].y }];
  const cubics = fitCurve(p, tol, t1, t2);
  if (!cubics.length) return null;
  const out: PathPoint[] = [{ x: cubics[0][0].x, y: cubics[0][0].y }];
  for (const [a, c1, c2, e] of cubics) {
    const pt: PathPoint = { x: e.x, y: e.y };
    const straight = c1.x === a.x && c1.y === a.y && c2.x === e.x && c2.y === e.y;
    if (!straight) {
      pt.c1 = { x: c1.x, y: c1.y };
      pt.c2 = { x: c2.x, y: c2.y };
    }
    out.push(pt);
  }
  return out;
}

/** How far along the hand's line it had got at each frame, 0 to 1 (by distance, so a pause shows as a flat bit). */
export function progressOf(pts: V[]): number[] {
  const run = [0];
  for (let k = 1; k < pts.length; k++) run.push(run[k - 1] + dist(pts[k], pts[k - 1]));
  const total = run[run.length - 1];
  return total > 0 ? run.map((r) => r / total) : run.map((_, k) => k / Math.max(1, run.length - 1));
}

/** Mean squared gap between an easing and the progress of the hand. */
function easeError(progress: number[], f: (t: number) => number): number {
  const n = progress.length - 1;
  let sum = 0;
  for (let k = 0; k <= n; k++) {
    const d = f(k / n) - progress[k];
    sum += d * d;
  }
  return sum / (n + 1);
}

/**
 * The easing that carries the hand's timing along a path: the best of the four plain ones, or when none is close, a
 * custom curve found by a small search (two handles, so "quick, then settling" comes out as it was done).
 */
export function fitEase(progress: number[]): Easing {
  if (progress.length < 3) return 'linear';
  let best: Easing = 'linear';
  let bestErr = easeError(progress, (t) => t);
  for (const e of EASES) {
    const err = easeError(progress, (t) => easeFn(e, t));
    // Steady wins ties and near ties: it's the plainest answer.
    if (err < bestErr * 0.7) {
      best = e;
      bestErr = err;
    }
  }
  // Under about 2% of the line off, a plain easing is close enough.
  if (bestErr < 0.0004) return best;
  let c: [number, number, number, number] = best === 'easeIn' ? [0.55, 0, 0.9, 0.5] : best === 'easeOut' ? [0.1, 0.5, 0.45, 1] : [0.42, 0, 0.58, 1];
  let cur = easeError(progress, (t) => bezierEase(c, t));
  for (let step = 0.2; step > 0.004; step *= 0.6) {
    for (let round = 0; round < 6; round++) {
      let moved = false;
      for (let i = 0; i < 4; i++) {
        for (const dir of [-1, 1]) {
          const next = c.slice() as [number, number, number, number];
          next[i] += dir * step;
          // The two time handles stay inside the span, the two progress handles inside 0 to 1, so it never runs backwards.
          next[i] = Math.min(1, Math.max(0, next[i]));
          const err = easeError(progress, (t) => bezierEase(next, t));
          if (err < cur - 1e-9) {
            c = next;
            cur = err;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }
  // A custom curve only when it clearly beats the plain one.
  if (cur > bestErr * 0.5) return best;
  return c.map((v) => Math.round(v * 100) / 100) as [number, number, number, number];
}

// ---------------------------------------------------------------- the plan

/**
 * Everything a recording turns into. `detail` is the slider (0 loose, 1 every frame); `scale` is `stageScale()`.
 * Returns null when the hand didn't move, or the press was too short to hold even one frame.
 */
export function planMove(samples: Sample[], fps: number, detail: number, keep: Keep = 'keys', scale = 1): MovePlan | null {
  const pts = resample(samples, fps);
  if (pts.length < 2) return null;
  if (!pts.some((p) => Math.hypot(p.x, p.y) > 0.5)) return null;
  const tol = toleranceFor(detail, scale);
  const frames = pts.length - 1;
  if (keep === 'path') {
    const line = fitPath(pts, tol);
    if (!line) return null;
    const end = pts[frames];
    // The path ends where the hand did, exactly, so the keys and the line agree.
    line[line.length - 1] = { ...line[line.length - 1], x: end.x, y: end.y };
    const ease = fitEase(progressOf(pts));
    return { keep, frames, keys: [{ frame: 0, x: 0, y: 0, ease }, { frame: frames, x: end.x, y: end.y, ease: 'linear' }], path: { points: line, ease } };
  }
  return { keep, frames, keys: thinKeys(pts, tol) };
}
