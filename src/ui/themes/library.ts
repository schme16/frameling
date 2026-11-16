// Changing the themes people have: picking one for dark or light, adding, saving, renaming and deleting their own.
// All of it goes through setPrefs, so it's saved and applied straight away.
import { getPrefs, setPrefs } from '../prefs';
import { defaultThemeFor, type Theme } from './builtIn';
import { findTheme, MAX_CUSTOM } from './model';
import type { ThemeMode } from './tokens';

/**
 * Use a theme. It goes to its own mode by default (dark themes for dark mode, light for light); with Advanced
 * picking, `as` says which mode it is being picked for, so a bright theme can be your night one if you like.
 */
export function selectTheme(theme: Theme, as?: ThemeMode): void {
  setPrefs((as ?? theme.mode) === 'dark' ? { darkTheme: theme.id } : { lightTheme: theme.id });
}

export function isInUse(theme: Theme): boolean {
  const p = getPrefs();
  return (theme.mode === 'dark' ? p.darkTheme : p.lightTheme) === theme.id;
}

/** Adds a custom theme. False if there are too many already. */
export function addCustomTheme(theme: Theme): boolean {
  const p = getPrefs();
  if (p.customThemes.length >= MAX_CUSTOM) return false;
  setPrefs({ customThemes: [...p.customThemes, { ...theme, builtIn: false }] });
  return true;
}

/** Replaces a custom theme with an edited version. */
export function saveCustomTheme(theme: Theme): void {
  const p = getPrefs();
  const old = p.customThemes.find((t) => t.id === theme.id);
  if (!old) return;
  // Changing its mode moves nothing: where you put a theme is your choice, and it stays put.
  setPrefs({ customThemes: p.customThemes.map((t) => (t.id === theme.id ? { ...theme, builtIn: false } : t)) });
}

/** Deletes a custom theme. Wherever it was in use, that slot goes to the default theme of the deleted theme's own mode, so it still looks the way it did. */
export function deleteCustomTheme(id: string): void {
  const p = getPrefs();
  const gone = p.customThemes.find((t) => t.id === id);
  const fallback = (slot: ThemeMode) => defaultThemeFor(gone?.mode ?? slot).id;
  setPrefs({
    customThemes: p.customThemes.filter((t) => t.id !== id),
    darkTheme: p.darkTheme === id ? fallback('dark') : p.darkTheme,
    lightTheme: p.lightTheme === id ? fallback('light') : p.lightTheme,
  });
}

export const themeById = (id: string): Theme | undefined => findTheme(id, getPrefs().customThemes);

export const modeLabel = (m: ThemeMode): string => (m === 'dark' ? 'dark mode' : 'light mode');
