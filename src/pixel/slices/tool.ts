// The Slice tool and the slices drawn on the canvas. Drag on the layer to cut out a rectangle; drag it to move, its edges
// to resize, the dashed lines of a 9-patch to move its borders, the cross of the pivot to move that. Delete removes it.
import { registerDecoration } from '../../canvas/decorations';
import type { PixelLayer, Slice } from '../../core/format';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../../core/registry';
import { store } from '../../core/store';
import { getPixelSettings } from '../settings';
import { SliceOptions } from './SliceOptions';
import { dragSlice, hitSlice, rectBetween, sliceAt, sliceColor, sliceLayers, type Grab, type Rect } from './model';
import { createSlice, deleteSlice, editSlice, pickedSlice, pickSlice, sliceLayer } from './state';

type Drag =
  | { kind: 'make'; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'edit'; id: string; layerId: string; start: Slice; grab: Grab; from: { x: number; y: number }; now: Slice };

let drag: Drag | null = null;

/** Where the pointer is on the layer's pixel grid, as a fraction (so handles can be near-hit). */
const at = (layer: PixelLayer, e: ToolPointer) => ({ x: e.x / layer.pixelSize, y: e.y / layer.pixelSize });
const snap = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
const reachFor = (layer: PixelLayer, ctx: ToolContext) => 7 / ctx.zoom / layer.pixelSize;

function drawSlice(g: CanvasRenderingContext2D, s: Slice, ps: number, px: number, opts: { picked: boolean; ghost?: boolean }): void {
  const color = sliceColor(s);
  const x = s.x * ps;
  const y = s.y * ps;
  const w = s.w * ps;
  const h = s.h * ps;
  g.save();
  g.globalAlpha = opts.ghost ? 0.7 : 1;
  g.fillStyle = color + '22';
  g.fillRect(x, y, w, h);
  g.lineWidth = (opts.picked ? 3 : 2) * px;
  g.strokeStyle = 'rgb(0 0 0 / 0.55)';
  g.strokeRect(x, y, w, h);
  g.lineWidth = (opts.picked ? 1.6 : 1) * px;
  g.strokeStyle = color;
  g.strokeRect(x, y, w, h);
  const c = s.center;
  if (c) {
    g.setLineDash([5 * px, 4 * px]);
    const lines: [number, number, number, number][] = [
      [c.x, s.y, c.x, s.y + s.h],
      [c.x + c.w, s.y, c.x + c.w, s.y + s.h],
      [s.x, c.y, s.x + s.w, c.y],
      [s.x, c.y + c.h, s.x + s.w, c.y + c.h],
    ];
    for (const [x0, y0, x1, y1] of lines) {
      g.beginPath();
      g.moveTo(x0 * ps, y0 * ps);
      g.lineTo(x1 * ps, y1 * ps);
      g.lineWidth = 3 * px;
      g.strokeStyle = 'rgb(0 0 0 / 0.5)';
      g.stroke();
      g.lineWidth = 1.2 * px;
      g.strokeStyle = color;
      g.stroke();
    }
    g.setLineDash([]);
  }
  if (s.pivot) {
    const cx = s.pivot.x * ps;
    const cy = s.pivot.y * ps;
    const r = 6 * px;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.moveTo(cx - r * 1.7, cy);
    g.lineTo(cx + r * 1.7, cy);
    g.moveTo(cx, cy - r * 1.7);
    g.lineTo(cx, cy + r * 1.7);
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgb(0 0 0 / 0.6)';
    g.stroke();
    g.lineWidth = 1.4 * px;
    g.strokeStyle = color;
    g.stroke();
  }
  // The name, in a small tag above the rectangle (below it at the top edge).
  const size = 11 * px;
  g.font = `700 ${size}px system-ui, sans-serif`;
  const tw = g.measureText(s.name).width + 8 * px;
  const ty = y - size - 4 * px < 0 ? y + h : y - size - 4 * px;
  g.fillStyle = color;
  g.fillRect(x, ty, tw, size + 4 * px);
  g.fillStyle = '#10131a';
  g.textBaseline = 'middle';
  g.fillText(s.name, x + 4 * px, ty + (size + 4 * px) / 2);
  g.restore();
}

/** The layer the slice being dragged is on (it may not be the active one: the tool picks slices of any shown pixel layer). */
function dragLayer(): PixelLayer | null {
  const d = drag;
  if (d?.kind !== 'edit') return sliceLayer();
  const l = store().get().doc.layers.find((x) => x.id === d.layerId);
  return l?.kind === 'pixel' ? l : sliceLayer();
}

/** Slices of the shown pixel layers, drawn whatever tool is picked (the Slices view option can hide them). */
registerDecoration((g, ctx) => {
  if (!getPixelSettings().showSlices) return;
  const { doc, ui } = store().get();
  const px = 1 / ctx.zoom;
  const id = pickedSlice();
  // A slice that changes between frames is drawn as it is at this frame.
  for (const l of sliceLayers(doc.layers)) for (const s of l.slices!) if (!(drag?.kind === 'edit' && drag.id === s.id)) drawSlice(g, sliceAt(s, ui.frame), l.pixelSize, px, { picked: s.id === id });
  if (drag?.kind === 'edit') {
    const l = dragLayer();
    if (l) drawSlice(g, drag.now, l.pixelSize, px, { picked: true, ghost: true });
  }
  if (drag?.kind === 'make') {
    const l = sliceLayer();
    if (!l) return;
    const r: Rect = rectBetween(drag.from, drag.to);
    drawSlice(g, { id: 'new', name: `${r.w} x ${r.h}`, ...r }, l.pixelSize, px, { picked: true, ghost: true });
  }
});

export const sliceTool: Tool = {
  id: 'slice',
  label: 'Slice',
  icon: 'slice',
  key: 'Shift+S',
  layers: ['pixel'],
  order: 36,
  group: 'select',
  groupAt: 4,
  help: 'pixel-slices',
  cursor: 'crosshair',
  options: SliceOptions,
  down(e, ctx) {
    const layer = sliceLayer();
    if (!layer) return ctx.hint('Slices go on a pixel layer. Pick one first.');
    const p = at(layer, e);
    const { doc, ui } = store().get();
    // The active layer's slices first, then the other shown pixel layers' from the top: a slice can be picked wherever it is.
    let hit: ReturnType<typeof hitSlice> = null;
    let on = layer;
    let at0 = p;
    for (const l of [layer, ...sliceLayers(doc.layers).reverse().filter((x) => x.id !== layer.id)]) {
      const q = l === layer ? p : at(l, e);
      hit = hitSlice((l.slices ?? []).map((s) => sliceAt(s, ui.frame)), q.x, q.y, reachFor(l, ctx));
      if (hit) {
        on = l;
        at0 = q;
        break;
      }
    }
    if (hit) {
      pickSlice(hit.slice.id);
      drag = { kind: 'edit', id: hit.slice.id, layerId: on.id, start: structuredClone(hit.slice), grab: hit.grab, from: snap(at0), now: structuredClone(hit.slice) };
    } else {
      pickSlice(null);
      drag = { kind: 'make', from: snap(p), to: snap(p) };
    }
    ctx.requestOverlay();
  },
  move(e, ctx) {
    const layer = dragLayer();
    if (!drag || !layer) return;
    const p = snap(at(layer, e));
    if (drag.kind === 'make') drag.to = p;
    else drag.now = dragSlice(drag.start, drag.grab, p.x - drag.from.x, p.y - drag.from.y);
    ctx.requestOverlay();
  },
  up(_e, ctx) {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.kind === 'make') {
      // A click without a drag makes nothing; a drag of at least one pixel makes a slice.
      if (d.from.x !== d.to.x || d.from.y !== d.to.y) createSlice(rectBetween(d.from, d.to));
    } else if (JSON.stringify(d.now) !== JSON.stringify(d.start)) {
      const now = d.now;
      editSlice(d.grab === 'body' ? 'Move slice' : d.grab === 'pivot' ? 'Move slice pivot' : 'Resize slice', d.id, (s) => Object.assign(s, { x: now.x, y: now.y, w: now.w, h: now.h, center: now.center, pivot: now.pivot }));
    }
    ctx.requestOverlay();
  },
  cancel(ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  leave() {
    drag = null;
  },
  onKey(e, ctx) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return false;
    const id = pickedSlice();
    if (!id) return false;
    deleteSlice(id);
    ctx.requestOverlay();
    return true;
  },
};

registerTool(sliceTool);
