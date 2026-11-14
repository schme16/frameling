/**
 * How much of the stage a vector drawing can touch, so its layer bitmap only needs to be that big (a few strokes on a
 * 1920 x 1080 stage are a bitmap of a few thousand pixels, not two million). The box is deliberately generous: it
 * must hold every pixel the drawing paints, and a box that is too big only wastes a little memory. Anything whose
 * reach isn't known here (symbol instances, text, particles, plugin shapes) answers "unknown" and keeps a
 * stage-sized bitmap.
 */
import type { PathPoint, Shape, StrokeShape, SubPath } from '../core/format';
import { styleReach } from '../geometry/lineStyle';

export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A bitmap's place on the stage-sized frame, in device pixels (whole numbers). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const grow = (b: InkBox, x: number, y: number, r: number): boolean => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x - r < b.x0) b.x0 = x - r;
  if (y - r < b.y0) b.y0 = y - r;
  if (x + r > b.x1) b.x1 = x + r;
  if (y + r > b.y1) b.y1 = y + r;
  return true;
};

/** How far a brush stroke's outline can lie from its points: the widest the pen gets, with room for the caps. */
function strokeReach(s: StrokeShape): number {
  const b = s.brush;
  let dev = 0;
  for (const p of s.points) dev = Math.max(dev, Math.abs(p.p - 0.5));
  // perfect-freehand's radius is size * (0.5 - thinning * (0.5 - pressure)).
  const radius = Math.abs(b.size) * (0.5 + Math.abs(b.thinning) * (0.5 + dev));
  return radius * 1.5 + 1;
}

function addPaths(b: InkBox, paths: readonly SubPath[], r: number): boolean {
  for (const sp of paths) {
    for (const p of sp.points as readonly PathPoint[]) {
      // A curve stays inside the box of its end and control points.
      if (!grow(b, p.x, p.y, r)) return false;
      if (p.c1 && !grow(b, p.c1.x, p.c1.y, r)) return false;
      if (p.c2 && !grow(b, p.c2.x, p.c2.y, r)) return false;
    }
  }
  return true;
}

/**
 * The document-space box of what these shapes paint: an empty box (x1 < x0) when they paint nothing, or null when the
 * reach of some shape isn't known.
 */
export function shapesInk(shapes: readonly Shape[]): InkBox | null {
  const b: InkBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const s of shapes) {
    if (s.type === 'stroke') {
      const r = strokeReach(s);
      for (const p of s.points) if (!grow(b, p.x, p.y, r)) return null;
    } else if (s.type === 'fill') {
      if (!addPaths(b, s.paths, 0)) return null;
    } else if (s.type === 'path') {
      let r = 0;
      if (s.stroke) {
        const half = s.stroke.width / 2;
        // A zero or odd width leaves the canvas's previous line width in force, so the reach can't be told.
        if (!(half > 0) || !Number.isFinite(half)) return null;
        // A miter can reach ten half-widths (the canvas default limit), a square cap a corner's worth.
        r = Math.max(half * (s.stroke.join === 'miter' ? 10 : 1.5), styleReach(s.stroke));
      }
      if (!addPaths(b, s.paths, r)) return null;
    } else return null;
  }
  return b;
}

/** Room left around the ink, in device pixels, for the soft edge of anti-aliasing. */
const MARGIN = 2;

/**
 * Where a drawing's bitmap sits on a stage-sized frame (the stage is `w` x `h` device pixels, which may be fractional;
 * the frame canvas is the whole pixels of that). Whole pixels only, so the drawing is rasterised on the very same
 * pixel grid as on a full frame, and clipped to the frame like it. Null when the box is unknown or not usable.
 */
export function cropFor(box: InkBox | null, docWidth: number, docHeight: number, w: number, h: number): CropRect | null {
  const fw = Math.trunc(w);
  const fh = Math.trunc(h);
  if (!box || !(docWidth > 0) || !(docHeight > 0) || !(fw >= 1) || !(fh >= 1)) return null;
  if (box.x1 < box.x0 || box.y1 < box.y0) return { x: 0, y: 0, w: 1, h: 1 };
  const sx = w / docWidth;
  const sy = h / docHeight;
  const x0 = Math.max(0, Math.floor(box.x0 * sx) - MARGIN);
  const y0 = Math.max(0, Math.floor(box.y0 * sy) - MARGIN);
  const x1 = Math.min(fw, Math.ceil(box.x1 * sx) + MARGIN);
  const y1 = Math.min(fh, Math.ceil(box.y1 * sy) + MARGIN);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  // Nothing of it on the frame.
  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The smallest crop that holds both. */
export function unionCrop(a: CropRect, b: CropRect): CropRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
