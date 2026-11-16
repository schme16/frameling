// How a theme card says which of your two themes it is: for day, for night, or for both. Pure words and shapes here,
// so the card, its screen reader name and the tests all agree.

/** Which of your two themes a card is. */
export interface ThemeUse {
  day: boolean;
  night: boolean;
}

export type UseKind = 'none' | 'day' | 'night' | 'both';

export const useKind = (u: ThemeUse): UseKind => (u.day && u.night ? 'both' : u.day ? 'day' : u.night ? 'night' : 'none');

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
 * The wobbly edge of a splotch, in a 100 x 100 box, from the card's top corner (100,0) down and round to the card's
 * side (0,100). This is the day splotch, in the top left corner; the night splotch is the same line mirrored, so the two
 * are the same size and shape and only face each other.
 */
const SPLOTCH_EDGE: ReadonlyArray<readonly [number, number]> = [
  [100, 0], [99.8, 5.2], [99.9, 10.6], [99.2, 16], [96.7, 21], [92.3, 25.4], [87.3, 29.3], [83.4, 33.3], [81.7, 38.2], [82.2, 44.4],
  [83.4, 51.5], [83.3, 58.3], [80.3, 63.5], [74.3, 66.1], [66.6, 66.6], [59.1, 66.4], [53.4, 67.7], [50, 71.5], [47.9, 77.8], [45.9, 85],
  [42.7, 91], [37.9, 94.5], [32.1, 95.1], [26, 94.3], [20.3, 93.6], [15.1, 94.2], [10.2, 96.2], [5.2, 98.6], [0, 100],
];

/** Which corner a splotch sits in: the sun's splotch top left, the moon's top right. */
export type SplotchSide = 'day' | 'night';

/** The edge of a splotch as points, for the side it is on. Night is day flipped left to right. */
export function splotchEdge(side: SplotchSide): Array<[number, number]> {
  return SPLOTCH_EDGE.map(([x, y]) => [side === 'day' ? x : Math.round((100 - x) * 10) / 10, y]);
}

/** The same edge as an SVG `points` string. The yellow is the polygon closed through the card's corner (0,0 or 100,0). */
export const splotchEdgePoints = (side: SplotchSide): string => splotchEdge(side).map(([x, y]) => `${x},${y}`).join(' ');
export const splotchFillPoints = (side: SplotchSide): string => `${splotchEdgePoints(side)} ${side === 'day' ? '0,0' : '100,0'}`;

/** The splotches a card carries, left to right: the day one on the left and the night one on the right, each only when it applies. */
export const useSplotches = (u: ThemeUse): SplotchSide[] => [...(u.day ? (['day'] as const) : []), ...(u.night ? (['night'] as const) : [])];
