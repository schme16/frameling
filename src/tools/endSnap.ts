/**
 * A freehand stroke's start and end pulled onto things (the end of another line, a guide, the grid, the page), shared by
 * the brush, the pencil and its clean line. Only the first point and the tip are ever moved: the middle of a stroke is
 * the hand's own, and a line that jumped onto the grid while you drew it would be horrible. The tip is aimed on every
 * move and only becomes a point when the stroke is finished. Two kinds of pull, told apart on purpose:
 *   - onto the end of another line (or the stroke's own start): the line you see ends there as you go (`tip`), because
 *     such a place is something you aimed at and there are few of them;
 *   - onto a guide, the grid or the page: the line that would take it lights up, but the stroke stays where the hand is
 *     until you let go (`landing`), because a grid has a line every few pixels and a tip that chased them would shake.
 */
import { clearSnap, closesLoop, drawSnapOn, findDrawSnap, showDrawSnap, snapDrawPoint } from '../canvas/guides';
import type { ToolPointer } from '../core/registry';
import type { Pt } from '../canvas/view';

export class EndSnap {
  /** Off (switch, tick, or a pixel layer): every call below does nothing and costs nothing. */
  private readonly on = drawSnapOn();
  /** Where the line is seen to end, when that is on the end of another line (or its own start), or null. */
  tip: Pt | null = null;
  /** Where the line will end if you let go now (the tip, or a guide, the grid or the page), or null for where the hand is. */
  landing: Pt | null = null;
  private first: Pt | null = null;
  private prev: Pt | null = null;
  private travelled = 0;

  /** The stroke's first point: pulled if it starts near something. */
  start(e: ToolPointer, zoom: number): Pt {
    if (!this.on) return e;
    const p = snapDrawPoint(e, zoom, e.mod);
    this.first = { x: p.x, y: p.y };
    this.prev = { x: e.x, y: e.y };
    return p;
  }

  /** The pointer moved: works out where the tip would be pulled to. A long stroke can close on its own start. */
  aim(e: ToolPointer, zoom: number): void {
    if (!this.on) return;
    if (this.prev) this.travelled += Math.hypot(e.x - this.prev.x, e.y - this.prev.y);
    this.prev = { x: e.x, y: e.y };
    const own = this.first && closesLoop(this.travelled, zoom) ? this.first : null;
    const hit = findDrawSnap(e, zoom, e.mod, own);
    showDrawSnap(hit);
    this.landing = hit ? hit.pt : null;
    this.tip = hit?.mark ? hit.pt : null;
  }

  /** Lets go of the tip and the marks on the canvas. */
  stop(): void {
    this.tip = null;
    this.landing = null;
    if (this.on) clearSnap();
  }
}

let spot: Pt | null = null;

/** Hovering before a stroke: where it would start if you pressed now (and the ring shows), or null. */
export function hoverStart(e: ToolPointer, zoom: number): void {
  if (!drawSnapOn()) {
    if (spot) forgetHover();
    return;
  }
  const p = snapDrawPoint(e, zoom, e.mod);
  spot = p === e ? null : p;
}

/** Where the next stroke would start, when that is not under the pointer. */
export const hoverSpot = (): Pt | null => spot;

export function forgetHover(): void {
  spot = null;
  clearSnap();
}
