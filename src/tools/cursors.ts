// Hover outlines drawn on the overlay: the brush ring on vector layers, the pixel footprint on pixel layers.
import type { ToolContext } from '../core/registry';
import { brushSpans, type PixelShape, type PxPt } from '../canvas/pixels';
import { getHoverPen } from '../canvas/controller';
import { LIGHTEST_SIZE, tiltSize, toolPen } from '../tablet/dynamics';
import type { PenTool } from '../tablet/settings';

/**
 * A circle that reads on any artwork: a light ring over a dark one. For a pen hovering over the page it follows the
 * pen: bigger when the tool grows as the pen leans, and with a faint inner ring for the smallest mark a light touch makes.
 */
export function drawRing(g: CanvasRenderingContext2D, ctx: ToolContext, x: number, y: number, radius: number, tool?: PenTool): void {
  const px = 1 / ctx.zoom;
  const hp = tool ? getHoverPen() : null;
  const grown = hp && tool ? radius * tiltSize(tool, hp) : radius;
  const r = Math.max(grown, 1.5 * px);
  g.save();
  if (hp && tool && toolPen(tool).size) {
    g.beginPath();
    g.arc(x, y, Math.max(r * LIGHTEST_SIZE, 0.75 * px), 0, Math.PI * 2);
    g.lineWidth = px;
    g.setLineDash([2 * px, 2 * px]);
    g.strokeStyle = 'rgb(0 0 0 / 0.55)';
    g.stroke();
    g.setLineDash([]);
  }
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.lineWidth = 3 * px;
  g.strokeStyle = 'rgb(255 255 255 / 0.75)';
  g.stroke();
  g.lineWidth = px;
  g.strokeStyle = 'rgb(0 0 0 / 0.8)';
  g.stroke();
  g.restore();
}

/** Past this many rows the footprint is drawn as one outline instead of a square per pixel, which a big brush could not afford. */
const GRID_ROWS = 24;

/** The footprint's edge as one closed path: down the left side, back up the right. */
function outline(g: CanvasRenderingContext2D, at: PxPt, ps: number, spans: readonly { y: number; x0: number; x1: number }[]): void {
  g.beginPath();
  for (const r of spans) {
    g.lineTo((at.x + r.x0) * ps, (at.y + r.y) * ps);
    g.lineTo((at.x + r.x0) * ps, (at.y + r.y + 1) * ps);
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    const r = spans[i];
    g.lineTo((at.x + r.x1 + 1) * ps, (at.y + r.y + 1) * ps);
    g.lineTo((at.x + r.x1 + 1) * ps, (at.y + r.y) * ps);
  }
  g.closePath();
}

/** The art pixels a brush would cover, outlined and lightly filled with the colour. */
export function drawPixelFootprint(g: CanvasRenderingContext2D, ctx: ToolContext, at: PxPt, pixelSize: number, size: number, shape: PixelShape, color: string | null, stamp?: readonly { x: number; y: number; rgba: readonly number[] }[]): void {
  const px = 1 / ctx.zoom;
  g.save();
  const spans = stamp ? [] : brushSpans(size, shape);
  const smooth = spans.length > GRID_ROWS;
  if (stamp) {
    // A brush made from a selection shows its own colours when it has them, and your colour when it is a plain shape.
    g.globalAlpha = 0.7;
    for (const c of stamp) {
      g.fillStyle = color ?? `rgb(${c.rgba[0]} ${c.rgba[1]} ${c.rgba[2]})`;
      g.fillRect((at.x + c.x) * pixelSize, (at.y + c.y) * pixelSize, pixelSize, pixelSize);
    }
    g.globalAlpha = 1;
  } else if (color) {
    g.globalAlpha = 0.55;
    g.fillStyle = color;
    if (smooth) {
      outline(g, at, pixelSize, spans);
      g.fill();
    } else for (const r of spans) g.fillRect((at.x + r.x0) * pixelSize, (at.y + r.y) * pixelSize, (r.x1 - r.x0 + 1) * pixelSize, pixelSize);
    g.globalAlpha = 1;
  }
  g.lineWidth = 3 * px;
  g.strokeStyle = 'rgb(255 255 255 / 0.75)';
  const box = () => {
    if (smooth) return outline(g, at, pixelSize, spans);
    g.beginPath();
    if (stamp) for (const c of stamp) g.rect((at.x + c.x) * pixelSize, (at.y + c.y) * pixelSize, pixelSize, pixelSize);
    else for (const r of spans) for (let x = r.x0; x <= r.x1; x++) g.rect((at.x + x) * pixelSize, (at.y + r.y) * pixelSize, pixelSize, pixelSize);
  };
  box();
  g.stroke();
  g.lineWidth = px;
  g.strokeStyle = 'rgb(0 0 0 / 0.8)';
  box();
  g.stroke();
  g.restore();
}
