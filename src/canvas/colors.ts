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

/** Reads `#rgb`, `#rrggbb` or `#rrggbbaa`. Returns null for anything else. */
export function parseHex(text: string): RGBA | null {
  let t = text.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) t = t.split('').map((c) => c + c).join('');
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
