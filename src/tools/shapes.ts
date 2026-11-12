/**
 * Rectangle [R], Ellipse [O] and Line [L]: crisp vector shapes. Drag to draw. Shift keeps a rectangle square, an
 * ellipse round and a line at 45 degree steps. Alt draws from the centre. The options choose outline, fill or both.
 */
import { shapeColors } from './wells';
import type { PathPoint, PathShape, SubPath } from '../core/format';
import { uid } from '../core/doc';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { drawShape } from '../core/render';
import { store } from '../core/store';
import type { Pt, Rect } from '../canvas/geometry';
import { addShapes } from './merge-mode';
import { clearSnap, snapLineEnd, snapPt, vanishingPoints } from '../canvas/guides';
import { choosePlane, planeMap, projectedEllipse, projectSubPath } from '../canvas/perspectivePlane';
import { viewSizeFactor } from './view-size';
import { ShapeOptions } from './options/ShapeOptions';
import { noteColorUsed } from './recent';
import { withWellGradients } from './gradient-wells';
import { getToolSettings, type ToolSettings } from './settings';
import { canEdit, reportEdit } from './util';
import { activePixelLayer, makePixelShape } from '../pixel/tools';
import { byLayerKind, PixelShapeOptions } from '../pixel/ToolOptions';

/** The control point distance that makes a quarter of a circle out of a cubic bezier. */
const KAPPA = 0.5522847498307936;

/** The two opposite corners a drag makes. Shift makes the box square, Alt grows it from the starting point. */
export function dragCorners(a: Pt, b: Pt, shift: boolean, alt: boolean): [Pt, Pt] {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  return [alt ? { x: a.x - dx, y: a.y - dy } : { x: a.x, y: a.y }, { x: a.x + dx, y: a.y + dy }];
}

/** The box a drag makes. Shift makes it square, Alt grows it from the starting point. */
export function dragRect(a: Pt, b: Pt, shift: boolean, alt: boolean): Rect {
  const [p, q] = dragCorners(a, b, shift, alt);
  return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
}

/** The two ends of a line drag. Shift snaps to 45 degree steps, Alt makes the start the middle. */
export function dragLine(a: Pt, b: Pt, shift: boolean, alt: boolean): [Pt, Pt] {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (shift) {
    const len = Math.hypot(dx, dy);
    const step = Math.PI / 4;
    const ang = Math.round(Math.atan2(dy, dx) / step) * step;
    dx = Math.cos(ang) * len;
    dy = Math.sin(ang) * len;
  }
  return alt ? [{ x: a.x - dx, y: a.y - dy }, { x: a.x + dx, y: a.y + dy }] : [{ x: a.x, y: a.y }, { x: a.x + dx, y: a.y + dy }];
}

/** A rectangle outline; `radius` rounds the corners (with bezier arcs). */
export function rectSubPath(r: Rect, radius = 0): SubPath {
  const { x, y, w, h } = r;
  const rad = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (rad < 0.01) {
    return { closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
  }
  const k = KAPPA * rad;
  const pts: PathPoint[] = [
    { x: x + rad, y, c1: { x, y: y + rad - k }, c2: { x: x + rad - k, y } },
    { x: x + w - rad, y },
    { x: x + w, y: y + rad, c1: { x: x + w - rad + k, y }, c2: { x: x + w, y: y + rad - k } },
    { x: x + w, y: y + h - rad },
    { x: x + w - rad, y: y + h, c1: { x: x + w, y: y + h - rad + k }, c2: { x: x + w - rad + k, y: y + h } },
    { x: x + rad, y: y + h },
    { x, y: y + h - rad, c1: { x: x + rad - k, y: y + h }, c2: { x, y: y + h - rad + k } },
    { x, y: y + rad },
  ];
  return { closed: true, points: pts };
}

/** An ellipse as four bezier curves. */
export function ellipseSubPath(r: Rect): SubPath {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = r.w / 2;
  const ry = r.h / 2;
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return {
    closed: true,
    points: [
      // The first point carries the curve that closes the loop (from the top back round to the right).
      { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
      { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
      { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
      { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
    ],
  };
}

export function lineSubPath(a: Pt, b: Pt): SubPath {
  return { closed: false, points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] };
}

/**
 * Builds the shape for a drag, from the fill and stroke colours (as Illustrator does: either can be none) and the
 * tool options. A line is all stroke, so it always uses the stroke colour, even when the stroke box is set to none.
 */
export function makeShape(
  kind: 'rect' | 'ellipse' | 'line',
  a: Pt,
  b: Pt,
  mod: { shift: boolean; alt: boolean },
  colors: { fill: string | null; stroke: string | null; line: string },
  s: ToolSettings,
  persp?: { vps: Pt[] },
): PathShape | null {
  const color = colors.line;
  if (kind === 'line') {
    const [p, q] = dragLine(a, b, mod.shift, mod.alt);
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1) return null;
    return {
      id: uid('sh'),
      type: 'path',
      paths: [lineSubPath(p, q)],
      fill: null,
      stroke: { color, width: s.shapeStroke, join: 'round', cap: 'round' },
      opacity: 1,
    };
  }
  const r = dragRect(a, b, mod.shift, mod.alt);
  if (r.w < 1 || r.h < 1) return null;
  if (!colors.fill && !colors.stroke) return null;
  // With perspective guides showing, a rectangle or ellipse follows the plane it's drawn on.
  let path = kind === 'rect' ? rectSubPath(r, s.cornerRadius) : ellipseSubPath(r);
  const plane = persp && choosePlane(s.perspectivePlane, persp.vps, r);
  if (plane) {
    const [p, q] = dragCorners(a, b, mod.shift, mod.alt);
    const m = planeMap(p, q, plane);
    const warped = m && (kind === 'rect' ? projectSubPath(path, m.map) : projectedEllipse(r, m.map));
    if (warped) path = warped;
  }
  return {
    id: uid('sh'),
    type: 'path',
    paths: [path],
    fill: colors.fill,
    stroke: colors.stroke ? { color: colors.stroke, width: s.shapeStroke, join: s.cornerRadius > 0 || kind === 'ellipse' ? 'round' : 'miter', cap: 'round' } : null,
    opacity: 1,
  };
}

interface Drag {
  start: Pt;
  cur: ToolPointer;
}

function shapeTool(kind: 'rect' | 'ellipse' | 'line', label: string, icon: string, key: string, order: number, help: string, what: string): Tool {
  let drag: Drag | null = null;
  // Where a pixel shape drag started, for pulling a line's end onto the perspective directions.
  let pixStart: Pt | null = null;
  // On a pixel layer the shape is painted as clean pixels instead (src/pixel/tools.ts).
  const pix = makePixelShape(kind, label);
  const build = (): PathShape | null => {
    if (!drag) return null;
    const ui = store().get().ui;
    // Sizes are in what-you-see terms, so through a zoomed camera they're smaller on the stage.
    const f = viewSizeFactor();
    const t = getToolSettings();
    const s = makeShape(kind, drag.start, drag.cur, { shift: drag.cur.shift, alt: drag.cur.alt }, { ...shapeColors(ui), line: ui.color }, f === 1 ? t : { ...t, shapeStroke: t.shapeStroke * f, cornerRadius: t.cornerRadius * f }, { vps: vanishingPoints(drag.cur.mod) });
    return s && withWellGradients(s);
  };
  // Where the drag ends: a line's end can follow the perspective guides (and Shift picks from their directions too).
  const endAt = (start: Pt, e: ToolPointer, ctx: ToolContext): ToolPointer => {
    if (kind !== 'line') return { ...e, ...snapPt(e, ctx.zoom, e.mod) };
    const s = snapLineEnd(start, e, ctx.zoom, e.mod, e.shift, !!activePixelLayer());
    return { ...e, ...s.pt, shift: s.constrained ? false : e.shift };
  };
  // A pixel line follows the perspective directions too. Cells already are the snapping, so nothing else is pulled.
  const pixEnd = (e: ToolPointer, ctx: ToolContext): ToolPointer => (kind === 'line' && pixStart && vanishingPoints(e.mod).length ? endAt(pixStart, e, ctx) : e);
  return {
    id: kind,
    label,
    icon,
    key,
    layers: ['vector', 'pixel'],
    order,
    help,
    cursor: 'crosshair',
    options: byLayerKind(ShapeOptions, PixelShapeOptions),
    down(e: ToolPointer, ctx: ToolContext) {
      const px = activePixelLayer();
      if (px) {
        if (!canEdit(ctx, 'pixel', what)) return;
        pixStart = { x: e.x, y: e.y };
        pix.down(e, ctx, px);
        return;
      }
      if (!canEdit(ctx, 'vector', what)) return;
      const ui = store().get().ui;
      if (kind !== 'line' && !ui.fillColor && !ui.strokeOn) {
        ctx.hint('Fill and stroke are both set to none, so the shape would be invisible. Pick a colour for one of them.');
        return;
      }
      drag = { start: snapPt(e, ctx.zoom, e.mod), cur: e };
      clearSnap();
    },
    move(e, ctx) {
      if (pix.active()) return pix.move(pixEnd(e, ctx));
      if (drag) drag.cur = endAt(drag.start, e, ctx);
    },
    up(e, ctx) {
      if (pix.active()) {
        const end = pixEnd(e, ctx);
        pixStart = null;
        clearSnap();
        return pix.up(end, ctx);
      }
      if (!drag) return;
      drag.cur = endAt(drag.start, e, ctx);
      clearSnap();
      const shape = build();
      drag = null;
      if (shape) {
        const r = addShapes(`Draw ${label.toLowerCase()}`, [shape]).result;
        if (r === 'ok') {
          if (shape.fill) noteColorUsed(shape.fill);
          if (shape.stroke) noteColorUsed(shape.stroke.color);
        } else if (r !== 'nothing') reportEdit(ctx, r);
      }
      ctx.requestOverlay();
    },
    cancel(ctx) {
      drag = null;
      pixStart = null;
      clearSnap();
      pix.cancel();
      ctx.requestOverlay();
    },
    overlay(g, ctx) {
      if (pix.active() || activePixelLayer()) return pix.overlay(g, ctx);
      const s = build();
      if (s) drawShape(g, s);
    },
  };
}

export const rectTool = shapeTool('rect', 'Rectangle', 'rect', 'r', 40, 'tool-rect', 'Rectangles');
export const ellipseTool = shapeTool('ellipse', 'Ellipse', 'ellipse', 'o', 50, 'tool-ellipse', 'Ellipses');
export const lineTool = shapeTool('line', 'Line', 'line', 'l', 60, 'tool-line', 'Lines');

registerTool(rectTool);
registerTool(ellipseTool);
registerTool(lineTool);
