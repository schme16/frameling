// Contrast checks for the pairs that matter for reading, in plain words. Ratios are WCAG ones: 4.5 is the usual bar
// for words, 3 is the bar for big or non-essential things.
import { contrast, ensureContrast } from './color';
import { tokenLabel, type ThemeTokens } from './tokens';

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
  { id: 'muted-panel', fg: 'muted', bg: 'panel', min: 4.5, what: 'Softer text on panels', words: true },
  { id: 'muted-panel2', fg: 'muted', bg: 'panel-2', min: 4.5, what: 'Softer text on the second panel shade', words: true },
  { id: 'muted-bg', fg: 'muted', bg: 'bg', min: 4.5, what: 'Softer text on the app background', words: true },
  { id: 'faint-panel', fg: 'faint', bg: 'panel', min: 4.5, what: 'Hints on panels', words: true },
  { id: 'faint-panel2', fg: 'faint', bg: 'panel-2', min: 4.5, what: 'Hints on the second panel shade', words: true },
  { id: 'chosen', fg: 'chosen-fg', bg: 'chosen-bg', min: 4.5, what: 'Text on the chosen colour', words: true },
  { id: 'accent-panel', fg: 'accent', bg: 'panel', min: 3, what: 'Links on panels', words: true },
  { id: 'danger-panel', fg: 'danger', bg: 'panel', min: 3, what: 'Warnings on panels', words: true },
  { id: 'cel', fg: 'cel-key', bg: 'panel-2', min: 3, what: 'Frames on the timeline', words: false },
  { id: 'playhead', fg: 'playhead', bg: 'panel-2', min: 3, what: 'The playhead on the timeline', words: false },
  { id: 'focus', fg: 'focus', bg: 'bg', min: 3, what: 'The keyboard focus ring', words: false },
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
