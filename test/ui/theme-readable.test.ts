// @vitest-environment jsdom
// The theme editor shows the app in the theme being made, so its buttons and words are painted in colours a person
// chose. The --on-* colours are worked out from each fill, so they always read, whatever was chosen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast, toHex } from '../../src/ui/themes/color';
import { READABLE_MIN, READABLE_TOKENS, readableTokens } from '../../src/ui/themes/contrast';
import { clearTheme, themeStyle, writeTheme } from '../../src/ui/themes/model';
import { deriveTokens, type ThemeTokens } from '../../src/ui/themes/tokens';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/ui/ui.css'), 'utf8');

/** Which fill each --on-* colour has to read against. */
const FILLS: Record<string, [string, string]> = {
  'on-bg': ['bg', 'on-bg'],
  'on-panel': ['panel', 'on-panel'],
  'on-muted': ['panel', 'on-muted'],
  'on-raised': ['raised', 'on-raised'],
  'on-hover': ['hover-bg', 'on-hover'],
  'on-danger': ['danger', 'on-danger'],
  'on-chosen': ['chosen-bg', 'on-chosen'],
  'on-chosen-deep': ['sunny-deep', 'on-chosen-deep'],
  'on-tip': ['tip-bg', 'on-tip'],
  'on-tip-soft': ['tip-bg', 'on-tip-soft'],
  'on-tip-link': ['tip-bg', 'on-tip-link'],
};

const reads = (tokens: ThemeTokens, on = readableTokens(tokens)): string[] =>
  Object.entries(FILLS)
    .filter(([name]) => contrast(on[name], tokens[FILLS[name][0]]) < READABLE_MIN)
    .map(([name]) => name);

describe('readable text colours', () => {
  it('covers every --on-* name and has a fill for each', () => {
    expect(Object.keys(FILLS).sort()).toEqual([...READABLE_TOKENS].sort());
  });

  it('reads on its fill in every built-in theme, including Delete\'s confirm (words on the danger fill)', () => {
    for (const t of BUILT_IN_THEMES) expect(reads(t.tokens), t.name).toEqual([]);
  });

  it('leaves a theme that already reads exactly as it is', () => {
    for (const t of BUILT_IN_THEMES) {
      const on = readableTokens(t.tokens);
      if (contrast(t.tokens.text, t.tokens.raised) >= READABLE_MIN) expect(on['on-raised'], t.name).toBe(t.tokens.text.toLowerCase());
      if (contrast(t.tokens.text, t.tokens['hover-bg']) >= READABLE_MIN) expect(on['on-hover'], t.name).toBe(t.tokens.text.toLowerCase());
    }
  });

  it('reads on any fill whatever the theme picked, over thousands of made-up colour sets', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const colour = () => toHex([rnd() * 255, rnd() * 255, rnd() * 255]);
    const base = BUILT_IN_THEMES[0].tokens;
    for (let i = 0; i < 3000; i++) {
      const picks = { bg: colour(), panel: colour(), raised: colour(), line: colour(), 'panel-2': colour(), text: colour(), muted: colour(), danger: colour(), 'chosen-bg': colour(), 'chosen-fg': colour() };
      const tokens = deriveTokens({ ...base, ...picks }, rnd() < 0.5 ? 'dark' : 'light');
      expect(reads(tokens), JSON.stringify(picks)).toEqual([]);
    }
  });

  it('rescues the screenshot case: pale words on a pale button', () => {
    const t: ThemeTokens = { ...BUILT_IN_THEMES.find((x) => x.id === 'ice-camo')!.tokens, text: '#9fb4ba' };
    expect(contrast(t.text, t.raised)).toBeLessThan(READABLE_MIN);
    const on = readableTokens(t);
    expect(contrast(on['on-raised'], t.raised)).toBeGreaterThanOrEqual(READABLE_MIN);
    expect(contrast(on['on-hover'], t['hover-bg'])).toBeGreaterThanOrEqual(READABLE_MIN);
  });

  it('is written with the theme, scoped for a preview, and taken off again', () => {
    const t = BUILT_IN_THEMES.find((x) => x.id === 'ice-camo')!;
    const el = document.createElement('div');
    writeTheme(el, t);
    for (const n of READABLE_TOKENS) expect(el.style.getPropertyValue(`--${n}`), n).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(themeStyle(t))).toEqual(expect.arrayContaining(READABLE_TOKENS.map((n) => `--${n}`)));
    clearTheme(el);
    for (const n of READABLE_TOKENS) expect(el.style.getPropertyValue(`--${n}`)).toBe('');
  });
});

describe('the buttons use them', () => {
  beforeEach(() => undefined);
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };
  it('plain buttons read from the raised fill at rest and from the hover fill on hover', () => {
    expect(rule('.ui-btn')).toContain('color: var(--on-raised, var(--text))');
    expect(rule('.ui-btn:where(:not(.ui-btn-quiet, .ui-btn-primary)):hover:not(:disabled)')).toContain('color: var(--on-hover, var(--text))');
  });
  it('primary buttons and the delete confirm read from their own fills', () => {
    expect(rule('.ui-btn-primary')).toContain('var(--on-chosen, var(--chosen-fg))');
    expect(rule('.ui-btn-primary:hover:not(:disabled)')).toContain('var(--on-chosen-deep, var(--chosen-fg))');
    expect(rule('.th-danger,\n.th-danger:hover:not(:disabled)')).toContain('var(--on-danger, var(--bg))');
  });
});
