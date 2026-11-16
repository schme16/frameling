// Where the quest card sits. Plain maths, no DOM: boxes in, a place out.
//
// The card must never cover the thing the step points at, and never the canvas you draw on. It looks for the free
// rectangles left once those are taken away, and puts the card in the biggest free area that is still near the target.
// If the card does not fit anywhere it shrinks to a narrower card, then to a small bar, and only when even the bar has
// no free spot does it sit over the least important thing, for the caller to fade.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Spot {
  left: number;
  top: number;
}

/** What the card is showing: the whole card, or the small bar it tucks down to. */
export type CardMode = 'card' | 'bar';

export interface Place extends Spot, Size {
  mode: CardMode;
  /** Which of `sizes` was used (0 is the widest). Always 0 for the bar. */
  size: number;
  /** True when nothing was free and the card sits over something. The caller fades it near the pointer. */
  covers: boolean;
}

export interface PlaceIn {
  view: Size;
  /** Space kept clear at the window's edges (the menu bar, the status bar). */
  insets?: { top?: number; bottom?: number; left?: number; right?: number };
  /** The card at the widths it can take, widest first. */
  sizes: Size[];
  /** The small bar the card tucks down to. */
  bar: Size;
  /** What the step points at, or null. */
  target: Box | null;
  /** Other things the card must stay off, the canvas first. */
  avoid?: Box[];
  /** Where it was last time: kept while it is still a good place, so the card does not hop about. */
  current?: Place | null;
  /** Where the person dragged it. Used while it leaves the target clear. */
  pinned?: Spot | null;
  /** The person tucked it away: show the bar. */
  tucked?: boolean;
  /** There is no room for the card but the person asked for it: show the card anyway, over whatever hides least. */
  peek?: boolean;
}

/** Room kept round the target and the canvas. */
export const BREATH = 10;
/** The default margin to the window's edges. */
export const EDGE = 12;
/** How much further than the nearest free spot we will look for a roomier one. */
const NEAR = 160;
/** How much worse than the best a spot we are already in may get before we move. */
const STAY = 220;
/** A narrower card must be this much nearer to be chosen over a wider one. */
const WIDER = 200;

export const grow = (b: Box, by: number): Box => ({ left: b.left - by, top: b.top - by, right: b.right + by, bottom: b.bottom + by });
const boxOf = (s: Spot, z: Size): Box => ({ left: s.left, top: s.top, right: s.left + z.w, bottom: s.top + z.h });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The distance between two boxes' nearest edges (0 when they touch or overlap). */
export function gapBetween(a: Box, b: Box): number {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

/** The window less its edges. */
export function zoneOf(i: Pick<PlaceIn, 'view' | 'insets'>): Box {
  const e = i.insets ?? {};
  return { left: e.left ?? EDGE, top: e.top ?? EDGE, right: i.view.w - (e.right ?? EDGE), bottom: i.view.h - (e.bottom ?? EDGE) };
}

/** True when the card is inside the zone and overlaps none of the obstacles. */
function isFree(b: Box, zone: Box, obstacles: Box[]): boolean {
  if (b.left < zone.left - 0.5 || b.top < zone.top - 0.5 || b.right > zone.right + 0.5 || b.bottom > zone.bottom + 0.5) return false;
  return !obstacles.some((o) => overlapArea(b, o) > 0);
}

/** Every empty rectangle between the zone's edges and the obstacles' edges (not only the biggest ones). */
function freeRects(zone: Box, obstacles: Box[]): Box[] {
  const xs = new Set<number>([zone.left, zone.right]);
  const ys = new Set<number>([zone.top, zone.bottom]);
  for (const o of obstacles) {
    for (const x of [o.left, o.right]) if (x > zone.left && x < zone.right) xs.add(x);
    for (const y of [o.top, o.bottom]) if (y > zone.top && y < zone.bottom) ys.add(y);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const out: Box[] = [];
  for (let a = 0; a < X.length; a++)
    for (let b = a + 1; b < X.length; b++)
      for (let c = 0; c < Y.length; c++)
        for (let d = c + 1; d < Y.length; d++) {
          const r = { left: X[a], top: Y[c], right: X[b], bottom: Y[d] };
          if (!obstacles.some((o) => overlapArea(r, o) > 0)) out.push(r);
        }
  return out;
}

/** The best free spot for one size: the roomiest free area among those near the anchor, the card tucked up to the anchor inside it. */
function bestFor(size: Size, zone: Box, obstacles: Box[], anchor: Box): { spot: Spot; gap: number } | null {
  const fits = freeRects(zone, obstacles).filter((r) => r.right - r.left >= size.w - 0.5 && r.bottom - r.top >= size.h - 0.5);
  if (!fits.length) return null;
  const cx = (anchor.left + anchor.right) / 2;
  const cy = (anchor.top + anchor.bottom) / 2;
  const cands = fits.map((r) => {
    const spot = { left: clamp(cx - size.w / 2, r.left, r.right - size.w), top: clamp(cy - size.h / 2, r.top, r.bottom - size.h) };
    return { spot, gap: gapBetween(boxOf(spot, size), anchor), area: (r.right - r.left) * (r.bottom - r.top) };
  });
  const nearest = Math.min(...cands.map((c) => c.gap));
  const near = cands.filter((c) => c.gap <= nearest + NEAR);
  near.sort((a, b) => b.area - a.area || a.gap - b.gap || a.spot.top - b.spot.top || a.spot.left - b.spot.left);
  return { spot: near[0].spot, gap: near[0].gap };
}

/** The point the card stays near when nothing is pointed at: the bottom left, where it has always lived. */
function homeAnchor(zone: Box): Box {
  return { left: zone.left, top: zone.bottom, right: zone.left, bottom: zone.bottom };
}

/**
 * Where to put the card. The answer is steady: while the last place is still free and not much worse than the best one it
 * is kept, so nothing moves when the target shifts by a pixel or the pointer wanders.
 */
export function placeCard(i: PlaceIn): Place {
  const zone = zoneOf(i);
  const target = i.target ? grow(i.target, BREATH) : null;
  const obstacles = [...(target ? [target] : []), ...(i.avoid ?? []).map((b) => grow(b, 2))];
  const anchor = i.target ?? homeAnchor(zone);
  type Try = { size: Size; mode: CardMode; index: number };
  const cards = i.sizes.map((size, index): Try => ({ size, mode: 'card', index }));
  const tries: Try[] = i.tucked ? [{ size: i.bar, mode: 'bar', index: 0 }] : i.peek ? cards : [...cards, { size: i.bar, mode: 'bar', index: 0 }];

  const make = (t: Try, spot: Spot, covers = false): Place => ({ left: spot.left, top: spot.top, w: t.size.w, h: t.size.h, mode: t.mode, size: t.index, covers });
  const keepInside = (s: Size, p: Spot): Spot => ({ left: clamp(p.left, zone.left, Math.max(zone.left, zone.right - s.w)), top: clamp(p.top, zone.top, Math.max(zone.top, zone.bottom - s.h)) });

  // The person's own place, while it keeps the target in view. The canvas is theirs to cover if they chose to.
  if (i.pinned) {
    const t = tries[0];
    const spot = keepInside(t.size, i.pinned);
    if (!target || overlapArea(boxOf(spot, t.size), target) === 0) return make(t, spot);
  }

  // The widest size that fits, unless a narrower one is much nearer. The bar only when no card fits (or it was tucked).
  let pick: { t: Try; hit: { spot: Spot; gap: number } } | null = null;
  for (const t of tries) {
    const hit = bestFor(t.size, zone, obstacles, anchor);
    if (!hit) continue;
    if (t.mode === 'bar') {
      pick ??= { t, hit };
      break;
    }
    if (!pick || hit.gap + WIDER < pick.hit.gap) pick = { t, hit };
  }

  if (pick) {
    // Stay where we are while it is still a good place for this size.
    const c = i.current;
    if (c && c.mode === pick.t.mode && c.size === pick.t.index) {
      const spot = keepInside(pick.t.size, c);
      const box = boxOf(spot, pick.t.size);
      if (isFree(box, zone, obstacles) && gapBetween(box, anchor) <= pick.hit.gap + STAY) return make(pick.t, spot);
    }
    return make(pick.t, pick.hit.spot);
  }

  // Nothing is free, even for the bar (or the card was asked for with no room). Take the corner that hides least, the target counting ten times as much as the canvas.
  const t = tries[tries.length - 1];
  let best: { spot: Spot; cost: number } | null = null;
  for (const left of [zone.left, zone.right - t.size.w])
    for (const top of [zone.top, zone.bottom - t.size.h]) {
      const b = boxOf({ left, top }, t.size);
      const cost = (target ? overlapArea(b, target) * 10 : 0) + (i.avoid ?? []).reduce((n, a) => n + overlapArea(b, a), 0);
      if (!best || cost < best.cost) best = { spot: { left, top }, cost };
    }
  return make(t, keepInside(t.size, best!.spot), true);
}

/** True when the pointer is within `pad` of the box: the card fades then, when it sits over it. */
export function pointerNear(box: Box | null, p: Spot | null, pad = 24): boolean {
  if (!box || !p) return false;
  return p.left >= box.left - pad && p.left <= box.right + pad && p.top >= box.top - pad && p.top <= box.bottom + pad;
}
