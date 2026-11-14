// Where the guide bar sits so the thing it points at stays visible. Plain maths, no DOM.
export type Spot = 'bl' | 'br' | 'tl' | 'tr';
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Distances from the window edges, matching quests.css. */
const SIDE = 12;
const FROM_BOTTOM = 42;
const FROM_TOP = 52;
const BREATH = 8;

/** The box the bar fills in a spot. */
export function spotBox(spot: Spot, bar: { w: number; h: number }, view: { w: number; h: number }): Box {
  const left = spot === 'bl' || spot === 'tl' ? SIDE : view.w - SIDE - bar.w;
  const top = spot === 'bl' || spot === 'br' ? view.h - FROM_BOTTOM - bar.h : FROM_TOP;
  return { left, top, right: left + bar.w, bottom: top + bar.h };
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

const ORDER: Spot[] = ['bl', 'br', 'tl', 'tr'];

/**
 * The spot to use. The current one stays while it leaves the target clear, so the bar never hops about for nothing; else
 * the first free corner (bottom left, bottom right, top left, top right); if none is free (a target as big as the
 * canvas) it stays put.
 */
export function placeBar(current: Spot, bar: { w: number; h: number }, view: { w: number; h: number }, target: Box | null): Spot {
  if (!target) return current;
  const grown = { left: target.left - BREATH, top: target.top - BREATH, right: target.right + BREATH, bottom: target.bottom + BREATH };
  const hidden = (s: Spot) => overlap(spotBox(s, bar, view), grown);
  if (hidden(current) === 0) return current;
  return ORDER.find((s) => hidden(s) === 0) ?? current;
}
