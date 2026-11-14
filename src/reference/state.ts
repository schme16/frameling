// Which reference layer is being moved, sized or turned right now (null = none). View only: never saved, never undone.
import { useSyncExternalStore } from 'react';
import type { Id } from '../core/format';

let placing: Id | null = null;
const listeners = new Set<() => void>();

export const getPlacing = (): Id | null => placing;

export function setPlacing(id: Id | null): void {
  if (id === placing) return;
  placing = id;
  for (const fn of [...listeners]) fn();
}

export function subscribePlacing(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function usePlacing(): Id | null {
  return useSyncExternalStore(subscribePlacing, getPlacing, getPlacing);
}
