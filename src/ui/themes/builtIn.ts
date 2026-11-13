// The themes Frameling comes with. Each one is a full set of colour tokens, built from the core colours plus a few
// hand-picked extras, so it can be cloned and tweaked like any other. Every pair that matters for reading has been
// checked (see contrast.ts and test/ui/themes.test.ts), and the chosen-state rule holds in nearly all of them: chosen
// tabs, tools and switches are gold with dark text. The few in CHOSEN_FROM_PALETTE pick their chosen colour from their
// own palette instead, still with dark text on it.
import { BRAND, SNAP_DEFAULTS, deriveTokens, type ThemeMode, type ThemeTokens } from './tokens';

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
  const tokens = { ...deriveTokens({ ...BRAND, ...SNAP_DEFAULTS[mode], ...core }, mode), ...extra };
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
    text: '#f4efe6', muted: '#b3aac4', faint: '#9d97b0', 'canvas-bg': '#121019',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#9b7bff', focus: GOLD, danger: '#ff7b7b', ok: '#4fd1a5',
    'cel-key': '#9b7bff', playhead: '#ff6f91',
  }, { 'sunny-deep': '#f2a91c', 'hover-bg': '#36314a' }),

  make('moonlit-pond', 'Moonlit Pond', 'dark', 'Calm blue-grey, like water at night. Easy on the eyes.', {
    bg: '#12181f', panel: '#1a222c', 'panel-2': '#222c38', raised: '#2a3644', line: '#394758',
    text: '#e8eef5', muted: '#a8b6c6', faint: '#94a2b3', 'canvas-bg': '#0d1217',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#6cc3f2', focus: GOLD, danger: '#ff8a8a', ok: '#5fd8b0',
    'cel-key': '#5ab8ff', playhead: '#ff8fa8',
  }),

  make('hot-cocoa', 'Hot Cocoa', 'dark', 'Warm browns and marshmallow cream. Cosy by the fire.', {
    bg: '#1d1510', panel: '#2a1f18', 'panel-2': '#352820', raised: '#403028', line: '#58443a',
    text: '#f8ecdd', muted: '#cdb29c', faint: '#ad998b', 'canvas-bg': '#150f0b',
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
    text: '#2a2533', muted: '#665e73', faint: '#71697c', 'canvas-bg': '#e8e1d5',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#6f4de6', focus: '#a86200', danger: '#c93d3d', ok: '#2f9e79',
    'cel-key': '#8a68f2', playhead: '#e0446b',
  }, { 'hover-bg': '#f0e7d8', 'sunny-deep': '#f2a91c' }),

  make('studio-white', 'Studio White', 'light', 'Clean, neutral and bright. Colours stand out against it.', {
    bg: '#eceef1', panel: '#ffffff', 'panel-2': '#f4f5f7', raised: '#ffffff', line: '#d3d8de',
    text: '#1f2328', muted: '#56606b', faint: '#68717c', 'canvas-bg': '#dde0e5',
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent: '#5b45d6', focus: '#a86200', danger: '#c62f2f', ok: '#1f8f6a',
    'cel-key': '#7a68e0', playhead: '#e0345f',
  }),

  make('strawberry-milk', 'Strawberry Milk', 'light', 'Soft pink pastels, sweet and gentle.', {
    bg: '#fbeaee', panel: '#fff7f9', 'panel-2': '#fadfe5', raised: '#ffffff', line: '#eec6d0',
    text: '#3d2630', muted: '#74505d', faint: '#7f5d69', 'canvas-bg': '#f4d6dd',
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
    text: '#3a1f24', muted: '#74484f', faint: '#8a6166', 'canvas-bg': '#f5c6cc',
    'chosen-bg': SEED, 'chosen-fg': SEED_TEXT, accent: '#c92c4b', focus: '#24873f', danger: '#a81d36', ok: '#24873f',
    'cel-key': '#e8456a', playhead: '#24873f',
  }, { rose: '#e8456a', mint: '#4fbf6a' }),

  make('strawberry-night', 'Strawberry Night', 'dark', 'Strawberries after dark: deep berry, cream words, yellow seeds and a leaf.', {
    bg: '#1f1216', panel: '#2a181e', 'panel-2': '#341e25', raised: '#3e242d', line: '#573440',
    text: '#fff1ec', muted: '#e0b9bf', faint: '#b18c94', 'canvas-bg': '#2b1219',
    'chosen-bg': SEED, 'chosen-fg': SEED_TEXT, accent: '#ff7d97', focus: SEED, danger: '#ffa08a', ok: '#8ee39c',
    'cel-key': '#ff6f8e', playhead: '#9ee88a',
  }, { rose: '#ff6f8e', mint: '#8ee39c', 'hover-bg': '#4a2b35' }),

  make('glacier-grid', 'Glacier Grid', 'dark', 'Charcoal and bright aqua, with a faint camo print around the page.', {
    bg: '#1a1e21', panel: '#22272b', 'panel-2': '#2a3034', raised: '#333a3f', line: '#434c52',
    text: '#edf7f7', muted: '#a8b9bc', faint: '#9aa7aa', 'canvas-bg': '#15191c',
    'chosen-bg': '#22c3d6', 'chosen-fg': '#0b1a1e', accent: '#7fe0dc', focus: '#5fdcea', danger: '#ff8a80', ok: '#7ddc9c',
    'cel-key': '#9fe6dc', playhead: '#ff7a8f',
  }, { 'hover-bg': '#3a4247' }),

  make('ice-camo', 'Ice Camo', 'light', 'White, ice and aqua with charcoal words. Crisp and cool, with a faint camo print.', {
    bg: '#e8f0f1', panel: '#ffffff', 'panel-2': '#f0f6f7', raised: '#ffffff', line: '#c8d5d8',
    text: '#1f2629', muted: '#4e5a5e', faint: '#667277', 'canvas-bg': '#d9e6e8',
    'chosen-bg': '#22c3d6', 'chosen-fg': '#0b1a1e', accent: '#0d7a8c', focus: '#0d7a8c', danger: '#c2353a', ok: '#1d8a5f',
    'cel-key': '#0e8fa3', playhead: '#e0345f',
  }, { 'hover-bg': '#e2eef0' }),

  make('lilac-static', 'Lilac Static', 'dark', 'Dusky violet with soft lavender and a little pastel glow.', {
    bg: '#1a1724', panel: '#231f31', 'panel-2': '#2b263b', raised: '#353047', line: '#473f5d',
    text: '#f4f0fb', muted: '#beb3d6', faint: '#a29ab8', 'canvas-bg': '#14111d',
    'chosen-bg': '#c9b8e8', 'chosen-fg': '#1d1830', accent: '#b9a3f0', focus: '#d9ccf5', danger: '#ff8a9a', ok: '#7ee0b8',
    'cel-key': '#86c5ff', playhead: '#ff8fbf',
  }),

  make('lavender-hum', 'Lavender Hum', 'light', 'Soft lilac and white. Gentle and friendly, like a pastel morning.', {
    bg: '#efeaf8', panel: '#fbf9ff', 'panel-2': '#f3eefc', raised: '#ffffff', line: '#dbd1ee',
    text: '#2a2438', muted: '#5d5272', faint: '#716688', 'canvas-bg': '#e4dcf3',
    'chosen-bg': '#bba6ea', 'chosen-fg': '#1d1830', accent: '#6a4fc4', focus: '#6a4fc4', danger: '#c23a4f', ok: '#23866a',
    'cel-key': '#8a6fd6', playhead: '#e0457f',
  }),

  // Based on Monokai: lemon, candy pink, lime and sky blue.
  make('gumdrop-night', 'Gumdrop Night', 'dark', 'Monokai after dark: olive-black with lemon, candy pink, lime and sky blue. Sweet and zingy.', {
    bg: '#1e1f1c', panel: '#272822', 'panel-2': '#2f302a', raised: '#3e3d32', line: '#56554a',
    text: '#f8f8f2', muted: '#cfcfc2', faint: '#b5b096', 'canvas-bg': '#1a1b17',
    'chosen-bg': '#e6db74', 'chosen-fg': '#272822', accent: '#66d9ef', focus: '#e6db74', danger: '#f92672', ok: '#a6e22e',
    'cel-key': '#ae81ff', playhead: '#f92672',
  }, { peach: '#fd971f', rose: '#f92672', grape: '#ae81ff', sky: '#66d9ef', mint: '#a6e22e' }),

  make('gumdrop-day', 'Gumdrop Day', 'light', 'Monokai in the sunshine: soft cream with tangerine, candy pink and grape.', {
    bg: '#f2f1ea', panel: '#fdfdf8', 'panel-2': '#f4f3ea', raised: '#ffffff', line: '#dcdacb',
    text: '#272822', muted: '#5a594d', faint: '#67655a', 'canvas-bg': '#e8e6da',
    'chosen-bg': '#fd971f', 'chosen-fg': '#1a1b16', accent: '#1a7f97', focus: '#c4134f', danger: '#c4134f', ok: '#5a8a00',
    'cel-key': '#8a5cf0', playhead: '#d61f63',
  }, { peach: '#fd971f', rose: '#f92672', grape: '#ae81ff', sky: '#66d9ef', mint: '#a6e22e' }),

  // Based on Darcula: charcoal, pumpkin and a warm lamp.
  make('batwing', 'Batwing', 'dark', 'Based on Darcula: charcoal, cool grey words, pumpkin orange and a warm lamp glow.', {
    bg: '#232323', panel: '#2b2b2b', 'panel-2': '#313335', raised: '#3c3f41', line: '#55595b',
    text: '#d4dce4', muted: '#a9b7c6', faint: '#a0abb6', 'canvas-bg': '#1e1f22',
    'chosen-bg': '#ffc66d', 'chosen-fg': '#2b2b2b', accent: '#e0893f', focus: '#ffc66d', danger: '#ff6b68', ok: '#8fb573',
    'cel-key': '#9876aa', playhead: '#6897bb',
  }, { peach: '#cc7832', grape: '#9876aa', sky: '#6897bb', mint: '#8fb573' }),

  make('bat-nap', 'Bat Nap', 'light', 'Darcula\'s daytime twin: crisp white and grey, inky blue, plum and a warm lamp.', {
    bg: '#f2f2f2', panel: '#ffffff', 'panel-2': '#f7f8fa', raised: '#ffffff', line: '#d1d1d1',
    text: '#1e1f22', muted: '#4d5157', faint: '#6c707e', 'canvas-bg': '#e4e4e6',
    'chosen-bg': '#ffc66d', 'chosen-fg': '#1e1f22', accent: '#0033b3', focus: '#3574f0', danger: '#c7222d', ok: '#067d17',
    'cel-key': '#871094', playhead: '#d1365c',
  }),

  // Based on Catppuccin (Mocha and Latte), https://catppuccin.com
  make('mocha-kitten', 'Mocha Kitten', 'dark', 'Catppuccin Mocha: soothing pastels on deep blue-grey, with a lilac chosen colour.', {
    bg: '#181825', panel: '#1e1e2e', 'panel-2': '#252536', raised: '#313244', line: '#45475a',
    text: '#cdd6f4', muted: '#bac2de', faint: '#a6adc8', 'canvas-bg': '#11111b',
    'chosen-bg': '#cba6f7', 'chosen-fg': '#1e1e2e', accent: '#89b4fa', focus: '#f5c2e7', danger: '#f38ba8', ok: '#a6e3a1',
    'cel-key': '#b4befe', playhead: '#fab387',
  }, { peach: '#fab387', rose: '#f38ba8', grape: '#cba6f7', sky: '#89dceb', mint: '#94e2d5' }),

  make('latte-kitten', 'Latte Kitten', 'light', 'Catppuccin Latte: milky pastels, cool grey-blue words and a lilac chosen colour.', {
    bg: '#e6e9ef', panel: '#eff1f5', 'panel-2': '#e6e9ef', raised: '#f7f8fb', line: '#ccd0da',
    text: '#41445c', muted: '#5c5f77', faint: '#5f6278', 'canvas-bg': '#dce0e8',
    'chosen-bg': '#cba6f7', 'chosen-fg': '#1e1e2e', accent: '#1e66f5', focus: '#8839ef', danger: '#d20f39', ok: '#40a02b',
    'cel-key': '#8839ef', playhead: '#e64553',
  }, { peach: '#fe640b', rose: '#e64553', grape: '#8839ef', sky: '#04a5e5', mint: '#179299' }),

  // Based on Gruvbox ("retro groove").
  make('retro-groove-night', 'Retro Groove Night', 'dark', 'Based on Gruvbox: retro browns, warm cream words and earthy, groovy colours.', {
    bg: '#1d2021', panel: '#282828', 'panel-2': '#32302f', raised: '#3c3836', line: '#5a524c',
    text: '#fbf1c7', muted: '#d5c4a1', faint: '#bdae93', 'canvas-bg': '#1a1a1a',
    'chosen-bg': '#fabd2f', 'chosen-fg': '#282828', accent: '#83a598', focus: '#fabd2f', danger: '#fb4934', ok: '#b8bb26',
    'cel-key': '#d3869b', playhead: '#8ec07c',
  }, { peach: '#fe8019', rose: '#fb4934', grape: '#d3869b', sky: '#83a598', mint: '#8ec07c' }),

  make('retro-groove-day', 'Retro Groove Day', 'light', 'Gruvbox by day: old paper, dark-roast words and faded seventies colours.', {
    bg: '#f2e5bc', panel: '#fbf1c7', 'panel-2': '#f2e5bc', raised: '#f9f5d7', line: '#d5c4a1',
    text: '#282828', muted: '#504945', faint: '#665c54', 'canvas-bg': '#ebdbb2',
    'chosen-bg': '#fabd2f', 'chosen-fg': '#282828', accent: '#076678', focus: '#af3a03', danger: '#9d0006', ok: '#79740e',
    'cel-key': '#076678', playhead: '#b16286',
  }, { peach: '#af3a03', rose: '#9d0006', grape: '#8f3f71', sky: '#076678', mint: '#427b58' }),

  // Pride, trans flag and programmer socks: pink, blue and white stripes, a rainbow of little touches, paw prints.
  make('puppy-socks', 'Puppy Socks', 'dark', 'Trans pink and blue, a rainbow of little touches, knee-high sock stripes and puppy paw prints round the page.', {
    bg: '#1b1724', panel: '#231e2f', 'panel-2': '#2b2539', raised: '#342d45', line: '#4a4060',
    text: '#fff5fa', muted: '#d9c9e3', faint: '#b3a6c4', 'canvas-bg': '#17131f',
    'chosen-bg': '#f5a9b8', 'chosen-fg': '#1d1b26', accent: '#5bcefa', focus: '#5bcefa', danger: '#ff8a8a', ok: '#7fe0b0',
    'cel-key': '#5bcefa', playhead: '#f5a9b8',
  }, { peach: '#ffa552', rose: '#f5a9b8', grape: '#b18cff', sky: '#5bcefa', mint: '#7ee08f' }),

  make('kitty-socks', 'Kitty Socks', 'light', 'Trans blue and pink on white, rainbow touches, knee-high sock stripes and kitty paw prints round the page.', {
    bg: '#f3eef6', panel: '#ffffff', 'panel-2': '#f7f2fa', raised: '#ffffff', line: '#e2d5ea',
    text: '#2a2233', muted: '#5c4f69', faint: '#6e6180', 'canvas-bg': '#eee4f2',
    'chosen-bg': '#5bcefa', 'chosen-fg': '#0f1b24', accent: '#c2366e', focus: '#1f7fae', danger: '#c62f3f', ok: '#1f8f6a',
    'cel-key': '#e05b8a', playhead: '#1f7fae',
  }, { peach: '#ff8c3a', rose: '#f5a9b8', grape: '#9b6cf0', sky: '#5bcefa', mint: '#4fbf6a' }),
];

/** Built-ins whose chosen colour comes from their own palette rather than gold. Text on it is still dark. */
export const CHOSEN_FROM_PALETTE: ReadonlySet<string> = new Set([
  'glacier-grid', 'ice-camo', 'lilac-static', 'lavender-hum', 'gumdrop-night', 'gumdrop-day', 'mocha-kitten', 'latte-kitten',
  'puppy-socks', 'kitty-socks',
]);

export type Surround = 'camo' | 'seeds' | 'socks';

/** Built-ins with a faint pattern in the canvas surround (camo print, strawberry seeds, sock stripes and paws). Copies keep it. */
export const SURROUNDS: Readonly<Record<string, Surround>> = {
  'glacier-grid': 'camo',
  'ice-camo': 'camo',
  strawberry: 'seeds',
  'strawberry-night': 'seeds',
  'puppy-socks': 'socks',
  'kitty-socks': 'socks',
};

/** Which pattern, if any, a theme shows around the page. */
export const surroundFor = (theme: Pick<Theme, 'id' | 'basedOn'>): Surround | null =>
  SURROUNDS[theme.id] ?? (theme.basedOn !== undefined ? SURROUNDS[theme.basedOn] : undefined) ?? null;

export const BUILT_IN_IDS = BUILT_IN_THEMES.map((t) => t.id);

export const getBuiltIn = (id: string): Theme | undefined => BUILT_IN_THEMES.find((t) => t.id === id);

export const defaultThemeFor = (mode: ThemeMode): Theme => getBuiltIn(mode === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT)!;
