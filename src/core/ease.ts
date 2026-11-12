/**
 * Easing: how in-betweens speed up and slow down. Named presets use the same names as Interactives, so a tween keeps
 * its feel when it moves there. A custom easing is a cubic bezier [x1, y1, x2, y2], like CSS.
 */
import type { Easing } from './format';

export interface EasePreset {
  id: Exclude<Easing, number[]>;
  /** Plain words first. */
  label: string;
  /** The industry name, shown second. */
  term: string;
  description: string;
}

export const EASE_PRESETS: EasePreset[] = [
  { id: 'linear', label: 'Steady', term: 'linear', description: 'The same speed all the way.' },
  { id: 'easeIn', label: 'Gentle start', term: 'ease in', description: 'Starts slowly and speeds up.' },
  { id: 'easeOut', label: 'Gentle stop', term: 'ease out', description: 'Moves off quickly and slows to a stop.' },
  { id: 'easeInOut', label: 'Gentle start and stop', term: 'ease in and out', description: 'Slow at both ends, quickest in the middle.' },
  { id: 'backIn', label: 'Wind up', term: 'anticipation', description: 'Pulls back a little before it goes.' },
  { id: 'backOut', label: 'Overshoot', term: 'back out', description: 'Goes a bit too far, then settles back.' },
  { id: 'elasticOut', label: 'Springy', term: 'elastic', description: 'Wobbles like a spring before it settles.' },
  { id: 'bounceOut', label: 'Bouncy', term: 'bounce', description: 'Lands and bounces, like a dropped ball.' },
];

export function presetOf(e: Easing): EasePreset | undefined {
  return typeof e === 'string' ? EASE_PRESETS.find((p) => p.id === e) : undefined;
}

/** Plain-words name of an easing ("Gentle stop", or "Custom curve"). */
export function easeLabel(e: Easing): string {
  return presetOf(e)?.label ?? 'Custom curve';
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) {
      // Newton wandered off: bisect instead.
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-7) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sy(t);
  };
}

const bezierCache = new Map<string, (t: number) => number>();

/** Eased progress for t in 0..1. Can go past 0 or 1 (overshoot, springy). */
export function ease(e: Easing | undefined, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (Array.isArray(e)) {
    const key = e.join(',');
    let fn = bezierCache.get(key);
    if (!fn) {
      fn = cubicBezier(e[0], e[1], e[2], e[3]);
      bezierCache.set(key, fn);
    }
    return fn(t);
  }
  switch (e) {
    case 'easeIn':
      return t * t * t;
    case 'easeOut':
      return 1 - Math.pow(1 - t, 3);
    case 'easeInOut':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'backIn': {
      const c = 1.70158;
      return (c + 1) * t * t * t - c * t * t;
    }
    case 'backOut': {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    }
    case 'elasticOut':
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    case 'bounceOut': {
      const n = 7.5625;
      const d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    }
    default:
      return t;
  }
}

/** A span's eased progress at `raw` (0..1 along the span): its easing curve, or the part of it the span plays. */
export function tweenEase(tw: { ease: Easing; slice?: [number, number] }, raw: number): number {
  const sl = tw.slice;
  if (!sl) return ease(tw.ease, raw);
  const a = ease(tw.ease, sl[0]);
  const d = ease(tw.ease, sl[1]) - a;
  if (Math.abs(d) < 1e-9) return raw;
  return (ease(tw.ease, sl[0] + (sl[1] - sl[0]) * Math.max(0, Math.min(1, raw))) - a) / d;
}

/**
 * The parts of the curve a span plays after being cut `at` (0..1 along the span) in two: first half, second half.
 * Each half plays its own part of the same curve, so the motion over the whole span does not change.
 */
export function cutSlice(tw: { slice?: [number, number] }, at: number): [[number, number] | undefined, [number, number] | undefined] {
  const [a, b] = tw.slice ?? [0, 1];
  const m = a + (b - a) * at;
  const tidy = (x: number, y: number): [number, number] | undefined => (x === 0 && y === 1 ? undefined : [x, y]);
  return [tidy(a, m), tidy(m, b)];
}

/** The nearest cubic bezier to a preset, so dragging a curve handle starts from what was there. */
export function bezierFor(e: Easing): [number, number, number, number] {
  if (Array.isArray(e)) return [e[0], e[1], e[2], e[3]];
  const presets: Record<string, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    easeIn: [0.42, 0, 1, 1],
    easeOut: [0, 0, 0.58, 1],
    easeInOut: [0.42, 0, 0.58, 1],
    backIn: [0.6, -0.28, 0.735, 0.045],
    backOut: [0.175, 0.885, 0.32, 1.275],
    elasticOut: [0.2, 1.6, 0.4, 1],
    bounceOut: [0.25, 1.3, 0.5, 1],
  };
  return presets[e] ?? [0.25, 0.1, 0.25, 1];
}

/** True for something that can be stored as an easing (used when reading files). */
export function isEasing(v: unknown): v is Easing {
  if (typeof v === 'string') return EASE_PRESETS.some((p) => p.id === v);
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}
