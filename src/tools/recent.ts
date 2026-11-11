// The last 8 colours used for drawing, newest first. Shared by the tools (which note a colour when it lands in the
// drawing) and the Colours panel (which shows them).
import { useSyncExternalStore } from 'react';

const KEY = 'frameling.recentColors';
const MAX = 8;
let list: string[] = [];
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(saved)) list = saved.filter((c) => typeof c === 'string').slice(0, MAX);
  }
} catch {
  // start empty
}

export function getRecentColors(): string[] {
  return list;
}

export function noteColorUsed(color: string): void {
  const c = color.toLowerCase();
  if (list[0] === c) return;
  list = [c, ...list.filter((x) => x !== c)].slice(0, MAX);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function useRecentColors(): string[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => list,
  );
}
