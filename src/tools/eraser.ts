/**
 * Eraser [E]. On a vector layer it rubs out just the bit you drag over (a brush stroke can be cut in two or nibbled
 * at the end), or, if you prefer, removes the whole lines and shapes it touches ("erase whole lines"). A merge layer
 * always rubs out area. Either way the change previews live as you drag. On a pixel layer it clears pixels.
 */
import type { Drawing, Id, Shape, VectorDrawing } from '../core/format';
import { findLayer } from '../core/doc';
import { registerCommands, registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
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
import { eraseArea, eraseBits, sweepGeom } from '../geometry/merge';
import { currentChoice, registerChoice, setChoice } from '../core/choices';
import { toast } from '../ui/toast';
import { sizeFactor } from '../tablet/dynamics';
import { activeVectorMirror, mirrorSpots } from './mirror';

interface VectorGesture {
  layerId: Id;
  drawing: VectorDrawing;
  removed: Set<Id>;
  /** Where each rub-out last was: the pointer, then its reflections when mirror drawing is on. */
  lasts: ({ x: number; y: number } | null)[];
  /** Rubbing out area instead of whole lines: the shapes as they are so far. `bits` cuts shapes that stay separate (object layers). */
  area: { shapes: Shape[]; changed: boolean; bits: boolean } | null;
}

export type EraserWay = 'bit' | 'whole';

registerChoice<EraserWay>({
  id: 'eraser.vectorWay',
  title: 'Eraser on lines and shapes',
  question: 'When the eraser touches a line or shape, what should it rub out?',
  options: [
    { value: 'bit', label: 'Just the bit I drag over', detail: 'Like a real rubber: a line is cut or nibbled where the circle passes, and the rest stays.' },
    { value: 'whole', label: 'The whole line', detail: 'Anything the circle touches disappears, so one swipe removes a stroke or a shape.' },
  ],
  default: 'bit',
  category: 'Drawing',
  help: 'tool-eraser',
  silent: true,
});

/** How the eraser treats lines and shapes on a layer that keeps them separate. */
export const eraserWay = (): EraserWay => currentChoice<EraserWay>('eraser.vectorWay');

registerCommands([
  {
    id: 'eraser.bit',
    label: 'Eraser rubs out just the bit',
    category: 'Draw',
    description: 'The eraser rubs out only the part you drag over, so a line can be cut or nibbled. Turn it off to erase whole lines.',
    help: 'tool-eraser',
    keywords: ['eraser', 'rubber', 'rub out', 'erase whole lines', 'partial', 'cut line'],
    checked: () => eraserWay() === 'bit',
    run: () => {
      const next: EraserWay = eraserWay() === 'bit' ? 'whole' : 'bit';
      setChoice('eraser.vectorWay', next);
      toast(next === 'bit' ? 'The eraser now rubs out just the bit you drag over.' : 'The eraser now removes whole lines.');
    },
  },
]);
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

/** Rubs out at the pointer, and at its reflections when mirror drawing is on. */
function sweep(g: VectorGesture, x: number, y: number, ctx: ToolContext, pen = 1): void {
  const m = activeVectorMirror();
  const spots = m ? mirrorSpots(m, x, y) : [{ x, y }];
  spots.forEach((p, i) => sweepOne(g, p.x, p.y, i, ctx, pen));
}

function sweepOne(g: VectorGesture, x: number, y: number, i: number, ctx: ToolContext, pen: number): void {
  const r = reach(ctx, pen);
  if (g.area) {
    // One capsule from the last spot to this one, so a fast flick still rubs out everything in between.
    const swept = sweepGeom(g.lasts[i] ?? { x, y }, { x, y }, r);
    const e = g.area.bits ? eraseBits(g.area.shapes, swept) : eraseArea(g.area.shapes, swept);
    g.lasts[i] = { x, y };
    if (e.changed) {
      g.area = { shapes: e.shapes, changed: true, bits: g.area.bits };
      setLive({ layerId: g.layerId, kind: 'vector', drawing: { ...g.drawing, shapes: e.shapes } });
    }
    return;
  }
  // Walk from the last position so a fast flick can't jump over a line.
  const from = g.lasts[i] ?? { x, y };
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
  g.lasts[i] = { x, y };
  if (hit) {
    const shown: Drawing = { ...g.drawing, shapes: g.drawing.shapes.filter((s) => !g.removed.has(s.id)) };
    setLive({ layerId: g.layerId, kind: 'vector', drawing: shown });
  }
}

/** Shift+click: each rub-out starts from where the last one ended (and from its reflections). */
function shiftLasts(shift: boolean, layerId: Id): ({ x: number; y: number } | null)[] {
  const from = shift ? eraseEnd(store().get().doc.id, layerId) : null;
  if (!from) return [];
  const m = activeVectorMirror();
  return m ? mirrorSpots(m, from.x, from.y) : [from];
}

function down(e: ToolPointer, ctx: ToolContext): void {
  const { layer, problem } = activeLayer();
  if (problem) return ctx.hint(EDIT_HINTS[problem]);
  if (!layer) return;
  if (layer.kind === 'vector') {
    const d = activeDrawing();
    if (!d || d.kind !== 'vector' || !d.shapes.length) {
      // Nothing on this frame to erase. A gesture with no drawing just does nothing.
      vec = { layerId: layer.id, drawing: { id: '', kind: 'vector', shapes: [] }, removed: new Set(), lasts: [], area: null };
      return;
    }
    // Shift+click rubs out in a straight line from where the last rub ended: the sweep walks the whole way there.
    vec = { layerId: layer.id, drawing: d, removed: new Set(), lasts: shiftLasts(e.shift, layer.id), area: activeIsMerge() ? { shapes: d.shapes.slice(), changed: false, bits: false } : eraserWay() === 'bit' ? { shapes: d.shapes.slice(), changed: false, bits: true } : null };
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
      const r = editShapes(g.area.bits ? 'Erase part of a line' : 'Erase', () => shapes);
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
    const m = activeVectorMirror();
    for (const p of m ? mirrorSpots(m, h.x, h.y) : [h]) drawRing(g, ctx, p.x, p.y, reach(ctx), 'eraser');
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
