/**
 * The paint bucket. On vector layers it finds the area enclosed around the click (closing small gaps) and adds a
 * FillShape for it, behind the lines. Clicking paint that is already there recolours it. On pixel layers it is a
 * plain flood fill (mirrored when mirror drawing is on). The heavy lifting is in `src/geometry/fill.ts`.
 */
import type { Doc, Drawing, FillShape, Shape } from '../core/format';
import { drawingAt, pixelGrid, uid } from '../core/doc';
import { tileModeOn, wrap } from '../tiles/state';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { fillRegion, pathsOverlap, type Rect } from '../geometry/fill';
import { pointInPaths } from '../geometry/hit';
import { floodFillPoints, parseColor, type Rgba } from '../geometry/pixel-fill';
import { makeMirror, mirrorPoints, snapToPalette } from '../pixel/ink';
import { getPixelSettings } from '../pixel/settings';
import { docPalette } from '../pixel/palette';
import { activeDrawing, activeLayer, EDIT_HINTS, editActiveDrawing } from './edit';
import { FillOptionsPanel, gapWidth, getFillOptions } from './fill-options';
import './fill-help';
import { activeIsMerge, editShapes } from './merge-mode';
import { gradientFor, withWellGradients } from './gradient-wells';
import { mergeShapes } from '../geometry/merge';
import { pixelSelection } from '../select/pixel-state';
import { clipToMask } from '../select/mask';
import { reducedMotion } from '../ui/prefs';

export const FILL_HINTS = {
  'no-fill': 'The fill colour is set to none. Pick a fill colour in the Colours panel (the solid box), then fill.',
  leak: "That area isn't closed in. Try a bigger gap setting, or close the gap.",
  'on-line': 'You clicked right on a line. Click inside the area you want to fill.',
  outside: "That spot is off the canvas. Click inside the area you want to fill.",
  'no-drawing': 'There is nothing to fill on this frame yet. Draw some lines first.',
  same: 'That area is already this colour. Pick a new fill colour in the Colours panel (the solid box), then click again.',
};

/** Share of an existing fill's ground the new area must cover before the click recolours it instead. */
const SAME_AREA = 0.85;

/** Index just under the lowest line, so new paint sits behind every stroke and path. */
export function indexBelowLines(shapes: readonly Shape[]): number {
  const i = shapes.findIndex((s) => s.type === 'stroke' || s.type === 'path');
  return i < 0 ? shapes.length : i;
}

/** The topmost shape with paint under the point: a fill, or a path that has a fill colour. */
export function paintAt(shapes: readonly Shape[], x: number, y: number): FillShape | Extract<Shape, { type: 'path' }> | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === 'fill' && pointInPaths(s.paths, x, y)) return s;
    if (s.type === 'path' && s.fill && pointInPaths(s.paths, x, y)) return s;
  }
  return undefined;
}

// ---------------------------------------------------------------- the pop

interface Pop {
  x: number;
  y: number;
  at: number;
  color: string;
}
let pop: Pop | null = null;
let looping = false;
const POP_MS = 420;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function startPop(x: number, y: number, color: string, ctx: ToolContext) {
  // The little ring is just for fun, so it's skipped when motion is turned down.
  if (reducedMotion()) return;
  pop = { x, y, at: clock(), color };
  ctx.requestOverlay();
}

function keepAnimating(ctx: ToolContext) {
  if (looping) return;
  looping = true;
  const step = () => {
    looping = false;
    if (pop) ctx.requestOverlay();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
  else setTimeout(step, 16);
}

function drawPop(g: CanvasRenderingContext2D, ctx: ToolContext) {
  if (!pop) return;
  const t = (clock() - pop.at) / POP_MS;
  if (t >= 1) {
    pop = null;
    return;
  }
  // Sizes are on screen, so divide by the zoom to draw them in document pixels.
  const z = Math.max(0.01, ctx.zoom);
  const ease = 1 - (1 - t) ** 3;
  g.save();
  g.globalAlpha = 1 - t;
  g.strokeStyle = pop.color;
  g.lineWidth = (3 * (1 - t) + 1) / z;
  g.beginPath();
  g.arc(pop.x, pop.y, (6 + 34 * ease) / z, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = pop.color;
  g.beginPath();
  g.arc(pop.x, pop.y, (5 * (1 - ease) + 1) / z, 0, Math.PI * 2);
  g.fill();
  g.restore();
  keepAnimating(ctx);
}

// ---------------------------------------------------------------- the tool

/** The lines the bucket sees: the active drawing, plus every visible vector layer's drawing at this frame when asked. */
export function barrierShapes(doc: Doc, frame: number, own: readonly Shape[], allLayers: boolean, activeLayerId: string | undefined): Shape[] {
  if (!allLayers) return own.slice();
  const out: Shape[] = own.slice();
  for (const l of doc.layers) {
    if (l.id === activeLayerId || !l.visible || l.kind !== 'vector') continue;
    const d = drawingAt(doc, l, frame);
    if (d?.kind === 'vector') for (const s of d.shapes) if (s.type !== 'fill' && s.type !== 'instance') out.push(s);
  }
  return out;
}

function fillVector(e: ToolPointer, ctx: ToolContext) {
  const { doc } = store().get();
  // The bucket pours the fill colour (the stroke colour is for lines), as in Illustrator.
  const ui = { ...store().get().ui, color: store().get().ui.fillColor ?? '' };
  if (!ui.color) {
    ctx.hint(FILL_HINTS['no-fill']);
    return;
  }
  const drawing: Drawing | undefined = activeDrawing();
  const opts = getFillOptions();
  // With lines from all layers, the colour layer can start empty: the first fill makes its drawing.
  if ((!drawing && !opts.allLayers) || (drawing && drawing.kind !== 'vector')) {
    ctx.hint(FILL_HINTS['no-drawing']);
    return;
  }
  const own = drawing?.kind === 'vector' ? drawing.shapes : [];
  const bounds: Rect = { x: 0, y: 0, width: doc.width, height: doc.height };
  const lines = barrierShapes(doc, ui.frame, own, opts.allLayers, activeLayer().layer?.id);
  // On a merge layer the lines are painted areas themselves, so their edges are the walls.
  const merge = activeIsMerge();
  const res = fillRegion(lines, { x: e.x, y: e.y }, { gap: gapWidth(opts.gap, ui.brush.size), bounds, includeFills: merge });
  const hit = paintAt(own, e.x, e.y);

  if (res.kind === 'outside' || res.kind === 'on-line') {
    ctx.hint(FILL_HINTS[res.kind]);
    return;
  }
  // Paint is already here and the lines around it have not changed (or have leaked since): recolour it.
  if (hit && (res.kind === 'leak' || pathsOverlap(res.paths, hit.paths, bounds) >= SAME_AREA)) {
    const current = hit.type === 'fill' ? hit.color : hit.fill;
    // With a gradient in the fill box, the area takes the gradient laid over its own size.
    const grad = gradientFor('fill', hit.paths);
    const hadGrad = hit.type === 'fill' ? hit.gradient : hit.fillGradient;
    if (!grad && !hadGrad && current && current.toLowerCase() === ui.color.toLowerCase()) {
      ctx.hint(FILL_HINTS.same);
      return;
    }
    const id = hit.id;
    const color = ui.color;
    const r =
      merge && hit.type === 'fill' && !hit.group
        ? // Recoloured paint joins any paint of the new colour it touches.
          editShapes('Recolour fill', (before) => {
            const at = before.findIndex((x) => x.id === id);
            return mergeShapes(
              before.filter((x) => x.id !== id),
              [grad ? { ...hit, color, gradient: grad } : (({ gradient: _g, ...rest }) => ({ ...rest, color }))(hit)],
              { under: true, at },
            ).shapes;
          })
        : editActiveDrawing('Recolour fill', 'vector', (d) => {
            const s = d.shapes.find((x) => x.id === id);
            if (!s) return;
            if (s.type === 'fill') {
              s.color = color;
              if (grad) s.gradient = grad;
              else delete s.gradient;
            } else if (s.type === 'path') {
              s.fill = color;
              if (grad) s.fillGradient = grad;
              else delete s.fillGradient;
            }
          });
    if (r === 'nothing') return;
    if (r !== 'ok') ctx.hint(EDIT_HINTS[r]);
    else startPop(e.x, e.y, color, ctx);
    return;
  }
  if (res.kind === 'leak') {
    ctx.hint(FILL_HINTS.leak);
    return;
  }
  const shape: FillShape = withWellGradients({ id: uid('f'), type: 'fill', paths: res.paths, color: ui.color, opacity: 1 });
  const r = merge
    ? // Paint only covers empty ground, and joins any of its own colour it touches.
      editShapes('Fill', (before) => mergeShapes(before, [shape], { under: true, at: indexBelowLines(before) }).shapes)
    : editActiveDrawing('Fill', 'vector', (d) => {
        // Behind every line, so lines always read on top of paint (unless asked otherwise).
        const at = opts.onTop ? d.shapes.length : indexBelowLines(d.shapes);
        d.shapes.splice(at, 0, shape as never);
      });
  if (r === 'nothing') return;
  if (r !== 'ok') ctx.hint(EDIT_HINTS[r]);
  else startPop(e.x, e.y, ui.color, ctx);
}

/** The clicked pixel and its mirror images while mirror drawing is on (wrapped round in tile mode). */
export function fillPoints(x: number, y: number, width: number, height: number, wrapOn: boolean): [number, number][] {
  const ps = getPixelSettings();
  const out = new Int32Array(8);
  const n = mirrorPoints(makeMirror(ps.symmetry, width, height, ps.axisX, ps.axisY), x, y, out);
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    let px = out[k * 2];
    let py = out[k * 2 + 1];
    if (wrapOn) {
      px = wrap(px, width);
      py = wrap(py, height);
    }
    if (px >= 0 && py >= 0 && px < width && py < height) pts.push([px, py]);
  }
  return pts;
}

function fillPixels(e: ToolPointer, ctx: ToolContext) {
  const ui = { ...store().get().ui, color: store().get().ui.fillColor ?? '' };
  if (!ui.color) {
    ctx.hint(FILL_HINTS['no-fill']);
    return;
  }
  const { layer } = activeLayer();
  if (!layer || layer.kind !== 'pixel') return;
  const wrapOn = tileModeOn();
  let px = Math.floor(e.x / layer.pixelSize);
  let py = Math.floor(e.y / layer.pixelSize);
  if (wrapOn) {
    const g = pixelGrid(store().get().doc, layer);
    px = wrap(px, g.width);
    py = wrap(py, g.height);
  }
  // A palette-locked layer only takes palette colours.
  const color = layer.paletteLock ? ([...snapToPalette(parseColor(ui.color), docPalette(store().get().doc))] as Rgba) : parseColor(ui.color);
  const mode = getFillOptions().allOfColour ? 'all' : 'contiguous';
  const existing = activeDrawing();
  if (existing && existing.kind === 'pixel') {
    if (px < 0 || py < 0 || px >= existing.width || py >= existing.height) {
      ctx.hint(FILL_HINTS.outside);
      return;
    }
    const r = floodFillPoints(existing.pixels, existing.width, existing.height, fillPoints(px, py, existing.width, existing.height, wrapOn), color, { mode, wrap: wrapOn });
    if (!r.changed) {
      ctx.hint(FILL_HINTS.same);
      return;
    }
    const sel = pixelSelection();
    const filled = sel && sel.width === existing.width && sel.height === existing.height ? clipToMask(existing.pixels, r.pixels, sel) : r.pixels;
    const res = editActiveDrawing('Fill', 'pixel', (d) => void (d.pixels = filled));
    if (res !== 'ok') ctx.hint(EDIT_HINTS[res]);
    else startPop(px * layer.pixelSize + layer.pixelSize / 2, py * layer.pixelSize + layer.pixelSize / 2, ui.color, ctx);
    return;
  }
  // An empty frame gets a fresh drawing, which the fill then covers (it is all one clear colour).
  const res = editActiveDrawing('Fill', 'pixel', (d) => {
    if (px < 0 || py < 0 || px >= d.width || py >= d.height) return;
    const filled = floodFillPoints(d.pixels, d.width, d.height, fillPoints(px, py, d.width, d.height, wrapOn), color, { mode, wrap: wrapOn }).pixels;
    const sel = pixelSelection();
    d.pixels = sel && sel.width === d.width && sel.height === d.height ? clipToMask(d.pixels, filled, sel) : filled;
  });
  if (res !== 'ok') ctx.hint(EDIT_HINTS[res]);
  else startPop(px * layer.pixelSize + layer.pixelSize / 2, py * layer.pixelSize + layer.pixelSize / 2, ui.color, ctx);
}

export const fillTool: Tool = {
  id: 'fill',
  label: 'Paint bucket',
  icon: 'fill',
  key: 'g',
  layers: ['vector', 'pixel'],
  order: 30,
  help: 'fill',
  cursor: 'crosshair',
  options: FillOptionsPanel as Tool['options'],
  down(e, ctx) {
    const { layer, problem } = activeLayer();
    if (problem || !layer) {
      ctx.hint(EDIT_HINTS[problem ?? 'no-layer']);
      return;
    }
    if (layer.kind === 'pixel') fillPixels(e, ctx);
    else fillVector(e, ctx);
  },
  cancel() {
    pop = null;
  },
  overlay(g, ctx) {
    drawPop(g, ctx);
  },
};

registerTool(fillTool);
