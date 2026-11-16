/**
 * Colour for the pixel brush: swinging a colour's hue, saturation and lightness, mixing it toward a back colour, and the
 * wet mode that carries colour from under the brush along the stroke. Pure functions on 0 to 255 channels, no DOM.
 */

export type Rgb = [number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Red, green, blue (0 to 255) to hue (0 to 360), saturation and lightness (0 to 1). */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [h, s, l];
}

const channel = (p: number, q: number, t: number): number => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

/** Hue (degrees), saturation and lightness (0 to 1) to red, green, blue written into `out` as whole numbers 0 to 255. */
export function hslToRgb(h: number, s: number, l: number, out: Rgb): Rgb {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s <= 1e-9) {
    const v = Math.round(l * 255);
    out[0] = out[1] = out[2] = v;
    return out;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  out[0] = Math.round(channel(p, q, hh + 1 / 3) * 255);
  out[1] = Math.round(channel(p, q, hh) * 255);
  out[2] = Math.round(channel(p, q, hh - 1 / 3) * 255);
  return out;
}

/** A colour with its hue turned `hue` degrees and its saturation and lightness moved by `sat` and `light`. Written into `out`. */
export function shiftColour(r: number, g: number, b: number, hue: number, sat: number, light: number, out: Rgb): Rgb {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h + hue, clamp01(s + sat), clamp01(l + light), out);
}

/** `t` of the way from one colour to another, written into `out`. */
export function mixRgb(a: ArrayLike<number>, b: ArrayLike<number>, t: number, out: Rgb): Rgb {
  out[0] = Math.round(a[0] + (b[0] - a[0]) * t);
  out[1] = Math.round(a[1] + (b[1] - a[1]) * t);
  out[2] = Math.round(a[2] + (b[2] - a[2]) * t);
  return out;
}

/** How quickly the wet load takes on what it passes over: a fraction of the gap closed at each dab. */
export const PICKUP_RATE = 0.25;

/**
 * The colour the brush carries after one more dab, wet mode. The load drifts toward the colour under the dab, by the pickup
 * rate and by how solid that colour is, so a stroke over clear canvas keeps its own colour and a stroke over paint
 * smears it along. Written into `load`.
 */
export function pickUp(load: Rgb, under: ArrayLike<number>, rate: number = PICKUP_RATE): Rgb {
  const k = clamp01((under[3] / 255) * rate);
  if (k <= 0) return load;
  load[0] += (under[0] - load[0]) * k;
  load[1] += (under[1] - load[1]) * k;
  load[2] += (under[2] - load[2]) * k;
  return load;
}
