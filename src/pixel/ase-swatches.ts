/**
 * Adobe swatch files (.ase, "Adobe Swatch Exchange"): Illustrator, Photoshop, InDesign and many palette sites save
 * them. Colours in RGB, CMYK, LAB or Gray become sRGB hex; groups become ramps (sections) of the palette with their
 * names, and each colour keeps its name. Pure bytes in, a palette out.
 *
 * Layout (big-endian): "ASEF", version u16 x2, block count u32, then blocks of type u16 and length u32. A colour
 * block holds a name (u16 length in characters, UTF-16, ending in a zero), a four letter model, that model's floats,
 * and a u16 kind. Type 0xC001 starts a group (with a name) and 0xC002 ends it.
 *
 * Not the Aseprite sprite format, which also often ends in .ase: that one has "ASEF" nowhere near its start.
 */
import type { DocPalette } from '../core/format';
import { MAX_COLORS, PaletteProblem } from './palette-io';

/** True when the bytes start like an Adobe swatch file. */
export function isAdobeSwatches(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[0] === 0x41 && bytes[1] === 0x53 && bytes[2] === 0x45 && bytes[3] === 0x46;
}

export interface SwatchResult {
  palette: DocPalette;
  /** Colours in the file, before the palette's limit. */
  total: number;
  /** How many were left out because the palette holds 256. */
  cut: number;
  /** Colours in a model this reader does not know (spot colours with other data). */
  skipped: number;
  /** Groups that came across as ramps. */
  groups: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);
const hex2 = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => '#' + hex2(r) + hex2(g) + hex2(b);

/** sRGB gamma on a linear channel (0 to 1). */
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** CIE LAB (D50, L 0 to 100) to sRGB 0..1, through XYZ and a Bradford step to D65. */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const f3 = (t: number) => (t * t * t > e ? t * t * t : (116 * t - 16) / k);
  const X = 0.9642 * f3(fx);
  const Y = L > k * e ? Math.pow((L + 16) / 116, 3) : L / k;
  const Z = 0.8249 * f3(fz);
  // Bradford adaptation D50 to D65, then XYZ to linear sRGB.
  const x = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z;
  const y = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z;
  const z = 0.0122982 * X - 0.020483 * Y + 1.3299098 * Z;
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [gamma(clamp01(r)), gamma(clamp01(g)), gamma(clamp01(bl))];
}

/** CMYK (each 0 to 1) to sRGB 0..1 by the plain formula, with no printer profile. */
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const kk = 1 - clamp01(k);
  return [(1 - clamp01(c)) * kk, (1 - clamp01(m)) * kk, (1 - clamp01(y)) * kk];
}

/** Reads the swatch file. Throws a PaletteProblem with words for a person when it is not one. */
export function parseAdobeSwatches(bytes: Uint8Array, fallbackName = 'Swatches'): SwatchResult {
  if (!isAdobeSwatches(bytes)) throw new PaletteProblem("That file isn't an Adobe swatch file.");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint32(8);
  const colors: string[] = [];
  const names: string[] = [];
  const starts: number[] = [];
  const rampNames: Record<number, string> = {};
  let skipped = 0;
  let total = 0;
  let groups = 0;
  let pendingGroup: string | null = null;
  let at = 12;
  const text = (p: number, chars: number): string => {
    let s = '';
    for (let i = 0; i < chars && p + i * 2 + 1 < bytes.length; i++) {
      const u = dv.getUint16(p + i * 2);
      if (u) s += String.fromCharCode(u);
    }
    return s.trim();
  };
  for (let n = 0; n < count && at + 6 <= bytes.length; n++) {
    const type = dv.getUint16(at);
    const len = dv.getUint32(at + 2);
    const body = at + 6;
    const end = Math.min(bytes.length, body + len);
    at = end;
    if (type === 0xc001 || type === 0x0001) {
      if (body + 2 > end) continue;
      const chars = dv.getUint16(body);
      const name = text(body + 2, chars);
      const after = body + 2 + chars * 2;
      if (type === 0xc001) {
        pendingGroup = name;
        continue;
      }
      if (after + 4 > end) continue;
      const model = String.fromCharCode(bytes[after], bytes[after + 1], bytes[after + 2], bytes[after + 3]).trim().toUpperCase();
      const f = (i: number) => (after + 4 + i * 4 + 4 <= end ? dv.getFloat32(after + 4 + i * 4) : 0);
      let rgb: [number, number, number] | null = null;
      if (model === 'RGB') rgb = [f(0), f(1), f(2)];
      else if (model === 'CMYK') rgb = cmykToRgb(f(0), f(1), f(2), f(3));
      else if (model === 'LAB') rgb = labToRgb(f(0) * 100, f(1), f(2));
      else if (model === 'GRAY') rgb = [f(0), f(0), f(0)];
      total++;
      if (!rgb) {
        skipped++;
        continue;
      }
      if (colors.length >= MAX_COLORS) continue;
      if (pendingGroup !== null) {
        // The first colour of a group starts its ramp. A file that starts with a group needs no ramp for index 0.
        if (colors.length > 0) starts.push(colors.length);
        if (pendingGroup) rampNames[colors.length] = pendingGroup;
        groups++;
        pendingGroup = null;
      }
      colors.push(toHex(...rgb));
      names.push(name);
    } else if (type === 0xc002) {
      pendingGroup = null;
    }
  }
  if (!colors.length) throw new PaletteProblem('No colours were found in that swatch file.');
  const palette: DocPalette = { name: fallbackName, colors };
  if (starts.length) palette.ramps = starts;
  if (names.some(Boolean)) palette.names = names;
  if (Object.keys(rampNames).length) palette.rampNames = rampNames;
  return { palette, total, cut: Math.max(0, total - skipped - colors.length), skipped, groups };
}
