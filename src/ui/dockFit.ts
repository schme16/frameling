/**
 * Making the layout answer to the room the window really has. At a big interface size on a small screen (200% on a
 * 1280 laptop is 640 units across) the docked zones used to take more width than there was and the canvas was squeezed to
 * nothing. Now the canvas keeps a least size, the zones give way for it (CSS shrinks them down to their own least size
 * first), and when even that is not enough a zone folds to its slim rail until there is room again. Folding is only how
 * it is shown: the saved layout and the zone's size are untouched, so the room coming back brings the panels back.
 *
 * The decision is pure so it can be tested; the measuring and the store are at the bottom.
 */

/** What a zone is to the decision along one axis (width for left and right, height for top and bottom). */
export interface FitZone {
  /** Whether the zone is on show (not empty, not already folded by hand, not put away). */
  present: boolean;
  /** The smallest it can shrink to, in units. */
  min: number;
  /** How much room it takes once folded to its rail. */
  folded: number;
}

/** What each zone may be asked to do: nothing, or fold. */
export interface Folds {
  /** The zone nearer the start of the axis (left, top) and the one nearer the end (right, bottom). */
  start: boolean;
  end: boolean;
}

/** The canvas keeps at least this much across (units), and this much down. Below that you can't draw. */
export const CANVAS_LEAST = { x: 280, y: 190 };
/** Room a zone's splitter and gap take, which folding frees. */
const SPLIT = 16;
/** To unfold a zone there must be this much to spare, so the layout does not flicker at the edge. */
const HYSTERESIS = 28;

/**
 * Which zones to fold. `room` is the length of the whole row (or column) the zones and the canvas share, `other` is
 * everything in it that is neither zone nor canvas (rails, splitters, gaps, padding). The end zone (right, bottom) folds
 * first, since it is the one that usually holds the wider panels; then the start one. `was` is what is folded now, for
 * the hysteresis.
 */
export function foldsFor(room: number, other: number, least: number, start: FitZone, end: FitZone, was: Folds = { start: false, end: false }): Folds {
  const need = (foldStart: boolean, foldEnd: boolean, extra: number): number => {
    const s = start.present ? (foldStart ? start.folded : start.min + SPLIT) : 0;
    const e = end.present ? (foldEnd ? end.folded : end.min + SPLIT) : 0;
    return other + least + s + e + extra;
  };
  // A zone already folded needs a little more room before it unfolds.
  const slack = (foldStart: boolean, foldEnd: boolean): number => (was.start && !foldStart ? HYSTERESIS : 0) + (was.end && !foldEnd ? HYSTERESIS : 0);
  const fits = (foldStart: boolean, foldEnd: boolean): boolean => need(foldStart, foldEnd, slack(foldStart, foldEnd)) <= room;
  if (fits(false, false)) return { start: false, end: false };
  if (end.present && fits(false, true)) return { start: false, end: true };
  if (start.present && fits(true, false)) return { start: true, end: false };
  return { start: start.present, end: end.present };
}

