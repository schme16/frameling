// Where the tool rail lands when it is carried by its grip, as plain functions so the rules can be tested without a
// window. Every place the rail can live is a drop target, and a drop that isn't on one puts the rail back.
//
//   a band along each outer edge of the work area   the rail docks on that side (the left and right bands win the corners)
//   the canvas                                      the rail floats there, where it was let go
//   anywhere else (the top bar, the panels, outside)  nowhere: the rail goes back to where it was picked up
import type { DockZone, ToolsPlace } from './dockModel';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The three boxes the rules read: the whole work area (left and right edges), the middle column (top and bottom edges), the canvas. */
export interface RailGeometry {
  body: Box;
  center: Box;
  canvas: Box;
}

/** How thick the drop bands along the edges are. */
export const RAIL_BAND = 64;
/** The top and bottom bands are a little thinner, so they leave the corners to the left and right ones. */
export const RAIL_BAND_FLAT = RAIL_BAND - 8;

export type RailDrop = { dock: DockZone } | { float: true } | null;

const inside = (b: Box, x: number, y: number): boolean => x >= b.left && x < b.right && y >= b.top && y < b.bottom;

/** The drop bands: where each side's band is on screen. */
export function railBands(g: RailGeometry): Record<DockZone, Box> {
  return {
    left: { left: g.body.left, top: g.body.top, right: g.body.left + RAIL_BAND, bottom: g.body.bottom },
    right: { left: g.body.right - RAIL_BAND, top: g.body.top, right: g.body.right, bottom: g.body.bottom },
    top: { left: g.center.left, top: g.center.top, right: g.center.right, bottom: g.center.top + RAIL_BAND_FLAT },
    bottom: { left: g.center.left, top: g.center.bottom - RAIL_BAND_FLAT, right: g.center.right, bottom: g.center.bottom },
  };
}

/** What letting go at a point would do. */
export function railDropAt(x: number, y: number, g: RailGeometry): RailDrop {
  const bands = railBands(g);
  for (const z of ['left', 'right', 'top', 'bottom'] as DockZone[]) if (inside(bands[z], x, y)) return { dock: z };
  return inside(g.canvas, x, y) ? { float: true } : null;
}

export interface RailStart {
  place: ToolsPlace;
  x: number;
  y: number;
}

export interface RailSettled {
  place: ToolsPlace;
  /** Where it floats (only when it floats). */
  at?: { x: number; y: number };
}

/**
 * Where the rail ends up. A drop on a side docks it there; a drop on the canvas floats it where the pointer let go;
 * a drop nowhere, or Escape, puts it back where it was picked up (the side, or the spot it was floating at).
 */
export function settleRail(ok: boolean, drop: RailDrop, was: RailStart, floatAt: { x: number; y: number }): RailSettled {
  if (ok && drop) return 'dock' in drop ? { place: drop.dock } : { place: 'float', at: floatAt };
  return was.place === 'float' ? { place: 'float', at: { x: was.x, y: was.y } } : { place: was.place };
}

/** Where the carried rail's corner goes so the grip stays under the pointer, kept on the screen. */
export function railCorner(px: number, py: number, grab: { x: number; y: number }, win: { w: number; h: number }): { x: number; y: number } {
  return { x: Math.max(0, Math.min(px - grab.x, win.w - 60)), y: Math.max(0, Math.min(py - grab.y, win.h - 60)) };
}

/** Whether a press at `x` (screen) is on the resize edge of a docked rail, which belongs to the rail's width and not to the grip. */
export function inRailEdge(x: number, rail: Pick<Box, 'left' | 'right'>, side: ToolsPlace, edge = 6): boolean {
  if (side === 'left') return x >= rail.right - edge;
  if (side === 'right') return x <= rail.left + edge;
  return false;
}

const SIDE_WORDS: Record<DockZone, string> = { left: 'the left', right: 'the right', top: 'the top', bottom: 'the bottom' };

/** What the label by the pointer says. `home` is the side the rail was on when it was picked up (null: it was floating). */
export function railDropNote(drop: RailDrop, home: DockZone | null): string {
  if (!drop) return 'let go to put it back';
  if ('float' in drop) return 'float here';
  return drop.dock === home ? `back on ${SIDE_WORDS[drop.dock]}, as it was` : `dock on ${SIDE_WORDS[drop.dock]}`;
}
