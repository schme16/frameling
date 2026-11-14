/**
 * Cutting a tween in two at a frame (drawing on an in-between, moving a property key into one) so the motion over the
 * whole span stays exactly as it was: each half plays its own part of the easing curve (`Tween.slice`), takes its share
 * of the spin and its piece of the motion path.
 */
import type { Drawing, InstanceShape, MotionPath, PathPoint, Tween } from './format';
import { cutSlice, tweenEase } from './ease';
import { buildPathTable, locate } from './motionPath';
import { isInstance, pairInstances, pointOnPath } from './symbols';

export interface TweenCut {
  /** The tween that now ends at the cut. */
  first: Tween;
  /** The tween the new key carries on with. */
  second: Tween;
  /**
   * Whole turns of the spin already done at the cut. The new key shows the pose with those turns taken off (they look
   * the same), so the halves can share the spin as whole turns.
   */
  turns: number;
}

export const MORPH_CUT_WHY = "That frame is inside a morph (one shape melting into the next), which can't be cut in two. Move the key onto a drawing key instead.";
export const OVERSHOOT_CUT_WHY = "The easing swings back and forth along the motion path around that frame, so the path can't be cut there. Pick another frame, or a smoother easing.";

/**
 * Why a tween can't be cut `at` (0..1 along its span of `length` frames), or null when it can. A morph can't. A motion
 * path can't when the easing runs back over ground it has covered (a bounce) or past the path's ends on either side of the
 * cut: each half's piece of the path runs start to end once.
 */
export function cutProblem(tw: Tween | undefined, at: number, length: number): string | null {
  if (!tw) return null;
  if (tw.kind === 'shape' || tw.hints?.length) return MORPH_CUT_WHY;
  if (tw.path && tw.path.points.length > 1) {
    const e = tweenEase(tw, at);
    if (e < 0 || e > 1) return OVERSHOOT_CUT_WHY;
    const eps = 1e-9;
    for (let f = 0; f <= length; f++) {
      const raw = f / length;
      const t = tweenEase(tw, raw);
      if (raw <= at ? t < -eps || t > e + eps : t < e - eps || t > 1 + eps) return OVERSHOOT_CUT_WHY;
    }
  }
  return null;
}

const tidy = (n: number): number => (Math.abs(n) < 1e-9 ? 0 : Math.round(n * 1e6) / 1e6);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mid = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const copyPoint = (p: PathPoint): PathPoint => ({ ...p, ...(p.c1 ? { c1: { ...p.c1 } } : {}), ...(p.c2 ? { c2: { ...p.c2 } } : {}) });

/**
 * Cuts a motion path where the follower is when it has gone `e` (0..1) of the way by distance. The follower measures
 * distance exactly (motionPath.ts), so the cut curve is split at the very point it stands on, and each piece keeps its
 * curves and plays exactly as that stretch of the whole did.
 */
export function splitPath(points: PathPoint[], e: number): [PathPoint[], PathPoint[]] {
  const whole = () => [points.map(copyPoint), points.map(copyPoint)] as [PathPoint[], PathPoint[]];
  if (points.length < 2) return whole();
  const tab = buildPathTable(points);
  if (!(tab.total > 0)) return whole();
  const at0 = locate(tab, Math.max(0, Math.min(1, e)) * tab.total);
  if (!at0) return whole();
  const j = at0.curve + 1;
  const t = at0.t;
  const q = points[j];
  const a = points[j - 1];
  const first = points.slice(0, j).map(copyPoint);
  const second = points.slice(j + 1).map(copyPoint);
  if (q.c1 && q.c2) {
    // De Casteljau at the curve parameter the follower had reached.
    const p01 = mid(a, q.c1, t);
    const p12 = mid(q.c1, q.c2, t);
    const p23 = mid(q.c2, q, t);
    const p012 = mid(p01, p12, t);
    const p123 = mid(p12, p23, t);
    const at = mid(p012, p123, t);
    first.push({ x: at.x, y: at.y, c1: p01, c2: p012 });
    second.unshift({ ...copyPoint(q), c1: p123, c2: p23 });
    second.unshift({ x: at.x, y: at.y });
  } else {
    const at = mid(a, q, t);
    first.push({ x: at.x, y: at.y });
    second.unshift(copyPoint(q));
    second.unshift({ x: at.x, y: at.y });
  }
  return [first, second];
}

/** Gives a tween `x` turns: the whole ones as its spin (what the user sees and edits), the fraction as its facing. */
function keepSpin(tw: Tween, x: number): void {
  const whole = Math.round(x);
  const frac = tidy(x - whole);
  if (whole) tw.spin = whole;
  if (frac) tw.facing = frac;
}

/**
 * The two halves of a tween cut `at` (0..1 along the span). Callers check `cutProblem` first. `faces` is false for
 * things that don't turn to face along a path (the camera).
 */
export function cutTween(tw: Tween, at: number, faces = true): TweenCut {
  const [s1, s2] = cutSlice(tw, at);
  // How far through the motion it is at the cut: the span's own eased progress (so with easing it is what shows).
  const e = tweenEase(tw, at);
  const base: Tween = { ...tw };
  delete base.slice;
  delete base.spin;
  delete base.facing;
  delete base.path;
  const first: Tween = { ...base };
  const second: Tween = { ...base };
  if (s1) first.slice = s1;
  if (s2) second.slice = s2;
  // The whole turns the user asked for and the path's facing fraction travel together; they are split apart again below.
  const spin = (tw.spin ?? 0) + (tw.facing ?? 0);
  // Turns the heading has gone through by the cut when the object turns to face along its path.
  let heading = 0;
  if (tw.path) {
    const pts = tw.path.points;
    const [p1, p2] = pts.length > 1 ? splitPath(pts, e) : [pts.map(copyPoint), pts.map(copyPoint)];
    first.path = { ...tw.path, points: p1 } as MotionPath;
    second.path = { ...tw.path, points: p2 } as MotionPath;
    if (faces && tw.path.orient && pts.length > 1) heading = (pointOnPath(tw.path, e).angle - pointOnPath(tw.path, 0).angle) / 360;
  }
  // The new key shows spin*e turns (and the heading) already done. Take whole turns off it and give them to the first
  // half; the rest of the spin, and the heading it can't show, are carried as small spins so both halves line up.
  const turns = Math.trunc(spin * e);
  const s1n = tidy(turns - heading);
  const s2n = tidy(spin - turns + heading);
  keepSpin(first, s1n);
  keepSpin(second, s2n);
  return { first, second, turns };
}

/**
 * Takes the whole turns a cut gave to the first half off the new key's copies (`shown` is the in-between copied into
 * the new key). Only copies that glide to a partner on the next key spin, so only those change. `from` is the key being
 * cut and `to` the key after it, in the order `shown`'s copies were made from.
 */
export function takeTurns(shown: { shapes: readonly unknown[] }, from: Drawing | undefined, to: Drawing | undefined, turns: number): void {
  if (!turns || from?.kind !== 'vector') return;
  const own = from.shapes.filter(isInstance);
  const pairs = pairInstances(own, to?.kind === 'vector' ? to.shapes.filter(isInstance) : []);
  (shown.shapes as { type: string; transform?: InstanceShape['transform'] }[]).filter((s) => s.type === 'instance').forEach((s, i) => {
    if (pairs[i] && s.transform) s.transform.rotation -= turns * 360;
  });
}
