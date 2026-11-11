/**
 * Pencil [P]: a thin, even line that follows the hand closely. On a pixel layer it's the pixel pencil: one pixel,
 * pixel perfect corners, Shift+click for a straight line (src/pixel/tools.ts).
 */
import type { BrushSettings } from '../core/format';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { getHover } from '../canvas/controller';
import { drawRing } from './cursors';
import { PencilOptions } from './options/PencilOptions';
import { getToolSettings } from './settings';
import { canEdit } from './util';
import { VectorStroke } from './vectorStroke';
import { activePixelLayer, makePixelPencil } from '../pixel/tools';
import { byLayerKind } from '../pixel/ToolOptions';

let stroke: VectorStroke | null = null;
const pix = makePixelPencil();

export function pencilBrush(): BrushSettings {
  return { size: getToolSettings().pencilSize, thinning: 0.1, smoothing: 0.4, streamline: 0.4, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
}

export const pencilTool: Tool = {
  id: 'pencil',
  label: 'Pencil',
  icon: 'pencil',
  key: 'p',
  layers: ['vector', 'pixel'],
  order: 20,
  help: 'tool-pencil',
  cursor: 'crosshair',
  options: byLayerKind(PencilOptions, pix.options),
  down(e: ToolPointer, ctx: ToolContext) {
    const px = activePixelLayer();
    if (px) {
      if (canEdit(ctx, 'pixel', 'The pencil')) pix.down(e, ctx, px);
      return;
    }
    if (!canEdit(ctx, 'vector', 'The pencil')) return;
    stroke = new VectorStroke(pencilBrush(), store().get().ui.color);
    stroke.add(e, ctx.zoom);
  },
  move(e, ctx) {
    if (pix.active()) return pix.move(e);
    stroke?.add(e, ctx.zoom);
  },
  up(e, ctx) {
    if (pix.active()) return pix.up(e, ctx);
    const s = stroke;
    stroke = null;
    s?.commit(e, ctx.zoom, ctx);
    ctx.requestOverlay();
  },
  cancel(ctx) {
    stroke = null;
    pix.cancel();
    ctx.requestOverlay();
  },
  overlay(g, ctx) {
    if (stroke) return stroke.overlay(g);
    if (pix.active() || activePixelLayer()) return pix.overlay(g, ctx);
    const h = getHover();
    if (h) drawRing(g, ctx, h.x, h.y, getToolSettings().pencilSize / 2);
  },
};

registerTool(pencilTool);
