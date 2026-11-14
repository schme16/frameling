// Finding a row on a Preferences page by the words it carries, and lighting it for a moment so you learn where it lives.
const CANDIDATES = '.ui-pref-text strong, .ui-keyrow-name span, h3, h4, th, strong, legend, button, label, [aria-label]';
/** What to light: the row round the words, or the heading itself when it is one. */
const BLOCK = '.ui-pref-row, .ui-keyrow, .ui-ws-list > li, .th-section, .th-current, .sn-master, .sn-distance, .sn-all-layers, .plugin-page-actions';

const tidy = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\.\.\.|…|:)\s*$/, '')
    .trim();

/** The element to light for `text` on a page: an exact match first, then one that starts with it, then one that holds it. */
export function findOnPage(root: ParentNode, text: string): HTMLElement | null {
  const want = tidy(text);
  if (!want) return null;
  const all = [...root.querySelectorAll<HTMLElement>(CANDIDATES)].map((el) => ({ el, said: tidy(el.getAttribute('aria-label') ?? el.textContent ?? '') })).filter((c) => c.said);
  const hit = all.find((c) => c.said === want) ?? all.find((c) => c.said.startsWith(want)) ?? (want.length > 4 ? all.find((c) => c.said.includes(want)) : undefined);
  if (!hit) return null;
  const el = hit.el;
  if (/^H[34]$/.test(el.tagName)) return el;
  return (el.closest(BLOCK) as HTMLElement | null) ?? el;
}

/**
 * Scrolls to the words and lights them for a couple of seconds. The page may still be drawing, so it looks again for
 * a moment. Returns a function that stops and tidies up.
 */
export function lightRow(root: ParentNode | null, text: string, hold = 2400): () => void {
  let timer = 0;
  let frame = 0;
  let lit: HTMLElement | null = null;
  let tries = 0;
  const look = () => {
    const el = root && findOnPage(root, text);
    if (!el) {
      if (++tries < 12) frame = requestAnimationFrame(look);
      return;
    }
    el.classList.add('is-lit');
    el.scrollIntoView({ block: 'center' });
    lit = el;
    timer = window.setTimeout(() => el.classList.remove('is-lit'), hold);
  };
  look();
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    lit?.classList.remove('is-lit');
  };
}
