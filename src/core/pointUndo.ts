// Points placed one click at a time (the pen, a polygon or lasso, a collision shape) live in the tool until the shape is
// done, so the drawing's undo history knows nothing about them. Without this, Ctrl+Z mid-shape undid the finished work
// behind the points, which stayed on screen as if nothing had happened. While a tool holds points, Undo takes the last
// one back instead. The one left on its own cancels the shape, and the press that does it stops there.
import { requestOverlay } from '../canvas/controller';

export interface PointGesture {
  /** True while the tool is holding points that are not in the drawing yet. */
  open(): boolean;
  /** Takes the last point back. The only one left cancels the whole shape. */
  back(): void;
}

const gestures: PointGesture[] = [];
// The last take-back emptied the shape: a held-down Ctrl+Z must not carry on into the drawing.
let emptied = false;

/** A tool that collects clicks before it commits registers itself here. */
export function registerPointGesture(g: PointGesture): void {
  gestures.push(g);
}

/** True while a shape is half made, so Undo means "take a point back" and Redo has nothing to put back. */
export function pointsInProgress(): boolean {
  return gestures.some((g) => g.open());
}

/** Undo for a half-made shape. False when no tool is holding points, so the drawing's own undo goes ahead. */
export function takePointBack(): boolean {
  const g = gestures.find((x) => x.open());
  if (!g) return false;
  g.back();
  emptied = !pointsInProgress();
  requestOverlay();
  return true;
}

/** A new key press (not a repeat of a held one) lets Undo reach the drawing again. */
export function noteKeyPress(repeat: boolean): void {
  if (!repeat) emptied = false;
}

/** True for the repeats of a held Undo right after it took the last point: they are dropped, not sent on to the drawing. */
export function swallowUndoRepeat(repeat: boolean): boolean {
  return repeat && emptied;
}
