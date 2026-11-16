/**
 * Curves and Levels: the maths. Both are a table of 256 numbers (what each brightness from 0 to 255 becomes), one per
 * colour, so applying them to a picture is a lookup per pixel. Pure functions with no DOM, so the curve evaluation, the
 * levels and the way the two combine are tested on their own.
 *
 * Levels says three things: the darkest the picture goes (anything that dark or darker becomes black), the lightest
 * (that light or lighter becomes white), and the midtones (a gamma: above 1 brightens the middle, below 1 darkens it).
 * Curves is a line you bend: brightness in along the bottom, brightness out up the side, through points you drag.
 */

export type Channel = 'all' | 'r' | 'g' | 'b';
export const CHANNELS: Channel[] = ['all', 'r', 'g', 'b'];

// ---------------------------------------------------------------- curves

/** One point on a curve: x is the brightness going in, y the brightness coming out, both 0 to 255. */
export interface CPoint {
  x: number;
  y: number;
}
/** A curve: points from left to right, always starting at x = 0 and ending at x = 255. */
export type Curve = CPoint[];

export const MAX_POINTS = 16;
/** No two points closer than this across. */
export const MIN_GAP = 2;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);

export const straightCurve = (): Curve => [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

/** A curve read from anything: sorted, held to 0..255, with the two ends in place and points kept apart. Anything odd gives the straight line. */
export function cleanCurve(raw: unknown): Curve {
  if (!Array.isArray(raw)) return straightCurve();
  const pts: CPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    pts.push({ x: Math.round(clamp(o.x, 0, 255)), y: Math.round(clamp(o.y, 0, 255)) });
  }
  pts.sort((a, b) => a.x - b.x);
  const first = pts.find((p) => p.x === 0);
  const last = [...pts].reverse().find((p) => p.x === 255);
  const inner = pts.filter((p) => p.x > 0 && p.x < 255);
  const out: Curve = [{ x: 0, y: first ? first.y : 0 }];
  for (const p of inner) {
    const prev = out[out.length - 1];
    if (p.x - prev.x >= MIN_GAP && 255 - p.x >= MIN_GAP && out.length < MAX_POINTS - 1) out.push(p);
  }
  out.push({ x: 255, y: last ? last.y : 255 });
  return out;
}

/**
 * What a curve makes of brightness `x` (0 to 255). A smooth line through the points that never overshoots between two of them
 * (a monotone cubic, Fritsch and Carlson): a plain spline rings, going lighter than the lightest point or darker than the darkest, and a
 * curve you drag must never do something you did not draw. Rises where the points rise and levels where they level off.
 */
export function evalCurve(c: Curve, x: number): number {
  const n = c.length;
  if (n === 0) return clamp(x, 0, 255);
  if (n === 1) return c[0].y;
  if (x <= c[0].x) return c[0].y;
  if (x >= c[n - 1].x) return c[n - 1].y;
  const m = slopes(c);
  let i = 0;
  while (i < n - 2 && x > c[i + 1].x) i++;
  const h = c[i + 1].x - c[i].x;
  const t = (x - c[i].x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const y = (2 * t3 - 3 * t2 + 1) * c[i].y + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * c[i + 1].y + (t3 - t2) * h * m[i + 1];
  return y;
}

/** The slope of the line at each point, chosen so it never overshoots (see evalCurve). */
function slopes(c: Curve): number[] {
  const n = c.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(c[i + 1].x - c[i].x);
    d.push((c[i + 1].y - c[i].y) / h[i]);
  }
  const m: number[] = new Array(n);
  if (n === 2) {
    m[0] = m[1] = d[0];
    return m;
  }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  m[0] = endSlope(h[0], h[1], d[0], d[1]);
  m[n - 1] = endSlope(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return m;
}

function endSlope(h0: number, h1: number, d0: number, d1: number): number {
  let m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (Math.sign(m) !== Math.sign(d0)) m = 0;
  else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(m) > 3 * Math.abs(d0)) m = 3 * d0;
  return m;
}

/** The table for a curve: what each of the 256 brightnesses becomes. */
export function curveLut(c: Curve): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(clamp(evalCurve(c, i), 0, 255));
  return lut;
}

/** Where the curve goes through the points nearest `x`, for a click on it: the index of a point within `reach` across, or -1. */
export function pointNear(c: Curve, x: number, y: number, reach: number): number {
  let best = -1;
  let bestD = reach * reach;
  c.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** A point put on the curve at (x, y). Returns the new curve and the index of the new point (the old one when one is already there, or -1 when the curve is full). */
export function addPoint(c: Curve, x: number, y: number): { curve: Curve; index: number } {
  const px = Math.round(clamp(x, 0, 255));
  const py = Math.round(clamp(y, 0, 255));
  const near = c.findIndex((p) => Math.abs(p.x - px) < MIN_GAP);
  if (near >= 0) return { curve: c, index: near };
  if (c.length >= MAX_POINTS) return { curve: c, index: -1 };
  const curve = [...c, { x: px, y: py }].sort((a, b) => a.x - b.x);
  return { curve, index: curve.findIndex((p) => p.x === px) };
}

/** Moves point `i`. The two ends stay at x = 0 and x = 255 and only go up and down; the others stay between their neighbours. */
export function movePoint(c: Curve, i: number, x: number, y: number): Curve {
  if (i < 0 || i >= c.length) return c;
  const last = c.length - 1;
  const ny = Math.round(clamp(y, 0, 255));
  const nx = i === 0 ? 0 : i === last ? 255 : Math.round(clamp(x, c[i - 1].x + MIN_GAP, c[i + 1].x - MIN_GAP));
  if (c[i].x === nx && c[i].y === ny) return c;
  return c.map((p, k) => (k === i ? { x: nx, y: ny } : p));
}

/** A point taken away. The two ends cannot be. */
export function removePoint(c: Curve, i: number): Curve {
  if (i <= 0 || i >= c.length - 1) return c;
  return c.filter((_, k) => k !== i);
}

export const isStraight = (c: Curve): boolean => c.length === 2 && c[0].y === 0 && c[1].y === 255;

/** Ready made curves, by the plain word for what they do. */
export const CURVE_PRESETS: { id: string; label: string; hint: string; curve: Curve }[] = [
  { id: 'lighter', label: 'Lighter', hint: 'Lifts the middle of the picture, so it looks brighter without blowing out the lightest parts.', curve: [{ x: 0, y: 0 }, { x: 128, y: 164 }, { x: 255, y: 255 }] },
  { id: 'darker', label: 'Darker', hint: 'Pulls the middle down, so the picture looks deeper without crushing the darkest parts.', curve: [{ x: 0, y: 0 }, { x: 128, y: 94 }, { x: 255, y: 255 }] },
  { id: 'contrast', label: 'More contrast', hint: 'An S shape: darks get darker and lights get lighter. The usual way to rescue a flat, washed out picture.', curve: [{ x: 0, y: 0 }, { x: 64, y: 44 }, { x: 192, y: 214 }, { x: 255, y: 255 }] },
  { id: 'flatter', label: 'Less contrast', hint: 'A backwards S: darks lift and lights ease off, so a harsh picture calms down.', curve: [{ x: 0, y: 0 }, { x: 64, y: 82 }, { x: 192, y: 174 }, { x: 255, y: 255 }] },
  { id: 'invert', label: 'Flip it', hint: 'Light becomes dark and dark becomes light, like a photo negative.', curve: [{ x: 0, y: 255 }, { x: 255, y: 0 }] },
];

// ---------------------------------------------------------------- levels

export interface Levels {
  /** Anything this dark or darker becomes black. 0 to 253. */
  black: number;
  /** Anything this light or lighter becomes white. 2 to 255. */
  white: number;
  /** The midtones: 1 leaves them be, above 1 brightens them, below 1 darkens them. */
  gamma: number;
}

export const GAMMA_RANGE = { min: 0.1, max: 9.99 };
export const neutralLevels = (): Levels => ({ black: 0, white: 255, gamma: 1 });

export function cleanLevels(raw: unknown): Levels {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let black = Math.round(num(r.black, 0, 253, 0));
  let white = Math.round(num(r.white, 2, 255, 255));
  if (white - black < 2) {
    black = Math.min(black, 253);
    white = black + 2;
  }
  return { black, white, gamma: Math.round(num(r.gamma, GAMMA_RANGE.min, GAMMA_RANGE.max, 1) * 100) / 100 };
}

/** Moves the darkest point, never past the lightest. */
export const withBlack = (l: Levels, black: number): Levels => cleanLevels({ ...l, black: Math.min(black, l.white - 2) });
/** Moves the lightest point, never below the darkest. */
export const withWhite = (l: Levels, white: number): Levels => cleanLevels({ ...l, white: Math.max(white, l.black + 2) });
export const withGamma = (l: Levels, gamma: number): Levels => cleanLevels({ ...l, gamma });

/** What levels make of brightness `x` (0 to 255): stretch black..white to the full range, then bend the middle by the gamma. */
export function levelsOf(l: Levels, x: number): number {
  const t = clamp((x - l.black) / (l.white - l.black), 0, 1);
  return 255 * Math.pow(t, 1 / l.gamma);
}

export function levelsLut(l: Levels): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(clamp(levelsOf(l, i), 0, 255));
  return lut;
}

export const isNeutralLevels = (l: Levels): boolean => l.black === 0 && l.white === 255 && Math.abs(l.gamma - 1) < 1e-9;

/** Where the midtone handle sits across the black to white range (0 to 255): the brightness that comes out as half grey. */
export function gammaHandleAt(l: Levels): number {
  return l.black + (l.white - l.black) * Math.pow(0.5, l.gamma);
}

/** The gamma that puts the midtone handle at brightness `x`. Held to the handle's own travel, so it can never sit on an end. */
export function gammaFromHandle(l: Levels, x: number): number {
  const t = clamp((x - l.black) / (l.white - l.black), 0.02, 0.98);
  return clamp(Math.log(t) / Math.log(0.5), GAMMA_RANGE.min, GAMMA_RANGE.max);
}

// ---------------------------------------------------------------- the two together

/** Everything Curves and Levels say about a picture: levels and a curve for all the colours together, and for each colour on its own. */
export interface Tone {
  levels: Record<Channel, Levels>;
  curves: Record<Channel, Curve>;
}

export const neutralTone = (): Tone => ({
  levels: { all: neutralLevels(), r: neutralLevels(), g: neutralLevels(), b: neutralLevels() },
  curves: { all: straightCurve(), r: straightCurve(), g: straightCurve(), b: straightCurve() },
});

export function isNeutralTone(t: Tone): boolean {
  return CHANNELS.every((c) => isNeutralLevels(t.levels[c]) && isStraight(t.curves[c]));
}

/** Which of the two have been changed: for naming the undo step. */
export function whatChanged(t: Tone): { levels: boolean; curves: boolean } {
  return { levels: CHANNELS.some((c) => !isNeutralLevels(t.levels[c])), curves: CHANNELS.some((c) => !isStraight(t.curves[c])) };
}

/**
 * The three tables (red, green, blue). For each colour: the levels of all colours together, then that colour's own levels, then the
 * curve of all colours together, then that colour's own curve. So an All colours change moves every colour, and a Red change
 * moves red alone (that is how a colour cast is fixed).
 */
export function toneLuts(t: Tone): [Uint8Array, Uint8Array, Uint8Array] {
  const lvAll = levelsLut(t.levels.all);
  const cvAll = curveLut(t.curves.all);
  return (['r', 'g', 'b'] as const).map((c) => {
    const lv = levelsLut(t.levels[c]);
    const cv = curveLut(t.curves[c]);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = cv[cvAll[lv[lvAll[i]]]];
    return lut;
  }) as [Uint8Array, Uint8Array, Uint8Array];
}

/** A new picture with the tables applied to every pixel that has something in it. See-through pixels keep their see-through and stay as they are. */
export function applyLuts(pixels: Uint8ClampedArray, luts: readonly [Uint8Array, Uint8Array, Uint8Array]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  const [lr, lg, lb] = luts;
  for (let i = 0; i < pixels.length; i += 4) {
    out[i + 3] = pixels[i + 3];
    if (pixels[i + 3] === 0) {
      out[i] = pixels[i];
      out[i + 1] = pixels[i + 1];
      out[i + 2] = pixels[i + 2];
      continue;
    }
    out[i] = lr[pixels[i]];
    out[i + 1] = lg[pixels[i + 1]];
    out[i + 2] = lb[pixels[i + 2]];
  }
  return out;
}

// ---------------------------------------------------------------- the histogram

export type Histograms = Record<Channel, Uint32Array>;

/** How many pixels there are of each brightness, for red, green, blue and all together (the light the eye sees). Pixels with nothing in them are left out; `keep` (one flag per pixel) limits it to a selection. */
export function histograms(pixels: ArrayLike<number>, keep?: ArrayLike<number> | null): Histograms {
  const h: Histograms = { all: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    if (pixels[i + 3] === 0) continue;
    if (keep && !keep[p]) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    h.r[r]++;
    h.g[g]++;
    h.b[b]++;
    h.all[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
  }
  return h;
}

/**
 * The black and white points that stretch a picture to use its whole range, ignoring the very few lightest and darkest pixels
 * (`clip`, a share, so one stray dot does not stop it). Null when there is nothing to stretch.
 */
export function autoPoints(hist: ArrayLike<number>, clip = 0.005): { black: number; white: number } | null {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i];
  if (total === 0) return null;
  const limit = total * clip;
  let black = 0;
  let sum = 0;
  for (; black < 255; black++) {
    sum += hist[black];
    if (sum > limit) break;
  }
  let white = 255;
  sum = 0;
  for (; white > 0; white--) {
    sum += hist[white];
    if (sum > limit) break;
  }
  if (white - black < 2) return null;
  return { black, white };
}
