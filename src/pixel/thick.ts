/**
 * Thick pixel outlines: the same clean rectangles, ellipses, lines and polygons, with the pixel brush stamped along
 * the edge. Crisp (whole pixels only), pure, no DOM. A thickness of 1 is the classic one pixel outline, exactly.
 */
import { brushOffsets, type PixelShape, type PxPt } from '../canvas/pixels';
import { plotEllipse, plotLine, plotPolygon, plotRect, plotRectInside, type Plot } from './raster';

export const MIN_OUTLINE = 1;
export const MAX_OUTLINE = 16;
export const DEFAULT_OUTLINE = 2;

export interface Thickness {
  /** Outline width in art pixels (1 is the classic outline). */
  size: number;
  /** The brush that is stamped: a square or a round one. */
  shape: PixelShape;
}

/** Keeps a saved or typed thickness to a whole number between the limits. */
export function clampOutline(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : DEFAULT_OUTLINE;
  return Math.min(MAX_OUTLINE, Math.max(MIN_OUTLINE, n));
}

/**
 * The thickness to draw with, or undefined for the classic outline. `size` is the preference in art pixels, already
 * run through the camera size rule by the caller.
 */
export function outlineThickness(on: boolean, size: number, shape: PixelShape): Thickness | undefined {
  const n = Math.max(1, Math.round(size));
  return on && n > 1 ? { size: n, shape } : undefined;
}

/** How far the brush reaches before and after its centre pixel (on even sizes the centre is the upper left of the middle). */
export function brushReach(size: number): { before: number; after: number } {
  const n = Math.max(1, Math.round(size));
  const before = Math.floor((n - 1) / 2);
  return { before, after: n - 1 - before };
}

/**
 * Collects the cells of an edge and stamps the brush on each one once `flush` is called, so the stamps land on top of
 * a fill that is painted while the edge is still being traced.
 */
function stamper(plot: Plot, t: Thickness): { edge: Plot; flush: () => void } {
  const offsets = brushOffsets(t.size, t.shape);
  const seen = new Set<string>();
  const cells: PxPt[] = [];
  return {
    edge: (x, y) => {
      const k = x + ',' + y;
      if (seen.has(k)) return;
      seen.add(k);
      cells.push({ x, y });
    },
    flush: () => {
      for (const c of cells) for (const o of offsets) plot(c.x + o.x, c.y + o.y);
    },
  };
}

/** A line with the brush stamped along it. */
export function plotThickLine(x0: number, y0: number, x1: number, y1: number, t: Thickness | undefined, plot: Plot): void {
  if (!t) return plotLine(x0, y0, x1, y1, plot);
  const s = stamper(plot, t);
  plotLine(x0, y0, x1, y1, s.edge);
  s.flush();
}

/**
 * A rectangle between two corner pixels. The outline grows inwards, so the shape keeps the size you dragged. When it is
 * thicker than the shape can hold, the shape comes out solid in the edge colour. `fill` paints the inside.
 */
export function plotThickRect(x0: number, y0: number, x1: number, y1: number, t: Thickness | undefined, edge: Plot, fill?: Plot): void {
  if (!t) {
    if (fill) plotRectInside(x0, y0, x1, y1, fill);
    return plotRect(x0, y0, x1, y1, false, edge);
  }
  const box = insetBox(x0, y0, x1, y1, t.size);
  if (!box) return plotRect(x0, y0, x1, y1, true, edge);
  if (fill) plotRectInside(x0, y0, x1, y1, fill);
  const s = stamper(edge, t);
  plotRect(box[0], box[1], box[2], box[3], false, s.edge);
  s.flush();
}

/** An ellipse that fits the box between two corner pixels, with the outline growing inwards like the rectangle. */
export function plotThickEllipse(x0: number, y0: number, x1: number, y1: number, t: Thickness | undefined, edge: Plot, fill?: Plot): void {
  if (!t) return plotEllipse(x0, y0, x1, y1, edge, fill);
  const box = insetBox(x0, y0, x1, y1, t.size);
  if (!box) return plotEllipse(x0, y0, x1, y1, edge, edge);
  const s = stamper(edge, t);
  plotEllipse(box[0], box[1], box[2], box[3], s.edge, fill);
  s.flush();
}

/** A polygon or a path in pixel units. The brush is centred on the edge, and the fill is painted underneath it. */
export function plotThickPolygon(pts: PxPt[], closed: boolean, t: Thickness | undefined, edge: Plot, fill?: Plot): void {
  if (!t) return plotPolygon(pts, closed, edge, fill);
  const s = stamper(edge, t);
  plotPolygon(pts, closed, s.edge, fill);
  s.flush();
}

/**
 * The box the brush centres travel round, so its outer edge sits on the dragged box. Null when the box is too small
 * for the brush (the shape is then solid).
 */
export function insetBox(x0: number, y0: number, x1: number, y1: number, size: number): [number, number, number, number] | null {
  const { before, after } = brushReach(size);
  const ax = Math.min(x0, x1) + before;
  const bx = Math.max(x0, x1) - after;
  const ay = Math.min(y0, y1) + before;
  const by = Math.max(y0, y1) - after;
  return ax > bx || ay > by ? null : [ax, ay, bx, by];
}
