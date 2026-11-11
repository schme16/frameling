// The themes Frameling comes with. Each one is a full set of colour tokens, built from the core colours plus a few
// hand-picked extras, so it can be cloned and tweaked like any other. Every pair that matters for reading has been
// checked (see contrast.ts and test/ui/themes.test.ts), and the chosen-state rule holds in nearly all of them: chosen
// tabs, tools and switches are gold with dark text. The few in CHOSEN_FROM_PALETTE pick their chosen colour from their
// own palette instead, still with dark text on it.
import { BRAND, deriveTokens, type ThemeMode, type ThemeTokens } from './tokens';

export interface Theme {
  id: string;
  name: string;
  mode: ThemeMode;
  builtIn: boolean;
  tokens: ThemeTokens;
  /** One friendly line for the gallery. */
  description?: string;
  /** The built-in this was copied from, so "Reset" has somewhere to go back to. */
  basedOn?: string;
}

export const DEFAULT_DARK = 'midnight-sketchbook';
export const DEFAULT_LIGHT = 'paper-and-honey';

function make(id: string, name: string, mode: ThemeMode, description: string, core: ThemeTokens, extra: ThemeTokens = {}): Theme {
  const tokens = { ...deriveTokens({ ...BRAND, ...core }, mode), ...extra };
  return { id, name, mode, builtIn: true, description, tokens };
}

const GOLD = '#ffc94a';
const GOLD_TEXT = '#1d1b26';
// Strawberry seeds: still gold enough for the chosen-state rule, just a touch sunnier.
const SEED = '#ffd23f';
const SEED_TEXT = '#2a1a10';

export const BUILT_IN_THEMES: Theme[] = [
  make('midnight-sketchbook', 'Midnight Sketchbook', 'dark', 'Deep plum and warm cream. The classic Frameling night.', {
    bg: '#17151f', panel: '#211e2c', 'panel-2': '#2a2638', raised: '#322d43', line: '#3a3550',
    text: '#f4efe6', muted: '#b3aac4', faint: '#8a82a0', 'canvas-bg': '#121019',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#9b7bff', focus: GOLD, danger: '#ff7b7b', ok: '#4fd1a5',
    'cel-key': '#9b7bff', playhead: '#ff6f91',
  }, { 'sunny-deep': '#f2a91c', 'hover-bg': '#36314a' }),

  make('moonlit-pond', 'Moonlit Pond', 'dark', 'Calm blue-grey, like water at night. Easy on the eyes.', {
    bg: '#12181f', panel: '#1a222c', 'panel-2': '#222c38', raised: '#2a3644', line: '#394758',
    text: '#e8eef5', muted: '#a8b6c6', faint: '#7f90a4', 'canvas-bg': '#0d1217',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#6cc3f2', focus: GOLD, danger: '#ff8a8a', ok: '#5fd8b0',
    'cel-key': '#5ab8ff', playhead: '#ff8fa8',
  }),

  make('hot-cocoa', 'Hot Cocoa', 'dark', 'Warm browns and marshmallow cream. Cosy by the fire.', {
    bg: '#1d1510', panel: '#2a1f18', 'panel-2': '#352820', raised: '#403028', line: '#58443a',
    text: '#f8ecdd', muted: '#cdb29c', faint: '#9a8170', 'canvas-bg': '#150f0b',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#ff9e6d', focus: GOLD, danger: '#ff8080', ok: '#7fd8a8',
    'cel-key': '#e8895a', playhead: '#ff7f9d',
  }),

  make('lantern-night', 'Lantern Night', 'dark', 'Extra contrast: bright words, strong borders. Easiest to see.', {
    bg: '#07060b', panel: '#100e17', 'panel-2': '#1a1724', raised: '#241f33', line: '#8c86a8',
    text: '#ffffff', muted: '#e2ddf2', faint: '#b8b0d0', 'canvas-bg': '#000000',
    'chosen-bg': '#ffd24d', 'chosen-fg': '#000000', accent: '#c2b0ff', focus: '#ffe066', danger: '#ff9c9c', ok: '#70f0c4',
    'cel-key': '#b49cff', playhead: '#ff8aa6',
  }, { grape: '#b49cff', sky: '#7ccbff', 'line-soft': '#6a6585' }),

  make('paper-and-honey', 'Paper & Honey', 'light', 'Warm paper and golden honey. The classic Frameling daytime.', {
    bg: '#f3eee6', panel: '#fffaf2', 'panel-2': '#f7f0e4', raised: '#ffffff', line: '#e2d8c7',
    text: '#2a2533', muted: '#665e73', faint: '#8a8296', 'canvas-bg': '#e8e1d5',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#6f4de6', focus: '#a86200', danger: '#c93d3d', ok: '#2f9e79',
    'cel-key': '#8a68f2', playhead: '#e0446b',
  }, { 'hover-bg': '#f0e7d8', 'sunny-deep': '#f2a91c' }),

  make('studio-white', 'Studio White', 'light', 'Clean, neutral and bright. Colours stand out against it.', {
    bg: '#eceef1', panel: '#ffffff', 'panel-2': '#f4f5f7', raised: '#ffffff', line: '#d3d8de',
    text: '#1f2328', muted: '#56606b', faint: '#7f8893', 'canvas-bg': '#dde0e5',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#5b45d6', focus: '#a86200', danger: '#c62f2f', ok: '#1f8f6a',
    'cel-key': '#7a68e0', playhead: '#e0345f',
  }),

  make('strawberry-milk', 'Strawberry Milk', 'light', 'Soft pink pastels, sweet and gentle.', {
    bg: '#fbeaee', panel: '#fff7f9', 'panel-2': '#fadfe5', raised: '#ffffff', line: '#eec6d0',
    text: '#3d2630', muted: '#74505d', faint: '#9c7885', 'canvas-bg': '#f4d6dd',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#c02f6c', focus: '#a86200', danger: '#c62f3f', ok: '#23916c',
    'cel-key': '#d63f7c', playhead: '#7b5cf0',
  }),

  make('sunbeam', 'Sunbeam', 'light', 'Extra contrast: near-black words on bright paper, strong borders.', {
    bg: '#f1eee7', panel: '#ffffff', 'panel-2': '#ece8df', raised: '#ffffff', line: '#6e687c',
    text: '#000000', muted: '#2e2a38', faint: '#554f63', 'canvas-bg': '#d6d1c5',
    'chosen-bg': '#ffc21a', 'chosen-fg': '#000000', accent: '#4a2fc4', focus: '#b36b00', danger: '#a80f2a', ok: '#0a6a4a',
    'cel-key': '#5b3fd9', playhead: '#c2003f',
  }, { 'hover-bg': '#e2ddd1', 'line-soft': '#8a8497' }),

  make('strawberry', 'Strawberry', 'light', 'Ripe strawberry, cream and little yellow seeds, with a leafy green playhead.', {
    bg: '#fde7e5', panel: '#fffaf3', 'panel-2': '#fcebe4', raised: '#ffffff', line: '#f0cfc6',
    text: '#3a1f24', muted: '#74484f', faint: '#9a6f75', 'canvas-bg': '#f5c6cc',
    'chosen-bg': SEED, 'chosen-fg': SEED_TEXT, accent: '#c92c4b', focus: '#24873f', danger: '#a81d36', ok: '#24873f',
    'cel-key': '#e8456a', playhead: '#24873f',
  }, { rose: '#e8456a', mint: '#4fbf6a' }),

  make('strawberry-night', 'Strawberry Night', 'dark', 'Strawberries after dark: deep berry, cream words, yellow seeds and a leaf.', {
    bg: '#1f1216', panel: '#2a181e', 'panel-2': '#341e25', raised: '#3e242d', line: '#573440',
    text: '#fff1ec', muted: '#e0b9bf', faint: '#a98088', 'canvas-bg': '#2b1219',
    'chosen-bg': SEED, 'chosen-fg': SEED_TEXT, accent: '#ff7d97', focus: SEED, danger: '#ffa08a', ok: '#8ee39c',
    'cel-key': '#ff6f8e', playhead: '#9ee88a',
  }, { rose: '#ff6f8e', mint: '#8ee39c', 'hover-bg': '#4a2b35' }),

  make('glacier-grid', 'Glacier Grid', 'dark', 'Charcoal and bright aqua, with a faint camo print around the page.', {
    bg: '#1a1e21', panel: '#22272b', 'panel-2': '#2a3034', raised: '#333a3f', line: '#434c52',
    text: '#edf7f7', muted: '#a8b9bc', faint: '#7e8f93', 'canvas-bg': '#15191c',
    'chosen-bg': '#22c3d6', 'chosen-fg': '#0b1a1e', accent: '#7fe0dc', focus: '#5fdcea', danger: '#ff8a80', ok: '#7ddc9c',
    'cel-key': '#9fe6dc', playhead: '#ff7a8f',
  }, { 'hover-bg': '#3a4247' }),

  make('ice-camo', 'Ice Camo', 'light', 'White, ice and aqua with charcoal words. Crisp and cool, with a faint camo print.', {
    bg: '#e8f0f1', panel: '#ffffff', 'panel-2': '#f0f6f7', raised: '#ffffff', line: '#c8d5d8',
    text: '#1f2629', muted: '#4e5a5e', faint: '#77848a', 'canvas-bg': '#d9e6e8',
    'chosen-bg': '#22c3d6', 'chosen-fg': '#0b1a1e', accent: '#0d7a8c', focus: '#0d7a8c', danger: '#c2353a', ok: '#1d8a5f',
    'cel-key': '#0e8fa3', playhead: '#e0345f',
  }, { 'hover-bg': '#e2eef0' }),

  make('lilac-static', 'Lilac Static', 'dark', 'Dusky violet with soft lavender and a little pastel glow.', {
    bg: '#1a1724', panel: '#231f31', 'panel-2': '#2b263b', raised: '#353047', line: '#473f5d',
    text: '#f4f0fb', muted: '#beb3d6', faint: '#8f85a9', 'canvas-bg': '#14111d',
    'chosen-bg': '#c9b8e8', 'chosen-fg': '#1d1830', accent: '#b9a3f0', focus: '#d9ccf5', danger: '#ff8a9a', ok: '#7ee0b8',
    'cel-key': '#86c5ff', playhead: '#ff8fbf',
  }),

  make('lavender-hum', 'Lavender Hum', 'light', 'Soft lilac and white. Gentle and friendly, like a pastel morning.', {
    bg: '#efeaf8', panel: '#fbf9ff', 'panel-2': '#f3eefc', raised: '#ffffff', line: '#dbd1ee',
    text: '#2a2438', muted: '#5d5272', faint: '#83789a', 'canvas-bg': '#e4dcf3',
    'chosen-bg': '#bba6ea', 'chosen-fg': '#1d1830', accent: '#6a4fc4', focus: '#6a4fc4', danger: '#c23a4f', ok: '#23866a',
    'cel-key': '#8a6fd6', playhead: '#e0457f',
  }),
];

/** Built-ins whose chosen colour comes from their own palette rather than gold. Text on it is still dark. */
export const CHOSEN_FROM_PALETTE: ReadonlySet<string> = new Set(['glacier-grid', 'ice-camo', 'lilac-static', 'lavender-hum']);

export type Surround = 'camo' | 'seeds';

/** Built-ins with a faint pattern in the canvas surround (camo print, strawberry seeds). Copies of them keep it. */
export const SURROUNDS: Readonly<Record<string, Surround>> = {
  'glacier-grid': 'camo',
  'ice-camo': 'camo',
  strawberry: 'seeds',
  'strawberry-night': 'seeds',
};

/** Which pattern, if any, a theme shows around the page. */
export const surroundFor = (theme: Pick<Theme, 'id' | 'basedOn'>): Surround | null =>
  SURROUNDS[theme.id] ?? (theme.basedOn !== undefined ? SURROUNDS[theme.basedOn] : undefined) ?? null;

export const BUILT_IN_IDS = BUILT_IN_THEMES.map((t) => t.id);

export const getBuiltIn = (id: string): Theme | undefined => BUILT_IN_THEMES.find((t) => t.id === id);

export const defaultThemeFor = (mode: ThemeMode): Theme => getBuiltIn(mode === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT)!;
