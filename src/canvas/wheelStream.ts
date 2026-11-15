/**
 * Telling a mouse wheel from a trackpad pinch by watching the run of events, not by how big one of them is. A
 * high-resolution wheel sends lots of small whole-number events, which used to look like a pinch and zoom far too
 * fast. A real pinch arrives as Ctrl+wheel with fractional deltas, so that is what counts. It also lets a
 * NotchLearner hear the plain wheel events, so a notch zooms the same on a wheel that says 45 as on one that says 100.
 * Nothing here adds events up: the zoom is e to the power of the distance turned, so a burst of small events multiplies
 * out to the same zoom as one big one. Pure, so it can be tested.
 */
import type { ZoomStep } from './input';
import { wheelPixels, wheelZoomFactor } from './view';
import { NotchLearner } from './wheelNotch';

/** How far back the stream looks. */
export const STREAM_WINDOW_MS = 250;

export type WheelKind = 'wheel' | 'pinch';

export interface WheelEventLike {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey?: boolean;
}

/** Whole numbers, give or take rounding. */
export function isWhole(n: number): boolean {
  return Math.abs(n - Math.round(n)) < 0.01;
}

/** Zoom speed multipliers for the Zoom speed preference. */
export type ZoomSpeed = 'slow' | 'normal' | 'fast';
export const ZOOM_SPEED_SCALE: Record<ZoomSpeed, number> = { slow: 0.6, normal: 1, fast: 1.6 };

export interface WheelReading {
  kind: WheelKind;
  factor: number;
  /** Events in the window, this one included. */
  burst: number;
  /** How many pixels this wheel says for one notch, as learned so far. */
  notch: number;
}

export class WheelStream {
  private seen: { t: number; fractional: boolean }[] = [];

  constructor(private learner: NotchLearner = new NotchLearner()) {}

  /** The notch learned so far. */
  get notch(): number {
    return this.learner.notch;
  }

  /** Take one event, returning what it is and how much it zooms. `dpr` is the screen scaling, `t` the time in ms. */
  read(e: WheelEventLike, t: number, opts: { step?: ZoomStep; dpr?: number; speed?: number } = {}): WheelReading {
    const dpr = opts.dpr ?? 1;
    // Whole either as sent or once the screen scaling is divided out: a plain wheel is one or the other.
    const fractional = e.deltaMode === 0 && !isWhole(e.deltaY) && !isWhole(wheelPixels(e.deltaY, 0, dpr));
    this.seen = this.seen.filter((s) => t - s.t < STREAM_WINDOW_MS);
    this.seen.push({ t, fractional });
    const ctrl = e.ctrlKey || !!e.metaKey;
    const kind: WheelKind = ctrl && e.deltaMode === 0 && this.seen.some((s) => s.fractional) ? 'pinch' : 'wheel';
    // Only a plain wheel teaches the notch: not a pinch, and not a fractional trackpad scroll.
    if (kind === 'wheel' && !fractional) this.learner.see(wheelPixels(e.deltaY, e.deltaMode, dpr));
    const notch = this.learner.notch;
    return { kind, factor: wheelZoomFactor(e.deltaY, e.deltaMode, opts.step ?? 'normal', kind, dpr, opts.speed ?? 1, notch), burst: this.seen.length, notch };
  }

  reset(): void {
    this.seen = [];
  }
}
