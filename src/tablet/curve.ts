// The pressure curve: how hard you press (what the pen reports, 0 to 1) becomes how hard Frameling treats it. A cubic
// curve from (0, 0) to (1, 1) with two handles, plus a minimum (below this counts as no press) and a maximum (at or
// above this counts as full press). Pure maths, so it can be tested and drawn by the curve editor.

export interface Curve {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type CurvePreset = 'soft' | 'normal' | 'firm';

/** Soft: a light touch already counts for a lot. Normal: a straight line. Firm: you have to press harder. */
export const CURVE_PRESETS: Record<CurvePreset, Curve> = {
  soft: { x1: 0.15, y1: 0.55, x2: 0.4, y2: 0.95 },
  normal: { x1: 1 / 3, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 },
  firm: { x1: 0.6, y1: 0.05, x2: 0.85, y2: 0.4 },
};

export const PRESET_ORDER: CurvePreset[] = ['soft', 'normal', 'firm'];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The handles kept in range: x within 0 to 1 so the curve never doubles back, y within 0 to 1 so it never overshoots. */
export function cleanCurve(c: Partial<Curve> | undefined, fallback: Curve = CURVE_PRESETS.normal): Curve {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : d);
  return { x1: n(c?.x1, fallback.x1), y1: n(c?.y1, fallback.y1), x2: n(c?.x2, fallback.x2), y2: n(c?.y2, fallback.y2) };
}

/** The curve's output for an input from 0 to 1. */
export function curveAt(c: Curve, t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  // Find the curve parameter s whose x is the input (the x of a bezier with ends 0 and 1 rises with s), then read its y.
  let lo = 0;
  let hi = 1;
  let s = x;
  for (let i = 0; i < 28; i++) {
    const bx = 3 * (1 - s) * (1 - s) * s * c.x1 + 3 * (1 - s) * s * s * c.x2 + s * s * s;
    if (Math.abs(bx - x) < 1e-6) break;
    if (bx < x) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return clamp01(3 * (1 - s) * (1 - s) * s * c.y1 + 3 * (1 - s) * s * s * c.y2 + s * s * s);
}

export interface PressureShape {
  curve: Curve;
  /** Pressure at or below this counts as zero. 0 to 0.5. */
  min: number;
  /** Pressure at or above this counts as full. 0.5 to 1. */
  max: number;
}

export const MIN_PRESSURE_LIMIT = 0.5;
export const MAX_PRESSURE_LIMIT = 0.5;

/** Keeps min and max apart so the range never collapses. */
export function cleanRange(min: unknown, max: unknown): { min: number; max: number } {
  let lo = typeof min === 'number' && Number.isFinite(min) ? Math.min(MIN_PRESSURE_LIMIT, Math.max(0, min)) : 0;
  let hi = typeof max === 'number' && Number.isFinite(max) ? Math.max(MAX_PRESSURE_LIMIT, Math.min(1, max)) : 1;
  if (hi - lo < 0.1) {
    lo = Math.min(lo, hi - 0.1);
    hi = Math.max(hi, lo + 0.1);
  }
  return { min: lo, max: hi };
}

/** What the pen reported, after the minimum, the maximum and the curve. */
export function mapPressure(raw: number, shape: PressureShape): number {
  const t = clamp01((raw - shape.min) / Math.max(0.01, shape.max - shape.min));
  return curveAt(shape.curve, t);
}

/** The curve is the straight line it starts as (close enough that a nudge you can't see doesn't count). */
export function isPlainCurve(c: Curve): boolean {
  const n = CURVE_PRESETS.normal;
  return Math.abs(c.x1 - n.x1) + Math.abs(c.y1 - n.y1) + Math.abs(c.x2 - n.x2) + Math.abs(c.y2 - n.y2) < 0.02;
}

/** The preset a curve is (nearly) the same as, or 'custom'. */
export function presetOf(c: Curve): CurvePreset | 'custom' {
  const near = (a: Curve, b: Curve) => Math.abs(a.x1 - b.x1) + Math.abs(a.y1 - b.y1) + Math.abs(a.x2 - b.x2) + Math.abs(a.y2 - b.y2) < 0.02;
  for (const k of PRESET_ORDER) if (near(c, CURVE_PRESETS[k])) return k;
  return 'custom';
}
