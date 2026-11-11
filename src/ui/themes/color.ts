// Small colour maths for themes: parsing, mixing, contrast and a hue/saturation/lightness round trip. No dependencies.
// Colours are `#rrggbb` strings everywhere else; this is the only place that turns them into numbers.

export type RGB = [number, number, number];
export type HSL = [number, number, number]; // hue 0-360, saturation 0-1, lightness 0-1

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** `#rgb` or `#rrggbb` (the leading # is needed) to [r, g, b] in 0-255, or null when it isn't one. */
export function parseHex(s: unknown): RGB | null {
  if (typeof s !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const isHex = (s: unknown): s is string => parseHex(s) !== null;

export function toHex([r, g, b]: RGB): string {
  const p = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** Normalises a hex colour to lowercase `#rrggbb`. Anything else comes back as the fallback. */
export function normHex(s: unknown, fallback = '#000000'): string {
  const rgb = parseHex(s);
  return rgb ? toHex(rgb) : fallback;
}

/** `share` of `a` (0-1) mixed with the rest of `b`, like CSS color-mix in srgb. */
export function mix(a: string, b: string, share: number): string {
  const x = parseHex(a) ?? [0, 0, 0];
  const y = parseHex(b) ?? [0, 0, 0];
  const t = clamp(share);
  return toHex([x[0] * t + y[0] * (1 - t), x[1] * t + y[1] * (1 - t), x[2] * t + y[2] * (1 - t)]);
}

/** `rgb(r g b / a%)` for shadows. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return `rgb(${r} ${g} ${b} / ${Math.round(clamp(a) * 100)}%)`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 (same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl([r, g, b]: RGB): HSL {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [(h * 60 + 360) % 360, clamp(s), l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  const S = clamp(s);
  const L = clamp(l);
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = L - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export const hexToHsl = (hex: string): HSL => rgbToHsl(parseHex(hex) ?? [0, 0, 0]);
export const hslToHex = (h: number, s: number, l: number): string => toHex(hslToRgb([h, s, l]));

/**
 * Moves `fg` lighter or darker (keeping its hue) until it reaches `min` contrast against `bg`. Goes the way that gets
 * there with the least change, and falls back to black or white when nothing in between is enough.
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return normHex(fg);
  const [h, s, l] = hexToHsl(fg);
  let best: string | null = null;
  for (const dir of [1, -1]) {
    for (let step = 1; step <= 100; step++) {
      const cand = hslToHex(h, s, l + (dir * step) / 100);
      if (contrast(cand, bg) >= min) {
        if (!best || Math.abs(hexToHsl(cand)[2] - l) < Math.abs(hexToHsl(best)[2] - l)) best = cand;
        break;
      }
    }
  }
  if (best) return best;
  return contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#000000' : '#ffffff';
}
