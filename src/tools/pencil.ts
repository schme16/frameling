/** Pencil [P]: a thin, even line that follows the hand closely. Vector layers only (pixel layers have the brush). */
import type { BrushSettings } from '../core/format';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { getHover } from '../canvas/controller';
import { drawRing } from './cursors';
import { PencilOptions } from './options/PencilOptions';
import { getToolSettings } from './settings';
import { canEdit } from './util';
import { VectorStroke } from './vectorStroke';

let stroke: VectorStroke | null = null;

export function pencilBrush(): BrushSettings {
  return { size: getToolSettings().pencilSize, thinning: 0.1, smoothing: 0.4, streamline: 0.4, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };
}

export const pencilTool: Tool = {
  id: 'pencil',
  label: 'Pencil',
  icon: 'pencil',
  key: 'p',
  layers: ['vector'],
  order: 20,
  help: 'tool-pencil',
  cursor: 'crosshair',
  options: PencilOptions,
  down(e: ToolPointer, ctx: ToolContext) {
    if (!canEdit(ctx, 'vector', 'The pencil')) return;
    stroke = new VectorStroke(pencilBrush(), store().get().ui.color);
    stroke.add(e, ctx.zoom);
  },
  move(e, ctx) {
    stroke?.add(e, ctx.zoom);
  },
  up(e, ctx) {
    const s = stroke;
    stroke = null;
    s?.commit(e, ctx.zoom, ctx);
    ctx.requestOverlay();
  },
  cancel(ctx) {
    stroke = null;
    ctx.requestOverlay();
  },
  overlay(g, ctx) {
    if (stroke) return stroke.overlay(g);
    const h = getHover();
    if (h) drawRing(g, ctx, h.x, h.y, getToolSettings().pencilSize / 2);
  },
};

registerTool(pencilTool);
