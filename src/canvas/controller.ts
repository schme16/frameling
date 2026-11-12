/**
 * The meeting point between the canvas and its tools: the viewport (zoom, pan, size), live previews, the hover
 * position, hints, and the commands that move the view. Tools and commands import this instead of reaching into the
 * canvas component, so they work (and test) without any DOM.
 */
import { ownedUndo } from '../core/owners';
import type { Drawing, Id } from '../core/format';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { tileModeOn } from '../tiles/state';
import { centerView, clampPan, fitView, nextZoomStep, screenToDoc, stageDeviceRect, zoomAbout, zoomToRect, type Pt, type Rect, type View } from './view';
import { clampZoom } from './view';

// ---------------------------------------------------------------- the viewport

export interface Viewport {
  /** Size of the canvas area in CSS pixels. */
  w: number;
  h: number;
  dpr: number;
}

let viewport: Viewport = { w: 900, h: 600, dpr: 1 };
let autoFit = true;

export function setViewport(v: Viewport): void {
  viewport = v;
}
export function getViewport(): Viewport {
  return viewport;
}

/** True while the view is just "fit to window" (so a window resize should refit it). */
export function isAutoFit(): boolean {
  return autoFit;
}

export function getView(): View {
  const { zoom, panX, panY } = store().get().ui;
  return { zoom, panX, panY };
}

/** Sets the view. `user` marks it as the person's own doing, which stops the view following window resizes. */
export function setView(v: View, user = true): void {
  const { doc, ui } = store().get();
  const c = clampPan(v, viewport.w, viewport.h, doc.width, doc.height);
  if (user) autoFit = false;
  if (c.zoom === ui.zoom && c.panX === ui.panX && c.panY === ui.panY) return;
  store().setUi({ zoom: c.zoom, panX: c.panX, panY: c.panY });
}

export function panBy(dx: number, dy: number): void {
  const v = getView();
  setView({ zoom: v.zoom, panX: v.panX + dx, panY: v.panY + dy });
}

/** Zooms to an exact level, keeping the screen point (default: the middle of the canvas) still. */
export function zoomTo(zoom: number, sx = viewport.w / 2, sy = viewport.h / 2): void {
  setView(zoomAbout(getView(), clampZoom(zoom), sx, sy));
}

export function zoomBy(factor: number, sx?: number, sy?: number): void {
  zoomTo(getView().zoom * factor, sx, sy);
}

/** Next zoom step in (1) or out (-1). */
export function zoomStep(dir: 1 | -1, sx?: number, sy?: number): void {
  zoomTo(nextZoomStep(getView().zoom, dir), sx, sy);
}

/** Zooms about a document point (for the Zoom tool's click). */
export function zoomAtDoc(zoom: number, docX: number, docY: number): void {
  const v = getView();
  zoomTo(zoom, docX * v.zoom + v.panX, docY * v.zoom + v.panY);
}

export function zoomToDocRect(r: Rect): void {
  setView(zoomToRect(r, viewport.w, viewport.h));
}

/** The smallest art pixel size of any pixel layer, or 0 when there are none. */
function artPixel(): number {
  let px = 0;
  for (const l of store().get().doc.layers) if (l.kind === 'pixel') px = px ? Math.min(px, l.pixelSize) : l.pixelSize;
  return px;
}

/** Fit the whole stage in the window. */
export function fit(): void {
  const { doc } = store().get();
  // In tile mode the stage has a copy on every side, so fit all nine.
  const k = tileModeOn() ? 3 : 1;
  const v = fitView(viewport.w, viewport.h, doc.width * k, doc.height * k, 48, artPixel());
  setView(k === 1 ? v : { zoom: v.zoom, panX: v.panX + doc.width * v.zoom, panY: v.panY + doc.height * v.zoom }, false);
  autoFit = true;
}

export function center(): void {
  const { doc } = store().get();
  setView(centerView(getView(), viewport.w, viewport.h, doc.width, doc.height));
}

export function zoom100(): void {
  const { doc } = store().get();
  setView(centerView({ zoom: 1, panX: 0, panY: 0 }, viewport.w, viewport.h, doc.width, doc.height));
}

/** Container-relative screen position to document position, with the live view. */
export function toDoc(sx: number, sy: number): Pt {
  return screenToDoc(getView(), sx, sy);
}

/** Where the stage sits on the device-pixel canvas right now. */
export function stageRect(): Rect {
  const { doc } = store().get();
  return stageDeviceRect(getView(), doc.width, doc.height, viewport.dpr);
}

// ---------------------------------------------------------------- live previews

/**
 * While a tool is mid-gesture it can swap what one layer shows, without touching the document: the move of a
 * selection, the strokes the eraser has touched so far, the pixels being painted. The change is committed (as one
 * undo step) when the gesture ends.
 */
export type Live =
  | { layerId: Id; kind: 'vector'; drawing: Drawing }
  | { layerId: Id; kind: 'pixel'; canvas: CanvasImageSource; width: number; height: number }
  | { layerId: Id; kind: 'tilemap'; drawing: Drawing };

let live: Live | null = null;

export function setLive(l: Live | null): void {
  live = l;
  invalidate(true, false);
}
export function getLive(): Live | null {
  return live;
}

// ---------------------------------------------------------------- redraw requests

interface Sink {
  main(): void;
  overlay(): void;
  hint?(msg: string): void;
  cursor?(c: string | null): void;
}
let sink: Sink | null = null;

export function setSink(s: Sink | null): void {
  sink = s;
}

export function invalidate(main: boolean, overlay: boolean): void {
  if (main) sink?.main();
  if (overlay) sink?.overlay();
}

export function requestOverlay(): void {
  sink?.overlay();
}

/** A short friendly message near the canvas. Falls back to a toast when no canvas is showing. */
export function hint(message: string): void {
  if (sink?.hint) sink.hint(message);
  else toast(message);
}

/** A tool can ask for a cursor (resize arrows over a handle). null goes back to the tool's own. */
export function setCursor(c: string | null): void {
  sink?.cursor?.(c);
}

// ---------------------------------------------------------------- overlays that aren't a tool's

/** Drawn on the overlay after the tool's own, in document coordinates, whatever tool is picked (marching ants). */
export type StageOverlay = (g: CanvasRenderingContext2D, zoom: number) => void;
const stageOverlays: StageOverlay[] = [];

export function addStageOverlay(fn: StageOverlay): void {
  if (stageOverlays.includes(fn)) return;
  stageOverlays.push(fn);
  ownedUndo(() => {
    const i = stageOverlays.indexOf(fn);
    if (i >= 0) stageOverlays.splice(i, 1);
  });
}
export function getStageOverlays(): readonly StageOverlay[] {
  return stageOverlays;
}

// ---------------------------------------------------------------- handles on the canvas that aren't a tool's

/**
 * Something on the canvas you can grab whatever tool is picked (a vanishing point). `hit` is asked on hover and on
 * press, in stage pixels; the first one that says yes gets the drag instead of the tool.
 */
export interface CanvasGrab {
  hit(p: Pt, zoom: number): boolean;
  cursor?: string;
  down(p: Pt): void;
  move(p: Pt, shift: boolean): void;
  up(p: Pt): void;
  cancel?(): void;
}
const grabs: CanvasGrab[] = [];

export function addCanvasGrab(g: CanvasGrab): void {
  if (grabs.includes(g)) return;
  grabs.push(g);
  ownedUndo(() => {
    const i = grabs.indexOf(g);
    if (i >= 0) grabs.splice(i, 1);
  });
}
export function grabAt(p: Pt, zoom: number): CanvasGrab | null {
  return grabs.find((g) => g.hit(p, zoom)) ?? null;
}

// ---------------------------------------------------------------- pointer extras

let hover: Pt | null = null;
let predicted: Pt[] = [];

/** Where the pointer is over the canvas (document pixels), or null when it's elsewhere. */
export function getHover(): Pt | null {
  return hover;
}
export function setHover(p: Pt | null): void {
  hover = p;
}

/** The pen's predicted next points. Only for drawing the live preview further ahead, never committed. */
export function getPredicted(): Pt[] {
  return predicted;
}
export function setPredicted(p: Pt[]): void {
  predicted = p;
}

// ---------------------------------------------------------------- before a tool starts

/** Runs before a tool gets a press, with the document point and the tool's id (artboards open the one clicked). */
export type PointerDownHook = (p: Pt, tool: string) => void;
const downHooks: PointerDownHook[] = [];

export function addPointerDownHook(fn: PointerDownHook): void {
  if (downHooks.includes(fn)) return;
  downHooks.push(fn);
  ownedUndo(() => {
    const i = downHooks.indexOf(fn);
    if (i >= 0) downHooks.splice(i, 1);
  });
}
export function runPointerDownHooks(p: Pt, tool: string): void {
  for (const fn of downHooks) fn(p, tool);
}
