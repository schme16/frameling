// Where the buttons sit on the board, and how the streamer moves them. A layout is the buttons that are shown, in order,
// the ones put away, and how big the buttons are. Pure and small, so every move is tested (test/streamboard/layout.test.ts).
//
// Moving is pick up, then put down: tap a button to lift it, tap the spot you want it in. There is nothing to drag or
// hold, so it works the same with a mouse, a finger or a tablet pen, and the arrow keys do it too.
import { TILES } from './tiles';

export interface Layout {
  /** The buttons on the board, first to last. */
  shown: string[];
  /** The buttons put away, listed in the tray while arranging. */
  hidden: string[];
  /** How big the buttons are: 0 is smallest. */
  size: number;
}

export const SIZE_STEPS = ['Small', 'Medium', 'Big', 'Huge'] as const;
export const DEFAULT_SIZE = 1;

export function defaultLayout(ids: readonly { id: string; defaultOn: boolean }[] = TILES): Layout {
  return { shown: ids.filter((t) => t.defaultOn).map((t) => t.id), hidden: ids.filter((t) => !t.defaultOn).map((t) => t.id), size: DEFAULT_SIZE };
}

/**
 * A saved layout read back, or the default for anything that is not one. Buttons that no longer exist are dropped, and a
 * button this version added since the layout was saved joins the end (shown if it is on by default, otherwise put away).
 */
export function readLayout(raw: unknown, known: readonly { id: string; defaultOn: boolean }[] = TILES): Layout {
  const fallback = defaultLayout(known);
  if (typeof raw !== 'object' || raw === null) return fallback;
  const r = raw as Record<string, unknown>;
  const ids = new Set(known.map((k) => k.id));
  const seen = new Set<string>();
  const take = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      if (typeof x === 'string' && ids.has(x) && !seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  };
  const shown = take(r.shown);
  const hidden = take(r.hidden);
  for (const k of known) {
    if (seen.has(k.id)) continue;
    (k.defaultOn ? shown : hidden).push(k.id);
  }
  const size = typeof r.size === 'number' && Number.isInteger(r.size) && r.size >= 0 && r.size < SIZE_STEPS.length ? r.size : DEFAULT_SIZE;
  return { shown, hidden, size };
}

export const sameLayout = (a: Layout, b: Layout): boolean => a.size === b.size && a.shown.join() === b.shown.join() && a.hidden.join() === b.hidden.join();

/** Puts `id` at position `to` among the shown buttons (a button that was put away comes back). Others shift along. */
export function moveTo(l: Layout, id: string, to: number): Layout {
  if (!l.shown.includes(id) && !l.hidden.includes(id)) return l;
  const shown = l.shown.filter((x) => x !== id);
  const at = Math.max(0, Math.min(shown.length, Math.round(to)));
  shown.splice(at, 0, id);
  return { ...l, shown, hidden: l.hidden.filter((x) => x !== id) };
}

/** Puts `id` where `target` is, so it takes that spot and the ones from there on move along. */
export function moveOnto(l: Layout, id: string, target: string): Layout {
  const to = l.shown.indexOf(target);
  return id === target || to < 0 ? l : moveTo(l, id, to);
}

/** One step earlier (-1) or later (+1). Stops at the ends. */
export function nudge(l: Layout, id: string, step: -1 | 1): Layout {
  const at = l.shown.indexOf(id);
  if (at < 0) return l;
  const to = at + step;
  return to < 0 || to >= l.shown.length ? l : moveTo(l, id, to);
}

/** Puts a button away. It stays in the tray, so it can come back. */
export function putAway(l: Layout, id: string): Layout {
  if (!l.shown.includes(id)) return l;
  return { ...l, shown: l.shown.filter((x) => x !== id), hidden: [...l.hidden, id] };
}

/** Brings a put-away button back, at the end. */
export function bringBack(l: Layout, id: string): Layout {
  return l.hidden.includes(id) ? moveTo(l, id, l.shown.length) : l;
}

export function resize(l: Layout, step: -1 | 1): Layout {
  const size = Math.max(0, Math.min(SIZE_STEPS.length - 1, l.size + step));
  return size === l.size ? l : { ...l, size };
}

/** The smallest a button may be, in CSS pixels, for each size. Big enough to hit without looking even at the smallest. */
export const MIN_TILE_PX = [150, 190, 250, 340] as const;
