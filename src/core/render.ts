/**
 * Draws a document frame onto any 2D canvas. The single source of truth for what a frame looks like: the editor's
 * canvas, onion skins, thumbnails and every export all go through here, so they always agree.
 *
 * Works with CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D. Coordinates are document pixels: set
 * the transform before calling to scale or pan.
 */
import { getStroke } from 'perfect-freehand';
import type { CameraView, Color, Doc, Drawing, FillShape, Layer, PathShape, PixelDrawing, Shape, StrokeShape, SubPath } from './format';
import { isPosed, poseAt, type PosedInstance, type PosedLayer, type PosedLook } from './symbols';
import { DEFAULT_TILE_SIZE, tileOrigin } from './doc';
import { folderChain } from './folders';
import { shapeKind } from './shapeKinds';
import { drawingKindOf } from './layerKinds';
import { cameraViewAt, layerCameraMatrix } from './camera';
import { compositePlan, EffectCache } from '../effects/composite';
import { buildPlan } from '../effects/plan';
import { activeEffects, needsCompositor } from '../effects/model';
import { ctx2, makeCanvas, type Canvas2 } from '../effects/apply';
import { canvasGradient } from './gradient';

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

/** The filled outline polygon of a brush stroke, worked out fresh. */
function computeOutline(s: StrokeShape): number[][] {
  const b = s.brush;
  // Every point at the middle means nothing varied, so widths come from the speed instead. A pen's own widths stand.
  const simulate = !s.realPressure && s.points.every((p) => p.p === 0.5);
  return getStroke(
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
}

/** The filled outline polygon of a brush stroke, in document pixels. Kept for strokes that are hit-tested or exported. */
export function strokeOutline(s: StrokeShape): number[][] {
  let o = strokeOutlineCache.get(s);
  if (!o) {
    o = computeOutline(s);
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
    // Drawing only needs the Path2D, so the outline isn't kept too: as arrays of points it is several times the size
    // of the stroke, and a long animation has a lot of strokes (300 MB of them in a 600 frame, 120,000 stroke test).
    p = outlinePath(strokeOutlineCache.get(s) ?? computeOutline(s));
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
  if (s.type !== 'stroke' && s.type !== 'fill' && s.type !== 'path') return shapeKind(s.type)?.draw(g, s, drawInstance);
  g.globalAlpha = s.opacity;
  if (s.type === 'stroke') {
    g.fillStyle = s.color;
    g.fill(strokePath(s));
  } else if (s.type === 'fill') {
    g.fillStyle = s.gradient ? canvasGradient(g, s.gradient) : s.color;
    g.fill(shapePath(s), 'evenodd');
  } else {
    const p = shapePath(s);
    if (s.fill) {
      g.fillStyle = s.fillGradient ? canvasGradient(g, s.fillGradient) : s.fill;
      g.fill(p, 'evenodd');
    }
    if (s.stroke) {
      g.strokeStyle = s.strokeGradient ? canvasGradient(g, s.strokeGradient) : s.stroke.color;
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
    // A blank drawing (nothing painted) gets a one pixel see-through picture, as a canvas cannot be 0 wide.
    const w = Math.max(1, d.width);
    const h = Math.max(1, d.height);
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = c.getContext('2d') as Ctx2D;
    if (d.width > 0 && d.height > 0) g.putImageData(new ImageData(new Uint8ClampedArray(d.pixels), d.width, d.height), 0, 0);
    pixelCanvasCache.set(d.pixels, c);
  }
  return c;
}

/** The picture already made for a pixel array, if any (never makes one). */
export function peekPixelCanvas(pixels: Uint8ClampedArray): OffscreenCanvas | HTMLCanvasElement | undefined {
  return pixelCanvasCache.get(pixels);
}

/** Hands over the finished picture of a new pixel array, so drawing it does not rebuild it from the pixels. */
export function seedPixelCanvas(pixels: Uint8ClampedArray, canvas: OffscreenCanvas | HTMLCanvasElement): void {
  pixelCanvasCache.set(pixels, canvas);
}

/** Forgets the picture made for a pixel array (it is made again when asked for). */
export function dropPixelCanvas(pixels: Uint8ClampedArray): void {
  pixelCanvasCache.delete(pixels);
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
    if (at) drawingKindOf(d)?.draw(g, at.doc, d, pixelSize, at.frame, pixelCanvas);
  } else if (d.kind === 'pixel') {
    if (d.width < 1 || d.height < 1) return;
    const prev = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(pixelCanvas(d), (d.x ?? 0) * pixelSize, (d.y ?? 0) * pixelSize, d.width * pixelSize, d.height * pixelSize);
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
  if (d.kind === 'pixel') return { k: 1 / pixelSize, src, x: (d.x ?? 0) * pixelSize, y: (d.y ?? 0) * pixelSize, canvas: pixelCanvas(d) };
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
  const look = s.posed.look;
  const pic = look ? lookPicture(g, m, look, at) : undefined;
  if (look && !pic) return;
  const draw = (t: Ctx2D) => {
    t.save();
    t.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    if (pic) {
      t.transform(1 / pic.k, 0, 0, 1 / pic.k, pic.x, pic.y);
      t.drawImage(pic.canvas, 0, 0);
    } else for (const l of s.posed.layers) drawPosedLayer(t, l, at);
    t.restore();
  };
  if (s.opacity >= 1 && !(s.tint && s.tint.amount > 0)) draw(g);
  else withGroupBuffer(g, s.opacity, s.tint, draw);
}

// ---------------------------------------------------------------- symbols with blend modes and effects inside

type Box = { x0: number; y0: number; x1: number; y1: number };
const EMPTY: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
const boxCache = new WeakMap<Drawing, { ps: number; box: Box }>();

function grow(b: Box, x: number, y: number, r = 0): void {
  if (x - r < b.x0) b.x0 = x - r;
  if (y - r < b.y0) b.y0 = y - r;
  if (x + r > b.x1) b.x1 = x + r;
  if (y + r > b.y1) b.y1 = y + r;
}

/** The box a posed drawing covers, in its own space (a little generous: curve handles count). */
export function drawingBox(d: Drawing, pixelSize = 1, doc?: Doc): Box {
  const hit = boxCache.get(d);
  if (hit && hit.ps === pixelSize) return hit.box;
  const b = { ...EMPTY };
  if (d.kind === 'pixel') {
    if (d.width > 0 && d.height > 0) {
      grow(b, (d.x ?? 0) * pixelSize, (d.y ?? 0) * pixelSize);
      grow(b, ((d.x ?? 0) + d.width) * pixelSize, ((d.y ?? 0) + d.height) * pixelSize);
    }
  } else if (d.kind === 'tilemap') {
    const o = doc ? tileOrigin(doc, pixelSize) : { x: 0, y: 0 };
    grow(b, o.x, o.y);
    grow(b, o.x + d.columns * (doc?.tileset?.tileWidth ?? DEFAULT_TILE_SIZE) * pixelSize, o.y + d.rows * (doc?.tileset?.tileHeight ?? DEFAULT_TILE_SIZE) * pixelSize);
  } else if (d.kind === 'vector')
    for (const s of d.shapes) {
      if (s.type === 'stroke') for (const [x, y] of strokeOutline(s)) grow(b, x, y);
      else if (s.type === 'fill' || s.type === 'path') {
        const r = s.type === 'path' && s.stroke ? s.stroke.width : 0;
        for (const sp of s.paths)
          for (const p of sp.points) {
            grow(b, p.x, p.y, r);
            if (p.c1) grow(b, p.c1.x, p.c1.y, r);
            if (p.c2) grow(b, p.c2.x, p.c2.y, r);
          }
      } else if (s.type !== 'instance') {
        shapeKind(s.type)?.extend(s, (x, y, r) => grow(b, x, y, r));
      } else if (isPosed(s)) {
        const ib = instanceBox(s, doc);
        if (ib.x1 < ib.x0) continue;
        const m = s.posed.matrix;
        for (const [x, y] of [[ib.x0, ib.y0], [ib.x1, ib.y0], [ib.x0, ib.y1], [ib.x1, ib.y1]]) grow(b, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
      }
    }
  boxCache.set(d, { ps: pixelSize, box: b });
  return b;
}

/** What a posed instance's layers cover in symbol space, its effects' reach included. */
function instanceBox(s: PosedInstance, doc?: Doc): Box {
  const b = { ...EMPTY };
  for (const l of s.posed.layers) {
    if (l.mesh) for (let i = 0; i < l.mesh.dst.length; i += 2) grow(b, l.mesh.dst[i], l.mesh.dst[i + 1], 2);
    else {
      const d = drawingBox(l.drawing, l.pixelSize, doc);
      if (d.x1 >= d.x0) grow2(b, d);
    }
  }
  const pad = s.posed.look ? lookReach(s.posed.look) : 0;
  return b.x1 < b.x0 ? b : { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
}

function grow2(b: Box, d: Box): Box {
  b.x0 = Math.min(b.x0, d.x0);
  b.y0 = Math.min(b.y0, d.y0);
  b.x1 = Math.max(b.x1, d.x1);
  b.y1 = Math.max(b.y1, d.y1);
  return b;
}

/** How far past the drawing an effect can paint, in document pixels (three sigmas of the blur: the soften radius and the shadow softness are sigmas, the glow's is half its size). */
export function effectReach(kind: string, v: Record<string, number | string>): number {
  const n = (k: string) => Math.abs(Number(v[k]) || 0);
  if (kind === 'blur') return n('radius') * 3;
  if (kind === 'glow') return n('size') * 1.5;
  if (kind === 'shadow') return Math.max(n('x'), n('y')) + n('softness') * 3;
  if (kind === 'outline') return n('width') + 1;
  if (kind === 'pixelate') return n('size');
  return 0;
}

function reachOf(effects: Layer['effects'], frame: number): number {
  let r = 0;
  for (const e of activeEffects(effects, frame)) r += effectReach(e.kind, e.v);
  return r;
}

/** The furthest any effect inside the symbol paints past its drawing (a layer's, plus its folder's). */
function lookReach(look: PosedLook): number {
  let layer = 0;
  let folder = 0;
  for (const l of look.layers) {
    layer = Math.max(layer, reachOf(l.effects, look.frame));
    // Every folder around the layer adds its own reach.
    folder = Math.max(folder, folderChain(look.folders, l.folder).reduce((n, f) => n + reachOf(f.effects, look.frame), 0));
  }
  return layer + folder + 1;
}

// Finished pictures of symbols with looks inside, by symbol (its layers array), frame, scale and the drawings shown,
// so a copy gliding or turning across the stage reuses one picture per symbol frame.
const lookCache = new EffectCache(32_000_000);
const tokens = new WeakMap<object, number>();
let nextToken = 1;
const token = (o: object | undefined) => {
  if (!o) return 0;
  let t = tokens.get(o);
  if (!t) tokens.set(o, (t = nextToken++));
  return t;
};
/** Pictures built and reused, for tests and the perf harness. */
export const lookStats = { built: 0, reused: 0 };

/** The largest side of a symbol picture, in canvas pixels. */
const LOOK_MAX = 4096;

/**
 * A symbol with blend modes, effects, clipping, masks or folders inside, composited in its own space as a picture
 * (`k` canvas pixels per symbol unit, top-left at x, y). Effects work in symbol units, so they grow and turn with
 * each copy, as they do in the SVG and Lottie exports.
 */
function lookPicture(g: Ctx2D, m: readonly number[], look: PosedLook, at?: DrawContext): { canvas: Canvas2; k: number; x: number; y: number } | undefined {
  // (Test fakes hand back an empty transform: taken as none.)
  const raw = g.getTransform();
  const T = typeof raw.a === 'number' ? raw : { a: 1, b: 0, c: 0, d: 1 };
  const a = T.a * m[0] + T.c * m[1];
  const b = T.b * m[0] + T.d * m[1];
  const c = T.a * m[2] + T.c * m[3];
  const d = T.b * m[2] + T.d * m[3];
  const det = Math.abs(a * d - b * c);
  if (!(det > 1e-12)) return undefined;
  const box = instanceBox({ posed: { matrix: [1, 0, 0, 1, 0, 0], layers: [...look.drawings.values()], look } } as PosedInstance, at?.doc);
  if (box.x1 <= box.x0 || box.y1 <= box.y0) return undefined;
  // Scales snap up to quarter steps, so a copy growing in a tween rebuilds now and then, not every frame.
  let k = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(det)) * 4) / 4);
  k = Math.max(1 / 64, Math.min(k, 16, LOOK_MAX / (box.x1 - box.x0), LOOK_MAX / (box.y1 - box.y0)));
  const x = Math.floor(box.x0 * k) / k;
  const y = Math.floor(box.y0 * k) / k;
  const W = Math.max(1, Math.ceil((box.x1 - x) * k));
  const H = Math.max(1, Math.ceil((box.y1 - y) * k));
  let sig = `${look.frame}|${k}|${x},${y},${W}x${H}|${token(look.folders)}|${g.imageSmoothingEnabled ? 1 : 0}`;
  for (const [id, pl] of look.drawings) sig += `|${id}:${token(pl.drawing)}:${token(pl.mesh)}`;
  const hit = lookCache.get(look.layers, sig);
  if (hit) {
    lookStats.reused++;
    return { canvas: hit, k, x, y };
  }
  const canvas = makeCanvas(W, H);
  const cg = ctx2(canvas) as Ctx2D;
  cg.setTransform(k, 0, 0, k, -x * k, -y * k);
  cg.imageSmoothingEnabled = g.imageSmoothingEnabled;
  const lookDoc = { ...(at?.doc ?? {}), layers: look.layers, folders: look.folders } as Doc;
  // Faded copies inside get buffers of their own depth, so the stage-sized ones aren't swapped back and forth.
  groupDepth++;
  try {
    compositePlan(cg, lookDoc, look.frame, buildPlan(lookDoc, (l) => l.visible && !l.reference), {
      paint: (lg, l) => {
        const pl = look.drawings.get(l.id);
        if (pl) drawPosedLayer(lg, pl.opacity >= 1 ? pl : { ...pl, opacity: 1 }, at);
      },
    });
  } finally {
    groupDepth--;
  }
  lookStats.built++;
  lookCache.set(look.layers, sig, canvas);
  return { canvas, k, x, y };
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
