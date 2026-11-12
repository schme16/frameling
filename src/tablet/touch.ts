// Fingers and palms: ignoring them while a pen is near the screen, and turning two fingers into pan and zoom. Pure.
import { clampZoom, zoomAbout, type Pt, type View } from '../canvas/view';
import { getPen } from './settings';

/** How long after the pen was last seen a touch is still taken for a resting palm, in milliseconds. */
export const PALM_GRACE_MS = 400;
/** A pen that stops reporting without saying it left (some drivers) is taken as gone after this long, in milliseconds. */
export const PEN_RANGE_TIMEOUT_MS = 10000;

/** Tracks whether a pen is near the screen or touching it, so fingers and palms can be ignored meanwhile. */
export class PenTracker {
  private lastSeen = -Infinity;
  private inRange = false;
  private touching = false;

  /** A pen event of any kind (hovering or drawing). */
  seen(now: number): void {
    this.lastSeen = now;
    this.inRange = true;
  }
  down(now: number): void {
    this.seen(now);
    this.touching = true;
  }
  up(now: number): void {
    this.lastSeen = now;
    this.touching = false;
  }
  /** The pen left the screen's range. */
  left(now: number): void {
    this.lastSeen = now;
    this.inRange = false;
    this.touching = false;
  }
  /** True while the pen is touching, or near the screen, or only just lifted away. */
  active(now: number): boolean {
    if (this.touching) return true;
    if (this.inRange && now - this.lastSeen < PEN_RANGE_TIMEOUT_MS) return true;
    return now - this.lastSeen < PALM_GRACE_MS;
  }
  /** Should a finger on the screen be ignored right now? */
  rejectsTouch(now: number): boolean {
    return getPen().touch.palmRejection && this.active(now);
  }
}

export interface PinchStart {
  a: Pt;
  b: Pt;
  view: View;
}

/** The view for two fingers now, given where they started: zoom by how far apart they are, pan by where their middle went. */
export function pinchView(start: PinchStart, a: Pt, b: Pt): View {
  const d0 = Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y);
  const d1 = Math.hypot(b.x - a.x, b.y - a.y);
  const ratio = d0 > 1 && d1 > 1 ? d1 / d0 : 1;
  const m0 = { x: (start.a.x + start.b.x) / 2, y: (start.a.y + start.b.y) / 2 };
  const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const z = zoomAbout(start.view, clampZoom(start.view.zoom * ratio), m0.x, m0.y);
  return { zoom: z.zoom, panX: z.panX + (m1.x - m0.x), panY: z.panY + (m1.y - m0.y) };
}
