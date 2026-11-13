// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES, CHOSEN_FROM_PALETTE, DEFAULT_DARK, DEFAULT_LIGHT, getBuiltIn, surroundFor } from '../../src/ui/themes/builtIn';
import { contrast, ensureContrast, hexToHsl, hslToHex, isHex, mix, parseHex } from '../../src/ui/themes/color';
import { checkContrast, fixPair, problems, problemsFor } from '../../src/ui/themes/contrast';
import { addCustomTheme, deleteCustomTheme, saveCustomTheme, selectTheme } from '../../src/ui/themes/library';
import { clearTheme, completeTokens, copyTheme, importThemeText, MAX_FILE_BYTES, sanitizeCustomThemes, themeFileName, themeToFile, themeStyle, uniqueName, writeTheme } from '../../src/ui/themes/model';
import { paletteFromColour } from '../../src/ui/themes/palette';
import { ALL_TOKENS, COLOUR_TOKENS, CORE_TOKENS, deriveTokens, EDITOR_CONTROLS } from '../../src/ui/themes/tokens';
import { activeTheme, applyPrefs, DEFAULT_PREFS, getPrefs, migratePrefs, resetPrefs, setPrefs, setThemePreview } from '../../src/ui/prefs';

beforeEach(() => {
  resetPrefs();
  document.documentElement.removeAttribute('style');
});

const root = () => document.documentElement;
const v = (name: string) => root().style.getPropertyValue(`--${name}`);

describe('built-in themes', () => {
  it('has at least three dark and three light, with unique ids and names', () => {
    expect(BUILT_IN_THEMES.filter((t) => t.mode === 'dark').length).toBeGreaterThanOrEqual(3);
    expect(BUILT_IN_THEMES.filter((t) => t.mode === 'light').length).toBeGreaterThanOrEqual(3);
    expect(new Set(BUILT_IN_THEMES.map((t) => t.id)).size).toBe(BUILT_IN_THEMES.length);
    expect(new Set(BUILT_IN_THEMES.map((t) => t.name)).size).toBe(BUILT_IN_THEMES.length);
    for (const id of ['midnight-sketchbook', 'paper-and-honey', 'moonlit-pond', 'studio-white', 'strawberry-milk']) expect(getBuiltIn(id)).toBeTruthy();
    // Every pair the user asked for has a dark and a light side.
    for (const [dark, light] of [['gumdrop-night', 'gumdrop-day'], ['batwing', 'bat-nap'], ['mocha-kitten', 'latte-kitten'], ['retro-groove-night', 'retro-groove-day'], ['puppy-socks', 'kitty-socks']]) {
      expect(getBuiltIn(dark)?.mode, dark).toBe('dark');
      expect(getBuiltIn(light)?.mode, light).toBe('light');
    }
  });

  it('covers every colour token with a valid value', () => {
    for (const t of BUILT_IN_THEMES) {
      expect(t.builtIn).toBe(true);
      for (const name of ALL_TOKENS) expect(t.tokens[name], `${t.id} ${name}`).toBeTruthy();
      for (const name of COLOUR_TOKENS) expect(isHex(t.tokens[name]), `${t.id} ${name} = ${t.tokens[name]}`).toBe(true);
    }
  });

  it('keeps the chosen-state rule: gold with dark text (or a colour from the theme, still with dark text)', () => {
    for (const t of BUILT_IN_THEMES) {
      if (CHOSEN_FROM_PALETTE.has(t.id)) {
        expect(contrast(t.tokens['chosen-fg'], t.tokens['chosen-bg']), t.id).toBeGreaterThanOrEqual(7);
        expect(parseHex(t.tokens['chosen-fg'])!.every((c) => c < 50), t.id).toBe(true);
        // Chosen things still stand apart from the panels they sit on.
        expect(contrast(t.tokens['chosen-bg'], t.tokens.panel), t.id).toBeGreaterThanOrEqual(1.5);
        continue;
      }
      const [h, s, l] = hexToHsl(t.tokens['chosen-bg']);
      expect(h, t.id).toBeGreaterThan(35);
      expect(h, t.id).toBeLessThan(50);
      expect(s, t.id).toBeGreaterThan(0.8);
      expect(l, t.id).toBeGreaterThan(0.5);
      expect(contrast(t.tokens['chosen-fg'], t.tokens['chosen-bg']), t.id).toBeGreaterThanOrEqual(7);
      expect(parseHex(t.tokens['chosen-fg'])!.every((c) => c < 50), t.id).toBe(true);
    }
  });

  it('passes every contrast check (and the high-contrast ones pass AAA)', () => {
    for (const t of BUILT_IN_THEMES) {
      expect(problems(t.tokens).map((r) => r.id), t.id).toEqual([]);
      expect(contrast(t.tokens.text, t.tokens.bg), t.id).toBeGreaterThanOrEqual(7);
      expect(contrast(t.tokens.text, t.tokens.panel), t.id).toBeGreaterThanOrEqual(7);
      expect(contrast(t.tokens.muted, t.tokens.panel), t.id).toBeGreaterThanOrEqual(4.5);
    }
    for (const id of ['lantern-night', 'sunbeam']) {
      const t = getBuiltIn(id)!;
      expect(contrast(t.tokens.muted, t.tokens.panel)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.tokens.faint, t.tokens.panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.tokens.line, t.tokens.panel)).toBeGreaterThanOrEqual(3);
    }
  });

  it('only a few themes have non-gold chosen states and a surround pattern, and copies keep it', () => {
    expect(CHOSEN_FROM_PALETTE.size).toBeLessThan(BUILT_IN_THEMES.length / 2);
    for (const id of CHOSEN_FROM_PALETTE) expect(getBuiltIn(id), id).toBeDefined();
    expect(surroundFor({ id: 'ice-camo' })).toBe('camo');
    expect(surroundFor({ id: 'custom-1', basedOn: 'glacier-grid' })).toBe('camo');
    expect(surroundFor({ id: 'lavender-hum' })).toBeNull();
    expect(surroundFor({ id: 'strawberry' })).toBe('seeds');
    expect(surroundFor({ id: 'kitty-socks' })).toBe('socks');
    expect(surroundFor({ id: 'custom-2', basedOn: 'puppy-socks' })).toBe('socks');
    expect(surroundFor({ id: DEFAULT_DARK })).toBeNull();
  });

  it('dark themes are dark and light themes are light', () => {
    for (const t of BUILT_IN_THEMES) {
      const l = contrast(t.tokens.bg, '#000000');
      if (t.mode === 'dark') expect(l, t.id).toBeLessThan(2);
      else expect(l, t.id).toBeGreaterThan(15);
    }
  });

  it('the two defaults match the fallback colours in theme.css', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/renderer/theme.css'), 'utf8');
    const block = (start: string) => {
      const i = css.indexOf(start);
      return css.slice(i, css.indexOf('}', i));
    };
    const read = (b: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(b)?.[1].toLowerCase();
    const dark = block(':root {');
    const light = block(":root[data-theme='light'] {");
    for (const n of ['bg', 'panel', 'panel-2', 'raised', 'line', 'text', 'muted', 'faint', 'canvas-bg', 'danger']) {
      expect(read(dark, n), `dark ${n}`).toBe(getBuiltIn(DEFAULT_DARK)!.tokens[n]);
    }
    for (const n of ['bg', 'panel', 'panel-2', 'raised', 'line', 'text', 'muted', 'faint', 'canvas-bg', 'danger', 'accent', 'focus', 'ok', 'cel-key', 'playhead']) {
      expect(read(light, n), `light ${n}`).toBe(getBuiltIn(DEFAULT_LIGHT)!.tokens[n]);
    }
  });
});

describe('colour maths', () => {
  it('parses, mixes and round-trips', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('nope')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(mix('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(hslToHex(...hexToHsl('#ffc94a'))).toBe('#ffc94a');
  });
  it('has the standard contrast extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
  it('ensureContrast moves a colour just far enough', () => {
    const fixed = ensureContrast('#888888', '#999999', 4.5);
    expect(contrast(fixed, '#999999')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#000000', '#ffffff', 4.5)).toBe('#000000');
    expect(ensureContrast('#7a7a7a', '#7a7a7a', 21)).toMatch(/^#(000000|ffffff)$/);
  });
});

describe('contrast checker', () => {
  const base = () => ({ ...getBuiltIn(DEFAULT_DARK)!.tokens });
  it('flags hard-to-read text in plain words', () => {
    const t = base();
    t.text = '#2a2638'; // nearly the panel colour
    const bad = problems(t);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.some((r) => r.id === 'text-panel' && r.level === 'bad')).toBe(true);
    expect(bad[0].message).toMatch(/hard to read/);
    expect(bad[0].message).not.toMatch(/--|token|ratio/i);
  });
  it('says "may be hard" for a near miss', () => {
    const t = base();
    // Find a muted shade that lands between 3.4 and 4.5.
    for (let l = 40; l < 70; l++) {
      t.muted = hslToHex(260, 0.1, l / 100);
      const r = checkContrast(t).find((x) => x.id === 'muted-panel')!;
      if (r.level === 'warn') {
        expect(r.message).toMatch(/may be hard to read/);
        return;
      }
    }
    throw new Error('no near miss found');
  });
  it('finds the problems for one token, and fixPair makes them pass', () => {
    const t = base();
    t.muted = t['panel-2'];
    expect(problemsFor(t, 'muted').length).toBeGreaterThan(0);
    for (const r of problemsFor(t, 'muted').filter((x) => x.fg === 'muted')) {
      t.muted = fixPair(t, r);
    }
    expect(problemsFor(t, 'muted')).toEqual([]);
  });
});

describe('palette from one colour', () => {
  const seeds = ['#6c8cff', '#ff3366', '#ffd400', '#2ecc71', '#808080', '#ffffff', '#000000', '#9b7bff', '#ff8000'];
  for (const mode of ['dark', 'light'] as const) {
    it(`makes a complete, readable ${mode} palette from any colour`, () => {
      for (const seed of seeds) {
        const p = paletteFromColour(seed, mode);
        for (const n of ALL_TOKENS) expect(p[n], `${seed} ${n}`).toBeTruthy();
        for (const n of COLOUR_TOKENS) expect(isHex(p[n]), `${seed} ${n} ${p[n]}`).toBe(true);
        expect(problems(p).map((r) => `${seed} ${r.id} ${r.ratio.toFixed(2)}`)).toEqual([]);
        expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(7);
        // Gold stays gold for chosen things.
        expect(p['chosen-bg']).toBe('#ffc94a');
        // The right end of the lightness range.
        const l = hexToHsl(p.bg)[2];
        if (mode === 'dark') expect(l).toBeLessThan(0.2);
        else expect(l).toBeGreaterThan(0.85);
      }
    });
  }
  it('tints the background with the picked hue', () => {
    const blue = hexToHsl(paletteFromColour('#3355ff', 'dark').panel)[0];
    expect(blue).toBeGreaterThan(210);
    expect(blue).toBeLessThan(250);
    const red = hexToHsl(paletteFromColour('#ff2222', 'light').panel)[0];
    expect(red < 20 || red > 340).toBe(true);
  });
  it('copes with a bad colour', () => {
    expect(() => paletteFromColour('not a colour', 'dark')).not.toThrow();
  });
});

describe('deriving tokens', () => {
  it('only recalculates what depends on what changed', () => {
    const t: Record<string, string> = { ...getBuiltIn(DEFAULT_DARK)!.tokens, 'hover-bg': '#123456' };
    const next = deriveTokens({ ...t, 'cel-key': '#ff0000' }, 'dark', ['cel-key']);
    expect(next.cel).not.toBe(t.cel);
    expect(next['hover-bg']).toBe('#123456');
    expect(deriveTokens(t, 'dark', ['text'])['line-soft']).toBe(t['line-soft']);
  });
  it('the soft warning tint follows the panel and peach, and text reads on it in every built-in theme', () => {
    for (const t of BUILT_IN_THEMES) {
      expect(isHex(t.tokens['peach-soft']), t.id).toBe(true);
      expect(contrast(t.tokens.text, t.tokens['peach-soft']), t.id).toBeGreaterThanOrEqual(4.5);
      // A tint, not the gold chosen colour: it stays close to the panel it sits on.
      expect(contrast(t.tokens['peach-soft'], t.tokens.panel), t.id).toBeLessThan(1.5);
    }
    const t = getBuiltIn(DEFAULT_DARK)!.tokens;
    const next = deriveTokens({ ...t, panel: '#102030' }, 'dark', ['panel']);
    expect(next['peach-soft']).toBe(mix(t.peach, '#102030', 0.14));
    expect(deriveTokens(t, 'dark', ['text'])['peach-soft']).toBe(t['peach-soft']);
    // A custom theme saved before the tint existed gets one worked out.
    const old: Record<string, unknown> = { ...t };
    delete old['peach-soft'];
    expect(completeTokens(old, 'dark')['peach-soft']).toBe(t['peach-soft']);
  });
  it('every editor control is a real core token', () => {
    for (const c of EDITOR_CONTROLS) expect((CORE_TOKENS as readonly string[]).includes(c.token), c.token).toBe(true);
    for (const c of CORE_TOKENS) expect(EDITOR_CONTROLS.some((e) => e.token === c), c).toBe(true);
  });
});

describe('applying a theme', () => {
  it('writes every token onto <html> as a CSS variable, with the colour scheme', () => {
    setPrefs({ theme: 'dark', darkTheme: 'moonlit-pond' });
    const t = getBuiltIn('moonlit-pond')!;
    for (const n of ALL_TOKENS) expect(v(n), n).toBe(t.tokens[n]);
    expect(root().style.getPropertyValue('color-scheme')).toBe('dark');
    expect(root().dataset.theme).toBe('dark');
  });
  it('uses the light pick for light and leaves data-theme off for System', () => {
    setPrefs({ theme: 'light', lightTheme: 'strawberry-milk' });
    expect(v('bg')).toBe(getBuiltIn('strawberry-milk')!.tokens.bg);
    expect(root().style.getPropertyValue('color-scheme')).toBe('light');
    setPrefs({ theme: 'system' });
    expect(root().dataset.theme).toBeUndefined();
  });
  it('marks <html> for the camo surround only while a camo theme shows', () => {
    setPrefs({ theme: 'dark', darkTheme: 'glacier-grid' });
    expect(root().dataset.surround).toBe('camo');
    setPrefs({ darkTheme: 'lilac-static' });
    expect(root().dataset.surround).toBeUndefined();
  });
  it('System follows the computer, live', () => {
    let dark = true;
    const listeners: (() => void)[] = [];
    (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
      get matches() {
        return q.includes('light') ? !dark : dark;
      },
      addEventListener: (_: string, f: () => void) => listeners.push(f),
    });
    try {
      setPrefs({ theme: 'system', darkTheme: 'hot-cocoa', lightTheme: 'studio-white' });
      expect(v('bg')).toBe(getBuiltIn('hot-cocoa')!.tokens.bg);
      dark = false;
      listeners.forEach((f) => f());
      expect(v('bg')).toBe(getBuiltIn('studio-white')!.tokens.bg);
      expect(activeTheme().id).toBe('studio-white');
    } finally {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });
  it('does not leave stale variables when a theme lacks a token', () => {
    const el = document.createElement('div');
    writeTheme(el, { mode: 'dark', tokens: { bg: '#000000', line: '#111111' } });
    writeTheme(el, { mode: 'dark', tokens: { bg: '#222222' } });
    expect(el.style.getPropertyValue('--line')).toBe('');
    expect(el.style.getPropertyValue('--bg')).toBe('#222222');
    clearTheme(el);
    expect(el.style.getPropertyValue('--bg')).toBe('');
  });
  it('a preview shows another theme without picking it', () => {
    setPrefs({ theme: 'light' });
    setThemePreview(getBuiltIn('lantern-night')!);
    expect(v('bg')).toBe(getBuiltIn('lantern-night')!.tokens.bg);
    expect(root().dataset.theme).toBe('dark');
    setThemePreview(null);
    expect(v('bg')).toBe(getBuiltIn(DEFAULT_LIGHT)!.tokens.bg);
    expect(getPrefs().darkTheme).toBe(DEFAULT_DARK);
  });
  it('rewrites data-look on every apply, so token caches hear about it', () => {
    const seen: string[] = [];
    const mo = new MutationObserver((rs) => rs.forEach((r) => seen.push(r.attributeName ?? '')));
    mo.observe(root(), { attributes: true, attributeFilter: ['data-look'] });
    applyPrefs();
    return new Promise<void>((done) =>
      setTimeout(() => {
        mo.disconnect();
        expect(seen).toContain('data-look');
        done();
      }, 0),
    );
  });
  it('look is independent of the theme', () => {
    setPrefs({ theme: 'dark', darkTheme: 'cosy-test-missing', look: 'crisp' });
    expect(root().dataset.look).toBe('crisp');
    expect(getPrefs().darkTheme).toBe('cosy-test-missing'); // stored as given; applying falls back
    expect(v('bg')).toBe(getBuiltIn(DEFAULT_DARK)!.tokens.bg);
  });
  it('themeStyle gives CSS variables for a preview', () => {
    const s = themeStyle(getBuiltIn('sunbeam')!);
    expect(s['--bg']).toBe(getBuiltIn('sunbeam')!.tokens.bg);
    expect(Object.keys(s)).toHaveLength(ALL_TOKENS.length);
  });
});

describe('preferences migration', () => {
  it('keeps an old theme-only save working', () => {
    const p = migratePrefs({ theme: 'light', look: 'crisp', sounds: true, keymap: { a: ['x'] } });
    expect(p.theme).toBe('light');
    expect(p.look).toBe('crisp');
    expect(p.sounds).toBe(true);
    expect(p.keymap).toEqual({ a: ['x'] });
    expect(p.darkTheme).toBe(DEFAULT_DARK);
    expect(p.lightTheme).toBe(DEFAULT_LIGHT);
    expect(p.customThemes).toEqual([]);
  });
  it('gives cosy and System to anyone with nothing saved', () => {
    expect(migratePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(migratePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(migratePrefs('junk')).toEqual(DEFAULT_PREFS);
    expect(migratePrefs([])).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.look).toBe('cosy');
    expect(DEFAULT_PREFS.theme).toBe('system');
  });
  it('replaces unknown values and picks for the wrong mode', () => {
    const p = migratePrefs({ theme: 'sepia', look: 'wobbly', darkTheme: 'nope', lightTheme: 'moonlit-pond', showTips: 'yes' });
    expect(p.theme).toBe('system');
    expect(p.look).toBe('cosy');
    expect(p.darkTheme).toBe(DEFAULT_DARK);
    expect(p.lightTheme).toBe(DEFAULT_LIGHT); // moonlit-pond is a dark theme
    expect(p.showTips).toBe(true);
  });
  it('keeps good picks, including a custom one, and drops a custom theme that is damaged', () => {
    const mine = copyTheme(getBuiltIn('studio-white')!, []);
    const p = migratePrefs({ lightTheme: mine.id, darkTheme: 'hot-cocoa', customThemes: [mine, { id: 'broken', mode: 'light' }, 'x', null] });
    expect(p.customThemes.map((t) => t.id)).toEqual([mine.id]);
    expect(p.lightTheme).toBe(mine.id);
    expect(p.darkTheme).toBe('hot-cocoa');
  });
  it('a pick whose custom theme has gone falls back', () => {
    expect(migratePrefs({ darkTheme: 'my-gone-1234' }).darkTheme).toBe(DEFAULT_DARK);
  });
  it('is read from localStorage format round trip', () => {
    const mine = copyTheme(getBuiltIn('hot-cocoa')!, []);
    addCustomTheme(mine);
    selectTheme(mine);
    const saved = JSON.parse(localStorage.getItem('frameling.prefs.v1')!);
    const back = migratePrefs(saved);
    expect(back.customThemes).toHaveLength(1);
    expect(back.darkTheme).toBe(mine.id);
  });
});

describe('custom themes', () => {
  it('copies, saves, switches mode and deletes', () => {
    const copy = copyTheme(getBuiltIn('moonlit-pond')!, []);
    expect(copy.builtIn).toBe(false);
    expect(copy.basedOn).toBe('moonlit-pond');
    expect(copy.name).toBe('Moonlit Pond copy');
    expect(copy.id).not.toBe('moonlit-pond');
    expect(addCustomTheme(copy)).toBe(true);
    selectTheme(copy);
    setPrefs({ theme: 'dark' });
    expect(getPrefs().darkTheme).toBe(copy.id);
    saveCustomTheme({ ...copy, tokens: deriveTokens({ ...copy.tokens, bg: '#102030' }, 'dark', ['bg']) });
    expect(v('bg')).toBe('#102030');
    // To the other mode: it follows.
    saveCustomTheme({ ...getPrefs().customThemes[0], mode: 'light' });
    expect(getPrefs().darkTheme).toBe(DEFAULT_DARK);
    expect(getPrefs().lightTheme).toBe(copy.id);
    selectTheme(getPrefs().customThemes[0]);
    deleteCustomTheme(copy.id);
    expect(getPrefs().customThemes).toEqual([]);
    expect(getPrefs().lightTheme).toBe(DEFAULT_LIGHT);
  });
  it('names copies so they never clash', () => {
    const a = copyTheme(getBuiltIn('sunbeam')!, []);
    const b = copyTheme(a, [a]);
    expect(b.name).toBe('Sunbeam copy 2');
    expect(uniqueName('Sunbeam copy', [a, b])).toBe('Sunbeam copy 3');
    expect(b.basedOn).toBe('sunbeam');
  });
});

describe('import and export', () => {
  const good = () => JSON.parse(themeToFile(getBuiltIn('strawberry-milk')!));
  const run = (x: unknown, custom = getPrefs().customThemes) => importThemeText(typeof x === 'string' ? x : JSON.stringify(x), custom);

  it('round trips a theme', () => {
    const r = importThemeText(themeToFile(getBuiltIn('hot-cocoa')!), []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.theme.mode).toBe('dark');
    expect(r.theme.builtIn).toBe(false);
    expect(r.theme.tokens).toEqual(getBuiltIn('hot-cocoa')!.tokens);
    expect(r.theme.id).not.toBe('hot-cocoa');
    expect(r.theme.name).toBe('Hot Cocoa copy'); // the name is taken by the built-in
  });
  it('names the file sensibly', () => {
    expect(themeFileName(getBuiltIn('paper-and-honey')!)).toBe('paper-honey.frameling-theme.json');
  });
  it('rejects junk without throwing', () => {
    const junk: unknown[] = ['', 'not json', '{', '[]', 'null', '42', '"hi"', {}, { kind: 'something-else' }, { kind: 'frameling-theme', mode: 'sepia', tokens: {} }, { kind: 'frameling-theme', mode: 'dark' }, { kind: 'frameling-theme', mode: 'dark', tokens: [] }, { kind: 'frameling-theme', mode: 'dark', tokens: { bg: '#000' } }, { kind: 'frameling-theme', version: 99, mode: 'dark', tokens: good().tokens }, undefined, 5, null];
    for (const j of junk) {
      const r = typeof j === 'string' || j === undefined || typeof j === 'number' || j === null ? importThemeText(j, []) : run(j, []);
      expect(r.ok, JSON.stringify(j)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });
  it('rejects a file that is too big', () => {
    const r = importThemeText(' '.repeat(MAX_FILE_BYTES + 1), []);
    expect(r.ok).toBe(false);
  });
  it('replaces bad colours instead of trusting them, and never lets CSS through', () => {
    const f = good();
    f.tokens.bg = 'red; background: url(http://evil)';
    f.tokens.panel = 'javascript:alert(1)';
    f.tokens.shadow = '0 0 0 red; position: fixed';
    f.tokens['stage-shadow'] = 'url(http://evil)';
    f.tokens.sneaky = '#ffffff';
    const r = run(f, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.theme.tokens.bg).toBe(getBuiltIn(DEFAULT_LIGHT)!.tokens.bg);
    expect(r.theme.tokens.panel).toBe(getBuiltIn(DEFAULT_LIGHT)!.tokens.panel);
    expect(r.theme.tokens.shadow).toMatch(/^0 8px 28px rgb\(/);
    expect(r.theme.tokens.sneaky).toBeUndefined();
    for (const val of Object.values(r.theme.tokens)) expect(val).not.toMatch(/url|;|javascript/i);
  });
  it('fills in missing colours and trims names', () => {
    const r = run({ kind: 'frameling-theme', version: 1, name: '  Wobbly\n\tTheme  '.padEnd(200, 'x'), mode: 'dark', tokens: { bg: '#101820', panel: '#182028', 'panel-2': '#202830', raised: '#283038', line: '#404850', text: '#ffffff' } }, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.theme.name.length).toBeLessThanOrEqual(40);
    expect(r.theme.name).not.toMatch(/[\n\t]/);
    for (const n of ALL_TOKENS) expect(r.theme.tokens[n], n).toBeTruthy();
    expect(r.theme.tokens.bg).toBe('#101820');
  });
  it('gives imports fresh ids, so a file cannot overwrite a built-in or an existing theme', () => {
    const f = good();
    f.id = 'midnight-sketchbook';
    const mine = copyTheme(getBuiltIn('sunbeam')!, []);
    const r = run(f, [mine]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.theme.id).not.toBe('midnight-sketchbook');
      expect(r.theme.id).not.toBe(mine.id);
    }
  });
  it('sanitises stored custom themes the same way', () => {
    const mine = copyTheme(getBuiltIn('sunbeam')!, []);
    const dupe = { ...mine, name: 'again' };
    const clash = { ...mine, id: 'sunbeam' };
    const out = sanitizeCustomThemes([mine, dupe, clash, { ...mine, id: 'bad id!' }]);
    expect(out.map((t) => t.id)).toEqual([mine.id]);
    const filled = completeTokens({}, 'dark');
    for (const n of CORE_TOKENS) expect(filled[n]).toBe(getBuiltIn(DEFAULT_DARK)!.tokens[n]);
    expect(Object.keys(filled).sort()).toEqual([...ALL_TOKENS].sort());
  });
});
