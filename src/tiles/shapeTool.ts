/**
 * The Collision tool: draws the shape a tile blocks things with, on the tile while it is open on the canvas. Drag for a
 * box, or click corners for a many-sided shape (click the first corner again, or press Enter, to close it). Drag a
 * corner to move it, drag inside the picked shape to move the whole shape, Delete removes it.
 *
 * It switches on by itself when you press Box or Shape in the Tileset panel, so it has no place on the tool rail.
 */
import type { TileShape } from '../core/format';
import { getHover } from '../canvas/controller';
import { type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { drawOutline, SHAPE_LINE } from './collisionView';
import { addShape, editingTileKey, setShapes, tileProps } from './ops';
import { getTileUi } from './state';
import { boxFromCorners, moveShape, shapeHas, shapePoints, validShape, type Pt } from './shapes';
import { ShapeToolOptions } from './ShapeToolOptions';

type Drag =
  | { kind: 'box'; from: Pt; to: Pt }
  | { kind: 'corner'; index: number; corner: number; at: Pt }
  | { kind: 'move'; index: number; from: Pt; shape: TileShape };

let draft: Pt[] = [];
let drag: Drag | null = null;
let selected = -1;
let ctxNow: ToolContext | null = null;
/** The tile the picked shape and the half-made one belong to. A different tile starts clean. */
let forTile = 0;
function sync(): number {
  const key = editingTileKey();
  if (key !== forTile) {
    forTile = key;
    selected = -1;
    draft = [];
    drag = null;
  }
  return key;
}

const snap = (p: Pt, tw: number, th: number): Pt => ({ x: Math.max(0, Math.min(tw, Math.round(p.x))), y: Math.max(0, Math.min(th, Math.round(p.y))) });
const size = () => {
  const ts = store().rootDoc().tileset;
  return { tw: ts?.tileWidth ?? 16, th: ts?.tileHeight ?? 16 };
};
const near = (a: Pt, b: Pt, zoom: number) => Math.hypot(a.x - b.x, a.y - b.y) * zoom <= 8;

/** The shapes as they look right now, with a drag in progress applied. */
function shown(key: number): TileShape[] {
  const shapes = tileProps(key).collision?.shapes ?? [];
  const d = drag;
  if (d?.kind === 'corner') return shapes.map((s, i) => (i === d.index ? cornerMoved(s, d.corner, d.at) : s));
  if (d?.kind === 'move') return shapes.map((s, i) => (i === d.index ? d.shape : s));
  return shapes;
}

/** Which corner (of which shape) is under a point. The index of a corner is its place in `shapePoints`. */
function cornerAt(shapes: TileShape[], p: Pt, zoom: number): { index: number; corner: number } | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const pts = shapePoints(shapes[i]);
    for (let c = 0; c < pts.length; c++) if (near(pts[c], p, zoom)) return { index: i, corner: c };
  }
  return null;
}

/** A shape with one corner moved. A box moves the corner and keeps the opposite one fixed. */
function cornerMoved(s: TileShape, corner: number, to: Pt): TileShape {
  const { tw, th } = size();
  if (s.kind === 'polygon') return { kind: 'polygon', points: s.points.map((p, i) => (i === corner ? to : p)) };
  const opp = shapePoints(s)[(corner + 2) % 4];
  return boxFromCorners(opp.x, opp.y, to.x, to.y, tw, th);
}

function closeDraft(key: number, ctx: ToolContext): void {
  const poly: TileShape = { kind: 'polygon', points: draft };
  draft = [];
  if (validShape(poly)) {
    addShape(key, poly);
    selected = (tileProps(key).collision?.shapes.length ?? 1) - 1;
  } else ctx.hint('A shape needs at least three corners that are not in a line.');
  ctx.requestOverlay();
}

export const tileShapeTool: Tool = {
  id: 'tile-shape',
  label: 'Collision shape',
  commandLabel: 'Collision shape (draw what a tile blocks)',
  icon: 'polygon',
  layers: ['pixel'],
  railless: true,
  help: 'tile-collision',
  cursor: 'crosshair',
  options: ShapeToolOptions,
  down(e: ToolPointer, ctx) {
    ctxNow = ctx;
    const key = sync();
    if (!key) return ctx.hint('Open a tile first: double-click it in the Tileset panel, then draw its shape.');
    const { tw, th } = size();
    const p = snap(e, tw, th);
    const shapes = tileProps(key).collision?.shapes ?? [];
    if (draft.length) {
      if (draft.length >= 3 && near(draft[0], p, ctx.zoom)) closeDraft(key, ctx);
      else if (!draft.some((q) => q.x === p.x && q.y === p.y)) draft.push(p);
      ctx.requestOverlay();
      return;
    }
    const c = cornerAt(shapes, e, ctx.zoom);
    if (c) {
      selected = c.index;
      drag = { kind: 'corner', index: c.index, corner: c.corner, at: shapePoints(shapes[c.index])[c.corner] };
      return;
    }
    if (selected >= 0 && shapes[selected] && shapeHas(shapes[selected], e.x, e.y)) {
      drag = { kind: 'move', index: selected, from: p, shape: shapes[selected] };
      return;
    }
    if (getTileUi().shapeMode === 'polygon') {
      draft = [p];
      ctx.requestOverlay();
      return;
    }
    drag = { kind: 'box', from: p, to: p };
  },
  move(e, ctx) {
    ctxNow = ctx;
    const { tw, th } = size();
    const p = snap(e, tw, th);
    if (!drag) return;
    const key = editingTileKey();
    if (drag.kind === 'box') drag.to = p;
    else if (drag.kind === 'corner') drag.at = p;
    else {
      const orig = tileProps(key).collision?.shapes[drag.index];
      if (orig) drag.shape = moveShape(orig, p.x - drag.from.x, p.y - drag.from.y, tw, th);
    }
    ctx.requestOverlay();
  },
  up(e, ctx) {
    const key = sync();
    const d = drag;
    drag = null;
    if (!d || !key) return;
    const { tw, th } = size();
    const shapes = tileProps(key).collision?.shapes ?? [];
    if (d.kind === 'box') {
      const small = d.from.x === d.to.x && d.from.y === d.to.y;
      if (small) {
        // A click with no drag picks the shape under it.
        const hit = [...shapes.keys()].reverse().find((i) => shapeHas(shapes[i], e.x, e.y));
        selected = hit ?? -1;
      } else {
        addShape(key, boxFromCorners(d.from.x, d.from.y, d.to.x, d.to.y, tw, th));
        selected = (tileProps(key).collision?.shapes.length ?? 1) - 1;
      }
    } else if (d.kind === 'corner') {
      const next = shapes[d.index] ? cornerMoved(shapes[d.index], d.corner, snap(e, tw, th)) : null;
      if (next && JSON.stringify(next) !== JSON.stringify(shapes[d.index])) setShapes(key, shapes.map((s, i) => (i === d.index ? next : s)), 'Move a shape corner');
    } else if (JSON.stringify(d.shape) !== JSON.stringify(shapes[d.index])) {
      setShapes(key, shapes.map((s, i) => (i === d.index ? d.shape : s)), 'Move a collision shape');
    }
    ctx.requestOverlay();
  },
  hover(_e, ctx) {
    ctxNow = ctx;
    ctx.requestOverlay();
  },
  cancel() {
    draft = [];
    drag = null;
    ctxNow?.requestOverlay();
  },
  leave() {
    draft = [];
    drag = null;
  },
  onKey(e, ctx) {
    const key = sync();
    if (!key) return false;
    if (e.key === 'Enter' && draft.length >= 3) {
      closeDraft(key, ctx);
      return true;
    }
    if (e.key === 'Backspace' && draft.length) {
      draft.pop();
      ctx.requestOverlay();
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !draft.length) {
      const shapes = tileProps(key).collision?.shapes ?? [];
      if (selected >= 0 && shapes[selected]) {
        setShapes(key, shapes.filter((_, i) => i !== selected), 'Remove a collision shape');
        selected = -1;
        ctx.requestOverlay();
        return true;
      }
    }
    return false;
  },
  overlay(g, ctx) {
    ctxNow = ctx;
    const key = sync();
    if (!key) return;
    const { tw, th } = size();
    const props = tileProps(key);
    const shapes = shown(key);
    // The tile's edge, so it is clear where the shape can go.
    g.save();
    g.lineWidth = 1 / ctx.zoom;
    g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    g.setLineDash([3 / ctx.zoom, 3 / ctx.zoom]);
    g.strokeRect(0, 0, tw, th);
    g.restore();
    shapes.forEach((s, i) => drawOutline(g, [shapePoints(s)], ctx.zoom, { oneWay: props.collision?.oneWay, weight: i === selected ? 2.5 : 1.5 }));
    // The box being dragged out.
    if (drag?.kind === 'box') drawOutline(g, [shapePoints(boxFromCorners(drag.from.x, drag.from.y, drag.to.x, drag.to.y, tw, th))], ctx.zoom, { weight: 2 });
    // The many-sided shape being built, with a line to where the next corner would go.
    const hover = hoverPoint(tw, th);
    if (draft.length) {
      g.save();
      g.lineWidth = 2 / ctx.zoom;
      g.strokeStyle = SHAPE_LINE;
      g.beginPath();
      draft.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (hover) g.lineTo(hover.x, hover.y);
      g.stroke();
      g.restore();
    }
    // Corner handles.
    g.save();
    const r = 4 / ctx.zoom;
    const handles = [...(draft.length ? [draft] : []), ...shapes.map((s) => shapePoints(s))];
    for (const pts of handles) {
      for (const p of pts) {
        g.beginPath();
        g.rect(p.x - r, p.y - r, 2 * r, 2 * r);
        g.fillStyle = '#fff';
        g.fill();
        g.lineWidth = 1.5 / ctx.zoom;
        g.strokeStyle = SHAPE_LINE;
        g.stroke();
      }
    }
    g.restore();
  },
};

function hoverPoint(tw: number, th: number): Pt | null {
  const h = getHover();
  return h ? snap(h, tw, th) : null;
}
