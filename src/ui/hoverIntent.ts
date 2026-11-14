/**
 * Hover intent for submenus: the "safe triangle".
 *
 * A submenu sits beside the row that opens it, so the way to it runs diagonally across the rows below. Treating
 * every one of those rows as "you hovered off" slams the submenu shut while you are still on your way to it. These
 * two helpers answer the only question that matters: is the pointer heading into that box? If it is, the menu waits.
 */

export type Pt = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };

const cross = (p: Pt, q: Pt) => p.x * q.y - p.y * q.x;

/**
 * True when the pointer moved from `prev` to `now` along a line that runs into `box`, approaching it from its left
 * or its right. `pad` grows the box a little so a path aimed at its very corner still counts.
 */
export function headingTo(prev: Pt | null, now: Pt | null, box: Box | null, pad = 6): boolean {
  if (!prev || !now || !box) return false;
  const d = { x: now.x - prev.x, y: now.y - prev.y };
  if (Math.abs(d.x) < 0.01 && Math.abs(d.y) < 0.01) return false;
  const top = box.top - pad;
  const bottom = box.bottom + pad;
  let edge: number;
  if (now.x <= box.left) edge = box.left + pad;
  else if (now.x >= box.right) edge = box.right - pad;
  else return false;
  // The wedge from the pointer to the two ends of the near edge.
  const a = { x: edge - now.x, y: top - now.y };
  const b = { x: edge - now.x, y: bottom - now.y };
  const wedge = cross(a, b);
  if (wedge === 0) return false;
  return cross(a, d) * wedge >= 0 && cross(d, b) * wedge >= 0;
}

/** How long a submenu will hold open while the pointer is still on its way, and how often that is re-checked. */
export const HOVER_GRACE = 700;
export const HOVER_STEP = 90;
