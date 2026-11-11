/**
 * Inks decide what colour a painted pixel becomes: a plain colour, one step lighter or darker along the palette ramp
 * (shading), or a dither pattern of two colours. Plus mirror drawing (symmetry) and the palette lock. Pure, no DOM.
 */
import type { DocPalette } from '../core/format';
import type { RGBA } from '../canvas/pixels';
import { ditherOn, type DitherPattern } from './dither';
import { exactIndex, NearestCache, paletteRgb, shadeStep } from './palette';
import type { SymmetryMode } from './settings';

export interface Ink {
  /**
   * Writes the colour for pixel (x, y) into `out`, given the pixel as it was before the stroke (`base` at byte `i`).
   * Returns false to leave the pixel alone.
   */
  color(x: number, y: number, base: Uint8ClampedArray, i: number, out: Uint8Array): boolean;
}

export function solidInk(c: RGBA): Ink {
  return {
    color(_x, _y, _b, _i, out) {
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      out[3] = c[3];
      return true;
    },
  };
}

/**
 * Shading: a pixel whose colour is in the palette moves one step along its ramp. Pixels that are clear, or not a
 * palette colour, are left alone, so you can shade over line art without touching it.
 */
export function shadeInk(p: DocPalette, lighter: boolean): Ink {
  const rgb = paletteRgb(p.colors);
  return {
    color(_x, _y, base, i, out) {
      if (base[i + 3] === 0) return false;
      const idx = exactIndex(rgb, base[i], base[i + 1], base[i + 2]);
      if (idx < 0) return false;
      const n = shadeStep(p, rgb, idx, lighter);
      if (n === idx) return false;
      out[0] = rgb[n * 3];
      out[1] = rgb[n * 3 + 1];
      out[2] = rgb[n * 3 + 2];
      out[3] = base[i + 3];
      return true;
    },
  };
}

/** Dither: the pattern's "on" pixels get `a` (the stroke colour), the rest get `b` (the fill colour), or stay as they were when `b` is null. */
export function ditherInk(pattern: DitherPattern, a: RGBA, b: RGBA | null): Ink {
  return {
    color(x, y, _base, _i, out) {
      const c = ditherOn(pattern, x, y) ? a : b;
      if (!c) return false;
      out[0] = c[0];
      out[1] = c[1];
      out[2] = c[2];
      out[3] = c[3];
      return true;
    },
  };
}

/** Wraps an ink so every colour it paints snaps to the nearest palette colour (clearing stays clearing). */
export function lockedInk(inner: Ink, p: DocPalette): Ink {
  const rgb = paletteRgb(p.colors);
  if (!rgb.length) return inner;
  const near = new NearestCache(rgb);
  return {
    color(x, y, base, i, out) {
      if (!inner.color(x, y, base, i, out)) return false;
      if (out[3] === 0) return true;
      const k = near.get(out[0], out[1], out[2]) * 3;
      out[0] = rgb[k];
      out[1] = rgb[k + 1];
      out[2] = rgb[k + 2];
      out[3] = 255;
      return true;
    },
  };
}

/** The colour a palette lock turns `c` into (for a single colour, like the bucket's). */
export function snapToPalette(c: RGBA, p: DocPalette): RGBA {
  if (c[3] === 0 || !p.colors.length) return c;
  const rgb = paletteRgb(p.colors);
  const k = new NearestCache(rgb).get(c[0], c[1], c[2]) * 3;
  return [rgb[k], rgb[k + 1], rgb[k + 2], 255];
}

export interface Mirror {
  mode: SymmetryMode;
  /** Twice the mirror line's position, in art pixel edges (so a line through a pixel's middle is odd). */
  ax2: number;
  ay2: number;
}

/** The mirror setup for a grid: the line positions default to the centre. */
export function makeMirror(mode: SymmetryMode, width: number, height: number, axisX: number | null, axisY: number | null): Mirror {
  return { mode, ax2: Math.round(2 * (axisX ?? width / 2)), ay2: Math.round(2 * (axisY ?? height / 2)) };
}

/**
 * The pixel and its mirror images, written as x, y pairs into `out`. Returns how many. Duplicates (a pixel sitting
 * on the mirror line) are left out.
 */
export function mirrorPoints(m: Mirror, x: number, y: number, out: Int32Array): number {
  out[0] = x;
  out[1] = y;
  if (m.mode === 'off') return 1;
  const mx = m.ax2 - x - 1;
  const my = m.ay2 - y - 1;
  let n = 1;
  const push = (px: number, py: number) => {
    for (let k = 0; k < n; k++) if (out[k * 2] === px && out[k * 2 + 1] === py) return;
    out[n * 2] = px;
    out[n * 2 + 1] = py;
    n++;
  };
  if (m.mode === 'h' || m.mode === 'both') push(mx, y);
  if (m.mode === 'v' || m.mode === 'both') push(x, my);
  if (m.mode === 'both') push(mx, my);
  return n;
}
