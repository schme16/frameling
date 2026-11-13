// Options for the Select tool (how it picks, and the magic wand's settings), kept in the browser's storage like the
// other tool options.
import { useSyncExternalStore } from 'react';
import type { SelectOp } from './mask';

/**
 * Box (a rectangle), lasso (draw round it freehand), polygon (click each corner) or magic wand (click a colour,
 * pixel layers only).
 */
export type SelectMode = 'box' | 'lasso' | 'polygon' | 'wand';

export interface SelectSettings {
  mode: SelectMode;
  /** What a new selection does when no key is held (Shift always adds, Alt always takes away). */
  op: Exclude<SelectOp, 'intersect'>;
  /** Magic wand: how close a colour has to be, 0 to 100 (percent). */
  tolerance: number;
  /** Magic wand: only pixels touching the one clicked (true), or that colour everywhere (false). */
  contiguous: boolean;
}

export const DEFAULT_SELECT_SETTINGS: SelectSettings = { mode: 'box', op: 'replace', tolerance: 0, contiguous: true };

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
