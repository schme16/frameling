// Hover outlines drawn on the overlay: the brush ring on vector layers, the pixel footprint on pixel layers.
import type { ToolContext } from '../core/registry';
import { brushOffsets, type PixelShape, type PxPt } from '../canvas/pixels';

/** A circle that reads on any artwork: a light ring over a dark one. */
export function drawRing(g: CanvasRenderingContext2D, ctx: ToolContext, x: number, y: number, radius: number): void {
  const px = 1 / ctx.zoom;
  const r = Math.max(radius, 1.5 * px);
  g.save();
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
