/**
 * Alt on the canvas does two things with one press: a click picks a colour (on a pixel layer), a drag turns the view.
 * Which one it is can only be known once the pointer has either moved or let go, so the press waits. This is the
 * pure part of that wait: no DOM, so the rule can be tested.
 *
 * The rule: the press is a PICK until the pointer has travelled further than a small distance from where it went
 * down, measured from that first point (not from the last move), so slow drifting still counts as a drag and a
 * shaky hand that wobbles inside the distance never does. Once it has crossed it is a TURN for good, even if the
 * pointer comes back, so a drag never flips into a pick on release. A release before it crosses is a pick, however
 * long the press was held.
 */

/** How far a mouse may wobble during a press and still be a click, in screen (CSS) pixels. */
export const TURN_SLOP_MOUSE = 6;
/** The same for a pen: a hand holding a pen in the air above a tablet shakes a little more than a mouse does. */
export const TURN_SLOP_PEN = 9;

/** The distance for this kind of pointer. Touch never takes part (fingers have their own pan and pinch). */
export function turnSlop(pointerType: string): number {
  return pointerType === 'pen' ? TURN_SLOP_PEN : TURN_SLOP_MOUSE;
}

export type AltPress = 'waiting' | 'turning';

/** The state of a press after the pointer has moved by (dx, dy) from where it went down. */
export function altPressMoved(state: AltPress, dx: number, dy: number, pointerType: string): AltPress {
  if (state === 'turning') return 'turning';
  const slop = turnSlop(pointerType);
  return dx * dx + dy * dy > slop * slop ? 'turning' : 'waiting';
}

/** What letting go does: a press that never became a turn is a pick (or the plain click of the tool). */
export function altPressReleased(state: AltPress): 'pick' | 'nothing' {
  return state === 'waiting' ? 'pick' : 'nothing';
}

/**
 * The tools whose Alt press is free to turn the view. Painting tools use Alt only to pick a colour on a pixel layer.
 * Tools that already give Alt another job keep it (shapes draw from the middle, selections take away or copy, the
 * transform scales from the pivot, boards duplicate, the camera tool turns the camera, the pen pulls a handle out, weights swap more and less, the
 * eyedropper reads one layer, zoom zooms out). The hand tool pans.
 */
export const ALT_TURN_TOOLS: ReadonlySet<string> = new Set(['pencil', 'brush', 'eraser', 'fill', 'shade', 'dither', 'spray', 'gradient']);

/** Does this press start the pick-or-turn wait? Alt on its own (no Shift, Ctrl or Cmd), the main button, a free tool. */
export function altTurnPress(o: { alt: boolean; shift: boolean; mod: boolean; button: number; tool: string; pointerType: string }): boolean {
  return o.alt && !o.shift && !o.mod && o.button === 0 && o.pointerType !== 'touch' && ALT_TURN_TOOLS.has(o.tool);
}
