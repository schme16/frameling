// Finding the thing a step points at. Plain DOM reads, nothing else.
import type { QuestTarget } from './types';

/** On screen and not hidden. */
export function isShown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  try {
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  } catch {
    return true;
  }
}

/** The first element a target names that is actually showing. */
export function resolveTarget(t: QuestTarget | undefined, shown: (el: Element) => boolean = isShown): Element | null {
  if (!t || typeof document === 'undefined') return null;
  if (typeof t === 'function') {
    try {
      const el = t();
      return el && shown(el) ? el : null;
    } catch {
      return null;
    }
  }
  for (const sel of Array.isArray(t) ? t : [t]) {
    let list: Element[] = [];
    try {
      list = [...document.querySelectorAll(sel)];
    } catch {
      // A bad selector is a quest bug, but it must never break the app.
    }
    const hit = list.find(shown);
    if (hit) return hit;
  }
  return null;
}

const BACKDROP = '.io-backdrop, .ui-backdrop';

/** True when a dialog is sitting on top of the element, so a ring round it would point at something you can't reach. */
export function isCoveredByDialog(el: Element): boolean {
  if (el.closest(BACKDROP)) return false;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint?.(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit?.closest(BACKDROP);
}
