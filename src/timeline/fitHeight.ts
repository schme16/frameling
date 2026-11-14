/**
 * Giving the Timeline the height its layers need. The panel docks at the bottom with a fixed height (a couple of layer
 * rows), so a file with eleven layers scrolled two rows at a time until you dragged it bigger by hand. Opening a file
 * now grows it to fit its layers, within reason, and "Fit layers" does the same on request. It only ever grows: a height
 * you chose yourself is never taken back.
 */
import { dock, locate, resizeZone, zoneOf } from '../ui/dock';
import { MAX_SIZE, MIN_SIZE } from '../ui/dockModel';
import { toast } from '../ui/toast';
import { store } from '../core/store';

/** How much of the window's height the timeline may take when it grows by itself (the rest stays for drawing). */
export const MAX_SHARE = 0.5;

/**
 * The height the zone should have: the current one plus what is hidden (`overflow` px of layers below the fold), kept
 * within the window's share and the zone's own largest size. Never smaller than it is now.
 */
export function fittedSize(current: number, overflow: number, windowH: number): number {
  if (!(overflow > 0)) return current;
  const cap = Math.max(MIN_SIZE.bottom, Math.min(MAX_SIZE.bottom, Math.floor(windowH * MAX_SHARE)));
  return Math.max(current, Math.min(current + Math.ceil(overflow), cap));
}

/** How many px of layers are out of sight in the timeline right now (0 when nothing is cut off, or it is not showing). */
export function hiddenHeight(): number {
  const el = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.tl-root .tl-body[data-scrolls]');
  if (!el || !el.clientHeight) return 0;
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/** Grows the bottom zone so the layers show, if the timeline is docked there and open. Returns what happened. */
export function fitLayers(): 'grew' | 'fits' | 'capped' | 'elsewhere' {
  const l = dock.get().layout;
  if (locate(l, 'timeline') === null || zoneOf('timeline', l) !== 'bottom' || l.zones.bottom.collapsed) return 'elsewhere';
  const over = hiddenHeight();
  if (over <= 0) return 'fits';
  const now = l.zones.bottom.size;
  const next = fittedSize(now, over, typeof window === 'undefined' ? 0 : window.innerHeight);
  if (next <= now) return 'capped';
  resizeZone('bottom', next);
  // Still cut off at the cap: the rest scrolls, which is what the cap is for.
  return next - now < over ? 'capped' : 'grew';
}

/** The command: fits and says what it did in plain words. */
export function fitLayersCommand(): void {
  const r = fitLayers();
  if (r === 'fits') toast('All your layers are already showing.');
  else if (r === 'elsewhere') toast('Fit layers works on the Timeline when it sits along the bottom.');
  else if (r === 'capped') toast('The Timeline is as tall as it can go without squeezing your drawing. The rest of the layers scroll.');
}

/**
 * When a file opens, grow the timeline to its layers once the panel has drawn them. Waits a moment so the rows are on
 * screen to measure, and tries again once in case the window was still settling.
 */
export function installFitOnOpen(): () => void {
  let timers: ReturnType<typeof setTimeout>[] = [];
  const off = store().onLoad(() => {
    timers.forEach(clearTimeout);
    timers = [150, 700].map((ms) => setTimeout(() => void fitLayers(), ms));
  });
  return () => {
    timers.forEach(clearTimeout);
    off();
  };
}
