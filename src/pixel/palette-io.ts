/**
 * Palette files in and out: GIMP `.gpl`, plain `.hex` (one RRGGBB per line), JASC `.pal`, and a palette taken from
 * the colours of an image. Pure text and bytes, no DOM.
 */
import type { DocPalette } from '../core/format';
import { luma } from './palette';
import { pickColours, tableOf } from './quantise';

export type PaletteFormat = 'gpl' | 'hex' | 'pal';

export const MAX_COLORS = 256;

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const rgbHex = (r: number, g: number, b: number) => '#' + hex2(r) + hex2(g) + hex2(b);
const rgbOf = (c: string): [number, number, number] => {
  const t = c.replace('#', '');
  return [parseInt(t.slice(0, 2), 16) || 0, parseInt(t.slice(2, 4), 16) || 0, parseInt(t.slice(4, 6), 16) || 0];
};

/** An error with words fit to show to a person. */
export class PaletteProblem extends Error {}

export function parseGpl(text: string, fallbackName = 'Palette'): DocPalette {
  const lines = text.split(/\r?\n/);
  if (!/^GIMP Palette/i.test(lines[0]?.trim() ?? '')) throw new PaletteProblem("That file doesn't start like a GIMP palette.");
  let name = fallbackName;
  const colors: string[] = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^Name:\s*(.+)$/i.exec(line);
    if (m) {
      name = m[1].trim();
      continue;
    }
    if (line.startsWith('#') || /^Columns:/i.test(line)) continue;
    const n = /^(\d+)\s+(\d+)\s+(\d+)/.exec(line);
    if (n) colors.push(rgbHex(+n[1], +n[2], +n[3]));
  }
  return finish(name, colors);
}

export function parseHexList(text: string, fallbackName = 'Palette'): DocPalette {
  const colors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*#?([0-9a-f]{6})(?:[0-9a-f]{2})?\s*$/i.exec(raw);
    if (m) colors.push('#' + m[1].toLowerCase());
  }
  return finish(fallbackName, colors);
}

export function parseJascPal(text: string, fallbackName = 'Palette'): DocPalette {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== 'JASC-PAL') throw new PaletteProblem("That .pal file isn't a JASC palette. Only JASC .pal files can be read.");
  const count = parseInt(lines[2] ?? '', 10);
  const colors: string[] = [];
  for (const line of lines.slice(3)) {
    const n = /^(\d+)\s+(\d+)\s+(\d+)/.exec(line);
    if (n) colors.push(rgbHex(+n[1], +n[2], +n[3]));
    if (Number.isFinite(count) && colors.length >= count) break;
  }
  return finish(fallbackName, colors);
}

function finish(name: string, colors: string[]): DocPalette {
  if (!colors.length) throw new PaletteProblem('No colours were found in that file.');
  return { name, colors: colors.slice(0, MAX_COLORS) };
}

/** Reads a palette file by its name's ending. Images go through `paletteFromPixels` instead. */
export function parsePaletteFile(fileName: string, text: string): DocPalette {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Palette';
  const ext = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase();
  if (ext === 'gpl') return parseGpl(text, base);
  if (ext === 'pal') return parseJascPal(text, base);
  if (ext === 'hex' || ext === 'txt') return parseHexList(text, base);
  // Unknown ending: try each, most specific first.
  if (/^GIMP Palette/i.test(text.trim())) return parseGpl(text, base);
  if (/^JASC-PAL/.test(text.trim())) return parseJascPal(text, base);
  return parseHexList(text, base);
}

export function toGpl(p: DocPalette): string {
  const rows = p.colors.map((c) => {
    const [r, g, b] = rgbOf(c);
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${c.slice(1, 7)}`;
  });
  return ['GIMP Palette', `Name: ${p.name}`, `Columns: ${Math.min(16, Math.max(1, p.colors.length))}`, '#', ...rows, ''].join('\n');
}

export function toHexList(p: DocPalette): string {
  return p.colors.map((c) => c.slice(1, 7).toLowerCase()).join('\n') + '\n';
}

export function toJascPal(p: DocPalette): string {
  return ['JASC-PAL', '0100', String(p.colors.length), ...p.colors.map((c) => rgbOf(c).join(' ')), ''].join('\r\n');
}

export function writePalette(p: DocPalette, format: PaletteFormat): string {
  return format === 'gpl' ? toGpl(p) : format === 'pal' ? toJascPal(p) : toHexList(p);
}

/** A palette from packed 0xRRGGBB colours, grouped by hue and dark to light so similar colours sit together. */
export function paletteOfKeys(keys: number[], name = 'From image'): DocPalette {
  return { name, colors: sortForRamps(keys).map((k) => rgbHex((k >> 16) & 255, (k >> 8) & 255, k & 255)) };
}

/**
 * The colours of an image as a palette, at most `max`. A picture with no more distinct colours than that keeps them as
 * they are; with more, pickColours (quantise.ts) picks `max` colours that stand for the picture. Runs in one go: for a
 * picture that might be big, use startScan (quantiseRun.ts), which does the same work off the page's thread.
 */
export function paletteFromPixels(pixels: Uint8ClampedArray | Uint8Array, name = 'From image', max = 32): DocPalette {
  const table = tableOf(pixels);
  if (!table.keys.length) throw new PaletteProblem('That picture has no solid colours to take.');
  return paletteOfKeys(pickColours(table, max), name);
}

/** Groups colours by hue (greys first), dark to light within a group, so similar colours sit together. */
export function sortForRamps(keys: number[]): number[] {
  const info = keys.map((k) => {
    const r = (k >> 16) & 255;
    const g = (k >> 8) & 255;
    const b = k & 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let h = 0;
    if (mx !== mn) {
      if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6;
      else if (mx === g) h = (b - r) / (mx - mn) + 2;
      else h = (r - g) / (mx - mn) + 4;
    }
    const grey = mx - mn < 24;
    return { k, group: grey ? -1 : Math.floor(((h * 60 + 15) % 360) / 30), l: luma(r, g, b) };
  });
  info.sort((a, b) => a.group - b.group || a.l - b.l);
  return info.map((i) => i.k);
}
