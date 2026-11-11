// Preferences: small, saved in localStorage, applied to <html> so the theme tokens do the rest.
import { createStore, readJson, writeJson } from './mini';

export type ThemePref = 'system' | 'dark' | 'light';
export type LookPref = 'cosy' | 'crisp';

export interface Prefs {
  theme: ThemePref;
  look: LookPref;
  /** Stub for now: the sound effects arrive with the first quests. */
  sounds: boolean;
  reduceMotion: boolean;
  /** Show the welcome sheet when the app starts. */
  showWelcome: boolean;
  /** Show the friendly tips in the status bar. */
  showTips: boolean;
  /** Command id -> its shortcuts. An empty list means "no shortcut". Missing means "use the default". */
  keymap: Record<string, string[]>;
}

export const PREFS_KEY = 'frameling.prefs.v1';

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  look: 'cosy',
  sounds: false,
  reduceMotion: false,
  showWelcome: true,
  showTips: true,
  keymap: {},
};

const prefsStore = createStore<Prefs>(readJson(PREFS_KEY, DEFAULT_PREFS));

export const getPrefs = (): Prefs => prefsStore.get();
export const usePrefs = <S,>(selector: (p: Prefs) => S): S => prefsStore.use(selector);
export const subscribePrefs = prefsStore.subscribe;

export function setPrefs(patch: Partial<Prefs>): void {
  prefsStore.set((p) => ({ ...p, ...patch }));
  writeJson(PREFS_KEY, prefsStore.get());
  applyPrefs();
}

/** Writes the look, theme and motion preferences onto <html>. Safe to call any time. */
export function applyPrefs(): void {
  if (typeof document === 'undefined') return;
  const p = prefsStore.get();
  const root = document.documentElement;
  if (p.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  root.dataset.look = p.look;
  if (p.reduceMotion) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}

/** The theme that's actually showing right now (resolves "system"). */
export function effectiveTheme(): 'dark' | 'light' {
  const p = prefsStore.get().theme;
  if (p !== 'system') return p;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** True when animation should be minimal: the preference, or the system setting. */
export function reducedMotion(): boolean {
  if (prefsStore.get().reduceMotion) return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** For tests. */
export function resetPrefs(): void {
  prefsStore.set({ ...DEFAULT_PREFS, keymap: {} });
  writeJson(PREFS_KEY, prefsStore.get());
  applyPrefs();
}
