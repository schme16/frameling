/**
 * Hand [H] and Zoom [Z]. The hand is handled by the canvas itself (dragging pans), so its tool has no gesture of its
 * own. The zoom tool: click to zoom in, Alt+click to zoom out, drag a box to zoom to it.
 */
import { registerTool, type Tool } from '../core/registry';
import { nextZoomStep } from '../canvas/view';
import { getView, zoomAtDoc, zoomToDocRect } from '../canvas/controller';
import type { Pt } from '../canvas/geometry';
import { rectFromPoints } from '../canvas/geometry';
import { HandOptions, ZoomOptions } from './options/ViewOptions';

export const handTool: Tool = {
  id: 'hand',
  label: 'Hand',
  icon: 'hand',
  key: 'h',
  layers: ['vector', 'pixel'],
  order: 80,
  help: 'tool-hand',
  cursor: 'grab',
  options: HandOptions,
};

/** How far (screen pixels) a drag must go before it's a box rather than a click. */
const DRAG_PX = 5;

let start: Pt | null = null;
let cur: Pt | null = null;
let startAlt = false;

export const zoomTool: Tool = {
  id: 'zoom',
  label: 'Zoom',
  icon: 'zoom',
  key: 'z',
  layers: ['vector', 'pixel'],
  order: 90,
  help: 'tool-zoom',
  cursor: 'zoom-in',
  options: ZoomOptions,
  down(e) {
    start = { x: e.x, y: e.y };
    cur = start;
    startAlt = e.alt;
  },
  move(e) {
    cur = { x: e.x, y: e.y };
  },
  up(e, ctx) {
    if (!start) return;
    const a = start;
    const b = { x: e.x, y: e.y };
    start = cur = null;
    const zoom = getView().zoom;
    if (Math.hypot(b.x - a.x, b.y - a.y) * zoom >= DRAG_PX && !startAlt) {
      zoomToDocRect(rectFromPoints(a, b));
    } else {
      zoomAtDoc(nextZoomStep(zoom, startAlt || e.alt ? -1 : 1), b.x, b.y);
    }
    ctx.requestOverlay();
  },
  cancel(ctx) {
    start = cur = null;
    ctx.requestOverlay();
  },
  overlay(g, ctx) {
    if (!start || !cur) return;
    const r = rectFromPoints(start, cur);
    const px = 1 / ctx.zoom;
    g.save();
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgb(255 255 255 / 0.8)';
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.lineWidth = px;
    g.setLineDash([5 * px, 4 * px]);
    g.strokeStyle = 'rgb(0 0 0 / 0.85)';
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.restore();
  },
};

registerTool(handTool);
registerTool(zoomTool);
