/**
 * Response curves for the pixel brush's pen routes. A curve says how an input (0 to 1) turns into what the route
 * sees (0 to 1): a straight line is the plain brush, a bend that rises early is a light touch that reaches full
 * quickly, a bend that rises late needs a firm press. It is a short list of points joined smoothly (monotone cubic,
 * so the line never wiggles past its own points). Pure functions, no DOM.
 *
 * The first point sits at 0 and the last at 1 (only their heights move), so every curve covers the whole input.
 */

export type Curve = readonly (readonly [number, number])[];

export const MAX_CURVE_POINTS = 8;
/** Points closer together than this (along the input) are one point. */
export const MIN_GAP = 0.02;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export const STRAIGHT: Curve = Object.freeze([Object.freeze([0, 0] as const), Object.freeze([1, 1] as const)]);

/** True when the curve is the plain diagonal (so a route can leave it out). */
export const isStraight = (c: Curve | undefined | null): boolean => !c || (c.length === 2 && c[0][1] === 0 && c[1][1] === 1);

/**
 * Drops the least useful points until at most `max` remain: each round removes the point that sits closest to the straight
 * line between its neighbours, so the shape survives. Used when a brush file brings a long list of points.
 */
export function thin(points: readonly (readonly [number, number])[], max: number = MAX_CURVE_POINTS): [number, number][] {
  const p = points.map((q) => [q[0], q[1]] as [number, number]);
  while (p.length > Math.max(2, max)) {
    let at = 1;
    let least = Infinity;
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1];
      const b = p[i + 1];
      const t = (p[i][0] - a[0]) / Math.max(1e-9, b[0] - a[0]);
      const d = Math.abs(p[i][1] - (a[1] + (b[1] - a[1]) * t));
      if (d < least) {
        least = d;
        at = i;
      }
    }
    p.splice(at, 1);
  }
  return p;
}

/**
 * A curve read from saved or shared data, or null when it is not one worth keeping. Anything off is mended rather than
 * trusted: points held to 0 to 1, put in order, the ends pinned to 0 and 1, near-duplicates merged, and a long list thinned.
 * A straight curve comes back null (nothing to keep).
 */
export function cleanCurve(raw: unknown): Curve | null {
  if (!Array.isArray(raw)) return null;
  const pts: [number, number][] = [];
  for (const q of raw) {
    if (!Array.isArray(q) || q.length < 2) continue;
    const x = q[0];
    const y = q[1];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    pts.push([clamp01(x), clamp01(y)]);
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a[0] - b[0]);
  // The ends: the first point is the input 0, the last the input 1, whatever x they came with.
  pts[0][0] = 0;
  pts[pts.length - 1][0] = 1;
  const kept: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = i === pts.length - 1;
    if (last) {
      // The end replaces anything crowding it.
      while (kept.length > 1 && 1 - kept[kept.length - 1][0] < MIN_GAP) kept.pop();
      kept.push(pts[i]);
    } else if (pts[i][0] - kept[kept.length - 1][0] >= MIN_GAP) kept.push(pts[i]);
  }
  if (kept.length < 2) return null;
  const out = thin(kept.map((q) => [r3(q[0]), r3(q[1])] as [number, number]));
  return isStraight(out) ? null : out;
}

export const sameCurve = (a: Curve | undefined | null, b: Curve | undefined | null): boolean => {
  if (isStraight(a) || isStraight(b)) return isStraight(a) && isStraight(b);
  return a!.length === b!.length && a!.every((p, i) => Math.abs(p[0] - b![i][0]) < 1e-6 && Math.abs(p[1] - b![i][1]) < 1e-6);
};

/** The slope at each point for a smooth monotone curve (Fritsch and Carlson): rising stays rising, flat stays flat. */
function slopes(p: Curve): Float64Array {
  const n = p.length;
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]);
  const m = new Float64Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}

/** The curve's height at `x`, worked out directly (use `lutOf` in a hot loop). */
export function curveAt(c: Curve, x: number): number {
  const v = clamp01(x);
  const n = c.length;
  if (n < 2) return v;
  const m = slopes(c);
  let i = 0;
  while (i < n - 2 && v > c[i + 1][0]) i++;
  const h = c[i + 1][0] - c[i][0];
  const t = (v - c[i][0]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const y = (2 * t3 - 3 * t2 + 1) * c[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * c[i + 1][1] + (t3 - t2) * h * m[i + 1];
  return clamp01(y);
}

export const LUT_SIZE = 256;
const luts = new WeakMap<object, Float32Array>();

/** The curve sampled at LUT_SIZE + 1 evenly spaced inputs, kept per curve so a dab only does a lookup. */
export function lutOf(c: Curve): Float32Array {
  let l = luts.get(c);
  if (!l) {
    l = new Float32Array(LUT_SIZE + 1);
    for (let i = 0; i <= LUT_SIZE; i++) l[i] = curveAt(c, i / LUT_SIZE);
    luts.set(c, l);
  }
  return l;
}

/** Through the curve with a lookup and a blend between the two nearest entries. */
export function shape(c: Curve, x: number): number {
  const l = lutOf(c);
  const f = clamp01(x) * LUT_SIZE;
  const i = f | 0;
  if (i >= LUT_SIZE) return l[LUT_SIZE];
  return l[i] + (l[i + 1] - l[i]) * (f - i);
}

// ---------------------------------------------------------------- editing (the editor's moves, kept pure)

/** One point moved to a new place. The ends only slide up and down; the others stay between their neighbours. */
export function movePoint(c: Curve, i: number, x: number, y: number): Curve {
  const p = c.map((q) => [q[0], q[1]] as [number, number]);
  if (i < 0 || i >= p.length) return c;
  const last = p.length - 1;
  if (i === 0 || i === last) p[i][1] = r3(clamp01(y));
  else {
    const lo = p[i - 1][0] + MIN_GAP;
    const hi = p[i + 1][0] - MIN_GAP;
    p[i] = [r3(Math.min(hi, Math.max(lo, x))), r3(clamp01(y))];
  }
  return p;
}

/** A new point at `x`, sitting on the curve where it is (so adding one changes nothing until it is dragged). Null when full or crowded. */
export function addPoint(c: Curve, x: number): { curve: Curve; index: number } | null {
  if (c.length >= MAX_CURVE_POINTS) return null;
  const v = clamp01(x);
  let at = c.findIndex((q) => q[0] > v);
  if (at < 1) return null;
  if (v - c[at - 1][0] < MIN_GAP || c[at][0] - v < MIN_GAP) return null;
  const p = c.map((q) => [q[0], q[1]] as [number, number]);
  p.splice(at, 0, [r3(v), r3(curveAt(c, v))]);
  return { curve: p, index: at };
}

/** A point taken away. The two ends stay. */
export function removePoint(c: Curve, i: number): Curve {
  if (i <= 0 || i >= c.length - 1) return c;
  return c.filter((_, k) => k !== i);
}

/** Ready-made feels, in the words a person would use for them. */
export interface CurveFeel {
  id: string;
  label: string;
  hint: string;
  curve: Curve;
}

export const FEELS: CurveFeel[] = [
  { id: 'straight', label: 'Even', hint: 'Straight through: twice the press, twice the effect.', curve: STRAIGHT },
  { id: 'light', label: 'Light touch', hint: 'A gentle press already does most of the work, so a light hand still gets a full mark.', curve: [[0, 0], [0.25, 0.5], [0.6, 0.85], [1, 1]] },
  { id: 'firm', label: 'Firm hand', hint: 'Needs a proper press to get going, so a light hand stays small and faint.', curve: [[0, 0], [0.4, 0.15], [0.75, 0.5], [1, 1]] },
  { id: 'soft-ends', label: 'Soft ends', hint: 'Slow to start and slow to finish, quick through the middle.', curve: [[0, 0], [0.3, 0.15], [0.7, 0.85], [1, 1]] },
  { id: 'ignore-light', label: 'Ignore the lightest', hint: 'Nothing happens until the press passes a fifth, which stops tiny accidental marks.', curve: [[0, 0], [0.2, 0], [1, 1]] },
];

/** Which feel a curve is, or null for one made by hand. */
export const feelOf = (c: Curve | undefined | null): CurveFeel | null => FEELS.find((f) => sameCurve(f.curve, c)) ?? null;
