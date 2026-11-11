// Reads theme tokens (CSS variables) for the things drawn on a canvas, which can't use CSS directly. Cached, and
// cleared when the theme or look changes, so switching dark/light recolours the handles and grid straight away.

const cache = new Map<string, string>();
let watching = false;

function watch(): void {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  new MutationObserver(() => cache.clear()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look', 'class'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => cache.clear());
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
