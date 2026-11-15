// Where a tip goes and where its arrow points. Pure, so the maths can be tested without a window.
//
// A tip sits just above the thing it describes, and drops below it only when there is no room up there. A narrow
// thing at the left edge (the tool rail) gets its tip on its right. A menu row's tip goes beside the whole menu and
// has no arrow. The arrow sits on the tip's edge nearest the thing and slides along it to keep pointing at the middle
// of the thing, even when the tip was pushed sideways to stay on screen; when the tip can't be got near the thing,
// the arrow is left off rather than pointing at nothing.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Which side of the tip the arrow is on is the opposite of where the tip is: `above` has its arrow underneath. */
export type TipSide = 'above' | 'below' | 'right' | 'left' | 'aside';

export interface Placement {
  left: number;
  top: number;
  side: TipSide;
  /** Where the arrow's middle sits along the tip's edge, in px from the tip's left (above, below) or top (right, left). Null: no arrow. */
  arrow: number | null;
}

/** Space between the thing and the tip, enough for the arrow's point. */
export const TIP_GAP = 12;
/** The tip never gets nearer the window edge than this. */
export const TIP_MARGIN = 8;
/** The arrow keeps this far from the tip's corners, so it never rides over the rounding. */
export const ARROW_INSET = 14;
/** How far the middle of the thing may be past the arrow's reach before the arrow is left off. */
export const ARROW_REACH = 14;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The arrow's offset along the tip's edge for a target at `target` (same axis, same origin as `edgeStart`), or null if out of reach. */
export function arrowOffset(target: number, edgeStart: number, edgeLength: number): number | null {
  const raw = target - edgeStart;
  const lo = Math.min(ARROW_INSET, edgeLength / 2);
  const hi = Math.max(edgeLength - ARROW_INSET, edgeLength / 2);
  const at = clamp(raw, lo, hi);
  return Math.abs(raw - at) > ARROW_REACH ? null : at;
}

const overlaps = (a: Box, b: Box, pad = 0) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

/** A thing at the left edge and small: a tool in the rail. Its tip goes to its right, not over the canvas edge. */
export function isRailThing(r: Box): boolean {
  return r.right - r.left < 60 && r.left < 70 && r.bottom - r.top < 60;
}

export function placeTip(thing: Box, tip: Size, view: Size, menus: Box | null = null, aside = false): Placement {
  const { width: w, height: h } = tip;
  // A menu row: beside every open menu, level with the row, no arrow.
  if (aside && menus) {
    const gap = 10;
    const left = menus.right + gap + w <= view.width - TIP_MARGIN ? menus.right + gap : Math.max(TIP_MARGIN, menus.left - gap - w);
    return { left, top: Math.max(TIP_MARGIN, Math.min(view.height - h - TIP_MARGIN, thing.top - 6)), side: 'aside', arrow: null };
  }
  const cx = (thing.left + thing.right) / 2;
  const cy = (thing.top + thing.bottom) / 2;
  const finish = (left: number, top: number, side: TipSide): Placement => {
    const box = { left, top, right: left + w, bottom: top + h };
    const horizontal = side === 'above' || side === 'below';
    // Overlapping the thing means the tip could not be got near it: nothing to point at.
    const arrow = overlaps(box, thing) ? null : horizontal ? arrowOffset(cx, left, w) : arrowOffset(cy, top, h);
    return { left, top, side, arrow };
  };
  if (isRailThing(thing)) {
    const left = Math.min(view.width - w - TIP_MARGIN, thing.right + TIP_GAP);
    return finish(Math.max(TIP_MARGIN, left), clamp(cy - h / 2, TIP_MARGIN, Math.max(TIP_MARGIN, view.height - h - TIP_MARGIN)), 'right');
  }
  const left = clamp(cx - w / 2, TIP_MARGIN, Math.max(TIP_MARGIN, view.width - w - TIP_MARGIN));
  const roomAbove = thing.top - TIP_GAP - TIP_MARGIN - h;
  const roomBelow = view.height - TIP_MARGIN - (thing.bottom + TIP_GAP) - h;
  if (roomAbove >= 0) return finish(left, thing.top - TIP_GAP - h, 'above');
  if (roomBelow >= 0) return finish(left, thing.bottom + TIP_GAP, 'below');
  // Neither side has room: the one with more, held on screen.
  const up = roomAbove >= roomBelow;
  const top = clamp(up ? thing.top - TIP_GAP - h : thing.bottom + TIP_GAP, TIP_MARGIN, Math.max(TIP_MARGIN, view.height - h - TIP_MARGIN));
  return finish(left, top, up ? 'above' : 'below');
}
