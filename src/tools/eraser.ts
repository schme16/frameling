/**
 * Eraser [E]. On a vector layer it removes whole lines and shapes it touches ("erase whole lines"), previewing them
 * disappearing as you go. On a pixel layer it clears pixels.
 */
import type { Drawing, Id, Shape, VectorDrawing } from '../core/format';
import { findLayer } from '../core/doc';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { getHover, setLive } from '../canvas/controller';
import { hitShape } from '../canvas/geometry';
import { docToPixel } from '../canvas/pixels';
import { activeDrawing, activeLayer, editActiveDrawing, EDIT_HINTS } from './edit';
import { drawPixelFootprint, drawRing } from './cursors';
import { EraserOptions } from './options/EraserOptions';
import { lastPixelEnd, PixelStroke } from './pixelStroke';
import { getToolSettings } from './settings';
import { reportEdit } from './util';
import { viewPixelSize, viewSizeFactor } from './view-size';
import { activeIsMerge, editShapes } from './merge-mode';
import { eraseArea, sweepGeom } from '../geometry/merge';
import { sizeFactor } from '../tablet/dynamics';

interface VectorGesture {
  layerId: Id;
  drawing: VectorDrawing;
  removed: Set<Id>;
  last: { x: number; y: number } | null;
  /** Merge layers rub out area instead of whole lines: the shapes as they are so far. */
  area: { shapes: Shape[]; changed: boolean } | null;
}
let vec: VectorGesture | null = null;
let pix: PixelStroke | null = null;
/** Where the last rub-out on a vector layer ended, for Shift+click straight lines. One layer of one document. */
let lastErase: { docId: string; layerId: string; x: number; y: number } | null = null;
const eraseEnd = (docId: string, layerId: string) => (lastErase && lastErase.docId === docId && lastErase.layerId === layerId ? { x: lastErase.x, y: lastErase.y } : null);
const noteErase = (layerId: string, e: { x: number; y: number }) => (lastErase = { docId: store().get().doc.id, layerId, x: e.x, y: e.y });

/** The ids of shapes within `radius` of the point. Exported for tests. */
export function shapesTouched(drawing: VectorDrawing, x: number, y: number, radius: number, skip: Set<Id> = new Set()): Id[] {
  const out: Id[] = [];
  for (const s of drawing.shapes) {
    if (skip.has(s.id)) continue;
    if (hitShape(s, x, y, radius)) out.push(s.id);
  }
  return out;
}

function reach(ctx: ToolContext, pen = 1): number {
  // Half the eraser size (more or less with a pen's pressure or tilt), but never so small it's hard to hit a thin line.
  const f = viewSizeFactor();
  return Math.max((getToolSettings().eraserSize * f * pen) / 2, (3 * f) / ctx.zoom);
}

function sweep(g: VectorGesture, x: number, y: number, ctx: ToolContext, pen = 1): void {
  const r = reach(ctx, pen);
  if (g.area) {
    // One capsule from the last spot to this one, so a fast flick still rubs out everything in between.
    const e = eraseArea(g.area.shapes, sweepGeom(g.last ?? { x, y }, { x, y }, r));
    g.last = { x, y };
    if (e.changed) {
      g.area = { shapes: e.shapes, changed: true };
      setLive({ layerId: g.layerId, kind: 'vector', drawing: { ...g.drawing, shapes: e.shapes } });
    }
    return;
  }
  // Walk from the last position so a fast flick can't jump over a line.
  const from = g.last ?? { x, y };
  const d = Math.hypot(x - from.x, y - from.y);
  const steps = Math.max(1, Math.ceil(d / Math.max(r / 2, 0.5)));
  let hit = false;
  for (let i = 1; i <= steps; i++) {
    const px = from.x + ((x - from.x) * i) / steps;
    const py = from.y + ((y - from.y) * i) / steps;
    for (const id of shapesTouched(g.drawing, px, py, r, g.removed)) {
      g.removed.add(id);
      hit = true;
    }
  }
  g.last = { x, y };
  if (hit) {
    const shown: Drawing = { ...g.drawing, shapes: g.drawing.shapes.filter((s) => !g.removed.has(s.id)) };
    setLive({ layerId: g.layerId, kind: 'vector', drawing: shown });
  }
}

function down(e: ToolPointer, ctx: ToolContext): void {
  const { layer, problem } = activeLayer();
  if (problem) return ctx.hint(EDIT_HINTS[problem]);
  if (!layer) return;
  if (layer.kind === 'vector') {
    const d = activeDrawing();
    if (!d || d.kind !== 'vector' || !d.shapes.length) {
      // Nothing on this frame to erase. A gesture with no drawing just does nothing.
      vec = { layerId: layer.id, drawing: { id: '', kind: 'vector', shapes: [] }, removed: new Set(), last: null, area: null };
      return;
    }
    // Shift+click rubs out in a straight line from where the last rub ended: the sweep walks the whole way there.
    vec = { layerId: layer.id, drawing: d, removed: new Set(), last: e.shift ? eraseEnd(store().get().doc.id, layer.id) : null, area: activeIsMerge() ? { shapes: d.shapes.slice(), changed: false } : null };
    sweep(vec, e.x, e.y, ctx, sizeFactor('eraser', e));
    noteErase(layer.id, e);
    return;
  }
  if (layer.kind !== 'pixel') return;
  const { doc, ui } = store().get();
  pix = new PixelStroke(doc, layer, ui.frame, { color: [0, 0, 0, 0], size: viewPixelSize(getToolSettings().eraserPixelSize), shape: getToolSettings().pixelBrushShape, perfect: false });
  pix.scale(sizeFactor('eraser', e));
  const here = pix.cell(e.x, e.y);
  const from = e.shift ? lastPixelEnd(doc, layer) : null;
  if (from) pix.beginLine(from, here);
  else pix.begin(here);
}

function move(e: ToolPointer, ctx: ToolContext): void {
  if (vec) {
    sweep(vec, e.x, e.y, ctx, sizeFactor('eraser', e));
    noteErase(vec.layerId, e);
  }
  else if (pix) {
    pix.scale(sizeFactor('eraser', e));
    pix.moveTo(pix.cell(e.x, e.y));
  }
}

function up(e: ToolPointer, ctx: ToolContext): void {
  if (vec) {
    const g = vec;
    vec = null;
    sweep(g, e.x, e.y, ctx, sizeFactor('eraser', e));
    noteErase(g.layerId, e);
    if (g.area?.changed) {
      const shapes = g.area.shapes;
      const r = editShapes('Erase', () => shapes);
      if (r !== 'nothing') reportEdit(ctx, r);
    } else if (g.removed.size) {
      const gone = g.removed;
      const r = editActiveDrawing('Erase lines', 'vector', (d) => {
        d.shapes = d.shapes.filter((s) => !gone.has(s.id));
      });
      reportEdit(ctx, r);
    }
    setLive(null);
  } else if (pix) {
    pix.moveTo(pix.cell(e.x, e.y));
    const p = pix;
    pix = null;
    const r = p.commit('Erase pixels');
    if (r !== 'ok' && r !== 'nothing') reportEdit(ctx, r);
  }
  ctx.requestOverlay();
}

function cancel(ctx: ToolContext): void {
  vec = null;
  pix?.discard();
  pix = null;
  setLive(null);
  ctx.requestOverlay();
}

function overlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
  const h = getHover();
  if (!h) return;
  const layer = findLayer(store().get().doc, store().get().ui.activeLayerId) ?? store().get().doc.layers.at(-1);
  if (layer?.kind === 'pixel') {
    drawPixelFootprint(g, ctx, docToPixel(h.x, h.y, layer.pixelSize), layer.pixelSize, viewPixelSize(getToolSettings().eraserPixelSize), getToolSettings().pixelBrushShape, null);
  } else {
    drawRing(g, ctx, h.x, h.y, reach(ctx), 'eraser');
  }
}

export const eraserTool: Tool = {
  id: 'eraser',
  group: 'draw',
  groupAt: 2,
  label: 'Eraser',
  icon: 'eraser',
  key: 'e',
  layers: ['vector', 'pixel'],
  order: 30,
  help: 'tool-eraser',
  cursor: 'crosshair',
  options: EraserOptions,
  down,
  move,
  up,
  cancel,
  overlay,
};

registerTool(eraserTool);
