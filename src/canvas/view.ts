/**
 * The maths of the viewport, kept apart from the DOM so it can be tested.
 *
 * A view is a zoom (screen pixels per document pixel, 1 = 100%) and a pan (where the stage's top-left corner sits,
 * in screen pixels from the top-left of the canvas area).
 */
import type { ZoomStep } from './input';
import { turnedSize } from './turn';

/** When the view is turned: the real window size, and the angle, so a fit leaves room for the page after the turn. */
export interface TurnRoom {
  w: number;
  h: number;
  angle: number;
}

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 64;

/** The zoom levels Zoom in and Zoom out step through. */
export const ZOOM_STEPS = [0.05, 0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Screen position (inside the canvas area) to document position. */
export function screenToDoc(v: View, sx: number, sy: number): Pt {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
}

/** Document position to screen position (inside the canvas area). */
export function docToScreen(v: View, x: number, y: number): Pt {
  return { x: x * v.zoom + v.panX, y: y * v.zoom + v.panY };
}

/** Changes the zoom so the document point under the screen point (sx, sy) stays exactly where it is. */
export function zoomAbout(v: View, zoom: number, sx: number, sy: number): View {
  const z = clampZoom(zoom);
  const d = screenToDoc(v, sx, sy);
  return { zoom: z, panX: sx - d.x * z, panY: sy - d.y * z };
}

/** The next zoom step in (dir = 1) or out (dir = -1) from the current zoom. */
export function nextZoomStep(zoom: number, dir: 1 | -1): number {
  const eps = 1e-3;
  if (dir > 0) {
    for (const s of ZOOM_STEPS) if (s > zoom * (1 + eps)) return s;
    return MAX_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < zoom * (1 - eps)) return ZOOM_STEPS[i];
  return MIN_ZOOM;
}

/**
 * The view that shows the whole stage, centred, with some breathing room. For pixel art pass the art pixel size
 * (document pixels per art pixel): the zoom is rounded down so each art pixel is a whole number of screen pixels,
 * which keeps every pixel the same size. `true` means an art pixel of 1.
 */
export function fitView(vw: number, vh: number, dw: number, dh: number, padding = 48, whole: boolean | number = false, room?: TurnRoom): View {
  const r = room ?? { w: vw, h: vh, angle: 0 };
  // A small window gives up less of itself as margin (a tenth, up to the usual 48), so the page is not shrunk to a speck.
  const pad = Math.min(padding, Math.max(8, Math.round(Math.min(r.w, r.h) * 0.1)));
  const availW = Math.max(16, r.w - pad * 2);
  const availH = Math.max(16, r.h - pad * 2);
  const t = turnedSize(Math.max(1, dw), Math.max(1, dh), r.angle);
  let zoom = clampZoom(Math.min(availW / t.w, availH / t.h));
  const px = whole === true ? 1 : whole || 0;
  if (px > 0 && zoom * px >= 1) zoom = Math.floor(zoom * px + 1e-6) / px;
  return centerView({ zoom, panX: 0, panY: 0 }, vw, vh, dw, dh);
}

/**
 * The view that shows a box of the document whole, centred, with margins. `above` is room in screen pixels kept over
 * the box (for the names written above artboards). The zoom is not rounded: this is for several boards at once.
 */
export function fitRectView(r: Rect, vw: number, vh: number, padding = 48, above = 0): View {
  const availW = Math.max(16, vw - padding * 2);
  const availH = Math.max(16, vh - padding * 2 - above);
  const zoom = clampZoom(Math.min(availW / Math.max(1, r.w), availH / Math.max(1, r.h)));
  return { zoom, panX: vw / 2 - (r.x + r.w / 2) * zoom, panY: (vh + above) / 2 - (r.y + r.h / 2) * zoom };
}

/** The same zoom, with the stage centred in the canvas area. */
export function centerView(v: View, vw: number, vh: number, dw: number, dh: number): View {
  return { zoom: v.zoom, panX: (vw - dw * v.zoom) / 2, panY: (vh - dh * v.zoom) / 2 };
}

/** The view that fills the canvas area with a box of the document (for the Zoom tool's drag-a-box). */
export function zoomToRect(r: Rect, vw: number, vh: number, padding = 16): View {
  const zoom = clampZoom(Math.min(Math.max(16, vw - padding * 2) / Math.max(1, r.w), Math.max(16, vh - padding * 2) / Math.max(1, r.h)));
  return { zoom, panX: vw / 2 - (r.x + r.w / 2) * zoom, panY: vh / 2 - (r.y + r.h / 2) * zoom };
}

/** Keeps a little of the stage in sight, so it can't be panned off into the void. */
export function clampPan(v: View, vw: number, vh: number, dw: number, dh: number, keep = 96): View {
  const w = dw * v.zoom;
  const h = dh * v.zoom;
  const kx = Math.min(keep, w, vw / 2);
  const ky = Math.min(keep, h, vh / 2);
  return {
    zoom: v.zoom,
    panX: Math.min(vw - kx, Math.max(kx - w, v.panX)),
    panY: Math.min(vh - ky, Math.max(ky - h, v.panY)),
  };
}

/** How much smaller or bigger a careful or a sweeping wheel step is than the usual one. */
export const ZOOM_STEP_SCALE: Record<ZoomStep, number> = { fine: 0.4, normal: 1, coarse: 2.2 };

/**
 * Wheel zoom: how much one wheel event changes the zoom. Trackpad pinches send small deltas, mouse wheels big ones,
 * and a pinch keeps its own size however the keys are held (it is already as fine as a finger can be).
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, step: ZoomStep = 'normal'): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const pinch = deltaMode === 0 && Math.abs(deltaY) < 40;
  return Math.exp(-px * (pinch ? 0.01 : 0.0022 * ZOOM_STEP_SCALE[step]));
}

/** Where the stage lands on the device-pixel canvas: whole pixels, so edges are crisp. */
export function stageDeviceRect(v: View, dw: number, dh: number, dpr: number): Rect {
  return {
    x: Math.round(v.panX * dpr),
    y: Math.round(v.panY * dpr),
    w: Math.max(1, Math.round(dw * v.zoom * dpr)),
    h: Math.max(1, Math.round(dh * v.zoom * dpr)),
  };
}
