// Finding the thing a step points at. Plain DOM reads, nothing else.
import { store } from '../core/store';
import { currentGroups, flyRequest, frontTools } from '../ui/toolRail';
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

const TOOL_BUTTON = /^\[data-command="tools\.([^"]+)"\]$/;

/** The tool a quest last opened a flyout for (and the tool in use then), so a flyout the person closed isn't opened again every moment. */
let askedFor: { id: string; using: string } | null = null;

/** Forgets the flyout a quest opened (for the tests). */
export function forgetFlyoutAsk(): void {
  askedFor = null;
}

/**
 * Where a tool's button is when the tool rail is in the Stacked style and the tool isn't the front one of its group:
 * there is only the group's button then. When the person isn't using another tool of that group, the tool is brought to
 * the front, so the button shows it. When they are, that tool has to stay on the button, so the group's flyout is opened
 * once (its items are found by the same selector). The group's button is what the ring goes round meanwhile.
 */
function stackedToolButton(id: string, shown: (el: Element) => boolean): Element | null {
  const g = currentGroups().find((x) => x.tools.includes(id));
  if (!g) return null;
  const btn = [...document.querySelectorAll(`.ui-tool.is-stack[data-tool-group="${g.id}"]`)].find(shown);
  if (!btn) return null;
  const using = g.tools.includes(store().get().ui.tool);
  if (!using) {
    if (frontTools.get()[g.id] !== id) frontTools.set((f) => ({ ...f, [g.id]: id }));
  } else if (askedFor?.id !== id) {
    askedFor = { id, using: store().get().ui.tool };
    flyRequest.set(g.id);
  }
  return btn;
}

/** The first element a target names that is actually showing. */
export function resolveTarget(t: QuestTarget | undefined, shown: (el: Element) => boolean = isShown): Element | null {
  if (!t || typeof document === 'undefined') return null;
  // Using another tool ends the last flyout request: the next one may open it again.
  if (askedFor && askedFor.using !== store().get().ui.tool) askedFor = null;
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
    const tool = TOOL_BUTTON.exec(sel)?.[1];
    if (hit) {
      return hit;
    }
    // A tool inside a stacked group of the tool rail has no button of its own to find.
    const group = tool && stackedToolButton(tool, shown);
    if (group) return group;
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
