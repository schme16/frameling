// Paper tooth in an SVG. A chalk or charcoal line that catches on paper is drawn from its points as pigment on the paper's
// tooth (effects/toothShape.ts), which has no vector form. An SVG can write it two ways:
//   'shapes'  the older tiny-shape grain: still vector, sharp at any size, but not the look of charcoal.
//   'picture' the line baked as a picture (PNG inside the file), so it looks as it does on the canvas, but it is pixels.
// The Export window asks which (choice `export.svgTooth`, see choices.ts). While a writer runs inside `withToothPictures`,
// a toothed line comes out as a picture; outside it nothing changes.
import type { Doc, StrokeShape } from '../core/format';
import { drawableShapeFx } from '../effects/shapeFx';
import { toothPicture } from '../effects/toothShape';
import { encodePng } from '../io/png';
import { n2 } from './svg-extra';

export type SvgTooth = 'shapes' | 'picture';

/** A picture is baked at this many pixels per SVG pixel, so it stays crisp on a screen with twice the density. */
export const BAKE_DENSITY = 2;
/** A picture bigger than this many pixels is baked smaller, and a line that is still bigger stays as shapes. */
export const MAX_PICTURE_PIXELS = 12_000_000;

interface Bake {
  /** Pixels per document pixel the pictures are baked at. */
  k: number;
  /** Only looking: nothing is drawn, and `found` says whether a toothed line was met. */
  probe: boolean;
  found: boolean;
  /** The pictures made, and the bytes of their PNGs, for the note. */
  made: number;
  bytes: number;
}

let bake: Bake | null = null;

/** Does this line carry Paper tooth as its first effect, so the canvas draws it as pigment on paper? */
export function isToothed(s: StrokeShape): boolean {
  return drawableShapeFx(s)[0]?.kind === 'tooth';
}

/** The pixels per document pixel a picture is baked at for an SVG written at this scale. */
export const bakeScale = (scale: number): number => Math.max(0.25, scale) * BAKE_DENSITY;

/** Runs `make` with toothed lines written as pictures baked for an SVG at `scale`. Without a mode it just runs. */
export function withToothPictures<T>(mode: SvgTooth | undefined, scale: number, make: () => T): T {
  if (mode !== 'picture') return make();
  const outer = bake;
  bake = { k: bakeScale(scale), probe: false, found: false, made: 0, bytes: 0 };
  try {
    return make();
  } finally {
    bake = outer;
  }
}

/** Runs a writer without drawing any toothed line, and says whether it met one: the file really has Paper tooth in it. */
export function meetsTooth(make: () => unknown): boolean {
  const outer = bake;
  const mine: Bake = { k: 1, probe: true, found: false, made: 0, bytes: 0 };
  bake = mine;
  try {
    make();
  } finally {
    bake = outer;
  }
  return mine.found;
}

/** Does any drawing in the document hold a toothed line? A cheap look that says whether there is anything to ask about. */
export function hasToothedLine(doc: Doc): boolean {
  for (const d of Object.values(doc.drawings)) if (d.kind === 'vector' && d.shapes.some((s) => s.type === 'stroke' && isToothed(s))) return true;
  return false;
}

/** How many canvas pixels the line's picture would take at `k` (a box round its points, padded by the brush). */
function roughPixels(s: StrokeShape, k: number): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const pad = s.brush.size + 2;
  return (x1 - x0 + 2 * pad) * k * ((y1 - y0 + 2 * pad) * k);
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * A toothed line as an `<image>` in document units, or '' when nothing shows. Null when this line is not to be a picture
 * (no picture mode, not toothed, or too big), and the caller writes it the usual way.
 */
export function toothImage(s: StrokeShape): string | null {
  if (!bake || !isToothed(s)) return null;
  if (bake.probe) {
    bake.found = true;
    return '';
  }
  // Too big at this density: bake it smaller, and if even a plain 1 to 1 picture is too big, leave it as shapes.
  let k = bake.k;
  if (roughPixels(s, k) > MAX_PICTURE_PIXELS) k = Math.min(1, k);
  if (roughPixels(s, k) > MAX_PICTURE_PIXELS) return null;
  const v = drawableShapeFx(s)[0].v;
  const pic = toothPicture(s, v, { a: k, b: 0, c: 0, d: k, e: 0, f: 0 });
  if (!pic) return '';
  const png = encodePng({ width: pic.w, height: pic.h, pixels: pic.data });
  bake.made++;
  bake.bytes += png.length;
  return `<image x="${n2(pic.x / k)}" y="${n2(pic.y / k)}" width="${n2(pic.w / k)}" height="${n2(pic.h / k)}" href="data:image/png;base64,${base64(png)}"/>`;
}

/** What baking did so far in this run, for tests and the notes. */
export function bakeStats(): { made: number; bytes: number } | null {
  return bake ? { made: bake.made, bytes: bake.bytes } : null;
}
