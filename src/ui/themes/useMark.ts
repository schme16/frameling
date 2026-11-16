// How a theme card says which of your two themes it is: for day, for night, or for both. Pure words and shapes here,
// so the card, its screen reader name and the tests all agree.

/** Which of your two themes a card is. */
export interface ThemeUse {
  day: boolean;
  night: boolean;
}

export type UseKind = 'none' | 'day' | 'night' | 'both';

export const useKind = (u: ThemeUse): UseKind => (u.day && u.night ? 'both' : u.day ? 'day' : u.night ? 'night' : 'none');

/** The short line a card can carry under its name. Same plain words as the menu: by day, at night, for both. */
export const USE_WORDS: Record<UseKind, string> = { none: '', day: 'By day', night: 'At night', both: 'Day and night' };

/** The card's name for a screen reader. */
export const USE_SAYS: Record<UseKind, string> = {
  none: 'not in use',
  day: 'your theme by day',
  night: 'your theme at night',
  both: 'your theme by day and at night',
};

/** The icons a card shows, in order: the sun and the moon as they apply. */
export const useIcons = (u: ThemeUse): Array<'sun' | 'moon'> => [...(u.day ? (['sun'] as const) : []), ...(u.night ? (['moon'] as const) : [])];

/**
 * Where a card says it. `label` is a small mark in the tick's place, `words` is a line under the name, `preview` puts
 * the sun and moon in the picture's own title bar. `words` is the one the app ships with (nothing sits over the picture,
 * the name keeps its room); the others are only for the side by side shots (a `?debug` window sets `window.__framelingBothStyle`).
 */
export type UseStyle = 'label' | 'words' | 'preview';

export const DEFAULT_USE_STYLE: UseStyle = 'words';

export function useStyle(): UseStyle {
  if (!/[?&]debug/.test(location.search)) return DEFAULT_USE_STYLE;
  const v = (window as unknown as { __framelingBothStyle?: string }).__framelingBothStyle;
  return v === 'words' || v === 'preview' || v === 'label' ? v : DEFAULT_USE_STYLE;
}
