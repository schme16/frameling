/**
 * Trackpad pinch in Safari. Chromium and Firefox report a pinch as ctrl+wheel (handled with the wheel); desktop Safari
 * instead fires gesturestart, gesturechange and gestureend, and zooms the whole page unless they are cancelled. The
 * scale on those events counts from the start of the pinch, so each change is turned into the step since the last one
 * and handed to the same zoom the wheel uses. Kept apart from the canvas so it can be tested.
 */

/** Safari only: the other engines have no GestureEvent, so nothing is attached for them. */
export function hasGestureEvents(win: object | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
  return !!win && typeof (win as { GestureEvent?: unknown }).GestureEvent !== 'undefined';
}

/** How much one gesturechange changes the zoom: the scale now over the scale at the last event. 1 if either is unusable. */
export function pinchStep(last: number, scale: number): number {
  if (!(last > 0) || !(scale > 0) || !Number.isFinite(last) || !Number.isFinite(scale)) return 1;
  return scale / last;
}

interface GestureLike extends Event {
  scale: number;
  clientX?: number;
  clientY?: number;
}

/**
 * Starts listening for pinch gestures on `el`. `onZoom` gets the zoom factor for this step and the pointer position
 * (page coordinates; the middle of the element when the browser doesn't say). Returns how to stop, or null when this
 * browser has no gesture events, in which case nothing is attached.
 */
export function attachPinch(
  el: HTMLElement,
  onZoom: (factor: number, clientX: number, clientY: number) => void,
  win: object | undefined = typeof window !== 'undefined' ? window : undefined,
): (() => void) | null {
  if (!hasGestureEvents(win)) return null;
  let last = 1;
  const at = (e: GestureLike): [number, number] => {
    if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) return [e.clientX as number, e.clientY as number];
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const start = (e: Event) => {
    e.preventDefault();
    last = 1;
  };
  const change = (e: Event) => {
    e.preventDefault();
    const g = e as GestureLike;
    const f = pinchStep(last, g.scale);
    last = g.scale > 0 && Number.isFinite(g.scale) ? g.scale : last;
    if (f === 1) return;
    const [x, y] = at(g);
    onZoom(f, x, y);
  };
  const end = (e: Event) => e.preventDefault();
  const opts = { passive: false } as const;
  el.addEventListener('gesturestart', start, opts);
  el.addEventListener('gesturechange', change, opts);
  el.addEventListener('gestureend', end, opts);
  return () => {
    el.removeEventListener('gesturestart', start);
    el.removeEventListener('gesturechange', change);
    el.removeEventListener('gestureend', end);
  };
}
