// What Align lines shapes up to when more than one is picked: their own box or the page. Kept between sessions.
import { useSyncExternalStore } from 'react';
import type { AlignTo } from './align';

const KEY = 'frameling.alignTo';
let current: AlignTo = 'selection';
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'page') current = 'page';
} catch {
  // no storage: the default stands
}
const listeners = new Set<() => void>();

export function getAlignTo(): AlignTo {
  return current;
}

export function setAlignTo(to: AlignTo): void {
  if (to === current) return;
  current = to;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, to);
  } catch {
    // not saved this time
  }
  for (const l of [...listeners]) l();
}

export function useAlignTo(): AlignTo {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    getAlignTo,
  );
}
