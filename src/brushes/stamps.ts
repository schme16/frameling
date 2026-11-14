// Brushes made from a selection. On a vector layer the selected shapes become a stamp (one silhouette, 1 unit across,
// that goes along a line in the brush's colour). On a pixel layer the selected pixels become a small picture the pixel
// brush paints with. Pure, no DOM.
import type { Shape } from '../core/format';
import { rdp } from '../geometry/bezier';
import { geomBox, shapeParts, union, type Geom } from '../geometry/merge';
import { MAX_CUSTOM_POINTS, MAX_CUSTOM_RINGS, MAX_TILE_POINTS, MAX_TILE_RINGS } from '../geometry/tip';
import type { RGBA } from '../canvas/pixels';
import { maskBounds, type Mask } from '../select/mask';

// ---------------------------------------------------------------- vector

export interface VectorStamp {
  rings: number[][];
  /** How big it was, longer side, in document pixels. */
  side: number;
  /** How many of the selected shapes can't be a stamp (text, particles, symbols) and were left out. */
  skipped: number;
}

/** True for the kinds of shape a stamp can be made from. */
export const stampable = (s: Shape): boolean => s.type === 'stroke' || s.type === 'fill' || s.type === 'path';

/**
 * The silhouette of the shapes as a stamp: every shape joined into one, outlines simplified until they fit the point
 * limit, centred and scaled so the longer side is 1. Null when there is nothing to make it from.
 */
export function vectorStampFrom(shapes: readonly Shape[], forTile = false): VectorStamp | null {
  const maxPoints = forTile ? MAX_TILE_POINTS : MAX_CUSTOM_POINTS;
  const maxRings = forTile ? MAX_TILE_RINGS : MAX_CUSTOM_RINGS;
  const digits = forTile ? 10000 : 1000;
  const use = shapes.filter(stampable);
  const skipped = shapes.length - use.length;
  const geoms: Geom[] = [];
  for (const s of use) for (const p of shapeParts(s)) geoms.push(p.geom);
  if (!geoms.length) return null;
  const all = geoms.length > 1 ? union(geoms[0], ...geoms.slice(1)) : geoms[0];
  if (!all || !all.length) return null;
  const box = geomBox(all);
  if (!box) return null;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const side = Math.max(w, h);
  if (!(side > 0)) return null;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const rings: { x: number; y: number }[][] = [];
  for (const poly of all) for (const ring of poly) if (ring.length > 3) rings.push(ring.slice(0, -1).map(([x, y]) => ({ x: (x - cx) / side, y: (y - cy) / side })));
  if (!rings.length) return null;
  // Simplify, a little more each time, until it is small enough to keep in every line drawn with it.
  let eps = forTile ? 0.0015 : 0.004;
  let out = rings;
  for (let i = 0; i < 14; i++) {
    out = rings.map((r) => simplifyRing(r, eps)).filter((r) => r.length >= 3);
    const total = out.reduce((n, r) => n + r.length, 0);
    if (out.length <= maxRings && total <= maxPoints) break;
    eps *= 1.5;
    // Too many rings: keep the biggest.
    if (out.length > maxRings) out = [...out].sort((a, b) => b.length - a.length).slice(0, maxRings);
  }
  while (out.reduce((n, r) => n + r.length, 0) > maxPoints && out.length > 1) out.pop();
  const flat = out.map((r) => r.flatMap((p) => [Math.round(p.x * digits) / digits, Math.round(p.y * digits) / digits]));
  const points = flat.reduce((n, r) => n + r.length / 2, 0);
  if (!flat.length || points > maxPoints) return null;
  return { rings: flat, side, skipped };
}

function simplifyRing(r: { x: number; y: number }[], eps: number): { x: number; y: number }[] {
  const s = rdp([...r, r[0]], eps);
  return s.slice(0, -1);
}

// ---------------------------------------------------------------- pixels

/** The most a pixel brush picture can be, each way. */
export const MAX_STAMP = 32;

export interface PixelStamp {
  w: number;
  h: number;
  /** The colours used, as #rrggbb or #rrggbbaa. */
  colours: string[];
  /** Row by row, w * h long: 0 is clear, any other number is a place in `colours` plus one. */
  cells: number[];
  /** Paint with the picture's own colours (true), or fill its shape with the colour you picked (false). */
  keep: boolean;
}

export type PixelStampResult = { ok: true; stamp: PixelStamp; colourCount: number } | { ok: false; why: 'empty' | 'big' };

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

/** The selected pixels (the ones with something in them) as a brush picture. `pixels` is RGBA, `width` the grid's width. */
export function pixelStampFrom(pixels: Uint8ClampedArray, width: number, mask: Mask, keep: boolean): PixelStampResult {
  const inside = new Uint8Array(mask.bits.length);
  for (let i = 0; i < inside.length; i++) if (mask.bits[i] && pixels[i * 4 + 3] > 0) inside[i] = 1;
  const b = maskBounds({ ...mask, bits: inside });
  if (!b) return { ok: false, why: 'empty' };
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  if (w > MAX_STAMP || h > MAX_STAMP) return { ok: false, why: 'big' };
  const colours: string[] = [];
  const index = new Map<string, number>();
  const cells: number[] = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (b.y0 + y) * width + (b.x0 + x);
      if (!inside[i]) continue;
      const a = pixels[i * 4 + 3];
      const key = `#${hex2(pixels[i * 4])}${hex2(pixels[i * 4 + 1])}${hex2(pixels[i * 4 + 2])}${a < 255 ? hex2(a) : ''}`;
      let k = index.get(key);
      if (k === undefined) {
        colours.push(key);
        k = colours.length;
        index.set(key, k);
      }
      cells[y * w + x] = k;
    }
  const many = colours.length > 1;
  return { ok: true, stamp: { w, h, colours, cells, keep: many && keep }, colourCount: colours.length };
}

/** A saved brush picture read back, or null when it isn't one. */
export function readPixelStamp(raw: unknown): PixelStamp | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const w = r.w;
  const h = r.h;
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_STAMP || h > MAX_STAMP) return null;
  if (!Array.isArray(r.colours) || r.colours.length > 256 || !r.colours.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c))) return null;
  if (!Array.isArray(r.cells) || r.cells.length !== w * h) return null;
  const n = r.colours.length;
  if (!r.cells.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= n)) return null;
  if (!r.cells.some((c) => c > 0)) return null;
  return { w, h, colours: r.colours as string[], cells: r.cells as number[], keep: r.keep === true };
}

export interface StampCell {
  /** Where it sits from the brush's centre pixel. */
  x: number;
  y: number;
  /** Its own colour. */
  rgba: RGBA;
}

function parseColour(hex: string): RGBA {
  const v = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [v(1), v(3), v(5), hex.length > 7 ? v(7) : 255];
}

/** The cells of a brush picture, around its middle pixel (the middle of the upper left when the sides are even). */
export function stampCells(st: PixelStamp): StampCell[] {
  const cx = Math.floor((st.w - 1) / 2);
  const cy = Math.floor((st.h - 1) / 2);
  const cols = st.colours.map(parseColour);
  const out: StampCell[] = [];
  for (let y = 0; y < st.h; y++)
    for (let x = 0; x < st.w; x++) {
      const k = st.cells[y * st.w + x];
      if (k > 0) out.push({ x: x - cx, y: y - cy, rgba: cols[k - 1] });
    }
  return out;
}

/** How far apart copies of a picture brush go as you drag: the picture's longer side, so they sit side by side. */
export const stampSpacing = (st: PixelStamp): number => Math.max(st.w, st.h);

/** True when the picture has more than one colour, so keeping them means something. */
export const hasColours = (st: PixelStamp): boolean => st.colours.length > 1;
