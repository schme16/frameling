// How wide the tool rail is. Pure: no DOM, no storage, so it can be tested alone. The rail starts at its natural width
// (two buttons across, or one in the one-per-group style); pulling its edge sets a width in pixels instead, kept per
// workspace. The width decides how many buttons fit across, and how much of a group's name shows.

import { BUILTIN_RAILS, DEFAULT_GROUPS, OTHER_GROUP } from './toolArrange';

export type RailLook = 'cosy' | 'crisp';
export type RailSize = 'small' | 'medium' | 'large';
export type RailStyle = 'two' | 'stacked';

/** The pixel sizes the rail's CSS works from (--tool, --tool-pad, and the gap between buttons). A test keeps them in step with ui.css. */
export interface RailSizes {
  /** The look the sizes are for: it decides the font, so how wide the switch's words are. */
  look: RailLook;
  tool: number;
  pad: number;
  gap: number;
}

const SIZES: Record<RailLook, Record<RailSize, Omit<RailSizes, 'look'>>> = {
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

export const railSizes = (look: RailLook, size: RailSize): RailSizes => {
  const found = SIZES[look]?.[size];
  return found ? { look, ...found } : { look: 'cosy', ...SIZES.cosy.medium };
};

/**
 * The widest the rail goes. The longest built-in group name ("Rig and motion", in small capitals) wants about 124px with
 * its room, and a name of your own, say "Colour and pixel extras", about 172px (196px while the tools are being changed,
 * with a fold arrow beside it). 280 leaves room for a name half as long again, without the rail eating the canvas.
 */
export const RAIL_MAX = 280;

/** How far the keys move the edge: a step, and a big step with Shift. */
export const RAIL_STEP = 16;
export const RAIL_BIG_STEP = 64;

/** The width the buttons alone give the rail: two across, or one for the one-per-group style. */
export const buttonsRailWidth = (s: RailSizes, style: RailStyle): number => (style === 'stacked' ? s.tool + s.pad - 6 : s.tool * 2 + s.pad);

/**
 * The width the rail starts at. The one-per-group style is one button wide (its Pixels | Vectors switch shows as two
 * small icons there, with no words to fit). The two-across style is the largest of three things: the buttons, the
 * Pixels | Vectors switch above them (switchRoom, so "Vectors" is never cut to "Vect..."), and, when the group names
 * are showing, the longest built-in name (see startingNamesRoom).
 */
export function naturalRailWidth(s: RailSizes, style: RailStyle, names = false): number {
  const buttons = buttonsRailWidth(s, style);
  if (style === 'stacked') return buttons;
  return Math.max(buttons, switchRoom(s.look), names ? startingNamesRoom() : 0);
}

// How wide a group name is. The names are in small capitals (10px, weight 800, letter-spacing 0.06em: .ui-tool-head in
// ui.css), so only the capitals matter. These are each letter's width in em, measured in the app's own font (Nunito) with
// the letter-spacing in; a test holds the working-out to what the real rail measures.
const LETTER_EM: Record<string, number> = {
  A: 0.814, B: 0.756, C: 0.745, D: 0.834, E: 0.666, F: 0.631, G: 0.803, H: 0.841, I: 0.358, J: 0.433, K: 0.748, L: 0.634, M: 0.938,
  N: 0.814, O: 0.856, P: 0.725, Q: 0.856, R: 0.756, S: 0.702, T: 0.692, U: 0.803, V: 0.788, W: 1.181, X: 0.745, Y: 0.692, Z: 0.675,
  ' ': 0.338, '.': 0.32, ',': 0.32, '-': 0.5, '/': 0.392, '&': 0.806, '(': 0.442, ')': 0.442, "'": 0.317,
};
const DIGIT_EM = 0.661;
/** What a character not in the table (a letter of another script, an emoji) is taken to be: wide, so the room is never short. */
const OTHER_EM = 0.9;
/** The name's font size in px, and the room its row takes either side of the words (8px of padding each side). */
export const HEAD_FONT = 10;
export const HEAD_SIDES = 16;
/** A little over what is measured, because the page zoom (125%, 150%) rounds its text a touch differently. */
const HEAD_SLACK = 1.02;

/** How wide a piece of a group name is, in px, as small capitals. */
export function nameTextWidth(text: string): number {
  let em = 0;
  for (const ch of text.toUpperCase()) em += LETTER_EM[ch] ?? (ch >= '0' && ch <= '9' ? DIGIT_EM : OTHER_EM);
  return Math.ceil(em * HEAD_FONT * HEAD_SLACK);
}

/** The width a name needs to sit on one line, with the room either side of it. */
export const nameRoom = (name: string): number => nameTextWidth(name) + HEAD_SIDES;

/**
 * The width a name needs when it may take two lines: the best split between two words. A name of one word, or whose
 * longest word is wider than a line, needs that word's width.
 */
export function nameRoomTwoLines(name: string): number {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return nameRoom(name);
  let best = Infinity;
  for (let i = 1; i < words.length; i++) {
    best = Math.min(best, Math.max(nameTextWidth(words.slice(0, i).join(' ')), nameTextWidth(words.slice(i).join(' '))));
  }
  return best + HEAD_SIDES;
}

/** The names a rail starts with: the built-in groups, and the ones the Pixel workspace names for itself. */
export function builtinGroupNames(): string[] {
  const own = Object.values(BUILTIN_RAILS).flatMap((gs) => gs.map((g) => g.name).filter((n): n is string => !!n));
  return [...new Set([...DEFAULT_GROUPS.map((g) => g.name), OTHER_GROUP.name, ...own])];
}

/** The widest of the names, each on one line. Worked out from the names, never a number picked by eye. */
export const widestNameRoom = (names: string[] = builtinGroupNames()): number => names.reduce((w, n) => Math.max(w, nameRoom(n)), 0);

/**
 * The scrollbar the rail grows when its tools do not all fit the window's height (a 1280 x 720 laptop): Chromium's thin
 * one, which takes 10px off the rail's inside (.ui-app * in ui.css). Counted in, so a name that fits stays on one line there too.
 */
export const RAIL_SCROLLBAR = 10;

/** The room the rail starts with when names show: the longest built-in name on one line, and the scrollbar's room, never past RAIL_START_MAX. */
export const startingNamesRoom = (): number => Math.min(RAIL_START_MAX, widestNameRoom() + RAIL_SCROLLBAR);

/** The most a rail starts at, whatever the names: a name of a long word is cut short or dropped to two lines instead. */
export const RAIL_START_MAX = 160;

// The Pixels | Vectors switch at the top of the rail (.ui-tool-switch in ui.css): two buttons of equal width, each with its
// word in 12px weight 800, mixed case. Each letter's width in em, measured in the look's own font (Nunito for cosy, the
// wider Inter for crisp); a test holds the working-out to what the real switch measures. The words are fixed, so this is
// a small exact sum.
const SWITCH_EM: Record<RailLook, Record<string, number>> = {
  cosy: { P: 0.664, i: 0.268, x: 0.56, e: 0.55, l: 0.334, s: 0.493, V: 0.728, c: 0.48, t: 0.405, o: 0.59, r: 0.413 },
  crisp: { P: 0.653, i: 0.284, x: 0.596, e: 0.602, l: 0.284, s: 0.575, V: 0.77, c: 0.597, t: 0.383, o: 0.62, r: 0.421 },
};
/** The two words on the switch: drawingMode.ts says them, and a test checks nothing else is on it. */
export const SIDE_WORDS = { pixel: 'Pixels', vector: 'Vectors' } as const;
/** The word's font size in px (--fs-small). */
export const SWITCH_FONT = 12;
/**
 * What the switch takes around its two words, before the scrollbar: 4px of padding inside each button (8), the switch's
 * own padding (4), border (2) and the 2px between its buttons, and its 4px margin each side (8). The rail's own 1px
 * border is outside the width it is given. See .ui-tool-switch and .ui-tool-side in ui.css; a test keeps them in step.
 */
export const SWITCH_FRAME = 24;

/** How wide a word on the switch is, in px. A letter not in the table is taken to be wide, so the room is never short. */
export function switchWordWidth(word: string, look: RailLook): number {
  let em = 0;
  for (const ch of word) em += SWITCH_EM[look][ch] ?? OTHER_EM;
  return Math.ceil(em * SWITCH_FONT * HEAD_SLACK);
}

/**
 * The rail width the switch needs to show both words whole: the buttons share the width equally, so the wider word
 * counts twice. The scrollbar's room is counted in, as it is for the names (a short window adds one).
 */
export const switchRoom = (look: RailLook): number => 2 * Math.max(...Object.values(SIDE_WORDS).map((w) => switchWordWidth(w, look))) + SWITCH_FRAME + RAIL_SCROLLBAR;

/** The narrowest the rail goes: one button across, with its edges. */
export const minRailWidth = (s: RailSizes): number => s.tool + s.pad - 6;

/** A width held to the limits (whole pixels). Anything that is not a number is the narrowest. */
export function clampRailWidth(w: number, s: RailSizes): number {
  const n = Number.isFinite(w) ? Math.round(w) : 0;
  return Math.max(minRailWidth(s), Math.min(RAIL_MAX, n));
}

/** How wide the rail is to start with: the natural width, or the saved one held to the limits. */
export const railWidthNow = (saved: number | undefined, s: RailSizes, style: RailStyle, names = false): number => (saved === undefined ? naturalRailWidth(s, style, names) : clampRailWidth(saved, s));

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
export function fitRailWidth(wanted: number, s: RailSizes, style: RailStyle, names = false): number {
  const w = Number.isFinite(wanted) ? Math.ceil(wanted) : 0;
  return clampRailWidth(Math.max(w, naturalRailWidth(s, style, names)), s);
}

/**
 * What a saved width becomes once it is chosen: the natural width, or one close enough to it to be the same thing,
 * is kept as "no width" so the rail goes on following its style and button size.
 */
export function chosenRailWidth(w: number, s: RailSizes, style: RailStyle, names = false): number | undefined {
  const c = clampRailWidth(w, s);
  return c === naturalRailWidth(s, style, names) ? undefined : c;
}

/** A saved width from outside (a save, a file) made safe: whole pixels between 20 and RAIL_MAX, or nothing. */
export function cleanRailWidth(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.round(v);
  return n >= 20 && n <= RAIL_MAX ? n : n > RAIL_MAX ? RAIL_MAX : undefined;
}
