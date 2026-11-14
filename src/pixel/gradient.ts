/**
 * Gradients on pixel layers. A gradient runs along a line you drag (or out from a middle point), and every pixel takes
 * the colour for how far along it sits. On a pixel layer that colour is never a smooth blend of two: it is one of a few
 * real colours, mixed by an ordered dither so the steps melt into each other:
 *  - 'palette' steps through the palette colours that lie between the two ends (the pixel art way);
 *  - 'two' dithers between just the two end colours;
 *  - 'blend' is a plain smooth mix of the two, for layers with no palette to keep to.
 * Pure, no DOM. The tool is in gradient-tool.ts; the dither patterns are in dither.ts.
 */
import type { RGBA } from '../canvas/pixels';
import { gradientThreshold, type GradientDither } from './dither';
import type { Ink } from './ink';
import { paletteRgb } from './palette';

export type GradientColours = 'palette' | 'two' | 'blend';
export type GradientShape = 'linear' | 'radial';

export const GRADIENT_COLOURS: { id: GradientColours; label: string; detail: string }[] = [
  { id: 'palette', label: 'Palette steps', detail: 'Steps through the palette colours between your two colours.' },
  { id: 'two', label: 'Two colours', detail: 'Only your two colours, dithered into each other.' },
  { id: 'blend', label: 'Smooth', detail: 'A smooth mix of the two colours, with no dithering.' },
];

export const GRADIENT_SHAPES: { id: GradientShape; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'radial', label: 'Radial' },
];

/** Where the gradient sits, in art pixels (fractions allowed): the start, and the end (or the edge of the circle). */
export interface GradientLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** How far along the gradient the middle of pixel (x, y) is, from 0 (the start) to 1 (the end), clamped. */
export function gradientPosition(shape: GradientShape, g: GradientLine, x: number, y: number): number {
  const dx = g.x1 - g.x0;
  const dy = g.y1 - g.y0;
  const px = x + 0.5 - g.x0;
  const py = y + 0.5 - g.y0;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  const t = shape === 'radial' ? Math.sqrt((px * px + py * py) / len2) : (px * dx + py * dy) / len2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Colours in order along the gradient, with where each sits (0 to 1, rising). */
export interface Ramp {
  colors: RGBA[];
  at: number[];
}

export const twoRamp = (a: RGBA, b: RGBA): Ramp => ({ colors: [a, b], at: [0, 1] });

/** A plain mix of two colours, `t` of the way from `a` to `b`. */
export function mixColors(a: RGBA, b: RGBA, t: number): RGBA {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t)];
}

const RAMP_SAMPLES = 96;

type Lab = [number, number, number];

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** A colour in OKLab, where equal steps look about equally different and a mix of two colours stays in between them in hue. */
function oklab(r: number, g: number, b: number): Lab {
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/**
 * The palette colours a gradient from `a` to `b` steps through. Walks the smooth mix of the two (mixed by lightness, vividness and hue, in OKLab) and notes the palette colour nearest to each point; each colour that wins a stretch of the way goes in the ramp, centred on that stretch.
 * An empty palette, or one where the whole way is one colour, gives a ramp of that one colour (or the two ends).
 */
export function paletteRamp(a: RGBA, b: RGBA, colors: readonly string[]): Ramp {
  if (!colors.length) return twoRamp(a, b);
  const rgb = paletteRgb(colors);
  const labs: Lab[] = [];
  for (let i = 0; i < colors.length; i++) labs.push(oklab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]));
  const la = oklab(a[0], a[1], a[2]);
  const lb = oklab(b[0], b[1], b[2]);
  const ca = Math.hypot(la[1], la[2]);
  const cb = Math.hypot(lb[1], lb[2]);
  // A grey has no hue of its own, so it takes the other end's, and a fade from grey to a colour stays in that colour.
  let ha = Math.atan2(la[2], la[1]);
  let hb = Math.atan2(lb[2], lb[1]);
  if (ca < 0.02) ha = hb;
  if (cb < 0.02) hb = ha;
  // The short way round the colour wheel.
  let dh = hb - ha;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  const out: Ramp = { colors: [], at: [] };
  let run = -1;
  let from = 0;
  const close = (end: number) => {
    out.colors.push([rgb[run * 3], rgb[run * 3 + 1], rgb[run * 3 + 2], 255]);
    out.at.push((from + end) / 2 / RAMP_SAMPLES);
  };
  for (let i = 0; i <= RAMP_SAMPLES; i++) {
    // Mixed by lightness, vividness and hue, so a fade from red to yellow goes through orange and not through a dull grey.
    const t = i / RAMP_SAMPLES;
    const L = la[0] + (lb[0] - la[0]) * t;
    const C = ca + (cb - ca) * t;
    const A = C * Math.cos(ha + dh * t);
    const B = C * Math.sin(ha + dh * t);
    let k = 0;
    let bestD = Infinity;
    for (let j = 0; j < labs.length; j++) {
      // Hue and vividness count more than lightness, so a grey never stands in for a colour (or the other way round).
      const d = (labs[j][0] - L) ** 2 + 6 * ((labs[j][1] - A) ** 2 + (labs[j][2] - B) ** 2);
      if (d < bestD) {
        bestD = d;
        k = j;
      }
    }
    if (k !== run) {
      if (run >= 0) close(i - 1);
      run = k;
      from = i;
    }
  }
  close(RAMP_SAMPLES);
  // The two ends always sit at the very start and end, so the first and last colours cover the whole of their side.
  out.at[0] = 0;
  out.at[out.at.length - 1] = 1;
  return out;
}

/** The colour for position `t` on a ramp, given the pixel's dither cut-off `thr`: the colour before or the one after. */
export function rampColor(r: Ramp, t: number, thr: number): RGBA {
  const n = r.colors.length;
  if (n === 1 || t <= r.at[0]) return r.colors[0];
  if (t >= r.at[n - 1]) return r.colors[n - 1];
  let i = 0;
  while (i < n - 2 && t >= r.at[i + 1]) i++;
  const f = (t - r.at[i]) / (r.at[i + 1] - r.at[i]);
  return f > thr ? r.colors[i + 1] : r.colors[i];
}

export interface GradientSpec {
  shape: GradientShape;
  line: GradientLine;
  /** The colour at the start, and at the end. */
  from: RGBA;
  to: RGBA;
  colours: GradientColours;
  dither: GradientDither;
  /** The document palette (for 'palette' steps). */
  palette: readonly string[];
  /** Leave clear pixels clear, and keep the alpha of painted ones. */
  paintedOnly: boolean;
}

/** The ramp a spec steps along ('palette' with fewer than two palette colours in the way falls back to the two ends). */
export function rampFor(s: Pick<GradientSpec, 'from' | 'to' | 'colours' | 'palette'>): Ramp {
  if (s.colours === 'palette') {
    const r = paletteRamp(s.from, s.to, s.palette);
    if (r.colors.length > 1 || s.palette.length >= 2) return r;
  }
  return twoRamp(s.from, s.to);
}

/** The ink for a pixel gradient: hand it to a PixelSession and paint every pixel. Palette lock wraps it as for any ink. */
export function gradientInk(s: GradientSpec): Ink {
  const ramp = rampFor(s);
  return {
    color(x, y, base, i, out) {
      if (s.paintedOnly && base[i + 3] === 0) return false;
      const t = gradientPosition(s.shape, s.line, x, y);
      const c = s.colours === 'blend' ? mixColors(s.from, s.to, t) : rampColor(ramp, t, gradientThreshold(s.dither, x, y));
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      out[3] = s.paintedOnly ? base[i + 3] : c[3];
      return true;
    },
  };
}
