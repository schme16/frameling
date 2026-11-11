/**
 * The decisions behind wheel and Space input, kept apart from the DOM so they can be tested: what a wheel event
 * means under the person's wheel preference, and whether a Space press counts as a tap.
 */
import type { WheelMode } from './choices';

export type WheelIntent = { kind: 'zoom'; factorDelta: number } | { kind: 'pan'; dx: number; dy: number };

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Ctrl (and a trackpad pinch, which Chromium reports as ctrl+wheel) always zooms. Otherwise 'zoom' mode zooms with
 * the wheel and sends Shift+wheel sideways; 'scroll' mode pans. Two-finger trackpad scrolling carries sideways
 * movement, so it pans in either mode instead of zooming under the person's fingers.
 */
export function wheelIntent(e: WheelLike, mode: WheelMode): WheelIntent {
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  let dx = e.deltaX * scale;
  let dy = e.deltaY * scale;
  if (e.ctrlKey || e.metaKey) return { kind: 'zoom', factorDelta: e.deltaY };
  if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
  const sideways = e.shiftKey || dx !== 0;
  if (mode === 'zoom' && !sideways) return { kind: 'zoom', factorDelta: e.deltaY };
  return { kind: 'pan', dx, dy };
}

/** A press of Space released within this long, without a drag, is a tap. */
export const SPACE_TAP_MS = 200;

/** Tracks one Space press. A pointer press while it's held (a pan) or another key spoils the tap. */
export class SpaceTap {
  private down: number | null = null;
  private spoiled = false;

  /** Space went down (repeats from holding it don't restart the clock). */
  press(now: number): void {
    if (this.down === null) {
      this.down = now;
      this.spoiled = false;
    }
  }

  /** A drag, another key or anything else that means Space is being used as a modifier. */
  spoil(): void {
    this.spoiled = true;
  }

  /** Space came up: was that a tap? */
  release(now: number): boolean {
    const d = this.down;
    this.down = null;
    return d !== null && !this.spoiled && now - d <= SPACE_TAP_MS;
  }

  reset(): void {
    this.down = null;
  }
}

/** Whether a press landed on a control laid over the canvas, which should get the press instead of the tools. */
export function pressesControl(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('button, a[href], select, [role="button"]');
}
