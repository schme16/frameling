/**
 * Select [V] on a pixel layer: pick pixels with a box, a lasso or the magic wand, then drag them to move them.
 * Shift adds to the selection, Alt takes away (Alt+drag inside it copies the pixels instead). Once something
 * is selected, painting stays inside it, and the Pixel tools menu's flips, turns and outlines work on just that part.
 */
import { gridPixels } from '../core/pixelBounds';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { currentChoice, registerChoice } from '../core/choices';
import { cssVar } from '../canvas/theme';
import { addStageOverlay, requestOverlay, setCursor } from '../canvas/controller';
import type { Pt } from '../canvas/geometry';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { combineMasks, maskEdges, maskHas, polygonMask, rectMask, wandMask, type Mask, type SelectOp } from './mask';
import {
  activePixelDrawing,
  activePixelGrid,
  dropFloating,
  floatingOffset,
  isFloating,
  liftSelection,
  moveFloatingTo,
  PIXEL_SELECT_TOOL,
  pixelSelection,
  setPixelSelection,
} from './pixel-state';
import { getSelectSettings } from './settings';
import { modeOfTool, WAYS } from './ways';
import { store } from '../core/store';
import { drawLasso, lassoClosesAt, lassoPoint } from './lasso';
import { PixelSelectOptions } from './options';
import { reducedMotion } from '../ui/prefs';

/** A drag shorter than this (screen pixels) is a click. */
const DRAG_PX = 3;

type Gesture =
  | { kind: 'box'; op: SelectOp; start: Pt; cur: Pt; size: number }
  | { kind: 'lasso'; op: SelectOp; pts: Pt[]; cur: Pt; size: number; open: boolean; poly?: boolean }
  | { kind: 'move'; start: Pt; startCell: { x: number; y: number }; from: { dx: number; dy: number }; size: number; lifted: boolean; copy: boolean };

let g: Gesture | null = null;

export type AltInsideChoice = 'copy' | 'subtract';

registerChoice<AltInsideChoice>({
  id: 'select.altInside',
  title: 'Alt+drag inside a pixel selection',
  question: 'What should Alt+drag do when it starts inside the selected pixels?',
  category: 'Pixel art',
  silent: true,
  default: 'copy',
  help: 'Alt+drag outside the selection always takes away from it.',
  options: [
    { value: 'copy', label: 'Copy the pixels', detail: 'Drags a copy and leaves the originals where they were.' },
    { value: 'subtract', label: 'Take away from the selection', detail: 'Draws a box or lasso that is cut out of the selection.' },
  ],
});

/** Alt (without Shift) pressed inside the selection drags a copy, unless Preferences say Alt takes away there too. */
const altCopies = (e: ToolPointer): boolean => e.alt && !e.shift && currentChoice<AltInsideChoice>('select.altInside') === 'copy';

/** Which way a new selection goes: Shift adds, Alt takes away, otherwise what the options say. */
function opFor(e: ToolPointer): SelectOp {
  if (e.shift && e.alt) return 'intersect';
  if (e.shift) return 'add';
  if (e.alt) return 'subtract';
  return getSelectSettings().op;
}

const cellOf = (p: Pt, size: number) => ({ x: Math.floor(p.x / size), y: Math.floor(p.y / size) });

function apply(m: Mask, op: SelectOp): void {
  setPixelSelection(combineMasks(pixelSelection(), m, op));
}

function down(e: ToolPointer, ctx: ToolContext): void {
  if (g?.kind === 'lasso' && g.open) {
    g.cur = e;
    // Back on the first corner closes it, whichever way it was started.
    if (lassoClosesAt(g.pts, e, ctx.zoom)) return finishLasso();
    g.pts.push({ x: e.x, y: e.y });
    // A polygon keeps waiting for the next corner. An Alt lasso waits for the next Alt as you let go.
    g.open = !!g.poly;
    return;
  }
  g = null;
  const a = activePixelGrid();
  if (!a) return ctx.hint('Select works on pixel and vector layers. Pick one in the timeline first.');
  const size = a.layer.pixelSize;
  const cell = cellOf(e, size);
  const sel = pixelSelection();
  const mode = modeOfTool(store().get().ui.tool);
  // Inside the selection with no keys held: drag the pixels. With Alt: drag a copy.
  const copy = altCopies(e);
  if (sel && !e.shift && (!e.alt || copy) && maskHas(sel, cell.x, cell.y)) {
    // Copying pixels that are already lifted puts them down first, then copies them from there.
    if (copy && isFloating()) dropFloating();
    g = { kind: 'move', start: { x: e.x, y: e.y }, startCell: cell, from: floatingOffset() ?? { dx: 0, dy: 0 }, size, lifted: isFloating(), copy };
    return;
  }
  const op = opFor(e);
  if (mode === 'wand') {
    if (isFloating()) dropFloating();
    const d = activePixelDrawing();
    const pixels = d ? gridPixels(d, a.width, a.height) : new Uint8ClampedArray(a.width * a.height * 4);
    const s = getSelectSettings();
    apply(wandMask(pixels, a.width, a.height, cell.x, cell.y, { tolerance: (s.tolerance / 100) * 255, contiguous: s.contiguous }), op);
    ctx.requestOverlay();
    return;
  }
  if (isFloating()) dropFloating();
  if (mode === 'polygon') g = { kind: 'lasso', op, pts: [{ x: e.x, y: e.y }], cur: e, size, open: true, poly: true };
  else if (mode === 'lasso') g = { kind: 'lasso', op, pts: [{ x: e.x, y: e.y }], cur: e, size, open: false };
  else g = { kind: 'box', op, start: { x: e.x, y: e.y }, cur: e, size };
}

function move(e: ToolPointer, ctx: ToolContext): void {
  if (!g) return;
  if (g.kind === 'box') g.cur = e;
  else if (g.kind === 'lasso') {
    g.cur = e;
    if (!g.open) lassoPoint(g.pts, e, ctx.zoom);
  } else {
    const c = cellOf(e, g.size);
    const dx = c.x - g.startCell.x;
    const dy = c.y - g.startCell.y;
    if (!g.lifted) {
      if (!dx && !dy) return;
      const { problem } = activeLayer();
      if (problem) {
        ctx.hint(EDIT_HINTS[problem]);
        g = null;
        return;
      }
      if (!liftSelection(g.copy)) {
        g = null;
        return;
      }
      g.lifted = true;
    }
    // Shift keeps the move straight across or straight up and down.
    let mx = dx;
    let my = dy;
    if (e.shift) {
      if (Math.abs(mx) > Math.abs(my)) my = 0;
      else mx = 0;
    }
    moveFloatingTo(g.from.dx + mx, g.from.dy + my);
  }
}

function up(e: ToolPointer, ctx: ToolContext): void {
  const s = g;
  if (!s) return;
  if (s.kind === 'move') {
    move(e, ctx);
    g = null;
    return;
  }
  if (s.kind === 'lasso') {
    s.cur = e;
    // A polygon is built from clicks, so letting go of one does nothing at all.
    if (s.poly) {
      ctx.requestOverlay();
      return;
    }
    lassoPoint(s.pts, e, ctx.zoom);
    if (e.alt && s.op !== 'subtract') {
      // Alt held as you let go keeps the lasso open: each Alt+click adds a straight side.
      s.open = true;
      ctx.requestOverlay();
      return;
    }
    return finishLasso();
  }
  g = null;
  const a = activePixelGrid();
  if (!a) return;
  const clicked = Math.hypot(e.x - s.start.x, e.y - s.start.y) * ctx.zoom < DRAG_PX;
  if (clicked) {
    // A click off the selection lets go of it.
    if (s.op === 'replace') setPixelSelection(null);
    ctx.requestOverlay();
    return;
  }
  const p = cellOf(s.start, s.size);
  const q = cellOf(e, s.size);
  apply(rectMask(a.width, a.height, p.x, p.y, q.x, q.y), s.op);
  ctx.requestOverlay();
}

function finishLasso(): void {
  const s = g;
  g = null;
  if (!s || s.kind !== 'lasso') return;
  const a = activePixelGrid();
  if (!a) return;
  const pts = s.pts.map((p) => ({ x: p.x / s.size, y: p.y / s.size }));
  if (pts.length < 3) {
    if (s.op === 'replace') setPixelSelection(null);
  } else apply(polygonMask(a.width, a.height, pts), s.op);
  requestOverlay();
}

/** True while a lasso or polygon is waiting for its next corner. */
export const pixelLassoIsOpen = (): boolean => g?.kind === 'lasso' && g.open;

/** Lets go of a lasso or polygon left open, without picking anything. True when there was one. */
export function cancelOpenPixelLasso(): boolean {
  if (g?.kind !== 'lasso' || !g.open) return false;
  g = null;
  return true;
}

/** Closes a lasso or polygon left open and picks what it covers. True when there was one. */
export function closeOpenPixelLasso(): boolean {
  if (g?.kind !== 'lasso' || !g.open) return false;
  finishLasso();
  return true;
}

/** Enter closes a polygon or lasso you left open, so you don't have to land back on the first corner. */
function polygonKey(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' || !pixelLassoIsOpen()) return false;
  return closeOpenPixelLasso();
}

function cancel(ctx: ToolContext): void {
  // A drag that already lifted pixels keeps them lifted where they were before it; anything else is dropped.
  if (g?.kind === 'move' && g.lifted) moveFloatingTo(g.from.dx, g.from.dy);
  g = null;
  ctx.requestOverlay();
}

function hover(e: ToolPointer): void {
  if (g?.kind === 'lasso' && g.open) {
    g.cur = e;
    return setCursor('crosshair');
  }
  const a = activePixelGrid();
  const sel = pixelSelection();
  if (!a || !sel) return setCursor(null);
  const c = cellOf(e, a.layer.pixelSize);
  if (e.shift || !maskHas(sel, c.x, c.y)) return setCursor(null);
  if (!e.alt) return setCursor('move');
  setCursor(altCopies(e) ? 'copy' : null);
}

function overlay(gx: CanvasRenderingContext2D, ctx: ToolContext): void {
  const ink = cssVar('--grape', '#9b7bff');
  if (g?.kind === 'lasso') drawLasso(gx, g.pts, g.open ? g.cur : null, ctx.zoom, ink);
  else if (g?.kind === 'box') {
    // The box snaps to whole pixels, so it shows exactly what will be picked.
    const s = g.size;
    const p = cellOf(g.start, s);
    const q = cellOf(g.cur, s);
    const x = Math.min(p.x, q.x) * s;
    const y = Math.min(p.y, q.y) * s;
    const w = (Math.abs(q.x - p.x) + 1) * s;
    const h = (Math.abs(q.y - p.y) + 1) * s;
    const px = 1 / ctx.zoom;
    gx.save();
    gx.globalAlpha = 0.14;
    gx.fillStyle = ink;
    gx.fillRect(x, y, w, h);
    gx.globalAlpha = 1;
    gx.lineWidth = 2.5 * px;
    gx.strokeStyle = 'rgb(255 255 255 / 0.8)';
    gx.strokeRect(x, y, w, h);
    gx.setLineDash([5 * px, 4 * px]);
    gx.lineWidth = 1.25 * px;
    gx.strokeStyle = ink;
    gx.strokeRect(x, y, w, h);
    gx.restore();
  }
}

/** One tool per way of picking, all sharing these handlers. The way comes from which one you chose. */
export const pixelSelectTools: Tool[] = WAYS.map((w) => ({
  id: w.pixel,
  group: 'select',
  groupAt: w.at,
  label: w.label,
  icon: w.icon,
  key: w.key,
  layers: ['pixel'],
  order: 5 + w.at,
  help: 'pixel-select',
  cursor: 'crosshair',
  options: PixelSelectOptions,
  down,
  move,
  up,
  hover,
  cancel,
  overlay,
  onKey: polygonKey,
}));

/** The box one, which is what Select has always meant. */
export const pixelSelectTool = pixelSelectTools[0];

for (const t of pixelSelectTools) registerTool(t);

// ---------------------------------------------------------------- marching ants, whatever tool is picked

let antsCache: { m: Mask; size: number; path: Path2D } | null = null;

function antsPath(m: Mask, size: number): Path2D {
  if (antsCache && antsCache.m === m && antsCache.size === size) return antsCache.path;
  const e = maskEdges(m);
  const path = new Path2D();
  for (let i = 0; i < e.length; i += 4) {
    path.moveTo(e[i] * size, e[i + 1] * size);
    path.lineTo(e[i + 2] * size, e[i + 3] * size);
  }
  antsCache = { m, size, path };
  return path;
}

addStageOverlay((gx, zoom) => {
  const m = pixelSelection();
  const a = activePixelGrid();
  if (!m || !a || typeof Path2D === 'undefined') return;
  const path = antsPath(m, a.layer.pixelSize);
  const px = 1 / zoom;
  // Black and white dashes that crawl along, so the edge shows on any colour.
  // They hold still when motion is turned down.
  const crawl = reducedMotion() ? 0 : (Date.now() / 60) % 8;
  gx.save();
  gx.lineWidth = px;
  gx.setLineDash([4 * px, 4 * px]);
  gx.lineDashOffset = -crawl * px;
  gx.strokeStyle = 'white';
  gx.stroke(path);
  gx.lineDashOffset = (4 - crawl) * px;
  gx.strokeStyle = 'black';
  gx.stroke(path);
  gx.restore();
});
