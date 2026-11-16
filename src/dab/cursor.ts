// The pixel brush's cursor: the real shape of its tip, turned and flattened as set, so you see where the pixels will go
// before you press. A small tip is drawn pixel by pixel (the pixels the first dab would paint); a big one as an outline.
import type { ToolContext } from '../core/registry';
import { pictureOf, samplerFor, snapAxis, type DabBrush } from './maths';

/** Past this width the tip is drawn as one outline, not a square per pixel. */
export const GRID_MAX = 24;

/** The pixels (art coordinates) the first dab of a brush would paint when its middle is at (cx, cy), for a tip up to GRID_MAX across. */
export function footprint(b: DabBrush, size: number, cx: number, cy: number): { x: number; y: number }[] {
  const angle = (b.angle * Math.PI) / 180;
  const sm = samplerFor(b, size, angle, true);
  const mx = b.aliased ? snapAxis(cx, sm.acrossX) : cx;
  const my = b.aliased ? snapAxis(cy, sm.acrossY) : cy;
  const out: { x: number; y: number }[] = [];
  const r = Math.ceil(sm.reach) + 1;
  for (let y = Math.floor(my - r); y <= Math.ceil(my + r); y++)
    for (let x = Math.floor(mx - r); x <= Math.ceil(mx + r); x++) if (sm.cov(x + 0.5 - mx, y + 0.5 - my) > 0) out.push({ x, y });
  return out;
}

/** Draws the tip's outline over the canvas. `x`, `y` are document pixels, `ps` the layer's pixel size, `size` the width in art pixels. */
export function drawDabCursor(g: CanvasRenderingContext2D, ctx: ToolContext, x: number, y: number, ps: number, b: DabBrush, size: number): void {
  const px = 1 / ctx.zoom;
  const angle = (b.angle * Math.PI) / 180;
  const stroke = (path: () => void) => {
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgb(255 255 255 / 0.75)';
    path();
    g.stroke();
    g.lineWidth = px;
    g.strokeStyle = 'rgb(0 0 0 / 0.8)';
    path();
    g.stroke();
  };
  g.save();
  if (size <= GRID_MAX && b.tip !== 'picture') {
    const cells = footprint(b, size, x / ps, y / ps);
    stroke(() => {
      g.beginPath();
      for (const c of cells) g.rect(c.x * ps, c.y * ps, ps, ps);
    });
  } else {
    g.translate(x, y);
    g.rotate(angle);
    stroke(() => {
      g.beginPath();
      const r = (size * ps) / 2;
      if (b.tip === 'round') g.ellipse(0, 0, r, Math.max(1.5 * px, r * b.roundness), 0, 0, Math.PI * 2);
      else if (b.tip === 'square') g.rect(-r, -r * b.roundness, r * 2, r * 2 * b.roundness);
      else if (b.picture) {
        const pic = pictureOf(b.picture);
        const s = (size * ps) / Math.max(pic.w, pic.h);
        g.rect((-pic.w * s) / 2, (-pic.h * s * b.roundness) / 2, pic.w * s, pic.h * s * b.roundness);
      }
    });
  }
  g.restore();
}
