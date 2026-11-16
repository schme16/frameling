// What the Repeat tool shows on the stage: where each copy lands, and the handles to grab. Drawn in document
// coordinates (the canvas has set up the transform), with sizes in screen pixels divided by the zoom.
import { repeatHandles, repeatMatrices, mirrorLine, type HandleId } from '../geometry/repeat';
import { drawPoint, ink } from '../tools/point-handles';
import { currentRepeat, pickedBox } from './ops';
import { store } from '../core/store';
import { apply } from '../geometry/matrix';

/** How far a mirror line's turning handle sits from its point, in screen pixels. */
export const END_REACH_PX = 110;

export function handleAt(zoom: number): { from: { x: number; y: number }; handles: ReturnType<typeof repeatHandles> } | null {
  const cur = currentRepeat();
  const box = pickedBox();
  if (!cur || !box) return null;
  const from = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return { from, handles: repeatHandles(cur.repeat, from, END_REACH_PX / zoom) };
}

export function drawRepeatGuides(g: CanvasRenderingContext2D, zoom: number, hot: HandleId | null): void {
  const cur = currentRepeat();
  const box = pickedBox();
  const h = handleAt(zoom);
  if (!cur || !box || !h) return;
  const px = 1 / zoom;
  const c = ink();
  const r = cur.repeat;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgb(255 255 255 / 0.7)';
    g.stroke();
    g.lineWidth = 1.25 * px;
    g.strokeStyle = c;
    g.stroke();
  };
  g.save();
  g.setLineDash([6 * px, 4 * px]);
  if (r.kind === 'ring') {
    const rad = Math.hypot(h.from.x - r.cx, h.from.y - r.cy);
    if (rad > 0.5) {
      g.beginPath();
      g.arc(r.cx, r.cy, rad, 0, Math.PI * 2);
      g.lineWidth = 1.25 * px;
      g.strokeStyle = c;
      g.globalAlpha = 0.7;
      g.stroke();
      g.globalAlpha = 1;
    }
    line(r.cx, r.cy, h.from.x, h.from.y);
  } else if (r.kind === 'mirror') {
    const { doc } = store().get();
    const far = Math.hypot(doc.width, doc.height);
    if (r.point) {
      line(r.x, r.y, h.from.x, h.from.y);
    } else {
      const l = mirrorLine(r, far);
      line(l.a.x, l.a.y, l.b.x, l.b.y);
    }
  } else {
    const hd = h.handles[0];
    line(h.from.x, h.from.y, hd.at.x, hd.at.y);
  }
  g.restore();
  // A small dot where each copy's middle lands.
  const ms = repeatMatrices(r, h.from);
  g.fillStyle = c;
  g.globalAlpha = 0.55;
  for (let i = 1; i < ms.length && i < 120; i++) {
    const p = apply(ms[i], h.from.x, h.from.y);
    g.beginPath();
    g.arc(p.x, p.y, 2.5 * px, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  for (const hd of h.handles) drawPoint(g, hd.at, zoom, { on: hot === hd.id, big: true, hot: hot === hd.id });
}
