// Arrow keys in a row of choices, a list or a little menu move along it, so every panel and dialog gets them for free:
// - radio buttons (role=radiogroup): move and pick, the way radio buttons work;
// - lists (role=listbox) and menus (role=menu): move only, Enter or Space picks.
// Anything that handles its own arrows (tab strips, the menu bar) calls preventDefault first and is left alone.
const LIVE = ':not([disabled]):not([aria-disabled="true"])';
const KINDS: { item: string; group: string; pick: boolean; upDownOnly: boolean }[] = [
  { item: 'radio', group: 'radiogroup', pick: true, upDownOnly: false },
  { item: 'option', group: 'listbox', pick: false, upDownOnly: false },
  { item: 'menuitem', group: 'menu', pick: false, upDownOnly: true },
  { item: 'menuitemcheckbox', group: 'menu', pick: false, upDownOnly: true },
  { item: 'menuitemradio', group: 'menu', pick: false, upDownOnly: true },
];

/** Where an arrow, Home or End key goes in a row of `n` choices from `i`. -1 when the key isn't one of those. */
export function nextIndex(key: string, i: number, n: number, upDownOnly = false): number {
  if (n <= 0) return -1;
  if (key === 'ArrowDown' || (!upDownOnly && key === 'ArrowRight')) return (i + 1) % n;
  if (key === 'ArrowUp' || (!upDownOnly && key === 'ArrowLeft')) return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return -1;
}

export function handleRovingKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return false;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  const kind = KINDS.find((k) => k.item === t.getAttribute('role'));
  if (!kind) return false;
  const group = t.closest(`[role="${kind.group}"]`);
  if (!group) return false;
  const sel = KINDS.filter((k) => k.group === kind.group).map((k) => `[role="${k.item}"]${LIVE}`).join(',');
  const items = [...group.querySelectorAll<HTMLElement>(sel)].filter((el) => el.closest(`[role="${kind.group}"]`) === group);
  const i = items.indexOf(t);
  const to = i < 0 ? -1 : nextIndex(e.key, i, items.length, kind.upDownOnly);
  if (to < 0) return false;
  // Taken here, so the canvas doesn't also nudge the selection with the same arrow.
  e.preventDefault();
  items[to].focus();
  if (kind.pick && items[to].getAttribute('aria-checked') !== 'true') items[to].click();
  return true;
}

export function installRovingKeys(): () => void {
  const on = (e: KeyboardEvent) => void handleRovingKey(e);
  document.addEventListener('keydown', on);
  return () => document.removeEventListener('keydown', on);
}
