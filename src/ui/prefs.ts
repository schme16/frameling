// Preferences: small, saved in localStorage, applied to <html> so the theme tokens do the rest.
import { createStore, readJson, writeJson } from './mini';
import { DEFAULT_DARK, DEFAULT_LIGHT, surroundFor, type Theme } from './themes/builtIn';
import { sanitizeCustomThemes, themeForMode, writeTheme } from './themes/model';
import { DEFAULT_UNIT, isUnit, type Unit } from '../core/units';
import { DEFAULT_KEYMAP_SET, isKeymapSet } from './keymapSets';
import { clampOutline, DEFAULT_OUTLINE } from '../pixel/thick';

export type ThemePref = 'system' | 'dark' | 'light';
export type LookPref = 'cosy' | 'crisp';
export type ToolRailPref = 'two' | 'stacked';

export interface Prefs {
  /** The mode: follow the computer (system), or always dark, or always light. (Called `theme` since before themes existed.) */
  theme: ThemePref;
  /** Which theme to use in dark mode (and for System when the computer is dark). A built-in id or a custom one. */
  darkTheme: string;
  /** Which theme to use in light mode (and for System when the computer is light). */
  lightTheme: string;
  /** Themes people made by copying and customising. */
  customThemes: Theme[];
  look: LookPref;
  /** Soft sound effects (quest steps, export done, refusals). On by default (picked on the board). */
  sounds: boolean;
  /** How loud the sounds are, 0 to 1. */
  soundVolume: number;
  reduceMotion: boolean;
  /** Show the welcome sheet when the app starts. */
  showWelcome: boolean;
  /** Show the friendly tips in the status bar. */
  showTips: boolean;
  /** Show Quill, the hedgehog guide. Off hides him everywhere; his speech bubbles still show their words. */
  showQuill: boolean;
  /** How the right side is laid out: Properties with a labelled rail, every panel on the rail, or tabs. */
  rightSide: 'inspector' | 'rail' | 'tabs';
  /** The tool rail: every tool two wide in groups, or one button per group with the rest in a flyout. */
  toolRail: ToolRailPref;
  /** Tile mode: fade the copies round the tile you're drawing (off shows them at full strength). */
  fadeTileCopies: boolean;
  /** How sizes are shown: pixels, or mm, cm, inches or points at the document's DPI. */
  units: Unit;
  /** The first-run hello from Quill has been seen (or skipped). */
  onboarded: boolean;
  /** Command id -> its shortcuts. An empty list means "no shortcut". Missing means "use the default". */
  keymap: Record<string, string[]>;
  /** The shortcut set underneath the person's own changes (see keymapSets.ts). */
  keymapSet: string;
  /** The plain timeline (one block per drawing, no property rows). Off shows the detailed one. */
  cleanTimeline: boolean;
  /** Pixel shapes (rectangle, ellipse, line, polygon, star) get a thicker outline. Off keeps the classic one pixel. */
  pixelThickOutlines: boolean;
  /** How thick that outline is, in art pixels (1 to 16). */
  pixelOutlineWidth: number;
  /** Measure each plugin's memory and speed (switch is in Preferences > Diagnostics, numbers in Preferences > Plugins). Off by default: the memory part needs each plugin in its own process, which costs memory and a restart. */
  pluginDiagnostics: boolean;
}

export const PREFS_KEY = 'frameling.prefs.v1';

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  darkTheme: DEFAULT_DARK,
  lightTheme: DEFAULT_LIGHT,
  customThemes: [],
  look: 'cosy',
  sounds: true,
  soundVolume: 0.6,
  reduceMotion: false,
  showWelcome: true,
  showTips: true,
  showQuill: true,
  rightSide: 'inspector',
  toolRail: 'two',
  fadeTileCopies: false,
  units: DEFAULT_UNIT,
  onboarded: false,
  keymap: {},
  keymapSet: DEFAULT_KEYMAP_SET,
  cleanTimeline: false,
  pixelThickOutlines: false,
  pixelOutlineWidth: DEFAULT_OUTLINE,
  pluginDiagnostics: false,
};

/**
 * Turns whatever was saved (older versions, hand-edited, damaged) into good preferences. Before themes existed only
 * `theme` was saved (system, dark or light), and it still means the same thing, so nothing else needs converting:
 * the theme picks just start at the defaults.
 */
export function migratePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const customThemes = sanitizeCustomThemes(r.customThemes);
  const keymap: Record<string, string[]> = {};
  if (r.keymap && typeof r.keymap === 'object' && !Array.isArray(r.keymap)) {
    for (const [k, v] of Object.entries(r.keymap)) if (Array.isArray(v)) keymap[k] = v.filter((x): x is string => typeof x === 'string');
  }
  const pick = (mode: 'dark' | 'light', id: unknown) => themeForMode(mode, typeof id === 'string' ? id : '', customThemes).id;
  return {
    theme: r.theme === 'dark' || r.theme === 'light' || r.theme === 'system' ? r.theme : DEFAULT_PREFS.theme,
    darkTheme: pick('dark', r.darkTheme),
    lightTheme: pick('light', r.lightTheme),
    customThemes,
    look: r.look === 'crisp' || r.look === 'cosy' ? r.look : DEFAULT_PREFS.look,
    sounds: bool(r.sounds, DEFAULT_PREFS.sounds),
    soundVolume: typeof r.soundVolume === 'number' && Number.isFinite(r.soundVolume) ? Math.min(1, Math.max(0, r.soundVolume)) : DEFAULT_PREFS.soundVolume,
    reduceMotion: bool(r.reduceMotion, DEFAULT_PREFS.reduceMotion),
    showWelcome: bool(r.showWelcome, DEFAULT_PREFS.showWelcome),
    showTips: bool(r.showTips, DEFAULT_PREFS.showTips),
    showQuill: bool(r.showQuill, DEFAULT_PREFS.showQuill),
    rightSide: r.rightSide === 'rail' || r.rightSide === 'tabs' || r.rightSide === 'inspector' ? r.rightSide : DEFAULT_PREFS.rightSide,
    toolRail: r.toolRail === 'stacked' || r.toolRail === 'two' ? r.toolRail : DEFAULT_PREFS.toolRail,
    fadeTileCopies: bool(r.fadeTileCopies, DEFAULT_PREFS.fadeTileCopies),
    units: isUnit(r.units) ? r.units : DEFAULT_PREFS.units,
    onboarded: bool(r.onboarded, DEFAULT_PREFS.onboarded),
    keymap,
    keymapSet: isKeymapSet(r.keymapSet) ? r.keymapSet : DEFAULT_PREFS.keymapSet,
    cleanTimeline: bool(r.cleanTimeline, DEFAULT_PREFS.cleanTimeline),
    pixelThickOutlines: bool(r.pixelThickOutlines, DEFAULT_PREFS.pixelThickOutlines),
    pluginDiagnostics: bool(r.pluginDiagnostics, DEFAULT_PREFS.pluginDiagnostics),
    pixelOutlineWidth: clampOutline(r.pixelOutlineWidth),
  };
}

const prefsStore = createStore<Prefs>(migratePrefs(readJson(PREFS_KEY, {})));

export const getPrefs = (): Prefs => prefsStore.get();
export const usePrefs = <S,>(selector: (p: Prefs) => S): S => prefsStore.use(selector);
export const subscribePrefs = prefsStore.subscribe;

export function setPrefs(patch: Partial<Prefs>): void {
  prefsStore.set((p) => ({ ...p, ...patch }));
  writeJson(PREFS_KEY, prefsStore.get());
  applyPrefs();
}

/** The theme being shown right now: the one being edited (a peek), else the pick for the current mode. */
export function activeTheme(): Theme {
  if (preview) return preview;
  const p = prefsStore.get();
  const mode = effectiveTheme();
  return themeForMode(mode, mode === 'dark' ? p.darkTheme : p.lightTheme, p.customThemes);
}

// While the theme editor is open, the theme being edited shows on the whole app even if it isn't the one picked.
let preview: Theme | null = null;

/** Shows a theme on the whole app without picking it. Pass null to go back to the real pick. */
export function setThemePreview(theme: Theme | null): void {
  preview = theme;
  applyPrefs();
}

let watchingSystem = false;

/** Follow the computer going dark or light while the mode is System. */
function watchSystem(): void {
  if (watchingSystem) return;
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (prefsStore.get().theme === 'system') applyPrefs();
    });
    watchingSystem = true;
  } catch {
    // No matchMedia (tests): nothing to follow.
  }
}

/** Writes the theme colours, look and motion preferences onto <html>. Safe to call any time. */
export function applyPrefs(): void {
  if (typeof document === 'undefined') return;
  watchSystem();
  const p = prefsStore.get();
  const root = document.documentElement;
  const theme = activeTheme();
  writeTheme(root, theme);
  // data-theme only says dark or light, for the few stylesheet rules that care. With System it's left off so the
  // computer's own setting decides them, which always agrees with the theme chosen above.
  if (p.theme === 'system' && !preview) delete root.dataset.theme;
  else root.dataset.theme = theme.mode;
  // A pattern around the page for the themes that have one (camo, strawberry seeds). Pure CSS, see canvas.css.
  const surround = surroundFor(theme);
  if (surround) root.dataset.surround = surround;
  else delete root.dataset.surround;
  // Written every time (even when unchanged) so things that cache token values, like the canvas, hear about it.
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
  preview = null;
  prefsStore.set({ ...DEFAULT_PREFS, customThemes: [], keymap: {} });
  writeJson(PREFS_KEY, prefsStore.get());
  applyPrefs();
}
