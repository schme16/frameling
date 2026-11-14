/**
 * Folding the menu bar when it has less room than its menus need. The ones that don't fit move into a More menu at the
 * end, so nothing runs off the edge. The sums are kept apart from the bar so they can be tested.
 */

/**
 * How many of the leading menus to show. `widths` are the menus' own widths in order, `room` is the space the bar may use,
 * `moreWidth` the More button's width and `gap` the space between buttons. All of them when they fit as they are;
 * otherwise as many as fit beside the More button (at least none: the More button alone always shows).
 */
export function menusThatFit(widths: number[], room: number, moreWidth: number, gap: number): number {
  const total = widths.reduce((n, w) => n + w, 0) + gap * Math.max(0, widths.length - 1);
  if (total <= room) return widths.length;
  let used = moreWidth;
  let shown = 0;
  for (const w of widths) {
    if (used + gap + w > room) break;
    used += gap + w;
    shown++;
  }
  return shown;
}
