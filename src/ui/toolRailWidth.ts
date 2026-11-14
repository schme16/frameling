// How wide the tool rail is. Pure: no DOM, no storage, so it can be tested alone. The rail starts at its natural width
// (two buttons across, or one in the one-per-group style); pulling its edge sets a width in pixels instead, kept per
// workspace. The width decides how many buttons fit across, and how much of a group's name shows.

export type RailLook = 'cosy' | 'crisp';
export type RailSize = 'small' | 'medium' | 'large';
export type RailStyle = 'two' | 'stacked';

/** The pixel sizes the rail's CSS works from (--tool, --tool-pad, and the gap between buttons). A test keeps them in step with ui.css. */
export interface RailSizes {
  tool: number;
  pad: number;
  gap: number;
}

const SIZES: Record<RailLook, Record<RailSize, RailSizes>> = {
  cosy: {
    small: { tool: 30, pad: 14, gap: 4 },
    medium: { tool: 38, pad: 18, gap: 4 },
    large: { tool: 46, pad: 20, gap: 4 },
  },
  crisp: {
    small: { tool: 28, pad: 12, gap: 2 },
    medium: { tool: 34, pad: 14, gap: 2 },
    large: { tool: 42, pad: 16, gap: 2 },
  },
};

export const railSizes = (look: RailLook, size: RailSize): RailSizes => SIZES[look]?.[size] ?? SIZES.cosy.medium;

/**
 * The widest the rail goes. The longest group name the rail starts with ("Colour and pixel extras", in small capitals)
 * wants about 172px with its room, and 196px while the tools are being changed (a fold arrow sits beside it). 280
 * leaves room for a name of your own half as long again, without the rail eating the canvas.
 */
export const RAIL_MAX = 280;

/** How far the keys move the edge: a step, and a big step with Shift. */
export const RAIL_STEP = 16;
export const RAIL_BIG_STEP = 64;

/** The width the rail has before anyone pulls it: two buttons across, or one for the one-per-group style. */
export function naturalRailWidth(s: RailSizes, style: RailStyle): number {
  return style === 'stacked' ? s.tool + s.pad - 6 : s.tool * 2 + s.pad;
}

/** The narrowest the rail goes: one button across, with its edges. */
export const minRailWidth = (s: RailSizes): number => s.tool + s.pad - 6;

/** A width held to the limits (whole pixels). Anything that is not a number is the narrowest. */
export function clampRailWidth(w: number, s: RailSizes): number {
  const n = Number.isFinite(w) ? Math.round(w) : 0;
  return Math.max(minRailWidth(s), Math.min(RAIL_MAX, n));
}

/** How wide the rail is to start with: the natural width, or the saved one held to the limits. */
export const railWidthNow = (saved: number | undefined, s: RailSizes, style: RailStyle): number => (saved === undefined ? naturalRailWidth(s, style) : clampRailWidth(saved, s));

/** How many buttons fit across a group at a width, at least one. The two-across style lines up with the natural width: 94px is two. */
export function buttonsAcross(width: number, s: RailSizes): number {
  const n = Math.floor((width - s.pad + 2 * s.gap) / (s.tool + s.gap));
  return Number.isFinite(n) ? Math.max(1, n) : 1;
}

/** The buttons across for the style: the one-per-group style has one button a group, whatever the width. */
export const acrossFor = (width: number, s: RailSizes, style: RailStyle): number => (style === 'stacked' ? 1 : buttonsAcross(width, s));

/** One more (or fewer) button column of width. */
export const columnStep = (s: RailSizes): number => s.tool + s.gap;

/**
 * The width that shows every group name whole: the room the widest name wants, but never less than the natural width
 * (a short name is no reason to take the icons down to one across).
 */
export function fitRailWidth(wanted: number, s: RailSizes, style: RailStyle): number {
  const w = Number.isFinite(wanted) ? Math.ceil(wanted) : 0;
  return clampRailWidth(Math.max(w, naturalRailWidth(s, style)), s);
}

/**
 * What a saved width becomes once it is chosen: the natural width, or one close enough to it to be the same thing,
 * is kept as "no width" so the rail goes on following its style and button size.
 */
export function chosenRailWidth(w: number, s: RailSizes, style: RailStyle): number | undefined {
  const c = clampRailWidth(w, s);
  return c === naturalRailWidth(s, style) ? undefined : c;
}

/** A saved width from outside (a save, a file) made safe: whole pixels between 20 and RAIL_MAX, or nothing. */
export function cleanRailWidth(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.round(v);
  return n >= 20 && n <= RAIL_MAX ? n : n > RAIL_MAX ? RAIL_MAX : undefined;
}
