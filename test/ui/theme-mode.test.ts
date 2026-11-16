// @vitest-environment jsdom
// A theme that is picked for a slot shows there, whatever mode it declares itself for.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DARK, DEFAULT_LIGHT, getBuiltIn } from '../../src/ui/themes/builtIn';
import { addCustomTheme, deleteCustomTheme, saveCustomTheme } from '../../src/ui/themes/library';
import { copyTheme, themeForMode } from '../../src/ui/themes/model';
import { activeTheme, getPrefs, migratePrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';

const root = () => document.documentElement;
const v = (name: string) => root().style.getPropertyValue(`--${name}`);
const SM = getBuiltIn('strawberry-milk')!; // a light theme
const MP = getBuiltIn('moonlit-pond')!; // a dark theme

/** Pretends the computer is set to dark or light. */
function computer(dark: boolean) {
  (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    get matches() {
      return q.includes('light') ? !dark : dark;
    },
    addEventListener: () => {},
  });
}

beforeEach(() => {
  resetPrefs();
  root().removeAttribute('style');
  delete root().dataset.theme;
});
afterEach(() => {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe('a theme in the slot for the other mode', () => {
  it('themeForMode keeps the pick whatever mode the theme declares', () => {
    expect(themeForMode('dark', SM.id, []).id).toBe(SM.id);
    expect(themeForMode('light', MP.id, []).id).toBe(MP.id);
  });

  it('a light theme set for both shows under System with the computer dark', () => {
    computer(true);
    setPrefs({ theme: 'system', darkTheme: SM.id, lightTheme: SM.id });
    expect(activeTheme().id).toBe(SM.id);
    expect(v('bg')).toBe(SM.tokens.bg);
    expect(root().style.getPropertyValue('color-scheme')).toBe('light');
  });

  it('shows under Dark mode too', () => {
    setPrefs({ theme: 'dark', darkTheme: SM.id, lightTheme: SM.id });
    expect(activeTheme().id).toBe(SM.id);
    expect(v('bg')).toBe(SM.tokens.bg);
  });

  it('a dark theme in the light slot shows under Light mode', () => {
    setPrefs({ theme: 'light', lightTheme: MP.id });
    expect(activeTheme().id).toBe(MP.id);
    expect(root().dataset.theme).toBe('dark');
  });
});

describe('data-theme follows the theme showing, not the computer', () => {
  it('is set under System, and says what the theme is', () => {
    computer(true);
    setPrefs({ theme: 'system', darkTheme: SM.id });
    expect(root().dataset.theme).toBe('light');
    computer(false);
    setPrefs({ theme: 'system', lightTheme: MP.id });
    expect(root().dataset.theme).toBe('dark');
  });

  it('a normal dark pair still says dark under a dark computer, and light under a light one', () => {
    computer(true);
    setPrefs({ theme: 'system', darkTheme: DEFAULT_DARK, lightTheme: DEFAULT_LIGHT });
    expect(root().dataset.theme).toBe('dark');
    computer(false);
    setPrefs({ theme: 'system' });
    expect(root().dataset.theme).toBe('light');
  });
});

describe('a theme that has gone', () => {
  it('a missing id falls back to the default for the slot', () => {
    expect(themeForMode('dark', 'nope', []).id).toBe(DEFAULT_DARK);
    expect(themeForMode('light', 'nope', []).id).toBe(DEFAULT_LIGHT);
    expect(themeForMode('dark', '', []).id).toBe(DEFAULT_DARK);
  });

  it('deleting a theme sent to the other slot gives that slot the default for the theme\'s own mode', () => {
    const mine = copyTheme(SM, []);
    addCustomTheme(mine);
    setPrefs({ darkTheme: mine.id, lightTheme: mine.id });
    deleteCustomTheme(mine.id);
    expect(getPrefs().customThemes).toEqual([]);
    expect(getPrefs().lightTheme).toBe(DEFAULT_LIGHT);
    expect(getPrefs().darkTheme).toBe(DEFAULT_LIGHT);
  });

  it('a saved pick whose custom theme was deleted falls back on load', () => {
    expect(migratePrefs({ darkTheme: 'my-gone-1234', lightTheme: 'my-gone-1234' })).toMatchObject({ darkTheme: DEFAULT_DARK, lightTheme: DEFAULT_LIGHT });
  });
});

describe('picks survive a save and a reload', () => {
  it('a light theme in both slots is still there after reading it back', () => {
    setPrefs({ theme: 'system', darkTheme: SM.id, lightTheme: SM.id });
    const saved = JSON.parse(localStorage.getItem('frameling.prefs.v1')!);
    const back = migratePrefs(saved);
    expect(back.darkTheme).toBe(SM.id);
    expect(back.lightTheme).toBe(SM.id);
  });

  it('a custom theme of one mode in the other mode\'s slot survives too', () => {
    const mine = copyTheme(MP, []);
    addCustomTheme(mine);
    setPrefs({ lightTheme: mine.id });
    const back = migratePrefs(JSON.parse(localStorage.getItem('frameling.prefs.v1')!));
    expect(back.lightTheme).toBe(mine.id);
    expect(back.customThemes.map((t) => t.id)).toEqual([mine.id]);
  });
});

describe('what "This theme is for" decides', () => {
  it('changing it moves no pick', () => {
    const mine = copyTheme(MP, []);
    addCustomTheme(mine);
    setPrefs({ darkTheme: mine.id, lightTheme: mine.id });
    saveCustomTheme({ ...getPrefs().customThemes[0], mode: 'light' });
    expect(getPrefs().darkTheme).toBe(mine.id);
    expect(getPrefs().lightTheme).toBe(mine.id);
  });
});
