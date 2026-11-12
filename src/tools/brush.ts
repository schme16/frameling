/**
 * Brush [B]. On a vector layer it paints a smooth, pressure-aware stroke (perfect-freehand), kept as points so it can
 * be restyled later. On a pixel layer it's a pixel pencil: hard pixels, a size in art pixels, "pixel perfect" corners,
 * and Shift+click for a straight line from the last pixel.
 */
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { parseHex } from '../canvas/colors';
import { getHover } from '../canvas/controller';
import { activeLayer, EDIT_HINTS } from './edit';
import { BrushOptions } from './options/BrushOptions';
import { PixelStroke, lastPixelEnd } from './pixelStroke';
import { noteColorUsed } from './recent';
import { getToolSettings } from './settings';
import { canEdit, reportEdit } from './util';
import { drawPixelFootprint, drawRing } from './cursors';
import { VectorStroke } from './vectorStroke';
import { docToPixel } from '../canvas/pixels';
import { viewPixelSize, viewSizeFactor } from './view-size';
import { sizeFactor, vectorDynamics } from '../tablet/dynamics';

let vec: VectorStroke | null = null;
let pix: PixelStroke | null = null;
let pixColor = '';

function down(e: ToolPointer, ctx: ToolContext): void {
  const { layer, problem } = activeLayer();
  if (problem) return ctx.hint(EDIT_HINTS[problem]);
  if (!layer) return;
  const { doc, ui } = store().get();
  if (layer.kind === 'vector') {
    if (!canEdit(ctx, 'vector', 'The brush')) return;
    const dyn = vectorDynamics('brush', { ...ui.brush, size: ui.brush.size * viewSizeFactor() }, e);
    vec = new VectorStroke(dyn.brush, ui.color, dyn);
    vec.add(e, ctx.zoom);
    return;
  }
  if (layer.kind !== 'pixel') return;
  const rgba = parseHex(ui.color);
  if (!rgba) return ctx.hint("That colour isn't something I can paint with. Pick one from the Colours panel.");
  const s = getToolSettings();
  pix = new PixelStroke(doc, layer, ui.frame, { color: rgba, size: viewPixelSize(s.pixelBrushSize), shape: s.pixelBrushShape, perfect: s.pixelPerfect });
  pixColor = ui.color;
  pix.scale(sizeFactor('brush', e));
  const here = pix.cell(e.x, e.y);
  const from = e.shift ? lastPixelEnd(doc, layer) : null;
  if (from) pix.beginLine(from, here);
  else pix.begin(here);
}

function move(e: ToolPointer, ctx: ToolContext): void {
  if (vec) vec.add(e, ctx.zoom);
  else if (pix) {
    pix.scale(sizeFactor('brush', e));
    pix.moveTo(pix.cell(e.x, e.y));
  }
}

function up(e: ToolPointer, ctx: ToolContext): void {
  if (vec) {
    const v = vec;
    vec = null;
    v.commit(e, ctx.zoom, ctx);
  } else if (pix) {
    pix.moveTo(pix.cell(e.x, e.y));
    const p = pix;
    pix = null;
    const r = p.commit('Draw pixels');
    if (r === 'ok') noteColorUsed(pixColor);
    else if (r !== 'nothing') reportEdit(ctx, r);
  }
  ctx.requestOverlay();
}

function cancel(ctx: ToolContext): void {
  vec = null;
  pix?.discard();
  pix = null;
  ctx.requestOverlay();
}

function overlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
  if (vec) return vec.overlay(g);
  if (pix) return;
  const h = getHover();
  if (!h) return;
  const { ui } = store().get();
  const layer = activeLayer().layer;
  if (layer?.kind === 'pixel') {
    const s = getToolSettings();
    drawPixelFootprint(g, ctx, docToPixel(h.x, h.y, layer.pixelSize), layer.pixelSize, viewPixelSize(s.pixelBrushSize), s.pixelBrushShape, ui.color);
  } else {
    drawRing(g, ctx, h.x, h.y, (ui.brush.size * viewSizeFactor()) / 2, 'brush');
  }
}

export const brushTool: Tool = {
  id: 'brush',
  group: 'draw',
  groupAt: 1,
  label: 'Brush',
  icon: 'brush',
  key: 'b',
  layers: ['vector', 'pixel'],
  order: 10,
  help: 'tool-brush',
  cursor: 'crosshair',
  options: BrushOptions,
  down,
  move,
  up,
  cancel,
  overlay,
};

registerTool(brushTool);
