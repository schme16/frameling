/**
 * The editor canvas's way into the compositor. Layers still come from the painter's cached bitmaps (a vector
 * drawing is rasterised once per zoom), and finished effect pictures are kept in the painter's effect cache, so
 * playing over held drawings with a glow blurs nothing new.
 */
import type { Doc, Layer } from '../core/format';
import { poseAt, poseLive } from '../core/symbols';
import { drawDrawing } from '../core/render';
import type { FramePainter, FrameParams } from '../canvas/pipeline';
import type { Ctx } from './apply';
import { BufferPool, ctx2 } from './apply';
import { compositePlan } from './composite';
import { buildPlan } from './plan';

let tintPool: BufferPool | null = null;

/** Paints the stage's layers through the compositor. Returns false when it used stale bitmaps and wants another go. */
export function paintComposited(painter: FramePainter, g: CanvasRenderingContext2D, p: FrameParams, cacheable: boolean): boolean {
  const { doc, rect } = p;
  let settled = true;
  const sx = rect.w / doc.width;
  const sy = rect.h / doc.height;
  const paint = (lg: Ctx, layer: Layer) => {
    const lv = p.live && p.live.layerId === layer.id ? p.live : null;
    const pixelSize = layer.kind === 'vector' ? 1 : layer.pixelSize;
    if (lv?.kind === 'pixel') {
      lg.save();
      lg.imageSmoothingEnabled = false;
      lg.drawImage(lv.canvas, 0, 0, lv.width * pixelSize, lv.height * pixelSize);
      lg.restore();
      return;
    }
    const drawing = lv?.kind === 'vector' ? poseLive(doc, layer, p.frame, lv.drawing) : lv?.kind === 'tilemap' ? lv.drawing : poseAt(doc, layer, p.frame);
    if (!drawing) return;
    if (drawing.kind === 'vector' && cacheable && !lv) {
      lg.save();
      lg.setTransform(1, 0, 0, 1, 0, 0);
      const fresh = p.zooming ? painter.cache.find(drawing, pixelSize, rect.w, rect.h) : undefined;
      const stale = p.zooming && !fresh ? painter.cache.stale(drawing, pixelSize) : undefined;
      if (stale) {
        settled = false;
        lg.drawImage(stale.canvas, rect.x, rect.y, rect.w, rect.h);
      } else {
        const e = fresh ?? painter.vectorBitmap(doc, layer.id, drawing, pixelSize, rect.w, rect.h);
        lg.drawImage(e.canvas, rect.x, rect.y);
      }
      lg.restore();
      return;
    }
    drawDrawing(lg, drawing, pixelSize, { doc, frame: p.frame });
  };
  const key = (layer: Layer) => {
    if (p.live?.layerId === layer.id || layer.kind === 'tilemap') return undefined;
    return poseAt(doc, layer, p.frame);
  };

  g.save();
  g.setTransform(sx, 0, 0, sy, rect.x, rect.y);
  compositePlan(g, doc, p.frame, buildPlan(doc, (l) => l.visible), { paint, key }, p.zooming ? undefined : painter.effects);

  // A mask layer is never shown, which makes drawing on one blind. While it's the one being worked on, its drawing
  // shows faintly on top in the mask colour.
  const active = p.activeLayerId ? doc.layers.find((l) => l.id === p.activeLayerId) : undefined;
  if (active?.mask && active.visible) {
    const w = Math.max(1, (g.canvas as HTMLCanvasElement).width);
    const h = Math.max(1, (g.canvas as HTMLCanvasElement).height);
    if (!tintPool) tintPool = new BufferPool(w, h);
    tintPool.resize(w, h);
    const c = tintPool.get();
    const cg = ctx2(c);
    cg.setTransform(sx, 0, 0, sy, rect.x, rect.y);
    paint(cg, active);
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.globalCompositeOperation = 'source-in';
    cg.fillStyle = MASK_TINT;
    cg.fillRect(0, 0, w, h);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.35;
    g.drawImage(c, 0, 0);
    g.globalAlpha = 1;
    tintPool.put(c);
  }
  g.restore();
  return settled;
}

/** The colour a mask layer shows in while it's being drawn. */
export const MASK_TINT = '#9b7bff';

/** Picking a mask layer, or leaving one, changes the canvas (the faint mask overlay). */
export function maskFocusChanged(s: { doc: Doc; ui: { activeLayerId: string | null } }, p: { doc: Doc; ui: { activeLayerId: string | null } }): boolean {
  if (s.ui.activeLayerId === p.ui.activeLayerId) return false;
  const isMask = (x: typeof s) => !!x.doc.layers.find((l) => l.id === x.ui.activeLayerId)?.mask;
  return isMask(s) || isMask(p);
}
