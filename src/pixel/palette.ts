/**
 * Palette maths for pixel art: the document palette, ramps, nearest colour, shading steps, reducing a drawing to the
 * palette and recolouring pixels when a palette colour changes. Pure functions on typed arrays, no DOM.
 *
 * Indexed colour is done by remapping, not by storing indices: pixels stay plain RGBA, and changing a palette colour
 * replaces every pixel of the old colour with the new one. That keeps the file format, export and every other tool
 * unchanged, at the cost that two palette entries set to the same colour can't be told apart afterwards.
 */
import type { Doc, DocPalette } from '../core/format';
import { parseHex } from '../canvas/colors';
import { STARTER_PALETTES } from './builtin';
import { variationPalette } from '../artboards/variations';

/** The palette a document uses: its own (an open variation's colourway first), or the first starter palette when it has none yet. */
export function docPalette(doc: Doc): DocPalette {
  return variationPalette(doc) ?? doc.palette ?? STARTER_PALETTES[0].palette;
}

/** A palette as packed RGB bytes (three per colour) for fast lookups. Cached per colour list. */
const rgbCache = new WeakMap<readonly string[], Uint8Array>();
export function paletteRgb(colors: readonly string[]): Uint8Array {
  let out = rgbCache.get(colors);
  if (out) return out;
  out = new Uint8Array(colors.length * 3);
  colors.forEach((c, i) => {
    const v = parseHex(c) ?? [0, 0, 0, 255];
    out![i * 3] = v[0];
    out![i * 3 + 1] = v[1];
    out![i * 3 + 2] = v[2];
  });
  rgbCache.set(colors, out);
  return out;
}

/** A perceptual-ish distance ("redmean"), cheap and much better than plain RGB for picking the nearest colour. */
export function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rm = (r1 + r2) >> 1;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (((512 + rm) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rm) * db * db) >> 8);
}

/** The index of the palette colour nearest to r, g, b (-1 for an empty palette). */
export function nearestIndex(rgb: Uint8Array, r: number, g: number, b: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0, n = rgb.length / 3; i < n; i++) {
    const d = colorDistance(r, g, b, rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    if (d < bestD) {
      bestD = d;
      best = i;
      if (d === 0) break;
    }
  }
  return best;
}

/** The exact palette index of r, g, b, or -1. */
export function exactIndex(rgb: Uint8Array, r: number, g: number, b: number): number {
  for (let i = 0, n = rgb.length / 3; i < n; i++) if (rgb[i * 3] === r && rgb[i * 3 + 1] === g && rgb[i * 3 + 2] === b) return i;
  return -1;
}

/** Remembers nearest colours, keyed by packed RGB, for one palette. Used while reducing big drawings. */
export class NearestCache {
  private map = new Map<number, number>();
  constructor(readonly rgb: Uint8Array) {}
  get(r: number, g: number, b: number): number {
    const k = (r << 16) | (g << 8) | b;
    let i = this.map.get(k);
    if (i === undefined) {
      i = nearestIndex(this.rgb, r, g, b);
      this.map.set(k, i);
    }
    return i;
  }
}

/** Start (inclusive) and end (exclusive) of the ramp the colour at `index` belongs to. */
export function rampOf(p: DocPalette, index: number): [number, number] {
  let start = 0;
  let end = p.colors.length;
  for (const r of p.ramps ?? []) {
    if (r <= index) start = Math.max(start, r);
    else end = Math.min(end, r);
  }
  return [start, end];
}

/** Every ramp as [start, end). */
export function ramps(p: DocPalette): [number, number][] {
  const starts = [0, ...(p.ramps ?? []).filter((r) => r > 0 && r < p.colors.length)].sort((a, b) => a - b);
  const uniq = [...new Set(starts)];
  return uniq.map((s, i) => [s, uniq[i + 1] ?? p.colors.length]);
}

/** Relative brightness, 0 to 255. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * The palette index one step lighter (or darker) along the ramp, or the same index at the end of the ramp. Which way
 * is "lighter" is read from the ramp itself, so ramps can be stored either way round.
 */
export function shadeStep(p: DocPalette, rgb: Uint8Array, index: number, lighter: boolean): number {
  const [s, e] = rampOf(p, index);
  if (e - s < 2) return index;
  const up = luma(rgb[(e - 1) * 3], rgb[(e - 1) * 3 + 1], rgb[(e - 1) * 3 + 2]) >= luma(rgb[s * 3], rgb[s * 3 + 1], rgb[s * 3 + 2]) ? 1 : -1;
  const next = index + (lighter ? up : -up);
  return next < s || next >= e ? index : next;
}

/**
 * Every pixel snapped to the nearest palette colour. Pixels less than half see-through become fully opaque; the rest
 * become fully clear, since a palette has no "half" colours. Returns a new array and how many pixels changed.
 */
export function reduceToPalette(pixels: Uint8ClampedArray, rgb: Uint8Array): { pixels: Uint8ClampedArray; changed: number } {
  const out = new Uint8ClampedArray(pixels.length);
  const cache = new NearestCache(rgb);
  let changed = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 128 || rgb.length === 0) {
      if (a !== 0) changed++;
      continue;
    }
    const k = cache.get(pixels[i], pixels[i + 1], pixels[i + 2]) * 3;
    out[i] = rgb[k];
    out[i + 1] = rgb[k + 1];
    out[i + 2] = rgb[k + 2];
    out[i + 3] = 255;
    if (out[i] !== pixels[i] || out[i + 1] !== pixels[i + 1] || out[i + 2] !== pixels[i + 2] || a !== 255) changed++;
  }
  return { pixels: out, changed };
}

/**
 * Every opaque pixel of one colour turned into another. Returns null when no pixel had that colour, so callers can
 * skip drawings that don't use it.
 */
export function remapColor(pixels: Uint8ClampedArray, from: readonly [number, number, number], to: readonly [number, number, number]): Uint8ClampedArray | null {
  let out: Uint8ClampedArray | null = null;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0 || pixels[i] !== from[0] || pixels[i + 1] !== from[1] || pixels[i + 2] !== from[2]) continue;
    if (!out) out = new Uint8ClampedArray(pixels);
    out[i] = to[0];
    out[i + 1] = to[1];
    out[i + 2] = to[2];
  }
  return out;
}

/** True when any opaque pixel is exactly this colour. */
export function usesColor(pixels: Uint8ClampedArray, r: number, g: number, b: number): boolean {
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] !== 0 && pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b) return true;
  return false;
}

/** How many opaque pixels use each palette colour (exact matches), for the panel's "in use" dots. */
export function colorUse(pixels: Uint8ClampedArray, rgb: Uint8Array, counts: Uint32Array): void {
  let lastKey = -1;
  let lastIdx = -1;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const k = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    if (k !== lastKey) {
      lastKey = k;
      lastIdx = exactIndex(rgb, pixels[i], pixels[i + 1], pixels[i + 2]);
    }
    if (lastIdx >= 0) counts[lastIdx]++;
  }
}

// ---------------------------------------------------------------- editing a palette (pure, returns a new palette)

/** Inserts a colour after `at` (or at the end), keeping ramp starts pointing at the same colours. */
export function insertColor(p: DocPalette, color: string, at = p.colors.length - 1): DocPalette {
  const i = Math.max(0, Math.min(p.colors.length, at + 1));
  const colors = [...p.colors.slice(0, i), color, ...p.colors.slice(i)];
  const r = (p.ramps ?? []).map((s) => (s >= i && s > 0 ? s + 1 : s));
  const names = p.names ? [...p.names.slice(0, i), '', ...p.names.slice(i)] : undefined;
  return withRamps(withNames(p, { colors }, names, (s) => (s >= i && s > 0 ? s + 1 : s)), r);
}

/** Removes the colour at `index`. */
export function removeColor(p: DocPalette, index: number): DocPalette {
  if (index < 0 || index >= p.colors.length) return p;
  const colors = p.colors.filter((_, i) => i !== index);
  const r = (p.ramps ?? []).map((s) => (s > index ? s - 1 : s));
  const names = p.names?.filter((_, i) => i !== index);
  return withRamps(withNames(p, { colors }, names, (s) => (s > index ? s - 1 : s)), r);
}

/** Moves a colour from one place to another. Ramp starts stay where they are (the colours flow through them). */
export function moveColor(p: DocPalette, from: number, to: number): DocPalette {
  if (from === to || from < 0 || from >= p.colors.length) return p;
  const colors = [...p.colors];
  const [c] = colors.splice(from, 1);
  colors.splice(Math.max(0, Math.min(colors.length, to)), 0, c);
  let names = p.names;
  if (names) {
    names = [...names];
    while (names.length < p.colors.length) names.push('');
    const [nm] = names.splice(from, 1);
    names.splice(Math.max(0, Math.min(names.length, to)), 0, nm);
  }
  return { ...p, colors, ...(names ? { names } : {}) };
}

/** Starts a new ramp at `index` (or joins it to the ramp before, when one already starts there). */
export function toggleRampStart(p: DocPalette, index: number): DocPalette {
  if (index <= 0 || index >= p.colors.length) return p;
  const r = new Set(p.ramps ?? []);
  const had = r.has(index);
  if (had) r.delete(index);
  else r.add(index);
  const out = withRamps(p, [...r]);
  if (had && out.rampNames?.[index] !== undefined) return withRampNames(out, Object.fromEntries(Object.entries(out.rampNames).filter(([k]) => +k !== index)));
  return out;
}

/** Builds a ramp of `steps` colours from dark to light through a base colour, for "Add ramp". */
export function makeRamp(base: string, steps = 5): string[] {
  const c = parseHex(base);
  if (!c) return [base];
  const out: string[] = [];
  for (let i = 0; i < steps; i++) {
    // -1 (deep shadow) to +1 (highlight), with the base in the middle. Shadows lean cooler, lights warmer, which
    // reads much more alive than plain black and white mixing.
    const t = steps === 1 ? 0 : (i / (steps - 1)) * 2 - 1;
    const mix = (v: number, target: number, k: number) => Math.round(v + (target - v) * k);
    const k = Math.abs(t) * 0.75;
    const [r, g, b] = t < 0 ? [mix(c[0], 24, k), mix(c[1], 20, k), mix(c[2], 48, k)] : [mix(c[0], 255, k), mix(c[1], 248, k), mix(c[2], 220, k)];
    out.push('#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join(''));
  }
  return out;
}

/** `p` with new colours, and its names (a same-length list, or none) and ramp names moved to match. */
function withNames(p: DocPalette, change: { colors: string[] }, names: string[] | undefined, move: (start: number) => number): DocPalette {
  const { names: _n, rampNames: _r, ...rest } = p;
  const out: DocPalette = { ...rest, colors: change.colors };
  if (names?.some(Boolean)) out.names = names;
  if (p.rampNames) out.rampNames = Object.fromEntries(Object.entries(p.rampNames).map(([k, v]) => [move(+k), v]));
  return withRampNames(out, out.rampNames);
}

function withRampNames(p: DocPalette, names: Record<number, string> | undefined): DocPalette {
  const { rampNames: _r, ...rest } = p;
  return names && Object.keys(names).length ? { ...rest, rampNames: names } : rest;
}

function withRamps(p: DocPalette, r: number[]): DocPalette {
  const clean = [...new Set(r.filter((s) => s > 0 && s < p.colors.length))].sort((a, b) => a - b);
  const { ramps: _old, ...rest } = p;
  return clean.length ? { ...rest, ramps: clean } : rest;
}
