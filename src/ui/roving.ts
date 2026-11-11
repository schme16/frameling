// Arrow keys in a row of choices (role=radiogroup) move to the next choice and pick it, the way radio buttons work.
// One listener covers every radiogroup in every panel and dialog, so new panels get it for free. Tab strips and
// menus handle their own arrows.
const RADIO = '[role="radio"]:not([disabled]):not([aria-disabled="true"])';

/** Where an arrow, Home or End key goes in a row of `n` choices from `i`. -1 when the key isn't one of those. */
export function nextIndex(key: string, i: number, n: number): number {
  if (n <= 0) return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % n;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return -1;
}

export function handleRovingKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return false;
  const t = e.target;
  if (!(t instanceof HTMLElement) || t.getAttribute('role') !== 'radio') return false;
  const group = t.closest('[role="radiogroup"]');
  if (!group) return false;
  const items = [...group.querySelectorAll<HTMLElement>(RADIO)].filter((el) => el.closest('[role="radiogroup"]') === group);
  const to = nextIndex(e.key, items.indexOf(t), items.length);
  if (to < 0 || items.indexOf(t) < 0) return false;
  // Taken here, so the canvas doesn't also nudge the selection with the same arrow.
  e.preventDefault();
  items[to].focus();
  if (items[to].getAttribute('aria-checked') !== 'true') items[to].click();
  return true;
}

export function installRovingKeys(): () => void {
  const on = (e: KeyboardEvent) => void handleRovingKey(e);
  document.addEventListener('keydown', on);
  return () => document.removeEventListener('keydown', on);
}
