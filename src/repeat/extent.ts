// The dashed box that shows how far a picked repeat reaches, drawn under the Select tool's own box. Apart from draw.ts so
// the Select tool can use it without pulling in the Repeat commands.
import type { Shape } from '../core/format';
import { shapesExtent, type Rect } from '../canvas/geometry';
import { ink } from '../tools/point-handles';

/** Where a repeat reaches, as a dashed box round the picked shapes and all their copies, so you can see how much space it takes. */
export function drawRepeatExtent(g: CanvasRenderingContext2D, shapes: Shape[], zoom: number): void {
  if (!shapes.some((s) => 'repeat' in s && s.repeat)) return;
  const b: Rect | null = shapesExtent(shapes);
  if (!b) return;
  const px = 1 / zoom;
  g.save();
  g.setLineDash([5 * px, 4 * px]);
  g.lineWidth = 1 * px;
  g.strokeStyle = ink();
  g.globalAlpha = 0.6;
  g.strokeRect(b.x, b.y, b.w, b.h);
  g.restore();
}
