// Gets the Streaming page on screen with the thing a step points at in view. The list of tools on that page sits
// under "Choose one by one", which only opens by itself once audience features are on, so the first step opens it.
import { openPrefs } from '../ui/overlays';

const MORE = '.features-streaming-more';
// The page draws a moment after it opens, so look a few times.
const TRIES = [0, 120, 350, 800];

/** Opens Preferences on the Streaming page, opens the list of tools, and scrolls to the first selector that is there. */
export function showStreamingPage(...selectors: string[]): void {
  openPrefs('streaming');
  if (typeof document === 'undefined') return;
  for (const ms of TRIES) {
    setTimeout(() => {
      // The last look is 800ms out, by which time the page can be gone (a window closed, a test torn down). The
      // check at the top of the function was made before any of these were set, so it says nothing about now.
      if (typeof document === 'undefined') return;
      const more = document.querySelector<HTMLDetailsElement>(MORE);
      if (more && !more.open) more.open = true;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return void (el as HTMLElement).scrollIntoView?.({ block: 'center' });
      }
    }, ms);
  }
}
