/**
 * Small helpers the templates are built from. Everything is generated in code (no saved drawings), so the
 * templates stay tiny and follow the format as it grows.
 */
import { trimmedDrawing } from '../core/pixelBounds';
import { DEFAULT_BRUSH, newPixelDrawing, newPixelLayer, newVectorLayer, uid } from '../core/doc';
import type { Color, Doc, FillShape, Layer, PathShape, PixelDrawing, PixelLayer, StrokeShape, SubPath, VectorDrawing, VectorLayer } from '../core/format';

export const INK = '#1d1b26';
export const PAPER = '#fffaf0';
export const SUNNY = '#ffc94a';
export const PEACH = '#ff9e6d';
export const ROSE = '#ff6f91';
export const GRAPE = '#9b7bff';
export const SKY = '#5ab8ff';
export const MINT = '#4fd1a5';

export type XY = [number, number];

/** A hand-drawn style line through the points, which the brush smooths out. */
export function stroke(
  points: XY[],
  color: Color,
  size: number,
  o: { taperStart?: number; taperEnd?: number; opacity?: number; step?: number; thinning?: number } = {},
): StrokeShape {
  return {
    id: uid('k'),
    type: 'stroke',
    points: densify(points, o.step ?? 10).map(([x, y]) => ({ x, y, p: 0.5 })),
    brush: { ...DEFAULT_BRUSH, size, thinning: o.thinning ?? 0, taperStart: o.taperStart ?? 0, taperEnd: o.taperEnd ?? 0 },
    color,
    opacity: o.opacity ?? 1,
  };
}

/** Adds points along each segment so a stroke made of a few corners still has an even-spaced point list. */
export function densify(points: XY[], step: number): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Points around an ellipse (angles in radians, 0 = right, going clockwise on screen). */
export function arc(cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, n = 40): XY[] {
  const pts: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

const K = 0.5523;

/** A closed ellipse as four cubic curves. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): SubPath {
  return {
    closed: true,
    points: [
      { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - K * ry }, c2: { x: cx - K * rx, y: cy - ry } },
      { x: cx + rx, y: cy, c1: { x: cx + K * rx, y: cy - ry }, c2: { x: cx + rx, y: cy - K * ry } },
      { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + K * ry }, c2: { x: cx + K * rx, y: cy + ry } },
      { x: cx - rx, y: cy, c1: { x: cx - K * rx, y: cy + ry }, c2: { x: cx - rx, y: cy + K * ry } },
    ],
  };
}

export function rectPath(x: number, y: number, w: number, h: number): SubPath {
  return {
    closed: true,
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  };
}

/** A smooth closed blob through the points (Catmull-Rom turned into cubic curves). */
export function smoothClosed(pts: XY[]): SubPath {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  const points = pts.map((p, i) => {
    const a = at(i - 2);
    const b = at(i - 1);
    const c = at(i + 1);
    return {
      x: p[0],
      y: p[1],
      c1: { x: b[0] + (p[0] - a[0]) / 6, y: b[1] + (p[1] - a[1]) / 6 },
      c2: { x: p[0] - (c[0] - b[0]) / 6, y: p[1] - (c[1] - b[1]) / 6 },
    };
  });
  return { closed: true, points };
}

/** An open line as a path (for ground lines and the like). */
export function linePath(pts: XY[]): SubPath {
  return { closed: false, points: pts.map(([x, y]) => ({ x, y })) };
}

export function fill(paths: SubPath[], color: Color, opacity = 1): FillShape {
  return { id: uid('f'), type: 'fill', paths, color, opacity };
}

export function pathShape(paths: SubPath[], fillColor: Color | null, line: { color: Color; width: number } | null, opacity = 1): PathShape {
  return {
    id: uid('s'),
    type: 'path',
    paths,
    fill: fillColor,
    stroke: line ? { color: line.color, width: line.width, join: 'round', cap: 'round' } : null,
    opacity,
  };
}

export function vectorDrawing(doc: Doc, shapes: (StrokeShape | FillShape | PathShape)[]): VectorDrawing {
  const d: VectorDrawing = { id: uid('v'), kind: 'vector', shapes };
  doc.drawings[d.id] = d;
  return d;
}

/** A blank doc with no layers, ready for the template to add its own. */
export function emptyOf(doc: Doc): Doc {
  doc.layers = [];
  return doc;
}

export function addVectorLayer(doc: Doc, name: string): VectorLayer {
  const l = newVectorLayer(name);
  doc.layers.push(l);
  return l;
}

export function addPixelLayer(doc: Doc, name: string, pixelSize: number): PixelLayer {
  const l = newPixelLayer(name, pixelSize);
  doc.layers.push(l);
  return l;
}

/** Holds a drawing on a layer from `start` for `length` frames. Several holds can share one drawing. */
export function hold(layer: Layer, drawingId: string, start: number, length = 1): void {
  layer.cels.push({ id: uid('c'), start, length, drawingId });
}

export function addMarker(doc: Doc, name: string, frame: number): void {
  doc.markers.push({ id: uid('m'), name, frame });
}

export function addClip(doc: Doc, name: string, start: number, end: number, loop = true): void {
  doc.clips.push({ id: uid('q'), name, start, end, loop });
}

// ---- Pixel art ------------------------------------------------------------------------------------------

/** Palette key -> colour. '.' is always transparent. */
export type PixelPalette = Record<string, Color>;

export function hexToRgba(c: Color): [number, number, number, number] {
  const h = c.replace('#', '');
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 255];
}

/** A mutable grid of palette characters, for composing frames out of hand-drawn pieces. */
export function blankGrid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array<string>(w).fill('.'));
}

/** Copies a sprite (rows of palette characters) onto a grid at (ox, oy). '.' leaves what's underneath alone. */
export function stamp(grid: string[][], rows: readonly string[], ox: number, oy: number): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const gy = oy + y;
      const gx = ox + x;
      if (ch === '.' || gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length) continue;
      grid[gy][gx] = ch;
    }
  });
}

/** Turns a grid of palette characters into a pixel drawing registered on the doc. `only` limits it to some keys. */
export function pixelDrawing(doc: Doc, grid: string[][] | readonly string[], palette: PixelPalette, only?: string): PixelDrawing {
  const rows = grid.map((r) => (typeof r === 'string' ? r.split('') : r));
  const h = rows.length;
  const w = rows[0].length;
  const d = newPixelDrawing(w, h);
  rows.forEach((row, y) => {
    row.forEach((ch, x) => {
      if (ch === '.' || (only && !only.includes(ch))) return;
      const col = palette[ch];
      if (!col) throw new Error(`No palette colour for '${ch}'`);
      d.pixels.set(hexToRgba(col), (y * w + x) * 4);
    });
  });
  // Only the painted part is held.
  const t = trimmedDrawing(d);
  doc.drawings[t.id] = t;
  return t;
}

/** True if a grid has any visible pixel for the keys. */
export function hasInk(grid: string[][], only: string): boolean {
  return grid.some((r) => r.some((c) => only.includes(c)));
}

export function swatchesFrom(doc: Doc, colours: [string, Color][]): void {
  doc.swatches = colours.map(([name, color]) => ({ id: uid('s'), name, color }));
}
