// Contrast checks for the pairs that matter for reading, in plain words. Ratios are WCAG ones: 4.5 is the usual bar
// for words, 3 is the bar for big or non-essential things.
import { contrast, ensureContrast } from './color';
import { SNAP_CONTROLS, tokenLabel, type ThemeTokens } from './tokens';

export interface ContrastCheck {
  id: string;
  /** The tokens being compared: the thing you read, then what it sits on. */
  fg: string;
  bg: string;
  /** Needed for "good". */
  min: number;
  /** What it is, in plain words ("Main text on panels"). */
  what: string;
  /** True for words, false for shapes like the playhead. */
  words: boolean;
}

export const CHECKS: ContrastCheck[] = [
  { id: 'text-bg', fg: 'text', bg: 'bg', min: 4.5, what: 'Main text on the app background', words: true },
  { id: 'text-panel', fg: 'text', bg: 'panel', min: 4.5, what: 'Main text on panels', words: true },
  { id: 'text-panel2', fg: 'text', bg: 'panel-2', min: 4.5, what: 'Main text on the second panel shade', words: true },
  { id: 'text-raised', fg: 'text', bg: 'raised', min: 4.5, what: 'Main text on buttons and cards', words: true },
  { id: 'text-warn', fg: 'text', bg: 'peach-soft', min: 4.5, what: 'Main text on warning notes', words: true },
  { id: 'muted-panel', fg: 'muted', bg: 'panel', min: 4.5, what: 'Softer text on panels', words: true },
  { id: 'muted-panel2', fg: 'muted', bg: 'panel-2', min: 4.5, what: 'Softer text on the second panel shade', words: true },
  { id: 'muted-bg', fg: 'muted', bg: 'bg', min: 4.5, what: 'Softer text on the app background', words: true },
  { id: 'muted-raised', fg: 'muted', bg: 'raised', min: 4.5, what: 'Softer text on buttons and cards', words: true },
  { id: 'faint-raised', fg: 'faint', bg: 'raised', min: 4.5, what: 'Hints on buttons and cards', words: true },
  { id: 'faint-panel', fg: 'faint', bg: 'panel', min: 4.5, what: 'Hints on panels', words: true },
  { id: 'faint-panel2', fg: 'faint', bg: 'panel-2', min: 4.5, what: 'Hints on the second panel shade', words: true },
  { id: 'text-tip', fg: 'tip-fg', bg: 'tip-bg', min: 4.5, what: 'Words in a tooltip', words: true },
  { id: 'muted-tip', fg: 'tip-soft', bg: 'tip-bg', min: 4.5, what: 'Softer words in a tooltip', words: true },
  { id: 'link-tip', fg: 'tip-link', bg: 'tip-bg', min: 4.5, what: 'The Learn more link in a tooltip', words: true },
  { id: 'chosen', fg: 'chosen-fg', bg: 'chosen-bg', min: 4.5, what: 'Text on the chosen colour', words: true },
  { id: 'accent-panel', fg: 'accent', bg: 'panel', min: 3, what: 'Links on panels', words: true },
  { id: 'danger-panel', fg: 'danger', bg: 'panel', min: 3, what: 'Warnings on panels', words: true },
  { id: 'cel', fg: 'cel-key', bg: 'panel-2', min: 3, what: 'Frames on the timeline', words: false },
  { id: 'playhead', fg: 'playhead', bg: 'panel-2', min: 3, what: 'The playhead on the timeline', words: false },
  { id: 'focus', fg: 'focus', bg: 'bg', min: 3, what: 'The keyboard focus ring', words: false },
  // Each snap colour is a line on the canvas surround and a dot in the note over the panels.
  ...SNAP_CONTROLS.flatMap((c): ContrastCheck[] => [
    { id: `${c.token}-canvas`, fg: c.token, bg: 'canvas-bg', min: 3, what: `The ${c.label.toLowerCase()} snap line on the canvas`, words: false },
    { id: `${c.token}-panel`, fg: c.token, bg: 'panel', min: 3, what: `The ${c.label.toLowerCase()} snap dot on panels`, words: false },
  ]),
];

export type ContrastLevel = 'good' | 'warn' | 'bad';

export interface ContrastResult extends ContrastCheck {
  ratio: number;
  level: ContrastLevel;
  /** A sentence for people, or '' when it's fine. */
  message: string;
}

export function levelFor(ratio: number, min: number): ContrastLevel {
  if (ratio >= min) return 'good';
  if (ratio >= min * 0.75) return 'warn';
  return 'bad';
}

export function checkContrast(tokens: ThemeTokens): ContrastResult[] {
  return CHECKS.map((c) => {
    const ratio = contrast(tokens[c.fg] ?? '#000000', tokens[c.bg] ?? '#ffffff');
    const level = levelFor(ratio, c.min);
    let message = '';
    if (level !== 'good') {
      if (c.words) message = level === 'warn' ? `${c.what}: this text may be hard to read.` : `${c.what}: this text is hard to read.`;
      else message = level === 'warn' ? `${c.what}: this may be hard to see.` : `${c.what}: this is hard to see.`;
    }
    return { ...c, ratio, level, message };
  });
}

/** Only the ones that need attention. */
export const problems = (tokens: ThemeTokens): ContrastResult[] => checkContrast(tokens).filter((r) => r.level !== 'good');

/** Problems that involve one token (for the warning under its colour control). */
export const problemsFor = (tokens: ThemeTokens, token: string): ContrastResult[] => problems(tokens).filter((r) => r.fg === token || r.bg === token);

/** Nudges the readable side of a pair (the text, never the background) until it passes. Returns the new value. */
export function fixPair(tokens: ThemeTokens, check: ContrastCheck): string {
  return ensureContrast(tokens[check.fg], tokens[check.bg], check.min);
}

export const describeToken = tokenLabel;

/** The most any readable-on-a-fill token is allowed to fall short: words need this much against their fill. */
export const READABLE_MIN = 4.5;

/**
 * Text colours worked out from the fills they sit on, so a button stays readable whatever colours a theme picked.
 * Each starts from the theme's own word colour (so a good theme is untouched) and is moved lighter or darker only as
 * far as it needs to reach 4.5:1, with black or white as the last resort (always at least 4.5 against anything).
 * The editor shows the app in the theme being made, so the chrome around the colours has to be readable in it.
 */
export const READABLE_TOKENS = ['chosen-mark', 'on-chosen-mark', 'on-bg', 'on-panel', 'on-muted', 'on-raised', 'on-hover', 'on-danger', 'on-chosen', 'on-chosen-deep', 'on-tip', 'on-tip-soft', 'on-tip-link'] as const;

/** A shape (a tick, a ring) has to stand out from what it sits on by this much. 3 is the usual bar for shapes. */
export const MARK_MIN = 3;

export function readableTokens(tokens: ThemeTokens): ThemeTokens {
  const text = tokens.text;
  const on = (fg: string | undefined, bg: string | undefined): string | undefined => (fg && bg ? ensureContrast(fg, bg, READABLE_MIN) : undefined);
  const out: ThemeTokens = {};
  const set = (name: string, v: string | undefined) => {
    if (v) out[name] = v;
  };
  set('on-bg', on(text, tokens.bg));
  set('on-panel', on(text, tokens.panel));
  set('on-muted', on(tokens.muted, tokens.panel));
  set('on-raised', on(text, tokens.raised));
  set('on-hover', on(text, tokens['hover-bg']));
  set('on-danger', on(tokens.bg, tokens.danger));
  // The chosen colour as a small mark on a card (the tick, the sun and moon, the edge): moved only as far as it needs
  // to stand out from the card's own fill, so a pale card cannot lose a pale tick. Its icon reads on it.
  const mark = tokens['chosen-bg'] && tokens['panel-2'] ? ensureContrast(tokens['chosen-bg'], tokens['panel-2'], MARK_MIN) : undefined;
  set('chosen-mark', mark);
  set('on-chosen-mark', on(tokens['chosen-fg'], mark));
  set('on-chosen', on(tokens['chosen-fg'], tokens['chosen-bg']));
  set('on-chosen-deep', on(tokens['chosen-fg'], tokens['sunny-deep']));
  // A tooltip's words, whatever tip colours a theme file carried: they cannot end up unreadable on the tip fill.
  set('on-tip', on(tokens['tip-fg'] ?? text, tokens['tip-bg']));
  set('on-tip-soft', on(tokens['tip-soft'] ?? tokens.muted, tokens['tip-bg']));
  set('on-tip-link', on(tokens['tip-link'] ?? tokens.accent, tokens['tip-bg']));
  return out;
}
