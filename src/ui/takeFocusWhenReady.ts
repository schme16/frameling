// Taking the focus into a box that a panel is still drawing.
//
// A command that opens a panel and then wants the cursor in one of its boxes used to guess how long the panel would
// take and reach for the box after that. A guess is wrong twice: on a slow machine the box is not there yet and the
// focus goes nowhere, and on a fast one the wait is time the person spends watching nothing happen. So watch for the
// box over the next few frames instead, take the focus the moment it appears, and give up quietly if it never does.

/** How long to keep watching before giving up. A panel that has not drawn a box by now is not going to. */
const GIVE_UP_MS = 600;

/**
 * Takes the focus into the first element matching `selector` as soon as it is on the page, and selects its text when
 * it is a text box. Returns a function that stops watching, for a caller that changes its mind. Does nothing at all
 * where there is no page (a test, a script), so nothing is left ticking after the page has gone.
 */
export function takeFocusWhenReady(selector: string, opts?: { select?: boolean }): () => void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return () => {};
  const until = Date.now() + GIVE_UP_MS;
  let frame = 0;
  const look = () => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.focus();
      if (opts?.select !== false && el instanceof HTMLInputElement) el.select();
      return;
    }
    if (Date.now() < until) frame = requestAnimationFrame(look);
  };
  frame = requestAnimationFrame(look);
  return () => cancelAnimationFrame(frame);
}
