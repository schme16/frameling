/**
 * The camera, as pure functions on the format (no DOM, no store).
 *
 * A camera layer's keys are camera views. The first visible camera layer on the stage frames every export and the
 * playback view: `cameraMatrix` turns stage space into what the camera sees (the output frame is the stage size).
 * Layers with a `depth` move less (further away) or more (closer) for parallax.
 */
import type { CameraDrawing, CameraLayer, CameraView, Cel, Doc, Id, Layer } from './format';
import { celAt, uid } from './doc';
import { tweenEase } from './ease';
import { invert, mul, pointOnPath, type Mat, IDENTITY_MAT } from './symbols';
import { cutProblem, cutTween } from './tweenCut';
import { current, isDraft } from 'immer';

const RAD = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The plain view: the whole stage, as if there were no camera. */
export function plainView(doc: Pick<Doc, 'width' | 'height'>): CameraView {
  return { x: doc.width / 2, y: doc.height / 2, zoom: 1, rotation: 0 };
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 40;
export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number.isFinite(z) && z > 0 ? z : 1));

export function newCameraDrawing(view: CameraView): CameraDrawing {
  return { id: uid('k'), kind: 'camera', view: { ...view } };
}

export function newCameraLayer(doc: Doc, name = 'Camera'): { layer: CameraLayer; drawing: CameraDrawing } {
  const drawing = newCameraDrawing(plainView(doc));
  const layer: CameraLayer = { id: uid('l'), name, kind: 'camera', visible: true, locked: false, opacity: 1, onion: false, cels: [{ id: uid('c'), start: 0, length: Math.max(1, doc.length), drawingId: drawing.id }] };
  return { layer, drawing };
}

/** The camera layer in charge: the topmost visible one on the stage (never one inside a symbol). */
export function activeCamera(doc: Doc): CameraLayer | undefined {
  // While a symbol is open, doc.layers are the symbol's; the stage's are in the first editing frame.
  const layers = doc.editing?.length ? doc.editing[0].layers : doc.layers;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.kind === 'camera' && l.visible) return l;
  }
  return undefined;
}

/** Any camera layer on the stage, visible or not. */
export function cameraLayerOf(doc: Doc): CameraLayer | undefined {
  const layers = doc.editing?.length ? doc.editing[0].layers : doc.layers;
  return layers.find((l): l is CameraLayer => l.kind === 'camera');
}

/** `t` (already eased) of the way from view `a` to view `b`. Zoom moves evenly in ratio, so zooming feels steady. */
export function mixViews(a: CameraView, b: CameraView, t: number, spin = 0): CameraView {
  const za = clampZoom(a.zoom);
  const zb = clampZoom(b.zoom);
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    zoom: za * Math.pow(zb / za, t),
    rotation: lerp(a.rotation, b.rotation, t) + spin * 360 * t,
    ...(a.fit ? { fit: a.fit } : {}),
  };
}

/** What a camera layer looks at on `frame` (its keys and in-betweens), or undefined on a frame with no key. */
export function cameraViewOn(doc: Doc, layer: Layer, frame: number): CameraView | undefined {
  const cel = celAt(layer, frame);
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  if (!cel || d?.kind !== 'camera') return undefined;
  const tw = cel.tween;
  if (!tw) return d.view;
  const i = layer.cels.indexOf(cel);
  const next = layer.cels[i + 1];
  const nd = next && next.start === cel.start + cel.length ? doc.drawings[next.drawingId] : undefined;
  if (nd?.kind !== 'camera') return d.view;
  const t = tweenEase(tw, (frame - cel.start) / cel.length);
  const v = mixViews(d.view, nd.view, t, tw.spin ?? 0);
  if (tw.path && tw.path.points.length > 1) {
    // Same as a symbol's motion path: follow the line, bent so it still starts and ends on the two keys.
    const p0 = pointOnPath(tw.path, 0);
    const p1 = pointOnPath(tw.path, 1);
    const pt = pointOnPath(tw.path, t);
    v.x = pt.x + lerp(d.view.x - p0.x, nd.view.x - p1.x, t);
    v.y = pt.y + lerp(d.view.y - p0.y, nd.view.y - p1.y, t);
  }
  return v;
}

/** What the camera sees on `frame`, or undefined when there's no camera (or it's hidden, or has no key there). */
export function cameraViewAt(doc: Doc, frame: number): CameraView | undefined {
  const cam = activeCamera(doc);
  return cam ? cameraViewOn(doc, cam, frame) : undefined;
}

/** How much a layer at `depth` follows the camera: 1 on the stage, 0.5 twice as far, 2 half as far. */
export function parallaxFactor(depth: number | undefined): number {
  const d = Math.max(-0.9, Number.isFinite(depth) ? (depth as number) : 0);
  return 1 / (1 + d);
}

/**
 * Stage space to camera space (the output frame, stage sized) for a layer `factor` along (see parallaxFactor).
 * Pan and zoom scale with the factor; turning is the same at every depth.
 */
export function cameraMatrix(doc: Pick<Doc, 'width' | 'height'>, view: CameraView, factor = 1): Mat {
  const cx = doc.width / 2;
  const cy = doc.height / 2;
  const z = depthScale(view, factor);
  const a = depthAnchor(doc, view, factor);
  const r = -view.rotation * RAD;
  const c = Math.cos(r) * z;
  const s = Math.sin(r) * z;
  // translate(cx, cy) * scale(z) * rotate(r) * translate(-px, -py)
  return [c, s, -s, c, cx - (c * a.x - s * a.y), cy - (s * a.x + c * a.y)];
}

/**
 * How much a layer `factor` along zooms (the whole view's zoom, as a scale). A view made by fitting a shot into a
 * picture (view.fit) zooms the shot's own zoom by the factor and applies the fit after, so a far layer is the same
 * size as the plain fit makes it.
 */
export function depthScale(view: CameraView, factor = 1): number {
  const zoom = clampZoom(view.zoom);
  const k = view.fit?.k;
  return k && k > 0 ? k * Math.pow(zoom / k, factor) : Math.pow(zoom, factor);
}

/** The stage point a layer `factor` along keeps in the middle of the picture (pan scales with the factor). */
export function depthAnchor(doc: Pick<Doc, 'width' | 'height'>, view: CameraView, factor = 1): { x: number; y: number } {
  // A fitted view pans within the shot's own frame, whose middle is what the fit puts in the middle of the picture.
  const cx = (view.fit ? view.fit.w : doc.width) / 2;
  const cy = (view.fit ? view.fit.h : doc.height) / 2;
  return { x: cx + (view.x - cx) * factor, y: cy + (view.y - cy) * factor };
}

/** Camera space back to stage space. */
export function cameraInverse(doc: Pick<Doc, 'width' | 'height'>, view: CameraView, factor = 1): Mat {
  return invert(cameraMatrix(doc, view, factor));
}

/** The camera matrix for a layer on `frame`, or undefined when no camera applies. */
export function layerCameraMatrix(doc: Doc, layer: Layer, view: CameraView | undefined): Mat | undefined {
  if (!view) return undefined;
  const m = cameraMatrix(doc, view, parallaxFactor(layer.depth));
  return isIdentity(m) ? undefined : m;
}

/** How much a matrix scales lengths (the square root of its area factor). */
export function matrixScale(m: readonly number[]): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/**
 * What to multiply a size by so it comes out that size in what you see: a camera zoomed in 2x shows stage lengths twice
 * as big, so a size of 10 is 5 on the stage. 1 when there's no camera (or it's a degenerate one).
 */
export function sizeThroughCamera(m: readonly number[] | undefined): number {
  const k = m ? matrixScale(m) : 1;
  return k > 1e-6 ? 1 / k : 1;
}

export function isIdentity(m: readonly number[]): boolean {
  return Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-9 && Math.abs(m[5]) < 1e-9;
}

/** The four corners of the camera's frame in stage space, clockwise from top left. */
export function cameraFrameCorners(doc: Pick<Doc, 'width' | 'height'>, view: CameraView): { x: number; y: number }[] {
  const inv = cameraInverse(doc, view);
  const pts: [number, number][] = [
    [0, 0],
    [doc.width, 0],
    [doc.width, doc.height],
    [0, doc.height],
  ];
  return pts.map(([x, y]) => ({ x: inv[0] * x + inv[2] * y + inv[4], y: inv[1] * x + inv[3] * y + inv[5] }));
}

/**
 * Sets the camera view on `frame` (on a draft). On a key's first frame it changes that key; anywhere else it makes a
 * new key there, keeping the in-betweens going (the earlier key's tween now ends at the new one, and the new key
 * tweens on to the next with the same easing). Returns the key's drawing id.
 */
export function setCameraKey(doc: Doc, layer: CameraLayer, frame: number, view: CameraView): Id {
  const v = { ...view, zoom: clampZoom(view.zoom) };
  const cel = celAt(layer, frame);
  if (cel && cel.start === frame) {
    const d = doc.drawings[cel.drawingId];
    // A drawing two cels share gets its own copy, so only this key changes.
    const shared = layer.cels.some((c) => c !== cel && c.drawingId === cel.drawingId);
    if (d?.kind === 'camera' && !shared) d.view = v;
    else {
      const nd = newCameraDrawing(v);
      doc.drawings[nd.id] = nd;
      cel.drawingId = nd.id;
    }
    return cel.drawingId;
  }
  const nd = newCameraDrawing(v);
  doc.drawings[nd.id] = nd;
  if (cel) {
    const end = cel.start + cel.length;
    const next = layer.cels.find((c) => c.start === end);
    const nextView = next ? doc.drawings[next.drawingId] : undefined;
    const length = cel.length;
    cel.length = frame - cel.start;
    const c: Cel = { id: uid('c'), start: frame, length: end - frame, drawingId: nd.id };
    const at = cel.length / length;
    // On a draft, work from a plain copy of the tween.
    const tw = cel.tween && isDraft(cel.tween) ? current(cel.tween) : cel.tween;
    if (tw && nextView?.kind === 'camera' && !cutProblem(tw, at, length)) {
      // Cut the glide at this frame: each half plays its part of the easing and takes its share of the spin and its
      // piece of the motion path, so the motion before and after stays as it was. The new key then takes the view.
      const halves = cutTween(tw, at);
      // Whole turns of spin already done are taken off the key (they look the same), as the halves share them.
      nd.view.rotation -= halves.turns * 360;
      cel.tween = halves.first;
      c.tween = halves.second;
    } else if (tw) {
      // A glide that can't be cut here (easing runs back over the path): neither half can keep the path.
      c.tween = structuredClone(stripPath(tw));
      if (cel.tween?.path) delete cel.tween.path;
    }
    layer.cels.push(c);
  } else {
    const after = layer.cels.find((c) => c.start > frame);
    layer.cels.push({ id: uid('c'), start: frame, length: after ? after.start - frame : Math.max(1, doc.length - frame), drawingId: nd.id });
  }
  layer.cels.sort((a, b) => a.start - b.start);
  return nd.id;
}

function stripPath<T extends { path?: unknown }>(t: T): T {
  const { path: _p, ...rest } = t;
  return rest as T;
}

/** Applies the camera for a layer to a 2D context (multiplies it in). Returns false when there's nothing to do. */
export function applyCamera(g: { transform(a: number, b: number, c: number, d: number, e: number, f: number): void }, m: Mat | undefined): boolean {
  if (!m) return false;
  g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  return true;
}

export { IDENTITY_MAT, mul };
