// The ink of a brush sample is chosen from the panel it sits on, never from the name of the theme.
import { describe, expect, it } from 'vitest';
import { flatten, inkAgainst, parseCssColour } from '../../src/brushes/ink';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast } from '../../src/ui/themes/color';

describe('reading a colour from the browser', () => {
  it('takes rgb, rgba, hex and srgb forms', () => {
    expect(parseCssColour('rgb(33, 30, 44)')).toEqual([33, 30, 44, 1]);
    expect(parseCssColour('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0]);
    expect(parseCssColour('rgb(10 20 30 / 50%)')?.[3]).toBeCloseTo(0.5);
    expect(parseCssColour('#abc')).toEqual([170, 187, 204, 1]);
    expect(parseCssColour('color(srgb 1 0.5 0)')?.slice(0, 3)).toEqual([255, 127.5, 0]);
    expect(parseCssColour('transparent')?.[3]).toBe(0);
    expect(parseCssColour('banana')).toBeNull();
  });
  it('lays see-through colours over what is behind them', () => {
    expect(flatten([[255, 255, 255, 0.5]], '#000000')).toBe('#808080');
    expect(flatten([[255, 0, 0, 1], [0, 0, 255, 1]], '#000000')).toBe('#ff0000');
  });
});

describe('the ink', () => {
  it('keeps a colour that already stands out, and moves one that does not', () => {
    expect(inkAgainst('#211e2c', '#f4efe6')).toBe('#f4efe6');
    expect(inkAgainst('#211e2c', '#1d1b26', 3)).not.toBe('#1d1b26');
    expect(contrast(inkAgainst('#211e2c', '#1d1b26', 3), '#211e2c')).toBeGreaterThanOrEqual(3);
    expect(contrast(inkAgainst('#fffaf0', '#f4efe6', 3), '#fffaf0')).toBeGreaterThanOrEqual(3);
  });
  it('falls back to the panel\'s own text colour when the colour asked for would vanish, so it reads and is not a dim tint', () => {
    const ink = inkAgainst('#211e2c', '#1d1b26', 3, '#f4efe6');
    expect(ink).toBe('#f4efe6');
    expect(inkAgainst('#211e2c', '#c0a0ff', 3, '#f4efe6')).toBe('#c0a0ff');
  });
  it('is light on a dark panel and dark on a light one, in every built-in theme and for any ink asked for', () => {
    for (const t of BUILT_IN_THEMES) {
      for (const bg of ['panel', 'panel-2', 'raised']) {
        const panel = t.tokens[bg];
        for (const want of ['#1d1b26', '#ffffff', '#c04030']) {
          const ink = inkAgainst(panel, want, 3);
          expect(contrast(ink, panel), `${t.name} ${bg} ${want}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
  it('holds for a theme made up on the spot', () => {
    for (const panel of ['#000000', '#ffffff', '#7a7a7a', '#2d6a4f', '#ffe066']) expect(contrast(inkAgainst(panel, '#808080', 4.5), panel)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('a dark paint colour on the picker rows', () => {
  // The picker draws its samples in the row's own text colour (inkFor without a paint colour), and the brush options
  // preview asks for the paint colour first. Neither may ever draw near black on a near black row.
  const PAINTS = ['#000000', '#0b0a10', '#1b1a20', '#2b2833', '#7a7a7a', '#ffffff'];
  it('keeps a sample readable on every row state of every built-in theme, whatever the paint colour', () => {
    for (const t of BUILT_IN_THEMES) {
      const rows: [string, string, string][] = [
        ['raised', t.tokens.raised, t.tokens.text],
        ['hover', t.tokens['hover-bg'] ?? t.tokens.raised, t.tokens.text],
        ['chosen', t.tokens['chosen-bg'], t.tokens['chosen-fg']],
      ];
      for (const [state, bg, text] of rows) {
        if (!/^#[0-9a-f]{6}$/i.test(bg)) continue;
        // The picker: the row's own text colour, nudged only if it needs it.
        expect(contrast(inkAgainst(bg, text), bg), `${t.name} ${state} picker`).toBeGreaterThanOrEqual(4.5);
        // The brush options preview: the paint colour while it shows, the text colour when it would vanish.
        for (const paint of PAINTS) expect(contrast(inkAgainst(bg, paint, 3, text), bg), `${t.name} ${state} ${paint}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('lets a dark paint colour through on a light theme and swaps it for the text colour on a dark one', () => {
    expect(inkAgainst('#fffaf0', '#1b1a20', 3, '#2a1a10')).toBe('#1b1a20');
    expect(inkAgainst('#322d43', '#1b1a20', 3, '#f4efe6')).toBe('#f4efe6');
  });
});
