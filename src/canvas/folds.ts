// Which "More ... options" folds in the tool options are open, remembered between sessions. Folds start shut, so
// the panel opens on the few things most people reach for.
import { useSyncExternalStore } from 'react';

export type Folds = Record<string, boolean>;

const KEY = 'frameling.optionFolds';

/** Reads the saved text back into folds, ignoring anything that isn't a plain on/off per name. Pure, so it's tested. */
export function parseFolds(raw: string | null | undefined): Folds {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Folds = {};
    for (const [k, on] of Object.entries(v)) if (typeof on === 'boolean') out[k] = on;
    return out;
  } catch {
    return {};
  }
}

export const isFoldOpen = (folds: Folds, name: string): boolean => folds[name] === true;

/** The folds with one set. Shut folds are dropped, so what's saved is only what's open. */
export function withFold(folds: Folds, name: string, open: boolean): Folds {
  const next = { ...folds };
  if (open) next[name] = true;
  else delete next[name];
  return next;
}

let state: Folds = {};
try {
  if (typeof localStorage !== 'undefined') state = parseFolds(localStorage.getItem(KEY));
} catch {
  // unreadable: everything starts shut
}
const listeners = new Set<() => void>();

export function setFold(name: string, open: boolean): void {
  if (isFoldOpen(state, name) === open) return;
  state = withFold(state, name, open);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export const getFold = (name: string): boolean => isFoldOpen(state, name);
export const toggleFold = (name: string): void => setFold(name, !getFold(name));

export function useFold(name: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => isFoldOpen(state, name),
  );
}
