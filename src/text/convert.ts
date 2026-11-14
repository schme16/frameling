// Text to shapes: draws the text big, traces its outline and fits curves, so it works with any font, even ones
// that only live on this computer. The result is a normal fill that can be reshaped, merged and exported anywhere.
import type { FillShape, SubPath, TextShape } from '../core/format';
import { fitClosedLoop, DEFAULT_LOOP, type V } from '../geometry/bezier';
import { ringArea2 } from '../geometry/raster';
import { traceMask } from '../geometry/trace';
import { drawText, textBounds } from './draw';

/** Mask pixels per document pixel: enough for smooth curves, capped so huge text stays quick. */
export function traceScale(w: number, h: number): number {
  const want = 6;
  const max = 4_000_000;
  return Math.max(0.5, Math.min(want, Math.sqrt(max / Math.max(1, w * h))));
}

function toDoc(sp: SubPath, ox: number, oy: number, k: number): SubPath {
  const f = (p: V): V => ({ x: ox + p.x / k, y: oy + p.y / k });
  return {
    closed: sp.closed,
    points: sp.points.map((p) => {
      const q: SubPath['points'][number] = { ...f(p) };
      if (p.c1 && p.c2) {
        q.c1 = f(p.c1);
        q.c2 = f(p.c2);
      }
      return q;
    }),
  };
}

/** The outlines of a text shape as it looks now (animated text as it is on this frame), in stage space. */
export function textOutlines(s: TextShape): SubPath[] {
  if (typeof OffscreenCanvas === 'undefined' || !s.text.trim()) return [];
  const b = textBounds(s);
  // Room for letters that reach past the measured box (italics, swashes) and for animated pieces.
  const pad = s.size * 0.6;
  const ox = b.x - pad;
  const oy = b.y - pad;
  const bw = b.w + pad * 2;
  const bh = b.h + pad * 2;
  const k = traceScale(bw, bh);
  const w = Math.max(1, Math.ceil(bw * k));
  const h = Math.max(1, Math.ceil(bh * k));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.setTransform(k, 0, 0, k, -ox * k, -oy * k);
  drawText(g, { ...s, opacity: 1, color: '#000000' });
  const px = g.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  const alpha = new Uint8Array(w * h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((alpha[y * w + x] = px[(y * w + x) * 4 + 3]) >= 128) {
        mask[y * w + x] = 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return [];
  // The anti-aliased edge places each contour point to a fraction of a pixel, so the curves stay smooth when the
  // outlines are opened at a large size in another program.
  const loops = traceMask(mask, w, h, { x0, y0, x1, y1 }, { field: alpha, level: 128 });
  const out: SubPath[] = [];
  const fit = { ...DEFAULT_LOOP, simplify: 0.12, tolerance: 0.1, dense: true };
  for (const loop of loops) {
    if (Math.abs(ringArea2(loop)) < 4) continue;
    const pts: V[] = [];
    for (let i = 0; i < loop.length; i += 2) pts.push({ x: loop[i], y: loop[i + 1] });
    const sp = fitClosedLoop(pts, fit);
    if (sp) out.push(toDoc(sp, ox, oy, k));
  }
  return out;
}

/** A fill shape with the text's outlines, colour and opacity (null when there is nothing to trace). */
export function textToFill(s: TextShape, id: string): FillShape | null {
  const paths = textOutlines(s);
  if (!paths.length) return null;
  return { id, ...(s.group ? { group: s.group } : {}), type: 'fill', paths, color: s.color, opacity: s.opacity };
}
