// Asking the timeline header's "more" menu to open from outside (a quest pointing at a button that is folded into it).
import { createStore } from '../ui/mini';

/** Set to true to open the "more" menu. The header answers and clears it. */
export const moreRequest = createStore(false);

/** The step a header element belongs to when that step is folded into the "more" menu right now, else null. */
export function foldedStepOf(el: Element): string | null {
  const header = el.closest('.tl-header');
  const step = el.closest('[data-step]')?.getAttribute('data-step');
  if (!header || !step) return null;
  return (header.getAttribute('data-folded') ?? '').split(' ').includes(step) ? step : null;
}
