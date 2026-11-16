// The tooltip colours are theme data: worked out from each theme's own colours (so a tip follows its theme a little),
// readable in every built-in theme in both modes, and unable to end up unreadable in a theme someone makes.
import { describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast, mix } from '../../src/ui/themes/color';
import { READABLE_MIN, checkContrast, readableTokens } from '../../src/ui/themes/contrast';
import { completeTokens, sanitizeTheme } from '../../src/ui/themes/model';
import { DERIVED, DERIVED_TOKENS, TIP_ACCENT, TIP_SURFACE, deriveTokens, type ThemeTokens } from '../../src/ui/themes/tokens';

const TIP = ['tip-bg', 'tip-fg', 'tip-soft', 'tip-line', 'tip-link'] as const;

describe('tooltip colours as derived tokens', () => {
  it('are derived tokens with the colours they depend on named', () => {
    for (const n of TIP) {
      expect(DERIVED_TOKENS as readonly string[]).toContain(n);
      expect(DERIVED[n].deps.length).toBeGreaterThan(0);
    }
  });

  it('keep the approved look: the surface a step past the menu, the accent in the border', () => {
    for (const t of BUILT_IN_THEMES) {
      const k = t.tokens;
      // Built-in themes carry the values worked out from their own colours: the same sums the stylesheet used.
      expect(k['tip-bg'], t.id).toBe(mix(k.raised, k.text, TIP_SURFACE));
      expect(k['tip-line'], t.id).toBe(mix(k.accent, k.line, TIP_ACCENT));
    }
  });

  it('leave the words alone wherever they already read, and only nudge them where they do not', () => {
    for (const t of BUILT_IN_THEMES) {
      const k = t.tokens;
      if (contrast(k.text, k['tip-bg']) >= READABLE_MIN) expect(k['tip-fg'], t.id).toBe(k.text);
      if (contrast(k.muted, k['tip-bg']) >= READABLE_MIN) expect(k['tip-soft'], t.id).toBe(k.muted);
    }
  });

  it('read at 4.5:1 or better in every built-in theme, dark and light, the high-contrast ones included', () => {
    for (const t of BUILT_IN_THEMES) {
      expect(contrast(t.tokens['tip-fg'], t.tokens['tip-bg']), `${t.id} words`).toBeGreaterThanOrEqual(READABLE_MIN);
      expect(contrast(t.tokens['tip-soft'], t.tokens['tip-bg']), `${t.id} softer words`).toBeGreaterThanOrEqual(READABLE_MIN);
      expect(contrast(t.tokens['tip-link'], t.tokens['tip-bg']), `${t.id} link`).toBeGreaterThanOrEqual(READABLE_MIN);
      const r = readableTokens(t.tokens);
      expect(contrast(r['on-tip'], t.tokens['tip-bg']), `${t.id} on-tip`).toBeGreaterThanOrEqual(READABLE_MIN);
    }
    expect(BUILT_IN_THEMES.some((t) => t.id === 'lantern-night')).toBe(true);
    expect(BUILT_IN_THEMES.some((t) => t.id === 'sunbeam')).toBe(true);
    expect(BUILT_IN_THEMES.some((t) => t.id === 'ice-camo')).toBe(true);
  });

  it('the tip fill is not the menu fill and not the page: a visible step, never the loudest thing', () => {
    for (const t of BUILT_IN_THEMES) {
      const k = t.tokens;
      expect(k['tip-bg'], t.id).not.toBe(k.raised);
      expect(contrast(k['tip-bg'], k.raised), t.id).toBeLessThan(3);
    }
  });

  it('follow the theme: editing a colour they depend on recalculates them, and only then', () => {
    const base = BUILT_IN_THEMES[0].tokens;
    const next = deriveTokens({ ...base, raised: '#101020' }, 'dark', ['raised']);
    expect(next['tip-bg']).toBe(mix('#101020', base.text, TIP_SURFACE));
    const same = deriveTokens({ ...base, 'tip-bg': '#123456' }, 'dark', ['sky']);
    expect(same['tip-bg']).toBe('#123456');
  });

  it('a custom theme with the same words as its fill still gets a readable tip', () => {
    const awkward: ThemeTokens = { ...BUILT_IN_THEMES[0].tokens, raised: '#808080', text: '#868686', muted: '#7c7c7c' };
    const out = deriveTokens(awkward, 'dark');
    expect(contrast(out['tip-fg'], out['tip-bg'])).toBeGreaterThanOrEqual(READABLE_MIN);
    expect(contrast(out['tip-soft'], out['tip-bg'])).toBeGreaterThanOrEqual(READABLE_MIN);
  });

  it('a theme file with a tip colour it should not have cannot make an unreadable tip', () => {
    const base = BUILT_IN_THEMES[0].tokens;
    const file = { ...base, 'tip-bg': '#303030', 'tip-fg': '#323232', 'tip-soft': '#343434' };
    const t = completeTokens(file, 'dark');
    expect(t['tip-bg']).toBe('#303030');
    const r = readableTokens(t);
    expect(contrast(r['on-tip'], '#303030')).toBeGreaterThanOrEqual(READABLE_MIN);
    expect(contrast(r['on-tip-soft'], '#303030')).toBeGreaterThanOrEqual(READABLE_MIN);
    expect(contrast(r['on-tip-link'], '#303030')).toBeGreaterThanOrEqual(READABLE_MIN);
  });

  it('the editor warns about tip words that are hard to read', () => {
    const t = { ...BUILT_IN_THEMES[0].tokens, 'tip-fg': '#322d43' };
    const hit = checkContrast(t).find((c) => c.id === 'text-tip');
    expect(hit?.level).toBe('bad');
    expect(checkContrast(BUILT_IN_THEMES[0].tokens).filter((c) => c.id.endsWith('-tip') && c.level !== 'good')).toEqual([]);
  });

  it('files from before tip colours existed open unchanged and get them worked out', () => {
    const old: Record<string, string> = { ...BUILT_IN_THEMES[0].tokens };
    for (const n of TIP) delete old[n];
    const theme = sanitizeTheme({ id: 'old-one', name: 'Old one', mode: 'dark', tokens: old });
    expect(theme).not.toBeNull();
    for (const n of TIP) expect(theme!.tokens[n]).toBe(BUILT_IN_THEMES[0].tokens[n]);
    // Everything that was in the file is as it was.
    for (const [k, v] of Object.entries(old)) expect(theme!.tokens[k], k).toBe(v);
  });

  it('files that carry tip colours keep them', () => {
    const base = BUILT_IN_THEMES[0].tokens;
    const theme = sanitizeTheme({ id: 'mine', name: 'Mine', mode: 'dark', tokens: { ...base, 'tip-line': '#ff00aa' } });
    expect(theme!.tokens['tip-line']).toBe('#ff00aa');
  });
});
