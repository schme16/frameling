// The themes Frameling comes with. Each one is a full set of colour tokens, built from the core colours plus a few
// hand-picked extras, so it can be cloned and tweaked like any other. Every pair that matters for reading has been
// checked (see contrast.ts and test/ui/themes.test.ts), and the chosen-state rule holds in all of them: chosen tabs,
// tools and switches are gold with dark text.
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
];

export const BUILT_IN_IDS = BUILT_IN_THEMES.map((t) => t.id);

export const getBuiltIn = (id: string): Theme | undefined => BUILT_IN_THEMES.find((t) => t.id === id);

export const defaultThemeFor = (mode: ThemeMode): Theme => getBuiltIn(mode === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT)!;
