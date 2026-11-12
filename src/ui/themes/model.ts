// Everything about a theme that isn't drawing: checking one that came from somewhere (storage, a file), filling in
// what's missing, making copies, the little .json file format, and writing a theme onto the page as CSS variables.
import { BUILT_IN_THEMES, defaultThemeFor, getBuiltIn, type Theme } from './builtIn';
import { isHex, normHex } from './color';
import { ALL_TOKENS, COLOUR_TOKENS, CORE_TOKENS, DERIVED_TOKENS, deriveTokens, isShadowToken, type ThemeMode, type ThemeTokens } from './tokens';
import { flushTheme } from '../../canvas/theme';

export const FILE_KIND = 'frameling-theme';
export const FILE_VERSION = 1;
export const MAX_FILE_BYTES = 20_000;
export const MAX_NAME = 40;
export const MAX_CUSTOM = 50;

const MODES: ThemeMode[] = ['dark', 'light'];
const isMode = (m: unknown): m is ThemeMode => typeof m === 'string' && (MODES as string[]).includes(m);

/** A shadow is a short run of numbers, units, colour words and brackets. Anything else is junk. */
export function isShadow(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 120 && /^[0-9a-z#(),.%/\s-]+$/i.test(v) && !/url|expression|var\(/i.test(v);
}

const cleanName = (n: unknown, fallback: string): string => {
  const s = typeof n === 'string' ? n.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  return s || fallback;
};

/** Fills in any token a theme lacks: core ones from the mode's default theme, derived ones worked out from the core. */
export function completeTokens(partial: Record<string, unknown>, mode: ThemeMode): ThemeTokens {
  const base = defaultThemeFor(mode).tokens;
  const given: ThemeTokens = {};
  const missingDerived: string[] = [];
  for (const name of ALL_TOKENS) {
    const v = partial[name];
    if (isShadowToken(name) ? isShadow(v) : isHex(v)) given[name] = isShadowToken(name) ? (v as string).trim() : normHex(v);
    else if ((DERIVED_TOKENS as readonly string[]).includes(name)) missingDerived.push(name);
    else given[name] = base[name];
  }
  const out = deriveTokens(given, mode);
  // Derived ones that were supplied (and valid) win over the worked-out value.
  for (const name of DERIVED_TOKENS) if (!missingDerived.includes(name)) out[name] = given[name];
  return out;
}

/** A custom theme read from storage or a file, made safe: unknown bits dropped, bad colours replaced. Null when there's no saving it. */
export function sanitizeTheme(raw: unknown): Theme | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isMode(r.mode)) return null;
  if (typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,60}$/i.test(r.id)) return null;
  if (!r.tokens || typeof r.tokens !== 'object' || Array.isArray(r.tokens)) return null;
  const theme: Theme = {
    id: r.id,
    name: cleanName(r.name, 'My theme'),
    mode: r.mode,
    builtIn: false,
    tokens: completeTokens(r.tokens as Record<string, unknown>, r.mode),
  };
  if (typeof r.basedOn === 'string' && getBuiltIn(r.basedOn)) theme.basedOn = r.basedOn;
  return theme;
}

/** The custom themes list from storage: sane ones only, no duplicate ids, none that clash with a built-in. */
export function sanitizeCustomThemes(raw: unknown): Theme[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(BUILT_IN_THEMES.map((t) => t.id));
  const out: Theme[] = [];
  for (const item of raw) {
    const t = sanitizeTheme(item);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= MAX_CUSTOM) break;
  }
  return out;
}

export function findTheme(id: string, custom: Theme[]): Theme | undefined {
  return getBuiltIn(id) ?? custom.find((t) => t.id === id);
}

/** The theme for a mode: the one picked if it exists and is for that mode, else the default for the mode. */
export function themeForMode(mode: ThemeMode, id: string, custom: Theme[]): Theme {
  const t = findTheme(id, custom);
  return t && t.mode === mode ? t : defaultThemeFor(mode);
}

export function uniqueId(custom: Theme[], seed = ''): string {
  const taken = new Set([...BUILT_IN_THEMES, ...custom].map((t) => t.id));
  const slug = seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  for (let i = 0; i < 1000; i++) {
    const id = `my-${slug ? slug + '-' : ''}${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`;
    if (!taken.has(id)) return id;
  }
  return `my-${Date.now().toString(36)}`;
}

/** "Name", then "Name copy", "Name copy 2"... whichever isn't taken. */
export function uniqueName(name: string, all: Theme[]): string {
  const taken = new Set(all.map((t) => t.name.toLowerCase()));
  const root = name.replace(/ copy( \d+)?$/i, '').slice(0, MAX_NAME - 8);
  let n = `${root} copy`;
  for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${root} copy ${i}`;
  return n;
}

/** A custom copy of any theme, ready to edit. */
export function copyTheme(source: Theme, custom: Theme[]): Theme {
  const all = [...BUILT_IN_THEMES, ...custom];
  return {
    id: uniqueId(custom, source.name),
    name: uniqueName(source.name, all),
    mode: source.mode,
    builtIn: false,
    tokens: { ...source.tokens },
    basedOn: source.builtIn ? source.id : source.basedOn,
  };
}

// ---------------------------------------------------------------- files

export interface ThemeFile {
  kind: typeof FILE_KIND;
  version: number;
  name: string;
  mode: ThemeMode;
  tokens: ThemeTokens;
}

export function themeToFile(t: Theme): string {
  const file: ThemeFile = { kind: FILE_KIND, version: FILE_VERSION, name: t.name, mode: t.mode, tokens: t.tokens };
  return JSON.stringify(file, null, 2) + '\n';
}

export const themeFileName = (t: Theme): string => `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme'}.frameling-theme.json`;

export type ImportResult = { ok: true; theme: Theme } | { ok: false; error: string };

/** Reads the text of a theme file. Never throws: a bad file is a friendly sentence. A good one comes back as a custom theme with a fresh id. */
export function importThemeText(text: unknown, custom: Theme[]): ImportResult {
  if (typeof text !== 'string') return { ok: false, error: 'That does not look like a Frameling theme file.' };
  if (text.length > MAX_FILE_BYTES) return { ok: false, error: 'That file is too big to be a theme.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a theme. It could not be read.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'That does not look like a Frameling theme file.' };
  const d = data as Record<string, unknown>;
  if (d.kind !== FILE_KIND) return { ok: false, error: 'That does not look like a Frameling theme file.' };
  if (typeof d.version === 'number' && d.version > FILE_VERSION) return { ok: false, error: 'That theme was made by a newer Frameling. Update Frameling to use it.' };
  if (!isMode(d.mode)) return { ok: false, error: 'That theme does not say whether it is for dark or light mode.' };
  const tokens = d.tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return { ok: false, error: 'That theme has no colours in it.' };
  const t = tokens as Record<string, unknown>;
  const got = (CORE_TOKENS as readonly string[]).filter((n) => isHex(t[n]));
  if (got.length < 6) return { ok: false, error: 'That theme is missing most of its colours.' };
  if (custom.length >= MAX_CUSTOM) return { ok: false, error: 'You have a lot of themes already. Delete one to make room.' };
  const name = cleanName(d.name, 'Imported theme');
  const all = [...BUILT_IN_THEMES, ...custom];
  const taken = all.some((x) => x.name.toLowerCase() === name.toLowerCase());
  return {
    ok: true,
    theme: {
      id: uniqueId(custom, name),
      name: taken ? uniqueName(name, all) : name,
      mode: d.mode,
      builtIn: false,
      tokens: completeTokens(t, d.mode),
    },
  };
}

// ---------------------------------------------------------------- applying

const applied = new WeakMap<HTMLElement, Set<string>>();

/** Writes a theme's colours onto an element (usually <html>) as CSS variables, and sets the matching color-scheme. */
export function writeTheme(el: HTMLElement, theme: Pick<Theme, 'mode' | 'tokens'>): void {
  const prev = applied.get(el);
  const next = new Set<string>();
  for (const name of ALL_TOKENS) {
    const v = theme.tokens[name];
    if (v === undefined) continue;
    el.style.setProperty(`--${name}`, v);
    next.add(name);
  }
  if (prev) for (const name of prev) if (!next.has(name)) el.style.removeProperty(`--${name}`);
  applied.set(el, next);
  el.style.setProperty('color-scheme', theme.mode);
  flushTheme();
}

/** Takes every theme variable off an element again, so theme.css shows through. */
export function clearTheme(el: HTMLElement): void {
  for (const name of applied.get(el) ?? []) el.style.removeProperty(`--${name}`);
  el.style.removeProperty('color-scheme');
  flushTheme();
  applied.delete(el);
}

/** CSS custom properties for a React `style` prop, to scope a theme to one preview. */
export function themeStyle(theme: Pick<Theme, 'tokens'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ALL_TOKENS) if (theme.tokens[name] !== undefined) out[`--${name}`] = theme.tokens[name];
  return out;
}

export { COLOUR_TOKENS };
