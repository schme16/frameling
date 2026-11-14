/**
 * Turning and flipping the view, to check a drawing the way a painter turns the page or looks at it in a mirror.
 *
 * This is the VIEW only. Nothing here touches the document, the file or an export: it is a screen-side transform that
 * lives for the session (a new or opened file starts straight again). The maths is kept apart from the DOM so it can
 * be tested.
 *
 * The canvas layers sit in one box (the "turn box") that the engine turns with a CSS transform about its centre, and
 * pointer positions are carried back through the inverse so the tools still see plain document points. The box is
 * made big enough to cover the window after the turn, so turning never shows bare corners.
 *
 * What you see = flip (a left-right mirror of the screen) applied after the turn, so "flipped" always means what a
 * mirror would show, whatever the angle.
 */
import { useSyncExternalStore } from 'react';

export interface Turn {
  /** Degrees, clockwise, 0 up to (not including) 360, in whole steps of TURN_STEP. */
  angle: number;
  /** Mirrored left to right on screen. */
  flip: boolean;
}

export const NO_TURN: Turn = { angle: 0, flip: false };

/** One turn step, in degrees. */
export const TURN_STEP = 15;

export interface Pt {
  x: number;
  y: number;
}

export function isTurned(t: Turn): boolean {
  return t.angle !== 0 || t.flip;
}

/** An angle brought into 0 up to (not including) 360 and rounded to a whole step. */
export function snapAngle(deg: number, step = TURN_STEP): number {
  if (!Number.isFinite(deg)) return 0;
  const a = Math.round(deg / step) * step;
  return ((a % 360) + 360) % 360;
}

/** Turn by some number of steps (negative turns the other way). */
export function turnedBy(t: Turn, steps: number): Turn {
  return { ...t, angle: snapAngle(t.angle + steps * TURN_STEP) };
}

export function flipped(t: Turn): Turn {
  return { ...t, flip: !t.flip };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The size of the box the canvas layers need so that, once turned, they still cover a window of w x h: the bounding
 * box of the window turned back. 0 and 180 degrees (and a flip) need nothing extra.
 */
export function turnBox(w: number, h: number, t: Turn): { w: number; h: number } {
  const c = Math.abs(Math.cos(rad(t.angle)));
  const s = Math.abs(Math.sin(rad(t.angle)));
  const bw = Math.ceil(w * c + h * s - 1e-6);
  const bh = Math.ceil(w * s + h * c - 1e-6);
  return { w: Math.max(w, bw), h: Math.max(h, bh) };
}

/** The CSS transform that does the turn (about the box centre). Empty when straight. */
export function turnCss(t: Turn): string {
  if (!isTurned(t)) return '';
  return `${t.flip ? 'scaleX(-1) ' : ''}rotate(${t.angle}deg)`;
}

/**
 * A vector as the screen shows it (dx, dy from the window centre, or a movement) to the same vector in the box's own
 * frame, where the canvas layers and the tools work.
 */
export function unturnVector(t: Turn, dx: number, dy: number): Pt {
  const fx = t.flip ? -dx : dx;
  const a = rad(t.angle);
  const c = Math.cos(a);
  const s = Math.sin(a);
  // The inverse of a clockwise turn.
  return { x: round(fx * c + dy * s), y: round(-fx * s + dy * c) };
}

/** The reverse: a vector in the box's frame to how the screen shows it. */
export function turnVector(t: Turn, x: number, y: number): Pt {
  const a = rad(t.angle);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rx = x * c - y * s;
  const ry = x * s + y * c;
  return { x: round(t.flip ? -rx : rx), y: round(ry) };
}

/** Float dust from the trig would show up as 1e-14 in coordinates: round it away. */
function round(n: number): number {
  const r = Math.round(n * 1e9) / 1e9;
  return r === 0 ? 0 : r;
}

/**
 * A pointer position inside the window (x, y from its top-left corner, window w x h) to the position inside the turn
 * box, which is the coordinate frame the view's pan and the canvases use.
 */
export function windowToBox(t: Turn, w: number, h: number, x: number, y: number): Pt {
  const box = turnBox(w, h, t);
  const v = unturnVector(t, x - w / 2, y - h / 2);
  return { x: box.w / 2 + v.x, y: box.h / 2 + v.y };
}

/** How far a drag has swung, in degrees from where it began, taking the short way round (-180 up to 180). */
export function turnAngleFor(from: number, now: number): number {
  let d = (now - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** How far the box sticks out left and top of the window. Keeps the picture still when the box changes size. */
export function boxOffset(w: number, h: number, t: Turn): Pt {
  const box = turnBox(w, h, t);
  return { x: (box.w - w) / 2, y: (box.h - h) / 2 };
}

/** The size a w x h rectangle takes up once turned (its bounding box), for fitting a turned page in the window. */
export function turnedSize(w: number, h: number, angle: number): { w: number; h: number } {
  const c = Math.abs(Math.cos(rad(angle)));
  const s = Math.abs(Math.sin(rad(angle)));
  return { w: w * c + h * s, h: w * s + h * c };
}

/** A short phrase for what the view is doing, for the status bar and the chip: "flipped", "turned 30 degrees". */
export function describeTurn(t: Turn): string {
  const parts: string[] = [];
  if (t.flip) parts.push('flipped');
  if (t.angle) parts.push(`turned ${t.angle} degrees`);
  return parts.join(' and ');
}

// ---------------------------------------------------------------- the session's turn

let current: Turn = NO_TURN;
const listeners = new Set<() => void>();

export function getTurn(): Turn {
  return current;
}

export function setTurn(t: Turn): void {
  const next = { angle: snapAngle(t.angle), flip: !!t.flip };
  if (next.angle === current.angle && next.flip === current.flip) return;
  current = next;
  for (const l of [...listeners]) l();
}

/** Back to straight. */
export function resetTurn(): void {
  setTurn(NO_TURN);
}

export function subscribeTurn(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useTurn(): Turn {
  return useSyncExternalStore(subscribeTurn, getTurn);
}
