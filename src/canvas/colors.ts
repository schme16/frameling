/** Small colour helpers: hex parsing and the HSV maths behind the colour picker. No DOM. */
import type { RGBA } from './pixels';

export interface HSV {
  /** 0 to 360 */
  h: number;
  /** 0 to 1 */
  s: number;
  /** 0 to 1 */
  v: number;
}

/** Reads `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Returns null for anything else. */
export function parseHex(text: string): RGBA | null {
  let t = text.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/i.test(t)) t = t.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)) return null;
  const n = (i: number) => parseInt(t.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), t.length === 8 ? n(6) : 255];
}

const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export function toHex(r: number, g: number, b: number, a = 255): string {
  return '#' + h2(r) + h2(g) + h2(b) + (a < 255 ? h2(a) : '');
}

export function hsvToRgb({ h, s, v }: HSV): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
  return [r * 255, g * 255, b * 255];
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex(c: HSV): string {
  const [r, g, b] = hsvToRgb(c);
  return toHex(r, g, b);
}

export function hexToHsv(hex: string): HSV | null {
  const c = parseHex(hex);
  return c ? rgbToHsv(c[0], c[1], c[2]) : null;
}

// ---------------------------------------------------------------- see-through (alpha)
// Colours are `#rrggbb` (solid) or `#rrggbbaa`. A solid colour is always written as six digits, so a colour that was
// never see-through reads and writes back exactly as it was.

/** How solid a colour is, 0 (clear) to 255 (solid). Six digits, or anything unreadable, is solid. */
export function alphaByte(hex: string): number {
  return parseHex(hex)?.[3] ?? 255;
}

/** True when the colour is see-through at all. */
export const hasAlpha = (hex: string): boolean => alphaByte(hex) < 255;

/** The colour without its see-through part: `#rrggbb`. Unreadable text comes back as it was. */
export function solidOf(hex: string): string {
  const c = parseHex(hex);
  return c ? toHex(c[0], c[1], c[2]) : hex;
}

/** The colour with a new see-through amount (0 to 255). Fully solid comes out as six digits. Unreadable text comes back as it was. */
export function withAlpha(hex: string, a: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const n = Math.max(0, Math.min(255, Math.round(a)));
  return toHex(c[0], c[1], c[2], n);
}

/** How solid a colour is as a whole percent, 0 to 100. */
export const alphaPercent = (hex: string): number => Math.round((alphaByte(hex) / 255) * 100);

/** A colour with a new solidness as a percent, 0 to 100. */
export const withAlphaPercent = (hex: string, pct: number): string => withAlpha(hex, (Math.max(0, Math.min(100, pct)) / 100) * 255);

/**
 * Reads what someone typed or pasted into a colour box. `allowAlpha` false drops any see-through part, for places that
 * only take solid colours. Null when it is not a colour.
 */
export function readColourText(text: string, allowAlpha = true): string | null {
  const c = parseHex(text);
  if (!c) return null;
  return toHex(c[0], c[1], c[2], allowAlpha ? c[3] : 255);
}
