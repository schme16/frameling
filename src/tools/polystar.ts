/**
 * Polygon [U] and Star [Shift+U]: shapes with straight sides. Drag to draw, as with the rectangle. Shift keeps it even
 * (a regular polygon, a star with equal arms), Alt draws from the middle. The options set the number of sides or
 * points, and how deep a star's dips go.
 */
import type { PathShape, SubPath } from '../core/format';
import { uid } from '../core/doc';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import type { Pt, Rect } from '../canvas/geometry';
import { clearSnap, snapPt } from '../canvas/guides';
import { addDrawn, drawWithMirror } from './mirror';
import { noteColorUsed } from './recent';
import { getToolSettings } from './settings';
import { viewSizeFactor } from './view-size';
import { dragRect } from './shapes';
import { canEdit, reportEdit } from './util';
import { shapeColors } from './wells';
import { withWellGradients } from './gradient-wells';
import { PolyStarOptions } from './options/PolyStarOptions';
import { activePixelLayer, makePixelPathShape } from '../pixel/tools';

/** Corners of a polygon (or a star, with `inner` from 0 to 1) round a circle of radius 1, the first one pointing up. */
export function polyPoints(count: number, inner: number | null): Pt[] {
  const n = Math.max(3, Math.round(count));
  const out: Pt[] = [];
  const steps = inner === null ? n : n * 2;
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / steps;
    const r = inner !== null && i % 2 === 1 ? inner : 1;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return out;
}

/**
 * The corners fitted into a box. `even` keeps the shape's own proportions (centred, as big as fits); otherwise it
 * stretches to fill the box exactly.
 */
export function fitPoints(pts: Pt[], r: Rect, even: boolean): Pt[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  let sx = r.w / (x1 - x0);
  let sy = r.h / (y1 - y0);
  if (even) sx = sy = Math.min(sx, sy);
  const ox = r.x + (r.w - (x1 - x0) * sx) / 2 - x0 * sx;
  const oy = r.y + (r.h - (y1 - y0) * sy) / 2 - y0 * sy;
  return pts.map((p) => ({ x: ox + p.x * sx, y: oy + p.y * sy }));
}

export function polyStarSubPath(kind: 'polygon' | 'star', r: Rect, even: boolean, s: { polygonSides: number; starPoints: number; starInner: number }): SubPath {
  const unit = kind === 'polygon' ? polyPoints(s.polygonSides, null) : polyPoints(s.starPoints, Math.max(0.05, Math.min(0.95, s.starInner / 100)));
  return { closed: true, points: fitPoints(unit, r, even) };
}

export function makePolyStar(kind: 'polygon' | 'star', a: Pt, b: Pt, mod: { shift: boolean; alt: boolean }, colors: { fill: string | null; stroke: string | null }, s = getToolSettings()): PathShape | null {
  const r = dragRect(a, b, mod.shift, mod.alt);
  if (r.w < 1 || r.h < 1 || (!colors.fill && !colors.stroke)) return null;
  return {
    id: uid('sh'),
    type: 'path',
    paths: [polyStarSubPath(kind, r, mod.shift, s)],
    fill: colors.fill,
    stroke: colors.stroke ? { color: colors.stroke, width: s.shapeStroke * viewSizeFactor(), join: 'round', cap: 'round' } : null,
    opacity: 1,
  };
}

function polyStarTool(kind: 'polygon' | 'star', label: string, key: string, order: number): Tool {
  let drag: { start: Pt; cur: ToolPointer } | null = null;
  const build = () => {
    if (!drag) return null;
    const s = makePolyStar(kind, drag.start, drag.cur, drag.cur, shapeColors());
    return s && withWellGradients(s);
  };
  // On a pixel layer it's painted as clean pixels (src/pixel/tools.ts).
  const pix = makePixelPathShape(label, (a, e) => makePolyStar(kind, a, e, e, shapeColors()));
  return {
    id: kind,
    group: 'shapes',
    groupAt: kind === 'polygon' ? 3 : 4,
    label,
    icon: kind === 'star' ? 'pointy' : 'polygon',
    key,
    layers: ['vector', 'pixel'],
    order,
    help: 'tool-polygon-star',
    cursor: 'crosshair',
    options: PolyStarOptions,
    down(e, ctx: ToolContext) {
      const px = activePixelLayer();
      if (px) {
        if (canEdit(ctx, 'pixel', label + 's')) pix.down(e, ctx, px);
        return;
      }
      if (!canEdit(ctx, 'vector', label + 's')) return;
      const ui = store().get().ui;
      if (!ui.fillColor && !ui.strokeOn) {
        ctx.hint('Fill and stroke are both set to none, so the shape would be invisible. Pick a colour for one of them.');
        return;
      }
      drag = { start: snapPt(e, ctx.zoom, e.mod), cur: e };
      clearSnap();
    },
    move(e, ctx) {
      if (pix.active()) return pix.move(e);
      if (drag) drag.cur = { ...e, ...snapPt(e, ctx.zoom, e.mod) };
    },
    up(e, ctx) {
      if (pix.active()) return pix.up(e, ctx);
      if (!drag) return;
      drag.cur = { ...e, ...snapPt(e, ctx.zoom, e.mod) };
      clearSnap();
      const shape = build();
      drag = null;
      if (shape) {
        const r = addDrawn(`Draw ${label.toLowerCase()}`, [shape]).result;
        if (r === 'ok') {
          if (shape.fill) noteColorUsed(shape.fill);
          if (shape.stroke) noteColorUsed(shape.stroke.color);
        } else if (r !== 'nothing') reportEdit(ctx, r);
      }
      ctx.requestOverlay();
    },
    cancel(ctx) {
      drag = null;
      clearSnap();
      pix.cancel();
      ctx.requestOverlay();
    },
    overlay(g, ctx) {
      if (pix.active() || activePixelLayer()) return pix.overlay(g, ctx);
      const s = build();
      if (s) drawWithMirror(g, s);
    },
  };
}

export const polygonTool = polyStarTool('polygon', 'Polygon', 'u', 62);
export const starTool = polyStarTool('star', 'Star', 'Shift+U', 63);
registerTool(polygonTool);
registerTool(starTool);
