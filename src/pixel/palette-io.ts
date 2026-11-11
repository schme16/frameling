/**
 * Palette files in and out: GIMP `.gpl`, plain `.hex` (one RRGGBB per line), JASC `.pal`, and a palette taken from
 * the colours of an image. Pure text and bytes, no DOM.
 */
import type { DocPalette } from '../core/format';
import { luma } from './palette';

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

/**
 * The colours of an image as a palette. Up to `max` distinct colours are kept as they are (most used first, then
 * grouped dark to light by hue); with more than that, median cut picks `max` representative colours.
 */
export function paletteFromPixels(pixels: Uint8ClampedArray | Uint8Array, name = 'From image', max = 32): DocPalette {
  const counts = new Map<number, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const k = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (!counts.size) throw new PaletteProblem('That picture has no solid colours to take.');
  let keys = [...counts.keys()];
  if (keys.length > max) keys = medianCut(counts, max);
  const colors = sortForRamps(keys).map((k) => rgbHex((k >> 16) & 255, (k >> 8) & 255, k & 255));
  return { name, colors };
}

/** Median cut over weighted colours: splits the box with the widest channel until there are `n` boxes. */
function medianCut(counts: Map<number, number>, n: number): number[] {
  type Box = { keys: number[] };
  const boxes: Box[] = [{ keys: [...counts.keys()] }];
  const ch = (k: number, c: number) => (k >> (16 - c * 8)) & 255;
  const range = (b: Box): [number, number] => {
    let best = 0;
    let bestC = 0;
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (const k of b.keys) {
        const v = ch(k, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best) {
        best = hi - lo;
        bestC = c;
      }
    }
    return [best, bestC];
  };
  while (boxes.length < n) {
    let pick = -1;
    let widest = 0;
    let channel = 0;
    boxes.forEach((b, i) => {
      if (b.keys.length < 2) return;
      const [w, c] = range(b);
      if (w > widest) {
        widest = w;
        pick = i;
        channel = c;
      }
    });
    if (pick < 0) break;
    const b = boxes[pick];
    b.keys.sort((x, y) => ch(x, channel) - ch(y, channel));
    // Split at the weighted median, so busy colours get more boxes.
    const total = b.keys.reduce((s, k) => s + counts.get(k)!, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < b.keys.length - 1; i++) {
      acc += counts.get(b.keys[i])!;
      if (acc >= total / 2) {
        cut = i + 1;
        break;
      }
    }
    boxes.splice(pick, 1, { keys: b.keys.slice(0, cut) }, { keys: b.keys.slice(cut) });
  }
  return boxes.map((b) => {
    let r = 0;
    let g = 0;
    let bl = 0;
    let w = 0;
    for (const k of b.keys) {
      const c = counts.get(k)!;
      r += ch(k, 0) * c;
      g += ch(k, 1) * c;
      bl += ch(k, 2) * c;
      w += c;
    }
    return (Math.round(r / w) << 16) | (Math.round(g / w) << 8) | Math.round(bl / w);
  });
}

/** Groups colours by hue (greys first), dark to light within a group, so similar colours sit together. */
function sortForRamps(keys: number[]): number[] {
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
