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

/**
 * A polygon or a path in pixel units. The outline is a stroke of steady width centred on the edge with pointed corners
 * (`plotCornerStroke`), and the fill is painted underneath it. A stamped brush made lumps on slanting edges and blunt
 * star tips; this is the same width everywhere. The brush shape (round or square) does not matter here.
 */
export function plotThickPolygon(pts: PxPt[], closed: boolean, t: Thickness | undefined, edge: Plot, fill?: Plot): void {
  if (!t) return plotPolygon(pts, closed, edge, fill);
  if (fill && closed) plotPolygon(pts, closed, null, fill);
  plotCornerStroke(pts, closed, t.size, edge);
}

/** The old way, kept for the A/B pictures: the brush stamped on every cell of the one pixel outline. */
export function plotStampedPolygon(pts: PxPt[], closed: boolean, t: Thickness, edge: Plot, fill?: Plot): void {
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

// ---------------------------------------------------------------- corner-aware strokes

/** How pointed a corner may get before it is rounded: the miter length over the stroke width (SVG's own limit is 4; 2 keeps a star's tips from turning into needles). */
export const MITER_LIMIT = 2;

const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** True when (x, y) is inside the convex polygon (any winding). */
function insideConvex(x: number, y: number, poly: PxPt[]): boolean {
  let pos = false;
  let neg = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c > 1e-9) pos = true;
    else if (c < -1e-9) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

/**
 * A polygon's edge as a stroke of one steady width, the way a drawing program makes a thick line, then cut into
 * pixels: every pixel whose middle is within half the width of the edge. The width is the same on flat, upright and
 * slanting edges, and corners are pointed (a miter join) up to `limit`, past which they are rounded, so a polygon's
 * corners stay square and a star's tips stay tidy instead of coming out as lumps. Each pixel is plotted once.
 * `pts` are corners in pixel units, like `plotPolygon`, and the stroke is centred on the edge itself, so a fill made
 * from the same corners always sits under it.
 */
export function plotCornerStroke(pts: PxPt[], closed: boolean, size: number, plot: Plot, limit = MITER_LIMIT): void {
  const n = Math.max(1, Math.round(size));
  // A hair off the pixel grid, so an edge exactly on a pixel line never leaves a width of n pixels in doubt.
  const q: PxPt[] = [];
  for (const p of pts) {
    const c = { x: p.x + 0.0001, y: p.y + 0.00013 };
    if (!q.length || q[q.length - 1].x !== c.x || q[q.length - 1].y !== c.y) q.push(c);
  }
  if (closed && q.length > 1 && q[0].x === q[q.length - 1].x && q[0].y === q[q.length - 1].y) q.pop();
  const r = n / 2;
  const seen = new Set<number>();
  const cells: PxPt[] = [];
  const take = (x: number, y: number) => {
    const k = (x + 100000) * 200003 + (y + 100000);
    if (seen.has(k)) return;
    seen.add(k);
    cells.push({ x, y });
  };
  const cover = (x0: number, y0: number, x1: number, y1: number, inside: (cx: number, cy: number) => boolean) => {
    for (let y = Math.floor(y0 - 0.5); y <= Math.ceil(y1 + 0.5); y++) for (let x = Math.floor(x0 - 0.5); x <= Math.ceil(x1 + 0.5); x++) if (inside(x + 0.5, y + 0.5)) take(x, y);
  };
  if (q.length === 1) {
    cover(q[0].x - r, q[0].y - r, q[0].x + r, q[0].y + r, (cx, cy) => Math.hypot(cx - q[0].x, cy - q[0].y) < r);
  }
  const segs = closed && q.length > 2 ? q.length : q.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    cover(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, (cx, cy) => distToSegment(cx, cy, a.x, a.y, b.x, b.y) < r);
  }
  // Pointed corners: the wedge a miter join adds beyond the round one.
  const corners = closed ? q.length : q.length - 2;
  for (let k = 0; k < corners && q.length > 2; k++) {
    const i = closed ? k : k + 1;
    const a = q[(i - 1 + q.length) % q.length];
    const v = q[i];
    const b = q[(i + 1) % q.length];
    const d1 = { x: v.x - a.x, y: v.y - a.y };
    const d2 = { x: b.x - v.x, y: b.y - v.y };
    const l1 = Math.hypot(d1.x, d1.y);
    const l2 = Math.hypot(d2.x, d2.y);
    if (!l1 || !l2) continue;
    d1.x /= l1; d1.y /= l1; d2.x /= l2; d2.y /= l2;
    const cross = d1.x * d2.y - d1.y * d2.x;
    const dot = d1.x * d2.x + d1.y * d2.y;
    if (Math.abs(cross) < 1e-9) continue;
    // The outside of the turn is opposite the way the path bends.
    const side = cross > 0 ? -1 : 1;
    const n1 = { x: -d1.y * side, y: d1.x * side };
    const n2 = { x: -d2.y * side, y: d2.x * side };
    // The miter tip lies along n1 + n2, at r / cos(half the turn) from the corner.
    const bis = { x: n1.x + n2.x, y: n1.y + n2.y };
    const bl = Math.hypot(bis.x, bis.y);
    if (bl < 1e-9) continue;
    const cosHalf = bl / 2;
    // The interior angle is pi minus the turn; the miter length over the width is 1 / sin(interior / 2) = 1 / cos(turn / 2).
    const ratio = 1 / cosHalf;
    if (ratio > limit || dot > 0.9999) continue;
    const tip = { x: v.x + (bis.x / bl) * (r / cosHalf), y: v.y + (bis.y / bl) * (r / cosHalf) };
    const wedge = [v, { x: v.x + n1.x * r, y: v.y + n1.y * r }, tip, { x: v.x + n2.x * r, y: v.y + n2.y * r }];
    const xs = wedge.map((p) => p.x);
    const ys = wedge.map((p) => p.y);
    cover(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (cx, cy) => insideConvex(cx, cy, wedge));
  }
  for (const c of cells) plot(c.x, c.y);
}
