// The colour tokens a theme covers, what each is called for people, and how the "automatic" ones are worked out.
//
// A theme stores a concrete value for every token (so applying one is just writing CSS variables). Most of them are
// "core": something a person might want to change. The rest are "derived" from the core ones (a softer line, a hover
// shade, shadows), and the editor recalculates those when the colours they depend on change. The brand tokens are the
// friendly rainbow used for little highlights; themes keep them unless they have a reason to change them.
import { alpha, hexToHsl, hslToHex, mix } from './color';

export type ThemeMode = 'dark' | 'light';
export type ThemeTokens = Record<string, string>;

export const CORE_TOKENS = [
  'bg', 'panel', 'panel-2', 'raised', 'line', 'text', 'muted', 'faint', 'canvas-bg',
  'chosen-bg', 'chosen-fg', 'accent', 'focus', 'danger', 'ok', 'cel-key', 'playhead',
] as const;

export const BRAND_TOKENS = ['peach', 'rose', 'grape', 'sky', 'mint'] as const;

/** One colour per thing a snap can land on: the line on the canvas and the dot in the "Snapped to" note. Same order as the snapping options. */
export const SNAP_TOKENS = ['snap-page', 'snap-centre', 'snap-guides', 'snap-grid', 'snap-shapes', 'snap-spacing', 'snap-perspective', 'snap-plugins', 'snap-cells', 'snap-angles', 'snap-artboards'] as const;

/**
 * What the snap colours start as (the same values canvas.css holds as a fallback). The dark set reads 3:1 on white and
 * on every dark theme's surfaces, the light set on every light theme's, so any built-in theme can use its mode's set.
 */
export const SNAP_DEFAULTS: Record<ThemeMode, ThemeTokens> = {
  dark: {
    'snap-page': '#0e9a8c', 'snap-centre': '#4d88e8', 'snap-guides': '#d757c2', 'snap-grid': '#798aa5', 'snap-shapes': '#e45b72',
    'snap-spacing': '#d1700a', 'snap-perspective': '#9873ef', 'snap-plugins': '#1a9cc8', 'snap-cells': '#798aa5', 'snap-angles': '#aa8400', 'snap-artboards': '#2f9d44',
  },
  light: {
    'snap-page': '#00695f', 'snap-centre': '#1c4fb8', 'snap-guides': '#9c1488', 'snap-grid': '#4a5870', 'snap-shapes': '#b01f3e',
    'snap-spacing': '#9a4a00', 'snap-perspective': '#5a30b8', 'snap-plugins': '#0b6a8c', 'snap-cells': '#4a5870', 'snap-angles': '#6b5000', 'snap-artboards': '#1a6b2a',
  },
};

/** When a theme changes between dark and light, snap colours still on the old mode's default move to the new mode's. */
export function switchSnapMode(tokens: ThemeTokens, from: ThemeMode, to: ThemeMode): ThemeTokens {
  if (from === to) return tokens;
  const out = { ...tokens };
  for (const name of SNAP_TOKENS) if (out[name]?.toLowerCase() === SNAP_DEFAULTS[from][name].toLowerCase()) out[name] = SNAP_DEFAULTS[to][name];
  return out;
}

export const DERIVED_TOKENS = ['line-soft', 'hover-bg', 'peach-soft', 'cel', 'cel-hold', 'sunny', 'sunny-deep', 'stage-shadow', 'shadow', 'shadow-small'] as const;

/** Every token a theme has a value for. */
export const ALL_TOKENS: readonly string[] = [...CORE_TOKENS, ...BRAND_TOKENS, ...SNAP_TOKENS, ...DERIVED_TOKENS];

/** Tokens that hold a plain colour (everything but the shadows). */
export const COLOUR_TOKENS: readonly string[] = ALL_TOKENS.filter((t) => !isShadowToken(t));

export function isShadowToken(name: string): boolean {
  return name === 'stage-shadow' || name === 'shadow' || name === 'shadow-small';
}

export const BRAND: ThemeTokens = {
  peach: '#ff9e6d',
  rose: '#ff6f91',
  grape: '#9b7bff',
  sky: '#5ab8ff',
  mint: '#4fd1a5',
};

type Deriver = (t: ThemeTokens, mode: ThemeMode) => string;

/** How each derived token is worked out, and which core tokens it depends on. */
export const DERIVED: Record<string, { deps: string[]; make: Deriver }> = {
  'line-soft': { deps: ['line', 'panel'], make: (t) => mix(t.line, t.panel, 0.5) },
  'hover-bg': {
    deps: ['raised', 'line', 'panel-2'],
    make: (t, m) => (m === 'dark' ? mix(t.raised, t.line, 0.7) : mix(t['panel-2'], t.line, 0.5)),
  },
  // A faint warm tint of the panel, behind a warning. Text stays the theme's own text colour on it.
  'peach-soft': { deps: ['peach', 'panel'], make: (t) => mix(t.peach, t.panel, 0.14) },
  cel: { deps: ['cel-key', 'panel-2'], make: (t, m) => mix(t['cel-key'], t['panel-2'], m === 'dark' ? 0.55 : 0.45) },
  'cel-hold': { deps: ['cel-key', 'panel-2'], make: (t, m) => mix(t['cel-key'], t['panel-2'], m === 'dark' ? 0.3 : 0.22) },
  sunny: { deps: ['chosen-bg'], make: (t) => t['chosen-bg'] },
  'sunny-deep': {
    deps: ['chosen-bg'],
    make: (t) => {
      const [h, s, l] = hexToHsl(t['chosen-bg']);
      return hslToHex(h, s * 0.92, l - 0.11);
    },
  },
  'stage-shadow': { deps: ['text'], make: (t, m) => `0 6px 30px ${alpha(m === 'dark' ? '#000000' : t.text, m === 'dark' ? 0.45 : 0.18)}` },
  shadow: { deps: ['text'], make: (t, m) => `0 8px 28px ${alpha(m === 'dark' ? '#000000' : t.text, m === 'dark' ? 0.35 : 0.16)}` },
  'shadow-small': { deps: ['text'], make: (t, m) => `0 2px 8px ${alpha(m === 'dark' ? '#000000' : t.text, m === 'dark' ? 0.25 : 0.12)}` },
};

/**
 * Fills in the derived tokens. With `changed` (the core tokens just edited) only the ones that depend on those are
 * recalculated; without it, all of them are.
 */
export function deriveTokens(tokens: ThemeTokens, mode: ThemeMode, changed?: Iterable<string>): ThemeTokens {
  const out = { ...tokens };
  const touched = changed ? new Set(changed) : null;
  for (const [name, d] of Object.entries(DERIVED)) {
    if (touched && !d.deps.some((x) => touched.has(x))) continue;
    out[name] = d.make(out, mode);
  }
  return out;
}

// ---------------------------------------------------------------- what the editor shows

export interface EditorGroup {
  id: string;
  label: string;
  hint: string;
}

export interface EditorControl {
  token: string;
  label: string;
  hint: string;
  group: string;
}

export const EDITOR_GROUPS: EditorGroup[] = [
  { id: 'background', label: 'Background', hint: 'The colour behind everything.' },
  { id: 'panels', label: 'Panels', hint: 'The boxes that hold tools, layers and the timeline.' },
  { id: 'text', label: 'Text', hint: 'Words and labels.' },
  { id: 'accent', label: 'Accent (gold)', hint: 'The colour of whatever you have chosen: the tool, the tab, a switch that is on.' },
  { id: 'timeline', label: 'Timeline', hint: 'Frames and the playhead.' },
  { id: 'canvas', label: 'Canvas surround', hint: 'The area around your drawing.' },
  { id: 'messages', label: 'Messages', hint: 'Warnings and good news.' },
  { id: 'snapping', label: 'Snapping', hint: 'The line you see, and the dot in the "Snapped to" note, when a shape lands on something. One colour for each.' },
];

export const EDITOR_CONTROLS: EditorControl[] = [
  { token: 'bg', label: 'App background', hint: 'Behind the panels and the top bar.', group: 'background' },
  { token: 'panel', label: 'Panel', hint: 'The main colour of panels and dialogs.', group: 'panels' },
  { token: 'panel-2', label: 'Panel, second shade', hint: 'Headers, wells and the timeline strip.', group: 'panels' },
  { token: 'raised', label: 'Buttons and cards', hint: 'Things that sit on top of a panel.', group: 'panels' },
  { token: 'line', label: 'Borders', hint: 'The thin lines between things.', group: 'panels' },
  { token: 'text', label: 'Main text', hint: 'Most of the words you read.', group: 'text' },
  { token: 'muted', label: 'Softer text', hint: 'Descriptions and small labels.', group: 'text' },
  { token: 'faint', label: 'Hints', hint: 'Placeholders and switched-off things.', group: 'text' },
  { token: 'chosen-bg', label: 'Chosen colour', hint: 'Gold by default.', group: 'accent' },
  { token: 'chosen-fg', label: 'Text on the chosen colour', hint: 'Keep it dark on gold.', group: 'accent' },
  { token: 'accent', label: 'Links and highlights', hint: 'Links and small touches.', group: 'accent' },
  { token: 'focus', label: 'Keyboard focus ring', hint: 'The outline that shows where the keyboard is.', group: 'accent' },
  { token: 'cel-key', label: 'Frames', hint: 'Drawn frames on the timeline.', group: 'timeline' },
  { token: 'playhead', label: 'Playhead', hint: 'The line that shows where you are.', group: 'timeline' },
  { token: 'canvas-bg', label: 'Around the drawing', hint: 'The colour you see past the edge of the page.', group: 'canvas' },
  { token: 'danger', label: 'Warning', hint: 'Delete buttons and problems.', group: 'messages' },
  { token: 'ok', label: 'Good news', hint: 'Things that worked.', group: 'messages' },
];

/** The snap colours, in the editor's Snapping group (they are not "core": a theme does not need to change them). */
export const SNAP_CONTROLS: EditorControl[] = [
  { token: 'snap-page', label: 'Page edges', hint: 'The border of the page.', group: 'snapping' },
  { token: 'snap-centre', label: 'Page middle', hint: 'The middle of the page, across and down.', group: 'snapping' },
  { token: 'snap-guides', label: 'Guides', hint: 'Guide lines from the rulers.', group: 'snapping' },
  { token: 'snap-grid', label: 'Grid', hint: 'The square or isometric grid.', group: 'snapping' },
  { token: 'snap-shapes', label: 'Other shapes', hint: 'Edges and middles of other shapes.', group: 'snapping' },
  { token: 'snap-spacing', label: 'Equal gaps', hint: 'The bars and sizes of a gap. The number on them is black or white to suit.', group: 'snapping' },
  { token: 'snap-perspective', label: 'Perspective lines', hint: 'Lines that follow a vanishing point.', group: 'snapping' },
  { token: 'snap-plugins', label: 'Plugin guides', hint: 'Lines and boxes a plugin draws as a guide.', group: 'snapping' },
  { token: 'snap-cells', label: 'Pixel cells', hint: 'Whole pixels on a pixel layer.', group: 'snapping' },
  { token: 'snap-angles', label: 'Angle steps', hint: 'Shift turns lines to neat angles.', group: 'snapping' },
  { token: 'snap-artboards', label: 'Other artboards', hint: 'The edges and middles of other artboards.', group: 'snapping' },
];

/** A plain name for a token, for messages. */
export function tokenLabel(token: string): string {
  const c = EDITOR_CONTROLS.find((x) => x.token === token);
  if (c) return c.label;
  const sn = SNAP_CONTROLS.find((x) => x.token === token);
  return sn ? `${sn.label} snap colour` : token;
}
