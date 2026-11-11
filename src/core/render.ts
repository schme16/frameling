/**
 * Draws a document frame onto any 2D canvas. The single source of truth for what a frame looks like: the editor's
 * canvas, onion skins, thumbnails and every export all go through here, so they always agree.
 *
 * Works with CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D. Coordinates are document pixels: set
 * the transform before calling to scale or pan.
 */
import { getStroke } from 'perfect-freehand';
import type { Doc, Drawing, FillShape, Layer, PathShape, PixelDrawing, Shape, StrokeShape, SubPath } from './format';
import { drawingAt } from './doc';
import { drawTilemap } from './tilemap';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOptions {
  /** Paint the document background (default true). */
  background?: boolean;
  /** Only these layers (default all visible ones). */
  layerFilter?: (layer: Layer) => boolean;
  /** Ignore layer visibility (export of hidden layers, for example). */
  includeHidden?: boolean;
}

// Outlines and Path2Ds are cached per shape object. Shapes are immutable (edits make new objects), so the object
// itself is the cache key and the WeakMap frees entries once a shape is gone.
const strokeCache = new WeakMap<StrokeShape, Path2D>();
const pathCache = new WeakMap<FillShape | PathShape, Path2D>();
const strokeOutlineCache = new WeakMap<StrokeShape, number[][]>();

/** The filled outline polygon of a brush stroke, in document pixels. */
export function strokeOutline(s: StrokeShape): number[][] {
  let o = strokeOutlineCache.get(s);
  if (!o) {
    const b = s.brush;
    const simulate = s.points.every((p) => p.p === 0.5);
    o = getStroke(
      s.points.map((p) => [p.x, p.y, p.p]),
      {
        size: b.size,
        thinning: b.thinning,
        smoothing: b.smoothing,
        streamline: b.streamline,
        simulatePressure: simulate,
        start: { taper: b.taperStart, cap: b.capStart },
        end: { taper: b.taperEnd, cap: b.capEnd },
        last: true,
      },
    );
    strokeOutlineCache.set(s, o);
  }
  return o;
}

/** Smooth closed Path2D through outline points (quadratic midpoints, as perfect-freehand recommends). */
export function outlinePath(points: number[][]): Path2D {
  const p = new Path2D();
  const n = points.length;
  if (n < 2) return p;
  if (n < 4) {
    p.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < n; i++) p.lineTo(points[i][0], points[i][1]);
    p.closePath();
    return p;
  }
  p.moveTo(points[0][0], points[0][1]);
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  p.closePath();
  return p;
}

export function strokePath(s: StrokeShape): Path2D {
  let p = strokeCache.get(s);
  if (!p) {
    p = outlinePath(strokeOutline(s));
    strokeCache.set(s, p);
  }
  return p;
}

export function subPathsToPath2D(paths: SubPath[]): Path2D {
  const p = new Path2D();
  for (const sp of paths) {
    const pts = sp.points;
    if (!pts.length) continue;
    p.moveTo(pts[0].x, pts[0].y);
    const seg = (i: number) => {
      const q = pts[i];
      if (q.c1 && q.c2) p.bezierCurveTo(q.c1.x, q.c1.y, q.c2.x, q.c2.y, q.x, q.y);
      else p.lineTo(q.x, q.y);
    };
    for (let i = 1; i < pts.length; i++) seg(i);
    if (sp.closed) {
      if (pts[0].c1 && pts[0].c2) seg(0);
      p.closePath();
    }
  }
  return p;
}

export function shapePath(s: FillShape | PathShape): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = subPathsToPath2D(s.paths);
    pathCache.set(s, p);
  }
  return p;
}

export function drawShape(g: Ctx2D, s: Shape): void {
  g.globalAlpha = s.opacity;
  if (s.type === 'stroke') {
    g.fillStyle = s.color;
    g.fill(strokePath(s));
  } else if (s.type === 'fill') {
    g.fillStyle = s.color;
    g.fill(shapePath(s), 'evenodd');
  } else {
    const p = shapePath(s);
    if (s.fill) {
      g.fillStyle = s.fill;
      g.fill(p, 'evenodd');
    }
    if (s.stroke) {
      g.strokeStyle = s.stroke.color;
      g.lineWidth = s.stroke.width;
      g.lineJoin = s.stroke.join;
      g.lineCap = s.stroke.cap;
      g.stroke(p);
    }
  }
  g.globalAlpha = 1;
}

// Pixel drawings become canvases once per pixel array (arrays are replaced on edit, never mutated).
const pixelCanvasCache = new WeakMap<Uint8ClampedArray, OffscreenCanvas | HTMLCanvasElement>();

export function pixelCanvas(d: PixelDrawing): OffscreenCanvas | HTMLCanvasElement {
  let c = pixelCanvasCache.get(d.pixels);
  if (!c) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(d.width, d.height) : Object.assign(document.createElement('canvas'), { width: d.width, height: d.height });
    const g = c.getContext('2d') as Ctx2D;
    g.putImageData(new ImageData(new Uint8ClampedArray(d.pixels), d.width, d.height), 0, 0);
    pixelCanvasCache.set(d.pixels, c);
  }
  return c;
}

/** Where a drawing is shown, which tilemaps need for their tiles (and animated tiles for the frame). */
export interface DrawContext {
  doc: Doc;
  frame: number;
}

/** Draws one drawing (no layer opacity). Pixel drawings need the layer's pixel size, tilemaps the document too. */
export function drawDrawing(g: Ctx2D, d: Drawing, pixelSize = 1, at?: DrawContext): void {
  if (d.kind === 'vector') {
    for (const s of d.shapes) drawShape(g, s);
  } else if (d.kind === 'tilemap') {
    if (at) drawTilemap(g, at.doc, d, pixelSize, at.frame, pixelCanvas);
  } else {
    const prev = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(pixelCanvas(d), 0, 0, d.width * pixelSize, d.height * pixelSize);
    g.imageSmoothingEnabled = prev;
  }
}

// One buffer for faded layers, reused for every call (an export draws thousands of frames, and a playing canvas
// draws a faded layer per frame). Layers are drawn one after another, never nested, so a single buffer is enough.
let fadeBuffer: OffscreenCanvas | null = null;
/** How many buffers were allocated, for tests. */
export const fadeStats = { allocated: 0 };

function fadeScratch(w: number, h: number): { c: OffscreenCanvas; g: OffscreenCanvasRenderingContext2D } {
  if (!fadeBuffer || fadeBuffer.width !== w || fadeBuffer.height !== h) {
    fadeBuffer = new OffscreenCanvas(w, h);
    fadeStats.allocated++;
  }
  const g = fadeBuffer.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  return { c: fadeBuffer, g };
}

/** Draws a layer's drawing at a frame, with the layer's opacity. */
export function drawLayerAt(g: Ctx2D, doc: Doc, layer: Layer, frame: number): void {
  const d = drawingAt(doc, layer, frame);
  if (!d) return;
  const ps = layer.kind === 'vector' ? 1 : layer.pixelSize;
  if (layer.opacity >= 1) {
    drawDrawing(g, d, ps, { doc, frame });
    return;
  }
  // Layer opacity applies to the layer as a whole, so overlapping strokes don't show through each other. The layer
  // is drawn into a buffer the size of the target canvas with the same transform, then composited 1:1, so a zoomed
  // or scaled render stays sharp.
  const target = g.canvas as { width: number; height: number };
  const { c, g: lg } = fadeScratch(Math.max(1, target.width), Math.max(1, target.height));
  lg.setTransform(g.getTransform());
  lg.imageSmoothingEnabled = g.imageSmoothingEnabled;
  drawDrawing(lg, d, ps, { doc, frame });
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = layer.opacity;
  g.drawImage(c, 0, 0);
  g.restore();
}

/** Draws a whole frame. */
export function renderFrame(g: Ctx2D, doc: Doc, frame: number, opts: RenderOptions = {}): void {
  if (opts.background !== false && doc.background) {
    g.fillStyle = doc.background;
    g.fillRect(0, 0, doc.width, doc.height);
  }
  for (const layer of doc.layers) {
    if (!opts.includeHidden && !layer.visible) continue;
    if (opts.layerFilter && !opts.layerFilter(layer)) continue;
    drawLayerAt(g, doc, layer, frame);
  }
}

/** Renders a frame to a new offscreen canvas at `scale` (for exports and thumbnails). */
export function renderFrameToCanvas(doc: Doc, frame: number, scale = 1, opts: RenderOptions = {}): OffscreenCanvas {
  const c = new OffscreenCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)));
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  renderFrame(g, doc, frame, opts);
  return c;
}
