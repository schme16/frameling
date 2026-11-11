// Little bits of view state that aren't part of the document or the shared UI state.
import { useSyncExternalStore } from 'react';

interface ViewSettings {
  /** Show the pixel grid on pixel layers when zoomed in far enough. */
  pixelGrid: boolean;
}

const KEY = 'frameling.view';
let state: ViewSettings = { pixelGrid: true };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved.pixelGrid === 'boolean') state = { ...state, pixelGrid: saved.pixelGrid };
  }
} catch {
  // storage can be unavailable; the defaults are fine
}

export function getViewSettings(): ViewSettings {
  return state;
}

export function setViewSettings(patch: Partial<ViewSettings>): void {
  state = { ...state, ...patch };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function subscribeViewSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useViewSettings<T>(selector: (s: ViewSettings) => T): T {
  return useSyncExternalStore(subscribeViewSettings, () => selector(state));
}
