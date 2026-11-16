/** Drawing collision shapes over the canvas: the one tile being shaped, and every tile on a map. */
import { drawingAt, tileOrigin } from '../core/doc';
import type { Doc, TileCollision, TilemapLayer } from '../core/format';
import { cellFlags, cellKey, flagMatrix } from './model';
import { shapePoints, type Pt } from './shapes';

export const SHAPE_FILL = 'rgba(255, 77, 122, 0.28)';
export const SHAPE_LINE = '#ff4d7a';

/** A shape's corners as they land in a slot of a map: turned or mirrored as the cell says, scaled, moved to the slot. */
export function slotPoints(c: TileCollision, flags: number, tw: number, th: number, ox: number, oy: number, k: number): Pt[][] {
  const [a, b, cc, d] = flagMatrix(flags);
  return c.shapes.map((s) =>
    shapePoints(s).map((p) => {
      const u = p.x - tw / 2;
      const v = p.y - th / 2;
      return { x: ox + (a * u + cc * v + tw / 2) * k, y: oy + (b * u + d * v + th / 2) * k };
    }),
  );
}

function trace(g: CanvasRenderingContext2D, pts: Pt[]): void {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}

/** Fills and outlines one set of shapes (document pixels). `oneWay` draws a dashed line, `weight` thickens it. */
export function drawOutline(g: CanvasRenderingContext2D, shapes: Pt[][], zoom: number, o: { oneWay?: boolean; weight?: number; fill?: boolean } = {}): void {
  g.save();
  g.lineJoin = 'round';
  g.lineWidth = (o.weight ?? 1.5) / zoom;
  if (o.oneWay) g.setLineDash([4 / zoom, 3 / zoom]);
  for (const pts of shapes) {
    trace(g, pts);
    if (o.fill !== false) {
      g.fillStyle = SHAPE_FILL;
      g.fill();
    }
    g.strokeStyle = SHAPE_LINE;
    g.stroke();
  }
  g.restore();
}

/** The shapes of every tile on the map that can be seen, over the map. */
export function drawMapCollision(g: CanvasRenderingContext2D, doc: Doc, layer: TilemapLayer, frame: number, zoom: number): void {
  const ts = doc.tileset;
  const d = drawingAt(doc, layer, frame);
  if (!ts || !d || d.kind !== 'tilemap') return;
  const solid = new Map(ts.tiles.filter((t) => t.collision?.shapes.length).map((t) => [t.key, t.collision!]));
  if (!solid.size) return;
  const k = layer.pixelSize;
  const o = tileOrigin(doc, k);
  const sw = ts.tileWidth * k;
  const sh = ts.tileHeight * k;
  // Only the slots the canvas can see.
  const inv = g.getTransform().inverse();
  const cw = (g.canvas as { width: number }).width;
  const ch = (g.canvas as { height: number }).height;
  const corners = [inv.transformPoint({ x: 0, y: 0 }), inv.transformPoint({ x: cw, y: 0 }), inv.transformPoint({ x: 0, y: ch }), inv.transformPoint({ x: cw, y: ch })];
  const x0 = Math.max(0, Math.floor((Math.min(...corners.map((p) => p.x)) - o.x) / sw));
  const x1 = Math.min(d.columns - 1, Math.floor((Math.max(...corners.map((p) => p.x)) - o.x) / sw));
  const y0 = Math.max(0, Math.floor((Math.min(...corners.map((p) => p.y)) - o.y) / sh));
  const y1 = Math.min(d.rows - 1, Math.floor((Math.max(...corners.map((p) => p.y)) - o.y) / sh));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = d.cells[y * d.columns + x];
      const c = v ? solid.get(cellKey(v)) : undefined;
      if (!c) continue;
      drawOutline(g, slotPoints(c, cellFlags(v), ts.tileWidth, ts.tileHeight, o.x + x * sw, o.y + y * sh, k), zoom, { oneWay: c.oneWay, weight: 1.25 });
    }
  }
}
