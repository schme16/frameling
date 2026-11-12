// Reads the few things a quest needs that aren't in the store: the paint bucket's gap choice (module state) and
// the export dialog (which keeps its settings in React state, so the only way in is to read what's on screen).
import { allFormats } from '../export/types';
import { getFillOptions } from '../tools/fill-options';
import { NO_PROBE, type Probe } from './types';

const FORMAT_GROUP = '[role="radiogroup"][aria-label="Format"]';

/** The format cards in the export dialog, if it's open. */
function formatCards(): HTMLElement[] {
  if (typeof document === 'undefined') return [];
  return [...document.querySelectorAll<HTMLElement>(`${FORMAT_GROUP} [role="radio"]`)];
}

function formatOf(card: HTMLElement): string | null {
  const text = card.textContent ?? '';
  const hit = allFormats().filter((f) => text.includes(f.title)).sort((a, b) => b.title.length - a.title.length)[0];
  return hit?.id ?? null;
}

export function readProbe(): Probe {
  try {
    const cards = formatCards();
    const chosen = cards.find((c) => c.getAttribute('aria-checked') === 'true');
    return { fillGap: getFillOptions().gap, exportOpen: cards.length > 0, exportFormat: chosen ? formatOf(chosen) : null };
  } catch {
    return NO_PROBE;
  }
}

/** The "Animated GIF" card in the export dialog, to point at. */
export function gifCard(): Element | null {
  return formatCards().find((c) => formatOf(c) === 'gif') ?? null;
}

/** A format card in the export dialog by its id (PNG picture, Sprite sheet...), if it is showing. */
export function formatCard(id: string): Element | null {
  return formatCards().find((c) => formatOf(c) === id) ?? null;
}

/**
 * Picks a format card in the export dialog for "Show me how". The less usual ones are tucked under "More formats", so
 * that is opened first when the card is not showing yet.
 */
export function pickFormat(id: string): void {
  if (typeof document === 'undefined') return;
  const click = () => (formatCard(id) as HTMLElement | null)?.click();
  if (formatCard(id)) return click();
  (document.querySelector('.ex-more[aria-expanded="false"]') as HTMLElement | null)?.click();
  setTimeout(click, 60);
}
