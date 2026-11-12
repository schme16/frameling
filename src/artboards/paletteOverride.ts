/**
 * A variation's colourway, per colour. A variation keeps only the palette colours it changed (`from` the original's
 * colour `to` its own); every other colour, and the order, names and ramps, follow the original. The pixels of the
 * original that are in a changed colour are shown in the new one, so recoloured pixels need no copy of their own.
 * Pure functions, no DOM.
 */
import type { Color, DocPalette, Drawing, PaletteColourChange, PaletteOverride, PixelDrawing, Shape } from '../core/format';
import { parseHex } from '../canvas/colors';
import { STARTER_PALETTES } from '../pixel/builtin';
import { recolourShape, shapeColours } from '../tools/shapeColour';

/** A colour as one number (the same colour written differently gives the same number), or -1 when it is not a colour. */
export function rgbKey(c: Color): number {
  const v = parseHex(c);
  return v ? (v[0] << 16) | (v[1] << 8) | v[2] : -1;
}

/** The palette a document's artboards share: its own, or the first starter palette when it has none yet. */
export const basePalette = (doc: { palette?: DocPalette }): DocPalette => doc.palette ?? STARTER_PALETTES[0].palette;

/** The changes, tidied: one per original colour, none that change nothing. */
export function tidyChanges(list: readonly PaletteColourChange[]): PaletteColourChange[] {
  const seen = new Set<number>();
  const out: PaletteColourChange[] = [];
  for (const c of list) {
    const k = rgbKey(c.from);
    if (k < 0 || seen.has(k) || rgbKey(c.to) < 0 || k === rgbKey(c.to)) continue;
    seen.add(k);
    out.push({ from: c.from, to: c.to });
  }
  return out;
}

/** An older file's whole palette as changes: the colours that differ from the original's, place by place. */
export function migrateLegacy(base: DocPalette, legacy: DocPalette): PaletteColourChange[] {
  const out: PaletteColourChange[] = [];
  for (let i = 0; i < Math.min(base.colors.length, legacy.colors.length); i++) out.push({ from: base.colors[i], to: legacy.colors[i] });
  return tidyChanges(out);
}

/** The changes of an override (an older whole palette is read against `base`). */
export function changesOf(ov: PaletteOverride | undefined, base: DocPalette): PaletteColourChange[] {
  if (!ov) return [];
  return ov.legacy && !ov.changes.length ? migrateLegacy(base, ov.legacy) : ov.changes;
}

/** An override of just these changes, or undefined when there are none. */
export const makeOverride = (changes: readonly PaletteColourChange[]): PaletteOverride | undefined => {
  const t = tidyChanges(changes);
  return t.length ? { changes: t } : undefined;
};

const resolved = new WeakMap<DocPalette, WeakMap<PaletteOverride, DocPalette>>();

/** The original's palette with the changes on. The original's own object when nothing changes (and the same object for the same input). */
export function resolvePalette(base: DocPalette, ov: PaletteOverride | undefined): DocPalette {
  if (!ov) return base;
  let m = resolved.get(base);
  if (!m) resolved.set(base, (m = new WeakMap()));
  let hit = m.get(ov);
  if (!hit) {
    const ch = changesOf(ov, base);
    if (!ch.length) hit = base;
    else {
      const map = new Map(ch.map((c) => [rgbKey(c.from), c.to] as const));
      hit = { ...base, colors: base.colors.map((c) => map.get(rgbKey(c)) ?? c) };
    }
    m.set(ov, hit);
  }
  return hit;
}

/** True when `p` is `base` with colours changed in place: same count, same names and ramps. */
export function isColourEdit(base: DocPalette, p: DocPalette): boolean {
  if (base.colors.length !== p.colors.length || base.name !== p.name) return false;
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return same(base.ramps, p.ramps) && same(base.names, p.names) && same(base.rampNames, p.rampNames);
}

/** The changes that make `base` into `p` (colours changed in place). Call `isColourEdit` first. */
export function changesBetween(base: DocPalette, p: DocPalette): PaletteColourChange[] {
  const out: PaletteColourChange[] = [];
  base.colors.forEach((c, i) => out.push({ from: c, to: p.colors[i] }));
  return tidyChanges(out);
}

/**
 * What an edit of the original's palette renamed: the colours that changed where they stood (a colour changed in place,
 * or several). Adding, removing and moving colours rename nothing. Pairs of colour number.
 */
export function paletteRenames(before: readonly Color[], after: readonly Color[]): Map<number, Color> {
  const out = new Map<number, Color>();
  const a = before.map(rgbKey);
  const b = after.map(rgbKey);
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let hiA = a.length;
  let hiB = b.length;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) {
    hiA--;
    hiB--;
  }
  // What is left in the middle: the same number of colours on both sides, and not just the same colours moved about.
  if (hiA - lo !== hiB - lo) return out;
  const left = a.slice(lo, hiA).sort();
  const right = b.slice(lo, hiB).sort();
  if (left.every((x, i) => x === right[i])) return out;
  for (let i = lo; i < hiA; i++) if (a[i] !== b[i] && !b.includes(a[i])) out.set(a[i], after[i]);
  return out;
}

/** The changes with their `from` colours renamed (the original recoloured a colour this variation had changed: it stays this variation's own). */
export function followRenames(changes: readonly PaletteColourChange[], renames: Map<number, Color>): PaletteColourChange[] {
  if (!renames.size) return changes as PaletteColourChange[];
  return changes.map((c) => {
    const to = renames.get(rgbKey(c.from));
    return to === undefined ? c : { from: to, to: c.to };
  });
}

// ---------------------------------------------------------------- the pixels

const maps = new WeakMap<PaletteOverride, Map<number, [number, number, number]>>();

/** The colour swaps of an override, by the original's colour. */
function colourMap(ov: PaletteOverride): Map<number, [number, number, number]> {
  let m = maps.get(ov);
  if (!m) {
    m = new Map();
    for (const c of ov.changes) {
      const to = parseHex(c.to);
      const k = rgbKey(c.from);
      if (to && k >= 0) m.set(k, [to[0], to[1], to[2]]);
    }
    maps.set(ov, m);
  }
  return m;
}

/** Pixels with the swaps made, or null when none of them uses a swapped colour. */
export function recolourPixels(pixels: Uint8ClampedArray, ov: PaletteOverride): Uint8ClampedArray | null {
  const map = colourMap(ov);
  if (!map.size) return null;
  let out: Uint8ClampedArray | null = null;
  let lastKey = -1;
  let lastTo: [number, number, number] | undefined;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const k = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    if (k !== lastKey) {
      lastKey = k;
      lastTo = map.get(k);
    }
    if (!lastTo) continue;
    if (!out) out = new Uint8ClampedArray(pixels);
    out[i] = lastTo[0];
    out[i + 1] = lastTo[1];
    out[i + 2] = lastTo[2];
  }
  return out;
}

const recoloured = new WeakMap<PaletteOverride, WeakMap<Drawing, Drawing>>();

/** A colour as `#rrggbb` (lower case, see-through part dropped), or null when it is not a colour. */
export function plainHex(c: Color): string | null {
  const v = parseHex(c);
  return v ? '#' + ((v[0] << 16) | (v[1] << 8) | v[2]).toString(16).padStart(6, '0') : null;
}

/** The swaps of an override as a colour-to-colour function for vector shapes (the see-through part of a colour stays). */
function shapeMapper(ov: PaletteOverride): (c: Color) => Color {
  const map = new Map(ov.changes.map((c) => [rgbKey(c.from), plainHex(c.to)] as const));
  return (c) => {
    const to = map.get(rgbKey(c));
    if (!to) return c;
    const t = c.trim().replace(/^#/, '');
    const alpha = t.length === 8 ? t.slice(6) : t.length === 4 ? t[3] + t[3] : '';
    return alpha ? to + alpha : to;
  };
}

/** A drawing as the variation shows it: pixels and vector shapes with the swaps made (the same object when nothing changes, and the same one for the same input). */
export function recolourDrawing(d: Drawing, ov: PaletteOverride | undefined): Drawing {
  if (!ov || !ov.changes.length) return d;
  if (d.kind === 'vector') {
    let m = recoloured.get(ov);
    if (!m) recoloured.set(ov, (m = new WeakMap()));
    let hit = m.get(d);
    if (!hit) {
      const f = shapeMapper(ov);
      let changed = false;
      const shapes = d.shapes.map((s) => {
        const n = recolourShape(s, f);
        if (n !== s) changed = true;
        return n;
      });
      hit = changed ? { ...d, shapes } : d;
      m.set(d, hit);
    }
    return hit;
  }
  if (d.kind !== 'pixel' || !(d.pixels instanceof Uint8ClampedArray)) return d;
  let m = recoloured.get(ov);
  if (!m) recoloured.set(ov, (m = new WeakMap()));
  let hit = m.get(d);
  if (!hit) {
    const px = recolourPixels(d.pixels, ov);
    hit = px ? ({ ...(d as PixelDrawing), pixels: px } as Drawing) : d;
    m.set(d, hit);
  }
  return hit;
}

/** The colours a drawing is made of, as `#rrggbb` by colour key (pixels that show, and the colours of vector shapes, gradients included). */
export function drawingColours(d: Drawing, into: Map<number, string> = new Map()): Map<number, string> {
  if (d.kind === 'vector') {
    for (const s of d.shapes as Shape[]) for (const c of shapeColours(s)) noteColour(into, c);
  } else if (d.kind === 'pixel' && d.pixels instanceof Uint8ClampedArray) {
    const px = d.pixels;
    let last = -1;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      if (k === last) continue;
      last = k;
      if (!into.has(k)) into.set(k, '#' + k.toString(16).padStart(6, '0'));
    }
  }
  return into;
}

function noteColour(into: Map<number, string>, c: Color): void {
  const k = rgbKey(c);
  if (k >= 0 && !into.has(k)) into.set(k, plainHex(c)!);
}
