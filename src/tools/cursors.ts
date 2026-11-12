// Hover outlines drawn on the overlay: the brush ring on vector layers, the pixel footprint on pixel layers.
import type { ToolContext } from '../core/registry';
import { brushOffsets, type PixelShape, type PxPt } from '../canvas/pixels';
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

/** The art pixels a brush would cover, outlined and lightly filled with the colour. */
export function drawPixelFootprint(g: CanvasRenderingContext2D, ctx: ToolContext, at: PxPt, pixelSize: number, size: number, shape: PixelShape, color: string | null): void {
  const px = 1 / ctx.zoom;
  g.save();
  if (color) {
    g.globalAlpha = 0.55;
    g.fillStyle = color;
    for (const o of brushOffsets(size, shape)) g.fillRect((at.x + o.x) * pixelSize, (at.y + o.y) * pixelSize, pixelSize, pixelSize);
    g.globalAlpha = 1;
  }
  g.lineWidth = 3 * px;
  g.strokeStyle = 'rgb(255 255 255 / 0.75)';
  const offs = brushOffsets(size, shape);
  const box = () => {
    g.beginPath();
    for (const o of offs) g.rect((at.x + o.x) * pixelSize, (at.y + o.y) * pixelSize, pixelSize, pixelSize);
  };
  box();
  g.stroke();
  g.lineWidth = px;
  g.strokeStyle = 'rgb(0 0 0 / 0.8)';
  box();
  g.stroke();
  g.restore();
}
