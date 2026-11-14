// Options for the Select tool (how it picks, and the magic wand's settings), kept in the browser's storage like the
// other tool options.
import { useSyncExternalStore } from 'react';
import type { SelectOp } from './mask';

export type { SelectMode } from './ways';

export interface SelectSettings {
  /** What a new selection does when no key is held (Shift always adds, Alt always takes away). */
  op: Exclude<SelectOp, 'intersect'>;
  /** Magic wand: how close a colour has to be, 0 to 100 (percent). */
  tolerance: number;
  /** Magic wand: only pixels touching the one clicked (true), or that colour everywhere (false). */
  contiguous: boolean;
  /** Magnetic lasso: how strongly it clings to an edge, 1 (only right beside it) to 10 (from a good way off). */
  cling: number;
}

export const DEFAULT_SELECT_SETTINGS: SelectSettings = { op: 'replace', tolerance: 0, contiguous: true, cling: 5 };

/** How far from an edge (screen pixels) the magnetic lasso still clings to it, for a cling setting of 1 to 10. */
export const clingReach = (cling: number): number => 3 + Math.max(1, Math.min(10, Math.round(cling))) * 3;

const KEY = 'frameling.selectSettings';
let state: SelectSettings = { ...DEFAULT_SELECT_SETTINGS };
const listeners = new Set<() => void>();

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULT_SELECT_SETTINGS) as (keyof SelectSettings)[]) {
        if (typeof saved[k] === typeof DEFAULT_SELECT_SETTINGS[k]) (state as unknown as Record<string, unknown>)[k] = saved[k];
      }
    }
  }
} catch {
  // start from the defaults
}

export function getSelectSettings(): SelectSettings {
  return state;
}

export function setSelectSettings(patch: Partial<SelectSettings>): void {
  state = { ...state, ...patch };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function useSelectSettings<T>(selector: (s: SelectSettings) => T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => selector(state),
  );
}

export function onSelectSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
