// What the Colours panel's row of picture tiles holds, and the small sums behind the opacity box. No DOM, so it is tested.
import { gradientCss } from '../core/gradient';
import type { GradientKind } from '../core/format';
import { alphaByte, solidOf } from './colors';

/** A tile in the row under the fill and stroke boxes: what the box in front is made of. */
export type KindChoice = 'none' | 'solid' | GradientKind;

export interface KindTile {
  id: KindChoice;
  /** The word under the picture. */
  label: string;
  /** The tooltip, plain words first and the industry term second. */
  title: string;
  /** A kebab-case id for the tests that check two panels offer the same control. */
  control: string;
}

/** In the order they sit in the row. None is first: "no paint" is one of the things a box can be. */
export const KIND_TILES: readonly KindTile[] = [
  { id: 'none', label: 'None', title: 'No colour: the fill or outline is left off', control: 'paint-none' },
  { id: 'solid', label: 'Solid', title: 'One colour', control: 'paint-solid' },
  { id: 'linear', label: 'Linear', title: 'Colours blending along a straight line (linear gradient)', control: 'paint-linear' },
  { id: 'radial', label: 'Radial', title: 'Colours blending out from the middle in a circle (radial gradient)', control: 'paint-radial' },
  { id: 'angular', label: 'Angular', title: 'Colours sweeping round the middle like a colour wheel or a pie (angular, or conic, gradient)', control: 'paint-angular' },
  { id: 'diamond', label: 'Diamond', title: 'Colours stepping out from the middle in a square turned on its corner (diamond gradient)', control: 'paint-diamond' },
];

/** The tiles to show: the Pixel workspace's Paint always has a colour, so it has no None. */
export const tilesFor = (paintAndBack: boolean): readonly KindTile[] => (paintAndBack ? KIND_TILES.filter((t) => t.id !== 'none') : KIND_TILES);

/** Which tile is lit. `kind` is '' when the picked shapes differ, so none of them is. */
export function tileIsOn(id: KindChoice, now: { none: boolean; kind: Exclude<KindChoice, 'none'> | '' }): boolean {
  if (id === 'none') return now.none;
  return !now.none && now.kind === id;
}

/** The picture on a tile, painted in the colour you have now: a flat colour, or white blending into it. */
export function tilePicture(id: Exclude<KindChoice, 'none'>, colour: string): string {
  const base = alphaByte(colour) < 255 ? colour : solidOf(colour);
  if (id === 'solid') return `linear-gradient(${base}, ${base})`;
  return gradientCss({ kind: id, stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: base }] }, 0);
}

/** How many tiles go on a line: all of them, or three to a line when the panel is narrow. Never a list one to a line. */
export const TILE_COLUMNS = { narrow: 3 } as const;
/** A tile needs about 40px for its word, and there are 4px between them. */
export const TILE_WIDTH = 40;
export const TILE_GAP = 4;
/** The panel's inner width (px) under which the tiles go three to a line. 260 for six, 216 for five. */
export const tilesNarrowBelow = (tiles: number): number => tiles * TILE_WIDTH + (tiles - 1) * TILE_GAP;
export const tileColumns = (innerWidth: number, tiles: number): number => (innerWidth >= tilesNarrowBelow(tiles) ? tiles : Math.min(tiles, TILE_COLUMNS.narrow));

// ---------------------------------------------------------------- the opacity box

/** Reads what was typed in the opacity box: a whole percent from 0 to 100, with or without the % sign. Null when it is not a number. */
export function parsePercent(text: string): number | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/.exec(text);
  if (!m) return null;
  return clampPercent(parseFloat(m[1]));
}

export const clampPercent = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

/** What the up and down arrows do in the opacity box: one step, ten with Shift, never past 0 or 100. */
export function nudgePercent(pct: number, dir: 1 | -1, shift = false): number {
  return clampPercent(pct + dir * (shift ? 10 : 1));
}

// ---------------------------------------------------------------- the swatches heading

/** The name shown beside "Swatches". Today the swatches belong to the drawing, so that is the whole name. */
export const swatchesWhere = (_count: number): string => 'This drawing';
/** The count after it, which a narrow panel leaves off. */
export const swatchesCount = (count: number): string => (count === 1 ? ', 1 colour' : `, ${count} colours`);
