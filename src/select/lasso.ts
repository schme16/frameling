// The lasso both Select tools share: collecting points as you drag, closing it, and drawing it on the canvas.
import type { Pt } from '../canvas/geometry';

/** Points closer than this (screen pixels) to the last one are skipped, which keeps a long lasso light. */
const STEP_PX = 2;
/** A click this close (screen pixels) to the first point closes an open lasso. */
const CLOSE_PX = 8;

/** Adds a point to a lasso if it's far enough from the last one. */
export function lassoPoint(pts: Pt[], p: Pt, zoom: number): void {
  const last = pts[pts.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) * zoom >= STEP_PX) pts.push({ x: p.x, y: p.y });
}

/** True when a click at `p` should close the lasso (it's on the first point). */
export function lassoClosesAt(pts: Pt[], p: Pt, zoom: number): boolean {
  return pts.length >= 3 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) * zoom <= CLOSE_PX;
}

/** The lasso as a dashed line, closed back to the start, with a line to the pointer while it's left open. */
export function drawLasso(g: CanvasRenderingContext2D, pts: Pt[], rubber: Pt | null, zoom: number, ink: string): void {
  if (!pts.length) return;
  const px = 1 / zoom;
  g.save();
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  if (rubber) g.lineTo(rubber.x, rubber.y);
  g.closePath();
  g.globalAlpha = 0.12;
  g.fillStyle = ink;
  g.fill();
  g.globalAlpha = 1;
  g.lineWidth = 2.5 * px;
  g.strokeStyle = 'rgb(255 255 255 / 0.8)';
  g.stroke();
  g.setLineDash([5 * px, 4 * px]);
  g.lineWidth = 1.25 * px;
  g.strokeStyle = ink;
  g.stroke();
  if (rubber) {
    // The first point: click it to close the lasso.
    g.setLineDash([]);
    g.beginPath();
    g.arc(pts[0].x, pts[0].y, 4 * px, 0, Math.PI * 2);
    g.fillStyle = 'white';
    g.fill();
    g.stroke();
  }
  g.restore();
}
