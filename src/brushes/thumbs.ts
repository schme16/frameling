// The little pictures in the brush picker: a short dab for the tip, and a long stroke for the row. Both are drawn by
// the one renderer (render.ts), the same way a line on the page is, so chalk shows grain, watercolour a wash and a
// stamp its shapes. A picture is kept once drawn: a list of hundreds is only ever drawn as far as it has been seen, and
// scrolling back over a brush costs a copy, not a redraw.
import type { BrushSettings, StrokePoint } from '../core/format';
import { drawShape } from '../core/render';
import { buildStroke } from '../tools/vectorStroke';

/** The points of the long sample: one slow wave with a swell in the middle, as wide as the box. */
export function samplePoints(w: number, h: number): StrokePoint[] {
  const pad = Math.min(14, w * 0.06);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    pts.push({ x: pad + t * (w - pad * 2), y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2, p: 0.25 + 0.6 * Math.sin(t * Math.PI) });
  }
  return pts;
}

/** The size the long sample is drawn at: the brush's own, scaled down to fit the row and capped so a fat brush stays inside. */
export const sampleSize = (size: number, h: number): number => Math.max(1.2, Math.min(size * 0.6, h * 0.66));

/**
 * The points of the short dab: centred in the box with room round the tip for a rough edge, a wash or a stamp to spread,
 * and a tiny slant so it looks made by a hand. A fat brush leaves little line (a tip), a thin one a short stroke.
 */
export function dabPoints(w: number, h: number, size: number): StrokePoint[] {
  const room = size / 2 + Math.max(4, size * 0.3);
  const len = Math.max(4, w - 2 * room);
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push({ x: w / 2 - len / 2 + t * len, y: h / 2 + (0.5 - t) * Math.min(h * 0.18, len * 0.2), p: 0.7 });
  }
  return pts;
}

/** The size the dab is drawn at: the brush's own, as long as it fits the box with room to spare. */
export const dabSize = (size: number, h: number): number => Math.max(1.4, Math.min(size, h * 0.6));

/** What a picture is made from: the dab or the long sample. */
export type ThumbKind = 'dab' | 'stroke';

/** The brush as the picture draws it: sized to fit, the taper kept short so the whole tip shows. */
export function thumbBrush(brush: BrushSettings, kind: ThumbKind, h: number): BrushSettings {
  if (kind === 'dab') return { ...brush, size: dabSize(brush.size, h), taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
  return { ...brush, size: sampleSize(brush.size, h), taperStart: brush.taperStart * 0.5, taperEnd: brush.taperEnd * 0.5 };
}

/** What makes two pictures the same: the brush's looks (not its name), the box, the screen's sharpness and the ink colour. */
export function thumbKey(brush: BrushSettings, kind: ThumbKind, w: number, h: number, dpr: number, color: string): string {
  const { size, thinning, smoothing, streamline, taperStart, taperEnd, capStart, capEnd, tip } = brush;
  return JSON.stringify([kind, w, h, dpr, color, size, thinning, smoothing, streamline, taperStart, taperEnd, capStart, capEnd, tip ?? null]);
}

/** Most pictures kept. A hundred rows at two sizes and both themes fit with room to spare, and each is a few KB. */
export const THUMB_CACHE_MAX = 600;
const cache = new Map<string, HTMLCanvasElement>();
let drawn = 0;

/** How many pictures have been drawn from scratch (not copied from the cache). For tests and measuring. */
export const thumbsDrawn = (): number => drawn;
export const thumbsKept = (): number => cache.size;
export function clearThumbs(): void {
  cache.clear();
}

/** The picture for a brush at a size, from the cache or drawn now. Null where there is no canvas to draw on. */
export function thumbFor(brush: BrushSettings, kind: ThumbKind, w: number, h: number, dpr: number, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || w < 1 || h < 1) return null;
  const key = thumbKey(brush, kind, w, h, dpr, color);
  const have = cache.get(key);
  if (have) {
    // Most recently used goes to the back, so the oldest is what gets dropped.
    cache.delete(key);
    cache.set(key, have);
    return have;
  }
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const used = thumbBrush(brush, kind, h);
  const pts = kind === 'dab' ? dabPoints(w, h, used.size) : samplePoints(w, h);
  drawShape(g, buildStroke(pts, used, color));
  drawn++;
  cache.set(key, c);
  if (cache.size > THUMB_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return c;
}
