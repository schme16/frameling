// "Start from a colour": one picked colour in, a whole palette out. It's a starting point to tweak, not a finished
// design, so it aims for something calm, readable and on brand: backgrounds tinted with the colour's hue, text that
// passes contrast, the colour itself as the accent, and gold for chosen things as always.
import { contrast, ensureContrast, hexToHsl, hslToHex, parseHex } from './color';
import { BRAND, deriveTokens, type ThemeMode, type ThemeTokens } from './tokens';

const GOLD = '#ffc94a';
const GOLD_TEXT = '#1d1b26';

/** Angular distance between two hues, 0-180. */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export function paletteFromColour(seed: string, mode: ThemeMode): ThemeTokens {
  const rgb = parseHex(seed);
  const [h, s0] = hexToHsl(rgb ? seed : '#9b7bff');
  // Keep the background tint gentle: enough to feel like the colour, never loud. Greys stay grey.
  const s = Math.min(0.32, Math.max(0.08, s0 * 0.35));
  const dark = mode === 'dark';
  const at = (sat: number, l: number) => hslToHex(h, Math.min(1, sat), l);

  const bg = dark ? at(s * 0.8, 0.1) : at(s * 1.1, 0.935);
  const panel = dark ? at(s * 0.8, 0.14) : at(s * 0.7, 0.975);
  const panel2 = dark ? at(s * 0.8, 0.18) : at(s, 0.94);
  const raised = dark ? at(s * 0.8, 0.22) : '#ffffff';
  const line = dark ? at(s * 0.8, 0.29) : at(s, 0.85);
  const canvas = dark ? at(s * 0.8, 0.075) : at(s, 0.9);

  const text = ensureContrast(dark ? at(0.4, 0.94) : at(0.3, 0.14), bg, 9);
  const muted = ensureContrast(dark ? at(0.2, 0.74) : at(0.15, 0.38), panel2, 5.2);
  const faint = ensureContrast(dark ? at(0.15, 0.58) : at(0.1, 0.55), panel, 3.4);

  // The picked colour is the accent, moved only as far as needed to be readable as a link.
  const [, seedS] = hexToHsl(rgb ? seed : '#9b7bff');
  const accentBase = hslToHex(h, Math.max(0.35, seedS), dark ? 0.7 : 0.45);
  const accent = ensureContrast(rgb ? (contrast(seed, panel) >= 4.5 ? seed : accentBase) : accentBase, panel, 4.6);
  const celKey = ensureContrast(accent, panel2, 3.1);

  // The playhead is whichever brand colour sits furthest round the wheel from the accent.
  const playBase = [BRAND.rose, BRAND.sky, BRAND.peach, BRAND.mint].reduce((a, b) => (hueGap(hexToHsl(b)[0], h) > hueGap(hexToHsl(a)[0], h) ? b : a));
  const playhead = ensureContrast(playBase, panel2, 3.1);

  const danger = ensureContrast(dark ? '#ff7b7b' : '#d64545', panel, 4.5);
  const ok = ensureContrast(dark ? '#4fd1a5' : '#2f9e79', panel, 3.1);
  const focus = ensureContrast(dark ? GOLD : '#a86200', bg, 3.1);

  const core: ThemeTokens = {
    ...BRAND,
    bg, panel, 'panel-2': panel2, raised, line, text, muted, faint, 'canvas-bg': canvas,
    'chosen-bg': GOLD, 'chosen-fg': GOLD_TEXT, accent, focus, danger, ok, 'cel-key': celKey, playhead,
  };
  return deriveTokens(core, mode);
}
