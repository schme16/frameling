// Reads theme tokens (CSS variables) for the things drawn on a canvas, which can't use CSS directly. Cached, and
// cleared when the theme or look changes, so switching dark/light recolours the handles and grid straight away.
// Whatever draws with these colours (the engine) subscribes with `subscribeTheme` to repaint when that happens.

const cache = new Map<string, string>();
const listeners = new Set<() => void>();
let watching = false;

function changed(): void {
  cache.clear();
  for (const fn of listeners) fn();
}

function watch(): void {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  // The style attribute is where live token edits land (a theme being tweaked), the others are theme and look picks.
  new MutationObserver(changed).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look', 'class', 'style'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', changed);
}

/** Calls `fn` after the theme tokens have changed (and the cache is clear). Returns the unsubscribe. */
export function subscribeTheme(fn: () => void): () => void {
  watch();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The value of a theme token, e.g. `cssVar('--grape')`. Falls back to `fallback` outside a page. */
export function cssVar(name: string, fallback = '#9b7bff'): string {
  if (typeof document === 'undefined') return fallback;
  watch();
  let v = cache.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    cache.set(name, v);
  }
  return v;
}
