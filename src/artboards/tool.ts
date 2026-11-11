/**
 * The Artboard tool [Shift+W]: drag on the empty pasteboard to make a new artboard, drag one to move it, drag its
 * edges or corners to resize it, Alt+drag to copy it. Clicking an artboard opens it. Sizes and places snap to whole
 * art pixels on pixel art.
 */
import type { Doc, Id } from '../core/format';
import { registerTool, type Tool, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { setCursor } from '../canvas/controller';
import type { Anchor } from '../canvas/resize';
import { activeArtboard, activeId, artboardAt, boxes } from './model';
import { duplicateArtboardById, goToArtboard, installArtboards, moveArtboardTo, newArtboard, resizeArtboard } from './ops';
import { lazyComponent } from '../core/lazy';

const ArtboardToolOptions = lazyComponent(() => import('./options').then((m) => m.ArtboardToolOptions));

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const OPPOSITE: Record<Handle, Anchor> = { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', nw: 'se', se: 'nw', sw: 'ne' };
const CURSOR: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
/** Screen pixels a drag must go before it counts. */
const DRAG_PX = 4;

type Drag =
  | { kind: 'move'; id: Id; start: Pt; from: Pt; key: string }
  | { kind: 'resize'; id: Id; handle: Handle; start: Pt; box: Box; now: Box }
  | { kind: 'new'; start: Pt; now: Pt };

let drag: Drag | null = null;
let hover: { id: Id; handle: Handle | null } | null = null;

/** The smallest art pixel on the open artboard (1 when there's no pixel art): sizes and moves snap to it. */
export function artStep(doc: Doc): number {
  let px = 0;
  for (const l of doc.layers) if (l.kind === 'pixel' || l.kind === 'tilemap') px = Math.max(px, l.pixelSize);
  return px || 1;
}

const snap = (v: number, step: number) => Math.round(v / step) * step;

/** A pointer position on the pasteboard (the tool gets them in the open artboard's own space). */
function onBoard(e: Pt, doc: Doc): Pt {
  const a = activeArtboard(doc);
  return { x: e.x + a.x, y: e.y + a.y };
}

function handlePoints(b: Box): Record<Handle, Pt> {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return { nw: { x: b.x, y: b.y }, n: { x: cx, y: b.y }, ne: { x: b.x + b.w, y: b.y }, e: { x: b.x + b.w, y: cy }, se: { x: b.x + b.w, y: b.y + b.h }, s: { x: cx, y: b.y + b.h }, sw: { x: b.x, y: b.y + b.h }, w: { x: b.x, y: cy } };
}

/** What's under a pasteboard point: the open artboard's handle first, then any artboard. */
export function hitTest(doc: Doc, p: Pt, zoom: number): { id: Id; handle: Handle | null } | null {
  const r = 7 / zoom;
  const act = boxes(doc).find((b) => b.id === activeId(doc))!;
  const hp = handlePoints(act);
  for (const h of HANDLES) if (Math.abs(p.x - hp[h].x) <= r && Math.abs(p.y - hp[h].y) <= r) return { id: act.id, handle: h };
  const id = artboardAt(doc, p.x, p.y);
  return id ? { id, handle: null } : null;
}

/** The box a resize drag makes: the dragged side follows the pointer, the other stays, never smaller than a step. */
export function resizedBox(b: Box, h: Handle, dx: number, dy: number, step: number): Box {
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  if (h.includes('w')) x0 = Math.min(x1 - step, snap(b.x + dx, step));
  if (h.includes('e')) x1 = Math.max(x0 + step, snap(b.x + b.w + dx, step));
  if (h.includes('n')) y0 = Math.min(y1 - step, snap(b.y + dy, step));
  if (h.includes('s')) y1 = Math.max(y0 + step, snap(b.y + b.h + dy, step));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function down(e: ToolPointer): void {
  installArtboards();
  const { doc, ui } = store().get();
  if (doc.editing?.length) return;
  const p = onBoard(e, doc);
  const hit = hitTest(doc, p, ui.zoom);
  if (!hit) {
    drag = { kind: 'new', start: p, now: p };
    return;
  }
  let id = hit.id;
  if (hit.handle) {
    const b = boxes(doc).find((x) => x.id === id)!;
    drag = { kind: 'resize', id, handle: hit.handle, start: p, box: b, now: b };
    return;
  }
  if (e.alt) id = duplicateArtboardById(id) ?? id;
  if (id !== activeId(store().get().doc)) goToArtboard(id);
  const b = boxes(store().get().doc).find((x) => x.id === id)!;
  drag = { kind: 'move', id, start: p, from: { x: b.x, y: b.y }, key: `ab-move-${id}-${Date.now()}` };
}

function move(e: ToolPointer): void {
  if (!drag) return;
  const { doc, ui } = store().get();
  const p = onBoard(e, doc);
  const step = artStep(doc);
  if (drag.kind === 'new') drag.now = p;
  else if (drag.kind === 'resize') drag.now = resizedBox(drag.box, drag.handle, p.x - drag.start.x, p.y - drag.start.y, step);
  else {
    let dx = p.x - drag.start.x;
    let dy = p.y - drag.start.y;
    if (Math.hypot(dx, dy) * ui.zoom < DRAG_PX) return;
    if (e.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    moveArtboardTo(drag.id, snap(drag.from.x + dx, step), snap(drag.from.y + dy, step), drag.key);
  }
}

function up(e: ToolPointer): void {
  const d = drag;
  drag = null;
  if (!d) return;
  const { doc, ui } = store().get();
  const step = artStep(doc);
  if (d.kind === 'new') {
    const p = onBoard(e, doc);
    const x0 = snap(Math.min(d.start.x, p.x), step);
    const y0 = snap(Math.min(d.start.y, p.y), step);
    const w = snap(Math.abs(p.x - d.start.x), step);
    const h = snap(Math.abs(p.y - d.start.y), step);
    if (Math.min(w, h) * ui.zoom < DRAG_PX * 2 || w < step || h < step) return;
    newArtboard({ x: x0, y: y0, width: w, height: h });
    return;
  }
  if (d.kind === 'resize') {
    const n = d.now;
    if (n.w === d.box.w && n.h === d.box.h && n.x === d.box.x && n.y === d.box.y) return;
    resizeArtboard(d.id, n.w, n.h, OPPOSITE[d.handle], { x: n.x, y: n.y });
  }
}

function hoverAt(e: ToolPointer): void {
  const { doc, ui } = store().get();
  if (doc.editing?.length) return;
  hover = hitTest(doc, onBoard(e, doc), ui.zoom);
  setCursor(hover?.handle ? CURSOR[hover.handle] : hover ? 'move' : 'crosshair');
}

function overlay(g: CanvasRenderingContext2D, zoom: number): void {
  const { doc } = store().get();
  if (doc.editing?.length) return;
  const act = activeArtboard(doc);
  const px = 1 / zoom;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--chosen-bg').trim() || '#ffc94a';
  const toLocal = (b: Box): Box => ({ x: b.x - act.x, y: b.y - act.y, w: b.w, h: b.h });
  g.save();
  for (const b of boxes(doc)) {
    const r = toLocal(b);
    const open = b.id === act.id;
    g.lineWidth = (open ? 2 : 1) * px;
    g.setLineDash(open ? [] : [4 * px, 3 * px]);
    g.strokeStyle = open ? accent : hover?.id === b.id ? accent : 'rgb(128 128 128 / 0.8)';
    g.strokeRect(r.x, r.y, r.w, r.h);
  }
  g.setLineDash([]);
  // Handles on the open artboard.
  const ab = boxes(doc).find((b) => b.id === act.id)!;
  const hp = handlePoints(toLocal(ab));
  const s = 7 * px;
  for (const h of HANDLES) {
    g.fillStyle = '#ffffff';
    g.strokeStyle = accent;
    g.lineWidth = 1.5 * px;
    g.fillRect(hp[h].x - s / 2, hp[h].y - s / 2, s, s);
    g.strokeRect(hp[h].x - s / 2, hp[h].y - s / 2, s, s);
  }
  // What a drag will make.
  let ghost: Box | null = null;
  if (drag?.kind === 'resize') ghost = toLocal(drag.now);
  if (drag?.kind === 'new') {
    const a = drag.start;
    const b = drag.now;
    ghost = toLocal({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  }
  if (ghost) {
    g.lineWidth = 2 * px;
    g.setLineDash([6 * px, 4 * px]);
    g.strokeStyle = accent;
    g.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h);
    g.setLineDash([]);
    g.font = `${12 * px}px Nunito, Inter, system-ui, sans-serif`;
    g.fillStyle = accent;
    g.fillText(`${Math.round(ghost.w)} x ${Math.round(ghost.h)}`, ghost.x, ghost.y + ghost.h + 14 * px);
  }
  g.restore();
}

export const artboardTool: Tool = {
  id: 'artboard',
  label: 'Artboard',
  icon: 'artboard',
  key: 'Shift+W',
  layers: ['vector', 'pixel', 'tilemap', 'camera'],
  order: 85,
  help: 'artboards',
  cursor: 'crosshair',
  options: ArtboardToolOptions,
  down: (e) => down(e),
  move: (e, ctx) => {
    move(e);
    ctx.requestOverlay();
  },
  up: (e, ctx) => {
    up(e);
    ctx.requestOverlay();
  },
  hover: (e, ctx) => {
    hoverAt(e);
    ctx.requestOverlay();
  },
  cancel: (ctx) => {
    drag = null;
    ctx.requestOverlay();
  },
  overlay: (g, ctx) => overlay(g, ctx.zoom),
};

registerTool(artboardTool);
