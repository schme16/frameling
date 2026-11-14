// A place for a debug-only stand-in for the saved-brush row, so layouts for a big brush library can be shot in the real
// app (brand/ab/brush-library). Nothing fills it unless the page has ?debug, so normal use never sees it.
import { useSyncExternalStore, type ReactNode } from 'react';

let row: (() => ReactNode) | null = null;
const listeners = new Set<() => void>();

export function setMockRow(r: (() => ReactNode) | null): void {
  row = r;
  listeners.forEach((l) => l());
}

export function useMockRow(): (() => ReactNode) | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => row,
  );
}
