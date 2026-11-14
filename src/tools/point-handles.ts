/**
 * How points and handles look on the canvas, shared by the Pen, Edit points and Gradient tools so they read as one
 * family. Sizes are in screen pixels (divided by the zoom), so they stay the same size at any zoom.
 *
 * Two looks for the A/B (brand/ab/pen-handles): 'square' (the default: square points, round handle ends, like most
 * vector apps) and 'round' (round points, diamond handle ends, softer).
 */
import { cssVar } from '../canvas/theme';
import type { Anchor, P } from '../geometry/pen';

export type HandleLook = 'square' | 'round';
let look: HandleLook = 'square';
export function setHandleLook(l: HandleLook): void {
  look = l;
}
if (typeof window !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingHandleLook: typeof setHandleLook }).__framelingHandleLook = setHandleLook;
}

/** Point size and how close a click has to be to grab something, in screen pixels. */
export const POINT_PX = 7;
export const GRAB_PX = 8;

export const ink = () => cssVar('--grape', '#9b7bff');

export function drawPoint(g: CanvasRenderingContext2D, p: P, zoom: number, o: { on?: boolean; big?: boolean; hot?: boolean } = {}): void {
  const s = ((o.big ? 1.4 : 1) * POINT_PX) / zoom;
  const c = ink();
  g.save();
  g.lineWidth = 1.5 / zoom;
  g.strokeStyle = c;
  g.fillStyle = o.on ? c : '#ffffff';
  g.beginPath();
  if (look === 'round') g.arc(p.x, p.y, s / 2, 0, Math.PI * 2);
  else g.rect(p.x - s / 2, p.y - s / 2, s, s);
  g.fill();
  g.stroke();
  if (o.hot) {
    // A ring round a point that a click would close the path on, or pick up.
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(p.x, p.y, s * 1.1, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

export function drawHandle(g: CanvasRenderingContext2D, from: P, to: P, zoom: number, on = false): void {
  const c = ink();
  const r = 3.5 / zoom;
  g.save();
  g.lineWidth = 1 / zoom;
  g.strokeStyle = c;
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(to.x, to.y);
  g.stroke();
  g.fillStyle = on ? c : '#ffffff';
  g.beginPath();
  if (look === 'round') {
    g.moveTo(to.x, to.y - r * 1.3);
    g.lineTo(to.x + r * 1.3, to.y);
    g.lineTo(to.x, to.y + r * 1.3);
    g.lineTo(to.x - r * 1.3, to.y);
    g.closePath();
  } else g.arc(to.x, to.y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();
}

/** A thin outline of a path, so the line being edited shows even where it has no colour. */
export function drawGuidePath(g: CanvasRenderingContext2D, path: Path2D, zoom: number): void {
  g.save();
  g.lineWidth = 1.25 / zoom;
  g.strokeStyle = ink();
  g.stroke(path);
  g.restore();
}

/** An anchor's handles and the point itself. */
export function drawAnchor(g: CanvasRenderingContext2D, a: Anchor, zoom: number, o: { on?: boolean; handles?: boolean; hot?: boolean; big?: boolean } = {}): void {
  if (o.handles !== false) {
    if (a.hin) drawHandle(g, a, a.hin, zoom);
    if (a.hout) drawHandle(g, a, a.hout, zoom);
  }
  drawPoint(g, a, zoom, o);
}
