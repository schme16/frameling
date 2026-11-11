// Changing the themes people have: picking one for dark or light, adding, saving, renaming and deleting their own.
// All of it goes through setPrefs, so it's saved and applied straight away.
import { getPrefs, setPrefs } from '../prefs';
import { defaultThemeFor, type Theme } from './builtIn';
import { findTheme, MAX_CUSTOM } from './model';
import type { ThemeMode } from './tokens';

/** Use a theme for its own mode (dark themes for dark mode, light for light). */
export function selectTheme(theme: Theme): void {
  setPrefs(theme.mode === 'dark' ? { darkTheme: theme.id } : { lightTheme: theme.id });
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

/** Replaces a custom theme with an edited version. If its mode changed, anything that was using it follows it. */
export function saveCustomTheme(theme: Theme): void {
  const p = getPrefs();
  const old = p.customThemes.find((t) => t.id === theme.id);
  if (!old) return;
  const patch: Partial<typeof p> = { customThemes: p.customThemes.map((t) => (t.id === theme.id ? { ...theme, builtIn: false } : t)) };
  if (old.mode !== theme.mode) {
    // It moved to the other mode: stop using it where it was, and use it where it is now.
    if (p.darkTheme === theme.id) patch.darkTheme = defaultThemeFor('dark').id;
    if (p.lightTheme === theme.id) patch.lightTheme = defaultThemeFor('light').id;
    if (old.mode === 'dark' && p.darkTheme === theme.id) patch.lightTheme = theme.id;
    if (old.mode === 'light' && p.lightTheme === theme.id) patch.darkTheme = theme.id;
  }
  setPrefs(patch);
}

/** Deletes a custom theme. Where it was in use, the mode goes back to its default theme. */
export function deleteCustomTheme(id: string): void {
  const p = getPrefs();
  setPrefs({
    customThemes: p.customThemes.filter((t) => t.id !== id),
    darkTheme: p.darkTheme === id ? defaultThemeFor('dark').id : p.darkTheme,
    lightTheme: p.lightTheme === id ? defaultThemeFor('light').id : p.lightTheme,
  });
}

export const themeById = (id: string): Theme | undefined => findTheme(id, getPrefs().customThemes);

export const modeLabel = (m: ThemeMode): string => (m === 'dark' ? 'dark mode' : 'light mode');
