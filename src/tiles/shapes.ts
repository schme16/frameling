/**
 * Collision shapes of a tile as plain functions: boxes and polygons in art pixels from the tile's top-left corner,
 * the checks the editor needs (is this a real shape, is a point inside), and how they leave for Godot.
 */
import type { Tile, TileCollision, TileShape } from '../core/format';
import { area2, cleanCollision, validShape } from '../core/tileFormat';

export type Pt = { x: number; y: number };

/** A box covering all of a tile. */
export const wholeTileBox = (w: number, h: number): TileShape => ({ kind: 'box', x: 0, y: 0, w, h });

/** A box from two corners, in whatever order they came, at least one pixel each way and kept inside the tile. */
export function boxFromCorners(ax: number, ay: number, bx: number, by: number, tw: number, th: number): TileShape {
  const x0 = clamp(Math.round(Math.min(ax, bx)), 0, tw - 1);
  const y0 = clamp(Math.round(Math.min(ay, by)), 0, th - 1);
  const x1 = clamp(Math.round(Math.max(ax, bx)), x0 + 1, tw);
  const y1 = clamp(Math.round(Math.max(ay, by)), y0 + 1, th);
  return { kind: 'box', x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The corners of a shape, clockwise from the top left. */
export function shapePoints(s: TileShape): Pt[] {
  if (s.kind === 'polygon') return s.points.map((p) => ({ x: p.x, y: p.y }));
  return [
    { x: s.x, y: s.y },
    { x: s.x + s.w, y: s.y },
    { x: s.x + s.w, y: s.y + s.h },
    { x: s.x, y: s.y + s.h },
  ];
}

export { validShape, cleanCollision };

/** Is the point inside the shape? */
export function shapeHas(s: TileShape, x: number, y: number): boolean {
  if (s.kind === 'box') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  const p = s.points;
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i].y > y !== p[j].y > y && x < ((p[j].x - p[i].x) * (y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) inside = !inside;
  }
  return inside;
}

/** Does a box cover the whole tile? */
export function isWholeTile(s: TileShape, tw: number, th: number): boolean {
  return s.kind === 'box' && s.x === 0 && s.y === 0 && s.w === tw && s.h === th;
}

/** The shapes pulled back inside a tile of this size; a shape squashed flat is dropped. Whole-tile boxes follow the size. */
export function fitShapes(shapes: TileShape[], from: { w: number; h: number }, to: { w: number; h: number }): TileShape[] {
  const out: TileShape[] = [];
  for (const s of shapes) {
    let n: TileShape;
    if (isWholeTile(s, from.w, from.h)) n = wholeTileBox(to.w, to.h);
    else if (s.kind === 'box') n = boxFromCorners(s.x, s.y, s.x + s.w, s.y + s.h, to.w, to.h);
    else n = { kind: 'polygon', points: s.points.map((p) => ({ x: clamp(p.x, 0, to.w), y: clamp(p.y, 0, to.h) })) };
    if (validShape(n)) out.push(n);
  }
  return out;
}

/** A shape moved by (dx, dy), kept inside the tile. */
export function moveShape(s: TileShape, dx: number, dy: number, tw: number, th: number): TileShape {
  const pts = shapePoints(s);
  const lo = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
  const hi = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
  const ox = clamp(dx, -lo.x, tw - hi.x);
  const oy = clamp(dy, -lo.y, th - hi.y);
  if (s.kind === 'box') return { ...s, x: s.x + ox, y: s.y + oy };
  return { kind: 'polygon', points: s.points.map((p) => ({ x: p.x + ox, y: p.y + oy })) };
}

/** Each shape as polygon points for Godot: from the tile's centre, in the picture's pixels (art pixels times `scale`). */
export function godotPolygons(c: TileCollision, tw: number, th: number, scale: number): Pt[][] {
  return c.shapes.filter(validShape).map((s) => {
    let pts = shapePoints(s).map((p) => ({ x: (p.x - tw / 2) * scale, y: (p.y - th / 2) * scale }));
    // Godot wants one winding for every polygon; clockwise on screen is what its editor draws.
    if (area2(pts) < 0) pts = pts.reverse();
    return pts;
  });
}

/** How many tiles of a tileset block anything. */
export const solidCount = (tiles: Tile[]): number => tiles.filter((t) => t.collision?.shapes.length).length;
