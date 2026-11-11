/**
 * Draws a document frame onto any 2D canvas. The single source of truth for what a frame looks like: the editor's
 * canvas, onion skins, thumbnails and every export all go through here, so they always agree.
 *
 * Works with CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D. Coordinates are document pixels: set
 * the transform before calling to scale or pan.
 */
import { getStroke } from 'perfect-freehand';
import type { CameraView, Color, Doc, Drawing, FillShape, Layer, PathShape, PixelDrawing, Shape, StrokeShape, SubPath } from './format';
import { isPosed, poseAt, type PosedInstance, type PosedLayer } from './symbols';
import { drawTilemap } from './tilemap';
import { drawText } from '../text/draw';
import { drawParticles } from '../particles/draw';
import { cameraViewAt, layerCameraMatrix } from './camera';
import { compositePlan, EffectCache } from '../effects/composite';
import { buildPlan } from '../effects/plan';
import { needsCompositor } from '../effects/model';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOptions {
  /** Paint the document background (default true). */
  background?: boolean;
  /** Only these layers (default all visible ones). */
  layerFilter?: (layer: Layer) => boolean;
  /** Ignore layer visibility (export of hidden layers, for example). */
  includeHidden?: boolean;
  /** Look through the camera, when the document has one (default true). The editor's own view passes false. */
  camera?: boolean;
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

export function drawShape(g: Ctx2D, s: Shape, at?: DrawContext): void {
  if (s.type === 'instance') {
    // Only posed instances can be drawn (poseAt gives them their symbol's drawings for the frame).
    if (isPosed(s)) drawInstance(g, s, at);
    return;
  }
  if (s.type === 'text') return drawText(g, s);
  if (s.type === 'particles') return drawParticles(g, s, drawInstance);
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
    for (const s of d.shapes) drawShape(g, s, at);
  } else if (d.kind === 'tilemap') {
    if (at) drawTilemap(g, at.doc, d, pixelSize, at.frame, pixelCanvas);
  } else if (d.kind === 'pixel') {
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

// Buffers for instances and the layers inside them, one per nesting depth, since an instance's opacity and tint
// apply to it as a whole and instances nest.
const groupBuffers: OffscreenCanvas[] = [];
let groupDepth = 0;

function withGroupBuffer(g: Ctx2D, alpha: number, tint: { color: Color; amount: number } | undefined, draw: (lg: Ctx2D) => void): void {
  const target = g.canvas as { width: number; height: number };
  const w = Math.max(1, target.width);
  const h = Math.max(1, target.height);
  let c = groupBuffers[groupDepth];
  if (!c || c.width !== w || c.height !== h) {
    c = groupBuffers[groupDepth] = new OffscreenCanvas(w, h);
    fadeStats.allocated++;
  }
  const lg = c.getContext('2d')!;
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.clearRect(0, 0, w, h);
  lg.setTransform(g.getTransform());
  lg.imageSmoothingEnabled = g.imageSmoothingEnabled;
  groupDepth++;
  try {
    draw(lg);
  } finally {
    groupDepth--;
  }
  if (tint && tint.amount > 0) {
    lg.save();
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-atop';
    lg.globalAlpha = Math.min(1, tint.amount);
    lg.fillStyle = tint.color;
    lg.fillRect(0, 0, w, h);
    lg.restore();
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha;
  g.drawImage(c, 0, 0);
  g.restore();
}

function drawPosedLayer(g: Ctx2D, l: PosedLayer, at?: DrawContext): void {
  // Inside a symbol, tilemaps animate on the symbol's own frame.
  const inner = at && l.frame !== undefined ? { doc: at.doc, frame: l.frame } : at;
  const draw = (t: Ctx2D) => (l.mesh ? drawMeshed(t, l.drawing, l.pixelSize, l.mesh) : drawDrawing(t, l.drawing, l.pixelSize, inner));
  if (l.opacity >= 1) draw(g);
  else if (l.opacity > 0) withGroupBuffer(g, l.opacity, undefined, draw);
}

// ---------------------------------------------------------------- bent (mesh) drawing

// A drawing's art at rest as a picture, per drawing, scale and mesh, for bending through a mesh. The picture is cut
// to the mesh's rest points, so moving or adding a mesh point needs a new one.
interface MeshTexture {
  k: number;
  src: number[];
  x: number;
  y: number;
  canvas: OffscreenCanvas | HTMLCanvasElement;
}
const meshTextures = new WeakMap<Drawing, MeshTexture[]>();
/** How many mesh pictures were made, for tests. */
export const meshStats = { textures: 0 };

function meshTexture(d: Drawing, pixelSize: number, src: number[], scale: number): MeshTexture {
  if (d.kind === 'pixel') return { k: 1 / pixelSize, src, x: 0, y: 0, canvas: pixelCanvas(d) };
  // Scales snap to powers of two so zooming doesn't redraw the picture every step.
  const k = Math.pow(2, Math.max(-2, Math.min(3, Math.ceil(Math.log2(Math.max(0.01, scale))))));
  const list = meshTextures.get(d) ?? [];
  const hit = list.find((t) => t.k === k && t.src === src);
  if (hit) return hit;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < src.length; i += 2) {
    x0 = Math.min(x0, src[i]);
    y0 = Math.min(y0, src[i + 1]);
    x1 = Math.max(x1, src[i]);
    y1 = Math.max(y1, src[i + 1]);
  }
  const pad = 2;
  const w = Math.max(1, Math.min(4096, Math.ceil((x1 - x0) * k) + pad * 2));
  const h = Math.max(1, Math.min(4096, Math.ceil((y1 - y0) * k) + pad * 2));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const tg = canvas.getContext('2d') as Ctx2D;
  tg.setTransform(k, 0, 0, k, (pad - x0 * k), (pad - y0 * k));
  drawDrawing(tg, d, pixelSize);
  const t = { k, src, x: x0 - pad / k, y: y0 - pad / k, canvas };
  list.push(t);
  if (list.length > 3) list.shift();
  meshTextures.set(d, list);
  meshStats.textures++;
  return t;
}

/** Draws a drawing bent through a mesh: each triangle's piece of the rest picture mapped onto where it is now. */
export function drawMeshed(g: Ctx2D, d: Drawing, pixelSize: number, mesh: { src: number[]; dst: number[]; triangles: number[] }): void {
  const m = g.getTransform();
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const tex = meshTexture(d, pixelSize, mesh.src, scale);
  // Texture pixels to rest space.
  const tk = 1 / tex.k;
  const { src, dst, triangles: tri } = mesh;
  // Triangles are grown a little so neighbours overlap and no hairline seams show.
  const grow = 0.6 / scale;
  const prevSmooth = g.imageSmoothingEnabled;
  if (d.kind === 'pixel') g.imageSmoothingEnabled = false;
  for (let k = 0; k < tri.length; k += 3) {
    const a = tri[k] * 2, b = tri[k + 1] * 2, c = tri[k + 2] * 2;
    const s = [src[a], src[a + 1], src[b], src[b + 1], src[c], src[c + 1]];
    const t = [dst[a], dst[a + 1], dst[b], dst[b + 1], dst[c], dst[c + 1]];
    const am = affineOf(s, t);
    if (!am) continue;
    const cx = (t[0] + t[2] + t[4]) / 3;
    const cy = (t[1] + t[3] + t[5]) / 3;
    g.save();
    g.beginPath();
    for (let i = 0; i < 6; i += 2) {
      const dx = t[i] - cx;
      const dy = t[i + 1] - cy;
      const len = Math.hypot(dx, dy) || 1;
      const px = t[i] + (dx / len) * grow;
      const py = t[i + 1] + (dy / len) * grow;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
    g.clip();
    g.transform(am[0], am[1], am[2], am[3], am[4], am[5]);
    g.transform(tk, 0, 0, tk, tex.x, tex.y);
    // Only the piece of the picture under this triangle (plus a pixel), not the whole thing.
    const sx0 = Math.max(0, Math.floor((Math.min(s[0], s[2], s[4]) - tex.x) * tex.k) - 2);
    const sy0 = Math.max(0, Math.floor((Math.min(s[1], s[3], s[5]) - tex.y) * tex.k) - 2);
    const sx1 = Math.min(tex.canvas.width, Math.ceil((Math.max(s[0], s[2], s[4]) - tex.x) * tex.k) + 2);
    const sy1 = Math.min(tex.canvas.height, Math.ceil((Math.max(s[1], s[3], s[5]) - tex.y) * tex.k) + 2);
    if (sx1 > sx0 && sy1 > sy0) g.drawImage(tex.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
    g.restore();
  }
  g.imageSmoothingEnabled = prevSmooth;
}

function affineOf(s: number[], t: number[]): number[] | null {
  const [x0, y0, x1, y1, x2, y2] = s;
  const det = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (v0: number, v1: number, v2: number) => [
    (v0 * (y1 - y2) - v1 * (y0 - y2) + v2 * (y0 - y1)) / det,
    (x0 * (v1 - v2) - x1 * (v0 - v2) + x2 * (v0 - v1)) / det,
    (x0 * (y1 * v2 - y2 * v1) - x1 * (y0 * v2 - y2 * v0) + x2 * (y0 * v1 - y1 * v0)) / det,
  ];
  const [a, c, e] = solve(t[0], t[2], t[4]);
  const [b, d, f] = solve(t[1], t[3], t[5]);
  return [a, b, c, d, e, f];
}

/** Draws a posed symbol instance: its symbol's layers under its matrix, faded and tinted as a whole. */
export function drawInstance(g: Ctx2D, s: PosedInstance, at?: DrawContext): void {
  if (s.opacity <= 0 || !s.posed.layers.length) return;
  const m = s.posed.matrix;
  const draw = (t: Ctx2D) => {
    t.save();
    t.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    for (const l of s.posed.layers) drawPosedLayer(t, l, at);
    t.restore();
  };
  if (s.opacity >= 1 && !(s.tint && s.tint.amount > 0)) draw(g);
  else withGroupBuffer(g, s.opacity, s.tint, draw);
}

/** Draws a layer's drawing at a frame, with the layer's opacity. */
export function drawLayerAt(g: Ctx2D, doc: Doc, layer: Layer, frame: number): void {
  const d = poseAt(doc, layer, frame);
  if (!d) return;
  if (layer.kind === 'camera') return;
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
  const view = opts.camera === false ? undefined : cameraViewAt(doc, frame);
  if (needsCompositor(doc)) {
    renderComposited(g, doc, frame, opts, view);
    return;
  }
  for (const layer of doc.layers) {
    if (!opts.includeHidden && !layer.visible) continue;
    if (opts.layerFilter && !opts.layerFilter(layer)) continue;
    if (layer.kind === 'camera') continue;
    const m = layerCameraMatrix(doc, layer, view);
    if (!m) {
      drawLayerAt(g, doc, layer, frame);
      continue;
    }
    g.save();
    g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    drawLayerAt(g, doc, layer, frame);
    g.restore();
  }
}

// Effect results for exports and thumbnails, so a held drawing with a glow is blurred once, not every frame.
const renderEffectCache = new EffectCache(16_000_000);

/** A frame with blend modes, effects, clipping, masks or folders (see src/effects). */
function renderComposited(g: Ctx2D, doc: Doc, frame: number, opts: RenderOptions, view?: CameraView): void {
  const include = (l: Layer) => opts.includeHidden || l.visible;
  compositePlan(g, doc, frame, buildPlan(doc, include, opts.includeHidden, opts.layerFilter), {
    paint: (lg, l) => {
      // Each layer is painted through the camera (with its own depth); effects then work on what the camera sees.
      const m = layerCameraMatrix(doc, l, view);
      if (m) {
        lg.save();
        lg.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      }
      drawLayerAt(lg, doc, l.opacity >= 1 ? l : { ...l, opacity: 1 }, frame);
      if (m) lg.restore();
    },
    // Tilemaps can animate on their own, so only vector and pixel drawings are reused.
    // A layer the camera moves isn't reused either: the same drawing sits somewhere else each frame.
    key: (l) => (l.kind === 'tilemap' || layerCameraMatrix(doc, l, view) ? undefined : poseAt(doc, l, frame)),
  }, renderEffectCache);
}

/** Renders a frame to a new offscreen canvas at `scale` (for exports and thumbnails). */
export function renderFrameToCanvas(doc: Doc, frame: number, scale = 1, opts: RenderOptions = {}): OffscreenCanvas {
  const c = new OffscreenCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)));
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  renderFrame(g, doc, frame, opts);
  return c;
}
