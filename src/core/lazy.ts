// Parts of the app that load when first used rather than at start-up (code splitting). Each one is fetched once; the
// promise is kept, so a second use waits on the same download. Once the app is up and idle, the likely ones are fetched
// in the background too, so the first click on Export doesn't wait either.
import { createElement, lazy, Suspense, type ComponentType, type ReactElement } from 'react';

export type Loader<T> = () => Promise<T>;

const warmList: Loader<unknown>[] = [];
let warmStarted = false;

/** A loader that only ever runs `load` once. With `warm`, it is also fetched in idle time after start-up. */
export function lazyModule<T>(load: Loader<T>, opts: { warm?: boolean } = {}): Loader<T> {
  let p: Promise<T> | null = null;
  const get = () => {
    if (!p) {
      p = load();
      // A failed fetch (offline with no saved copy, say) can be tried again next time.
      p.catch(() => (p = null));
    }
    return p;
  };
  if (opts.warm) {
    warmList.push(get);
    if (warmStarted) scheduleWarm();
  }
  return get;
}

/** A React component from a lazily loaded module, shown once loaded (nothing in its place until then). */
export function lazyComponent<P extends object>(load: Loader<ComponentType<P>>): (props: P) => ReactElement {
  const L = lazy(() => load().then((c) => ({ default: c })));
  return (props: P) => createElement(Suspense, { fallback: null }, createElement(L as ComponentType<P>, props));
}

function idle(fn: () => void, timeout: number): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else setTimeout(fn, 50);
}

function scheduleWarm(): void {
  // One at a time, each in its own idle slot, so a person drawing straight away never feels it.
  const next = () => {
    const l = warmList.shift();
    if (!l) return;
    idle(() => void l().then(next, next), 4000);
  };
  next();
}

/** Starts fetching the `warm` parts in the background. Called once the first frame is up. */
export function warmLazyParts(delayMs = 1500): void {
  if (warmStarted || typeof window === 'undefined') return;
  warmStarted = true;
  setTimeout(scheduleWarm, delayMs);
}

/** A dock panel whose code loads when it's first shown (or in idle time after start-up). */
export function lazyPanel(load: Loader<ComponentType>): ComponentType {
  return lazyComponent<object>(lazyModule(load, { warm: true })) as ComponentType;
}
