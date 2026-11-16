/** Finding an artboard by name in a long list. Pure matching, plus a small "please focus the search box" request. */
import type { Artboard } from '../core/format';

/** Searching earns its place once the list is longer than a few rows. */
export const SEARCH_FROM = 6;

/** The artboards whose name has every word of the search in it, in any case. An empty search keeps them all. */
export function matchArtboards<T extends Pick<Artboard, 'name'>>(list: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((a) => {
    const n = a.name.toLowerCase();
    return words.every((w) => n.includes(w));
  });
}

let wanted = false;
const listeners = new Set<() => void>();

/** Asks the Artboards panel to show its search box and put the cursor in it (it may not be open yet). */
export function requestFind(): void {
  wanted = true;
  for (const fn of [...listeners]) fn();
}

/** The panel listens here. A request made before it opened is answered as soon as it does. */
export function onFindRequest(fn: () => void): () => void {
  listeners.add(fn);
  if (wanted) queueMicrotask(() => wanted && fn());
  return () => void listeners.delete(fn);
}

/** The panel has answered the request. */
export function findAnswered(): void {
  wanted = false;
}
