// The snap line colours (one per target) have to be seen on the canvas and in the "Snapped to" note in every theme.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SNAP_TARGETS } from '../../src/canvas/snapModel';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast } from '../../src/ui/themes/color';
import { checkContrast, problemsFor } from '../../src/ui/themes/contrast';
import { completeTokens, importThemeText, sanitizeTheme, themeToFile } from '../../src/ui/themes/model';
import { paletteFromColour } from '../../src/ui/themes/palette';
import { ALL_TOKENS, SNAP_CONTROLS, SNAP_DEFAULTS, SNAP_TOKENS, switchSnapMode } from '../../src/ui/themes/tokens';

const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/canvas/canvas.css'), 'utf8');
const all = [...css.matchAll(/--snap-([a-z]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]] as const);
const n = SNAP_TARGETS.length;
const sets = { dark: Object.fromEntries(all.slice(0, n)), light: Object.fromEntries(all.slice(n, 2 * n)), light2: Object.fromEntries(all.slice(2 * n, 3 * n)) };

describe('snap colours', () => {
  it('are set for every target in the dark set and both places the light set lives', () => {
    expect(all).toHaveLength(n * 3);
    for (const s of Object.values(sets)) for (const t of SNAP_TARGETS) expect(s[t.id], t.id).toMatch(/^#[0-9a-f]{6}$/i);
    expect(sets.light).toEqual(sets.light2);
  });
  it('are told apart (no two targets share a colour, bar the grid and its pixel cells)', () => {
    for (const s of [sets.dark, sets.light]) {
      const seen = Object.entries(s).filter(([k]) => k !== 'cells').map(([, v]) => v.toLowerCase());
      expect(new Set(seen).size).toBe(seen.length);
    }
  });
  it('show 3:1 on the canvas and on the panels of every theme', () => {
    for (const t of BUILT_IN_THEMES) {
      const set = sets[t.mode === 'dark' ? 'dark' : 'light'];
      for (const [k, v] of Object.entries(set)) for (const surface of ['canvas-bg', 'panel', 'raised']) expect(contrast(v, t.tokens[surface]), `${t.id} ${k} on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('dark themes still read 3:1 on a white page', () => {
    for (const [k, v] of Object.entries(sets.dark)) expect(contrast(v, '#ffffff'), k).toBeGreaterThanOrEqual(3);
    for (const [k, v] of Object.entries(sets.light)) expect(contrast(v, '#ffffff'), k).toBeGreaterThanOrEqual(3);
  });
  it('carry a readable number on the gap tab', () => {
    for (const s of [sets.dark, sets.light]) expect(Math.max(contrast('#000000', s.spacing), contrast('#ffffff', s.spacing))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('snap colours as theme tokens', () => {
  const nameOf = (t: string) => t.slice('snap-'.length);
  it('cover every snap target, in the editor and in every theme', () => {
    expect(SNAP_TOKENS.map(nameOf).sort()).toEqual(SNAP_TARGETS.map((t) => t.id).sort());
    expect(SNAP_CONTROLS.map((c) => c.token).sort()).toEqual([...SNAP_TOKENS].sort());
    for (const c of SNAP_CONTROLS) expect(c.label).toBe(SNAP_TARGETS.find((t) => t.id === nameOf(c.token))!.label);
    for (const t of BUILT_IN_THEMES) for (const n of SNAP_TOKENS) expect(t.tokens[n], `${t.id} ${n}`).toMatch(/^#[0-9a-f]{6}$/i);
    for (const n of SNAP_TOKENS) expect(ALL_TOKENS).toContain(n);
  });
  it('start as the values canvas.css holds, for dark and light, in all 14 built-in themes', () => {
    for (const n of SNAP_TOKENS) {
      expect(SNAP_DEFAULTS.dark[n].toLowerCase(), n).toBe(sets.dark[nameOf(n)].toLowerCase());
      expect(SNAP_DEFAULTS.light[n].toLowerCase(), n).toBe(sets.light[nameOf(n)].toLowerCase());
    }
    expect(BUILT_IN_THEMES).toHaveLength(14);
    for (const t of BUILT_IN_THEMES) for (const n of SNAP_TOKENS) expect(t.tokens[n].toLowerCase(), `${t.id} ${n}`).toBe(SNAP_DEFAULTS[t.mode][n].toLowerCase());
  });
  it('raise no contrast warning in any built-in theme', () => {
    for (const t of BUILT_IN_THEMES) expect(checkContrast(t.tokens).filter((r) => r.fg.startsWith('snap-') && r.level !== 'good').map((r) => r.message), t.id).toEqual([]);
  });
  it('warn in plain words, under the colour, when a user theme makes one hard to see', () => {
    const base = BUILT_IN_THEMES.find((t) => t.mode === 'dark')!;
    // Dark teal on a dark canvas.
    const tokens = { ...base.tokens, 'snap-page': '#102a2a' };
    const probs = problemsFor(tokens, 'snap-page');
    expect(probs.length).toBeGreaterThan(0);
    expect(probs[0].message).toMatch(/page edges snap/i);
    expect(problemsFor(tokens, 'snap-guides')).toEqual([]);
  });
  it('are filled in from the mode when an older theme or file lacks them, and kept when given', () => {
    const base = BUILT_IN_THEMES.find((t) => t.mode === 'light')!;
    const { 'snap-page': _drop, ...without } = base.tokens;
    expect(completeTokens(without, 'light')['snap-page']).toBe(SNAP_DEFAULTS.light['snap-page']);
    expect(completeTokens({ ...without, 'snap-page': '#123456' }, 'light')['snap-page']).toBe('#123456');
    expect(completeTokens({ ...without, 'snap-page': 'red' }, 'light')['snap-page']).toBe(SNAP_DEFAULTS.light['snap-page']);
    const t = sanitizeTheme({ id: 'mine', name: 'Mine', mode: 'dark', tokens: { ...BUILT_IN_THEMES[0].tokens, 'snap-guides': '#ABCDEF' } })!;
    expect(t.tokens['snap-guides']).toBe('#abcdef');
  });
  it('survive export and import', () => {
    const base = BUILT_IN_THEMES.find((t) => t.mode === 'dark')!;
    const mine = { ...base, id: 'my-x', name: 'Mine', builtIn: false, tokens: { ...base.tokens, 'snap-spacing': '#ff00aa' } };
    const r = importThemeText(themeToFile(mine), []);
    expect(r.ok).toBe(true);
    if (r.ok) for (const n of SNAP_TOKENS) expect(r.theme.tokens[n], n).toBe(mine.tokens[n]);
  });
  it('are made to show by "Start from a colour", for any seed and mode', () => {
    for (const seed of ['#9b7bff', '#ffc94a', '#222222', '#ffffff', '#00ff88']) {
      for (const mode of ['dark', 'light'] as const) {
        const p = paletteFromColour(seed, mode);
        for (const n of SNAP_TOKENS) for (const surface of ['canvas-bg', 'panel', 'raised']) expect(contrast(p[n], p[surface]), `${seed} ${mode} ${n} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('move to the other mode\'s set when a theme changes mode, unless they were changed', () => {
    const t = { ...SNAP_DEFAULTS.dark, 'snap-guides': '#123456' };
    const out = switchSnapMode(t, 'dark', 'light');
    expect(out['snap-page']).toBe(SNAP_DEFAULTS.light['snap-page']);
    expect(out['snap-guides']).toBe('#123456');
    expect(switchSnapMode(t, 'dark', 'dark')).toBe(t);
  });
});
