/**
 * Pen [Shift+P]: exact lines and curves, point by point (bezier paths). Click for a sharp corner, drag for a smooth
 * curve. Click the first point to close the shape; Enter, Escape or a double-click finishes an open line. Backspace
 * takes back the last point. Shift keeps a new point at 45 degree steps, Alt while dragging bends just the next side.
 *
 * The pure model (`PenPath`) is separate from the canvas tool so it can be tested on its own.
 */
import type { PathShape } from '../core/format';
import { uid } from '../core/doc';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { subPathsToPath2D } from '../core/render';
import { store } from '../core/store';
import { clearSnap, snapLineEnd, snapPt } from '../canvas/guides';
import { activePixelLayer, commitPixelPath, currentOutline } from '../pixel/tools';
import { dragHandles, fromAnchors, type Anchor, type P } from '../geometry/pen';
import { addDrawn, drawWithMirror } from './mirror';
import { noteColorUsed } from './recent';
import { getToolSettings } from './settings';
import { viewSizeFactor } from './view-size';
import { canEdit, reportEdit } from './util';
import { shapeColors } from './wells';
import { withWellGradients } from './gradient-wells';
import { drawAnchor, drawGuidePath, drawPoint, GRAB_PX, ink } from './point-handles';
import { PenOptions } from './options/PenOptions';

/** Below this drag (screen pixels) a press is a click: a corner. */
const DRAG_PX = 3;
const DOUBLE_MS = 400;
/** Enter this soon after a shape was closed still belongs to the pen (it means "done"), not to Play. */
export const CLOSE_ENTER_MS = 2500;

/** Whether an Enter now is the tail of closing a shape (closed at `closedAt`, or never). */
export function enterEndsClosing(closedAt: number, now: number): boolean {
  return now - closedAt >= 0 && now - closedAt < CLOSE_ENTER_MS;
}

/** A point at 45 degree steps from `from`. */
export function constrain45(from: P, to: P): P {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy) * Math.cos(Math.atan2(dy, dx) - a);
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}

/** A path being drawn with the pen. */
export class PenPath {
  anchors: Anchor[] = [];
  closing = false;

  get length(): number {
    return this.anchors.length;
  }

  /** Adds a corner point. */
  add(p: P): void {
    this.anchors.push({ x: p.x, y: p.y });
  }

  /** Pulls handles out of the last point (or, while closing, the first), the out side following the pointer. */
  pull(pointer: P, onlyOut: boolean): void {
    const i = this.closing ? 0 : this.anchors.length - 1;
    const a = this.anchors[i];
    if (!a) return;
    const h = dragHandles(a, pointer);
    // Alt bends just the side the pointer is on, leaving a corner.
    a.hout = h.hout;
    if (!onlyOut) a.hin = h.hin;
  }

  /** Takes the last point away. False when there's nothing left. */
  back(): boolean {
    this.anchors.pop();
    return this.anchors.length > 0;
  }

  /** The finished outline. A single point is nothing. */
  subPath(closed: boolean): PathShape['paths'][number] | null {
    if (this.anchors.length < 2) return null;
    return fromAnchors(this.anchors, closed && this.anchors.length >= 3);
  }
}

/** The shape a finished pen path makes: a closed one gets the fill and stroke, an open one is a line. */
export function penShape(sp: PathShape['paths'][number], colors: { fill: string | null; stroke: string | null; line: string }, width: number): PathShape | null {
  if (sp.closed) {
    if (!colors.fill && !colors.stroke) return null;
    return { id: uid('sh'), type: 'path', paths: [sp], fill: colors.fill, stroke: colors.stroke ? { color: colors.stroke, width, join: 'round', cap: 'round' } : null, opacity: 1 };
  }
  // An open line always shows: with the stroke set to none it still uses the stroke colour, like the Line tool.
  return { id: uid('sh'), type: 'path', paths: [sp], fill: null, stroke: { color: colors.stroke ?? colors.line, width, join: 'round', cap: 'round' }, opacity: 1 };
}

let path: PenPath | null = null;
let press: { at: P; dragged: boolean; time: number } | null = null;
let lastUp = { time: -Infinity, x: 0, y: 0 };
let hover: P | null = null;
let closedAt = -Infinity;
// The pen took an Enter (finishing a shape) and that key may still be held: its repeats are the pen's too.
let enterHeld = false;

function colors() {
  const ui = store().get().ui;
  return { ...shapeColors(ui), line: ui.color };
}

/** The line width to draw with: the vector thickness, or on a pixel layer the outline thickness in whole art pixels. */
function lineWidth(): number {
  const layer = activePixelLayer();
  if (!layer) return getToolSettings().shapeStroke * viewSizeFactor();
  return (currentOutline()?.size ?? 1) * layer.pixelSize;
}

function preview(closed: boolean): PathShape | null {
  const sp = path?.subPath(closed);
  if (!sp) return null;
  const s = penShape(sp, colors(), lineWidth());
  return s && withWellGradients(s);
}

/** Puts the path into the drawing (one undo step) and starts afresh. */
function finish(ctx: ToolContext, closed: boolean): void {
  const p = path;
  path = null;
  press = null;
  ctx.requestOverlay();
  if (!p) return;
  const sp = p.subPath(closed);
  if (!sp) return;
  if (closed) closedAt = performance.now();
  const shape = penShape(sp, colors(), lineWidth());
  if (!shape) {
    ctx.hint('Fill and stroke are both set to none, so the shape would be invisible. Pick a colour for one of them.');
    return;
  }
  // On a pixel layer the finished path is painted as clean pixels.
  if (activePixelLayer()) return commitPixelPath(shape, closed ? 'Draw with the pen' : 'Draw a pen line', ctx);
  const s = withWellGradients(shape);
  const r = addDrawn(closed ? 'Draw with the pen' : 'Draw a pen line', [s]).result;
  if (r === 'ok') {
    if (s.fill) noteColorUsed(s.fill);
    if (s.stroke) noteColorUsed(s.stroke.color);
  } else if (r !== 'nothing') reportEdit(ctx, r);
}

const nearFirst = (p: P, zoom: number) => !!path && path.length >= 3 && Math.hypot(p.x - path.anchors[0].x, p.y - path.anchors[0].y) * zoom <= GRAB_PX;
const nearLast = (p: P, zoom: number) => !!path && path.length >= 2 && Math.hypot(p.x - path.anchors[path.length - 1].x, p.y - path.anchors[path.length - 1].y) * zoom <= GRAB_PX;

function placed(e: ToolPointer, ctx: ToolContext): P {
  const last = path?.anchors[path.length - 1];
  // What a point snaps to is the snapping choices (on a pixel layer, Pixel cells keeps it on the cell clicked).
  if (!last) return snapPt(e, ctx.zoom, e.mod);
  // From the last point: perspective directions when the guides show, Shift for 45 degree steps (or those directions).
  const s = snapLineEnd(last, e, ctx.zoom, e.mod, e.shift);
  if (e.shift && !s.constrained) return constrain45(last, e);
  return s.pt;
}

export const penTool: Tool = {
  id: 'pen',
  group: 'select',
  groupAt: 6,
  label: 'Pen',
  icon: 'pen',
  key: 'Shift+P',
  layers: ['vector', 'pixel'],
  order: 65,
  help: 'tool-pen',
  cursor: 'crosshair',
  options: PenOptions,
  down(e, ctx) {
    closedAt = -Infinity;
    if (!path && !canEdit(ctx, activePixelLayer() ? 'pixel' : 'vector', 'The pen')) return;
    const double = e.time - lastUp.time < DOUBLE_MS && Math.hypot(e.x - lastUp.x, e.y - lastUp.y) * ctx.zoom <= GRAB_PX;
    if (path && nearFirst(e, ctx.zoom)) {
      path.closing = true;
      press = { at: { x: e.x, y: e.y }, dragged: false, time: e.time };
      return;
    }
    // A click on the last point, or a double-click, finishes an open line.
    if (path && (nearLast(e, ctx.zoom) || double)) {
      finish(ctx, false);
      return;
    }
    const p = placed(e, ctx);
    clearSnap();
    path ??= new PenPath();
    path.add(p);
    press = { at: p, dragged: false, time: e.time };
  },
  move(e, ctx) {
    hover = { x: e.x, y: e.y };
    if (!press || !path) return;
    if (!press.dragged && Math.hypot(e.x - press.at.x, e.y - press.at.y) * ctx.zoom < DRAG_PX) return;
    press.dragged = true;
    path.pull(e, e.alt);
  },
  up(e, ctx) {
    lastUp = { time: e.time, x: e.x, y: e.y };
    if (!press || !path) return;
    const closing = path.closing;
    press = null;
    if (closing) finish(ctx, true);
    ctx.requestOverlay();
  },
  hover(e, ctx) {
    // The preview segment goes where a click would put the point (perspective and Shift included).
    hover = path?.length && !nearFirst(e, ctx.zoom) ? placed(e, ctx) : { x: e.x, y: e.y };
  },
  cancel(ctx) {
    // Escape mid-drag: keep the points so far, drop the drag.
    press = null;
    if (path) path.closing = false;
    ctx.requestOverlay();
  },
  onKey(e, ctx) {
    // Enter right after closing a shape is the habit of finishing: take it, so it doesn't start Play and hide the shape.
    // Held-down repeats of that Enter are taken too, so key repeat never starts Play either.
    if (!path) {
      if (e.key !== 'Enter') return false;
      if (e.repeat && enterHeld) return true;
      enterHeld = false;
      if (!enterEndsClosing(closedAt, performance.now())) return false;
      closedAt = -Infinity;
      enterHeld = true;
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Escape') {
      finish(ctx, false);
      if (e.key === 'Enter') enterHeld = true;
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!path.back()) path = null;
      ctx.requestOverlay();
      return true;
    }
    return false;
  },
  leave(ctx) {
    closedAt = -Infinity;
    enterHeld = false;
    finish(ctx, false);
  },
  overlay(g, ctx) {
    if (!path) return;
    const z = ctx.zoom;
    const s = preview(false);
    if (s) drawWithMirror(g, s);
    const sp = path.subPath(false);
    if (sp) drawGuidePath(g, subPathsToPath2D([sp]), z);
    const last = path.anchors[path.length - 1];
    // The next piece, from the last point to the pointer (curved if the last point has a handle out).
    if (hover && !press) {
      const to = nearFirst(hover, z) ? path.anchors[0] : hover;
      g.save();
      g.lineWidth = 1 / z;
      g.setLineDash([4 / z, 3 / z]);
      g.strokeStyle = ink();
      g.beginPath();
      g.moveTo(last.x, last.y);
      if (last.hout) g.bezierCurveTo(last.hout.x, last.hout.y, to.x, to.y, to.x, to.y);
      else g.lineTo(to.x, to.y);
      g.stroke();
      g.restore();
    }
    path.anchors.forEach((a, i) => {
      const isLast = i === path!.length - 1;
      drawAnchor(g, a, z, { on: isLast, handles: isLast || (path!.closing && i === 0), hot: i === 0 && !!hover && nearFirst(hover, z), big: i === 0 });
    });
    if (hover && !press && !path.length) drawPoint(g, hover, z);
  },
};

/** For tests and the help shots. */
export function penState(): { path: PenPath | null } {
  return { path };
}

registerTool(penTool);
