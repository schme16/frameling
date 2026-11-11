// A tiny external store for UI state that isn't the document (prefs, dock layout, overlays, toasts), plus safe
// localStorage helpers. Storage can be missing or full (private windows, tests), so every call is wrapped.
import { useSyncExternalStore } from 'react';

export interface MiniStore<T> {
  get(): T;
  set(next: T | ((old: T) => T)): void;
  subscribe(fn: () => void): () => void;
  /** Read a slice in a component. The selector must return something stable (a primitive or a part of the state). */
  use<S>(selector: (v: T) => S): S;
}

export function createStore<T>(initial: T): MiniStore<T> {
  let value = initial;
  const subs = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    subs.add(fn);
    return () => void subs.delete(fn);
  };
  return {
    get: () => value,
    set(next) {
      const n = typeof next === 'function' ? (next as (o: T) => T)(value) : next;
      if (n === value) return;
      value = n;
      for (const f of [...subs]) f();
    },
    subscribe,
    use: (selector) => useSyncExternalStore(subscribe, () => selector(value)),
  };
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...(typeof fallback === 'object' && fallback ? fallback : {}), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or unavailable. Nothing to do; the app still works for this session.
  }
}

export function readRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
