// Where a drop down goes so all of it is on screen. It hangs off the button's right-hand end, opens downward when it
// fits (or when there is more room below than above) and upward otherwise, never gets taller than the room it has, and
// is kept inside the left and right edges. Pure, so it is tested edge by edge; the picker calls it on open, on a
// resize and on a scroll.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PopupAsk {
  /** The button it hangs from, in window coordinates. */
  anchor: Box;
  /** The window's size. */
  win: { w: number; h: number };
  /** The width it would like. */
  width: number;
  /** The height it would like, or what its content comes to. */
  height: number;
  /** The gap kept to the window's edges. */
  margin?: number;
  /** The gap between the button and the drop down. */
  gap?: number;
  /** Less room than this on either side of the button and it stops hanging off the button and fills the window's height. */
  minRoom?: number;
}

export interface PopupPlace {
  left: number;
  width: number;
  /** The distance from the window's top edge, when it opens downward (or fills the window). */
  top?: number;
  /** The distance from the window's bottom edge, when it opens upward, so it grows up from the button. */
  bottom?: number;
  /** The tallest it may be: the rows scroll inside when there are more than fit. */
  maxHeight: number;
  /** Which way it opens. 'over' is a window too small to open it beside the button, so it covers it. */
  opens: 'below' | 'above' | 'over';
}

export const POPUP_MARGIN = 8;
export const POPUP_GAP = 6;
/** About the least that still shows the live sliders, the search box, a row or two and the Row size slider. */
export const POPUP_MIN_ROOM = 200;

export function placePopup(ask: PopupAsk): PopupPlace {
  const margin = ask.margin ?? POPUP_MARGIN;
  const gap = ask.gap ?? POPUP_GAP;
  const { anchor, win } = ask;
  const innerW = Math.max(0, win.w - margin * 2);
  const innerH = Math.max(0, win.h - margin * 2);
  const width = Math.max(0, Math.min(ask.width, innerW));
  // Right edge on the button's right edge, then pushed back inside the window on either side.
  const left = Math.max(margin, Math.min(anchor.right - width, win.w - margin - width));

  const below = win.h - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  const want = Math.min(Math.max(0, ask.height), innerH);
  const minRoom = Math.min(ask.minRoom ?? POPUP_MIN_ROOM, want);

  if (Math.max(below, above) < minRoom) return { left, width, top: margin, maxHeight: innerH, opens: 'over' };
  // Below unless it does not fit there and there is more room above. A button that has scrolled partly out of the
  // window still gets a drop down that is inside it.
  if (below >= want || below >= above) {
    const top = Math.max(margin, anchor.bottom + gap);
    return { left, width, top, maxHeight: Math.min(innerH, win.h - margin - top), opens: 'below' };
  }
  const bottom = Math.max(margin, win.h - anchor.top + gap);
  return { left, width, bottom, maxHeight: Math.min(innerH, win.h - margin - bottom), opens: 'above' };
}
