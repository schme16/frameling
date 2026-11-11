/**
 * Rectangle [R], Ellipse [O] and Line [L]: crisp vector shapes. Drag to draw. Shift keeps a rectangle square, an
 * ellipse round and a line at 45 degree steps. Alt draws from the centre. The options choose outline, fill or both.
 */
import type { PathPoint, PathShape, SubPath } from '../core/format';
import { uid } from '../core/doc';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { drawShape } from '../core/render';
import { store } from '../core/store';
import type { Pt, Rect } from '../canvas/geometry';
import { editActiveDrawing } from './edit';
import { ShapeOptions } from './options/ShapeOptions';
import { noteColorUsed } from './recent';
import { getToolSettings, type ToolSettings } from './settings';
import { canEdit, reportEdit } from './util';

/** The control point distance that makes a quarter of a circle out of a cubic bezier. */
const KAPPA = 0.5522847498307936;

/** The box a drag makes. Shift makes it square, Alt grows it from the starting point. */
export function dragRect(a: Pt, b: Pt, shift: boolean, alt: boolean): Rect {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  const x0 = alt ? a.x - dx : a.x;
  const y0 = alt ? a.y - dy : a.y;
  const x1 = a.x + dx;
  const y1 = a.y + dy;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
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

/** Builds the shape for a drag, from the colour and the tool options. */
export function makeShape(kind: 'rect' | 'ellipse' | 'line', a: Pt, b: Pt, mod: { shift: boolean; alt: boolean }, color: string, s: ToolSettings): PathShape | null {
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
  const outline = s.shapeMode !== 'fill';
  const fill = s.shapeMode === 'outline' ? null : s.shapeMode === 'both' ? (s.shapeFill ?? color) : color;
  return {
    id: uid('sh'),
    type: 'path',
    paths: [kind === 'rect' ? rectSubPath(r, s.cornerRadius) : ellipseSubPath(r)],
    fill,
    stroke: outline ? { color, width: s.shapeStroke, join: s.cornerRadius > 0 || kind === 'ellipse' ? 'round' : 'miter', cap: 'round' } : null,
    opacity: 1,
  };
}

interface Drag {
  start: Pt;
  cur: ToolPointer;
}

function shapeTool(kind: 'rect' | 'ellipse' | 'line', label: string, icon: string, key: string, order: number, help: string, what: string): Tool {
  let drag: Drag | null = null;
  const build = (): PathShape | null => {
    if (!drag) return null;
    return makeShape(kind, drag.start, drag.cur, { shift: drag.cur.shift, alt: drag.cur.alt }, store().get().ui.color, getToolSettings());
  };
  return {
    id: kind,
    label,
    icon,
    key,
    layers: ['vector'],
    order,
    help,
    cursor: 'crosshair',
    options: ShapeOptions,
    down(e: ToolPointer, ctx: ToolContext) {
      if (!canEdit(ctx, 'vector', what)) return;
      drag = { start: { x: e.x, y: e.y }, cur: e };
    },
    move(e) {
      if (drag) drag.cur = e;
    },
    up(e, ctx) {
      if (!drag) return;
      drag.cur = e;
      const shape = build();
      drag = null;
      if (shape) {
        const r = editActiveDrawing(`Draw ${label.toLowerCase()}`, 'vector', (d) => {
          d.shapes.push(shape);
        });
        if (r === 'ok') noteColorUsed(store().get().ui.color);
        else reportEdit(ctx, r);
      }
      ctx.requestOverlay();
    },
    cancel(ctx) {
      drag = null;
      ctx.requestOverlay();
    },
    overlay(g) {
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
