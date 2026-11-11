// Shortcut strings: parsing, matching, labels, overrides and conflicts. No DOM needed except for the event type.
//
// A combo is written `Mod+Shift+Z`, `Alt+ArrowLeft`, `F1`, `b`, `Space`. `Mod` is Ctrl on Windows and Linux, Cmd on
// macOS. Combos are normalised to `Mod+Alt+Shift+key` with letters lower-case, so two spellings of one shortcut are
// equal. For symbols that need Shift to type (`?`, `+`) Shift isn't part of the combo: the character says it.
import { allCommands, type Command } from '../core/registry';
import { DEFAULT_KEYMAP_SET, keymapSet } from './keymapSets';
import { getPrefs, setPrefs } from './prefs';

export interface Combo {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const ALIASES: Record<string, string> = {
  space: ' ',
  spacebar: ' ',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  plus: '+',
  comma: ',',
};

const isAlnum = (k: string) => /^[a-z0-9]$/i.test(k);

// Symbols and the character Shift makes of them (a US keyboard). `Shift+,` and `<` are the same shortcut, and the
// physical key decides when Shift is down, so it works the same on any layout.
const SHIFTED: Record<string, string> = { ',': '<', '.': '>', '/': '?', ';': ':', "'": '"', '[': '{', ']': '}', '\\': '|', '-': '_', '=': '+', '`': '~' };
const UNSHIFTED = Object.fromEntries(Object.entries(SHIFTED).map(([a, b]) => [b, a]));
const CODE_BASE: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' };

function normKey(k: string): string {
  const alias = ALIASES[k.toLowerCase()];
  if (alias) return alias;
  if (k.length === 1) return k.toLowerCase();
  if (/^f\d{1,2}$/i.test(k)) return k.toUpperCase();
  return k;
}

/** Reads a combo string. Returns null for rubbish. */
export function parseCombo(text: string): Combo | null {
  const s = text.trim();
  if (!s) return null;
  // A trailing `+` is the plus key itself (`Mod++`), not a separator.
  let rest = s;
  let key = '';
  if (rest === '+') key = '+';
  else if (rest.endsWith('++')) {
    key = '+';
    rest = rest.slice(0, -2);
  } else {
    const i = rest.lastIndexOf('+');
    if (i >= 0) {
      key = rest.slice(i + 1);
      rest = rest.slice(0, i);
    } else {
      key = rest;
      rest = '';
    }
  }
  const combo: Combo = { mod: false, alt: false, shift: false, key: normKey(key) };
  if (!combo.key) return null;
  for (const part of rest.split('+').filter(Boolean)) {
    const p = part.toLowerCase();
    if (p === 'mod' || p === 'ctrl' || p === 'cmd' || p === 'meta' || p === 'control' || p === 'command') combo.mod = true;
    else if (p === 'alt' || p === 'option' || p === 'opt') combo.alt = true;
    else if (p === 'shift') combo.shift = true;
    else return null;
  }
  // `Shift+,` is `<`. Shift is implied by the symbol, so it drops out.
  if (combo.shift && SHIFTED[combo.key]) combo.key = SHIFTED[combo.key];
  if (combo.key.length === 1 && !isAlnum(combo.key)) combo.shift = false;
  return combo;
}

export function comboToString(c: Combo): string {
  return [c.mod ? 'Mod' : '', c.alt ? 'Alt' : '', c.shift ? 'Shift' : '', c.key === ' ' ? 'Space' : c.key].filter(Boolean).join('+');
}

/** The one spelling of a shortcut, so `ctrl+z` and `Mod+Z` compare equal. Returns '' for rubbish. */
export function normaliseCombo(text: string): string {
  const c = parseCombo(text);
  return c ? comboToString(c) : '';
}

export function isMacPlatform(): boolean {
  try {
    return window.frameling?.platform === 'darwin';
  } catch {
    return false;
  }
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** The combo an event is. Returns null for a lone modifier key. */
export function comboFromEvent(e: KeyLike, mac = isMacPlatform()): Combo | null {
  let key = e.key;
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta' || key === 'AltGraph' || key === 'Dead' || key === 'Unidentified') return null;
  // Holding Alt changes the character on some keyboards (Option+Z on a Mac), so read the physical key for letters and digits.
  if (e.altKey && e.code) {
    const m = /^Key([A-Z])$/.exec(e.code) ?? /^Digit(\d)$/.exec(e.code);
    if (m) key = m[1];
  }
  // With Shift down, a punctuation key is read from its physical place (Shift+Comma is `<` on any layout).
  if (e.shiftKey && e.code && CODE_BASE[e.code]) key = SHIFTED[CODE_BASE[e.code]];
  else if (e.shiftKey && e.code) {
    const d = /^Digit(\d)$/.exec(e.code);
    if (d) key = d[1];
  }
  const combo: Combo = { mod: mac ? e.metaKey : e.ctrlKey, alt: e.altKey, shift: e.shiftKey, key: normKey(key) };
  // On a Mac, Ctrl is its own key and isn't "Mod". On the others Cmd/Win is left alone, so it never matches.
  if (mac ? e.ctrlKey : e.metaKey) return null;
  if (combo.key.length === 1 && !isAlnum(combo.key)) combo.shift = false;
  return combo;
}

/** True when this keyboard event is the given shortcut. */
export function matchEvent(e: KeyLike, shortcut: string, mac = isMacPlatform()): boolean {
  const c = comboFromEvent(e, mac);
  const want = normaliseCombo(shortcut);
  return !!c && !!want && comboToString(c) === want;
}

const MAC_NAMES: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Backspace: '⌫', Delete: '⌦', Enter: '↩', ' ': 'Space', Tab: '⇥' };
const PC_NAMES: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', ' ': 'Space', PageUp: 'PgUp', PageDown: 'PgDn' };

/** The pieces of a shortcut for showing: `['Ctrl', 'Shift', 'Z']`, or `['⌘', '⇧', 'Z']` on a Mac. */
export function comboParts(shortcut: string, mac = isMacPlatform()): string[] {
  const c = parseCombo(shortcut);
  if (!c) return [shortcut];
  const names = mac ? MAC_NAMES : PC_NAMES;
  // Ctrl+< reads oddly: with a modifier held, show the symbol as Shift plus its plain key (Ctrl+Shift+,).
  if ((c.mod || c.alt) && UNSHIFTED[c.key] && c.key !== '+') {
    c.key = UNSHIFTED[c.key];
    c.shift = true;
  }
  const key = names[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key);
  const out: string[] = [];
  if (mac) {
    if (c.alt) out.push('⌥');
    if (c.shift) out.push('⇧');
    if (c.mod) out.push('⌘');
  } else {
    if (c.mod) out.push('Ctrl');
    if (c.alt) out.push('Alt');
    if (c.shift) out.push('Shift');
  }
  out.push(key);
  return out;
}

/** A shortcut as one string: `Ctrl+Shift+Z`, or `⌘⇧Z` on a Mac. */
export function comboLabel(shortcut: string, mac = isMacPlatform()): string {
  return comboParts(shortcut, mac).join(mac ? '' : '+');
}

// ---------------------------------------------------------------- the keymap

/**
 * The keys a set gives each command it changes, as an override map: the set's own entries, plus the commands that lose
 * a default key because the set hands it to something else that works in the same place.
 */
export function setBaseKeys(setId: string, commands: Command[]): Record<string, string[]> {
  const set = keymapSet(setId);
  const out: Record<string, string[]> = {};
  const given: { combo: string; cmd: Command }[] = [];
  for (const c of commands) {
    const keys = set.keys[c.id];
    if (!keys) continue;
    out[c.id] = keys.map(normaliseCombo).filter(Boolean);
    for (const combo of out[c.id]) given.push({ combo, cmd: c });
  }
  if (!given.length) return out;
  for (const c of commands) {
    if (out[c.id] || !c.keys?.length) continue;
    const mine = c.keys.map(normaliseCombo).filter(Boolean);
    const kept = mine.filter((k) => !given.some((g) => g.combo === k && sameContext(g.cmd, c)));
    if (kept.length !== mine.length) out[c.id] = kept;
  }
  return out;
}

/** A set's keys with the person's own changes on top: the full override map that `effectiveKeys` reads. */
export function layeredOverrides(setId: string, commands: Command[], personal: Record<string, string[]>): Record<string, string[]> {
  if (keymapSet(setId).id === DEFAULT_KEYMAP_SET) return personal;
  return { ...setBaseKeys(setId, commands), ...personal };
}

let layered: { set: string; personal: Record<string, string[]>; count: number; map: Record<string, string[]> } | null = null;

/** The override map in use now: the picked set plus the person's changes. Cached until either (or the commands) change. */
export function activeOverrides(): Record<string, string[]> {
  const p = getPrefs();
  if (keymapSet(p.keymapSet).id === DEFAULT_KEYMAP_SET) return p.keymap;
  const cmds = allCommands();
  if (!layered || layered.set !== p.keymapSet || layered.personal !== p.keymap || layered.count !== cmds.length) {
    layered = { set: p.keymapSet, personal: p.keymap, count: cmds.length, map: layeredOverrides(p.keymapSet, cmds, p.keymap) };
  }
  return layered.map;
}

/** What a command gets before the person changes anything: the picked set's keys, else Frameling's. */
export function baseKeys(cmd: Pick<Command, 'id' | 'keys'>): string[] {
  const p = getPrefs();
  const fromSet = keymapSet(p.keymapSet).id === DEFAULT_KEYMAP_SET ? undefined : setBaseKeys(p.keymapSet, allCommands())[cmd.id];
  return (fromSet ?? cmd.keys ?? []).map(normaliseCombo).filter(Boolean);
}

/** The shortcuts a command uses now: the person's choice if they made one, else the set's, else the default. */
export function effectiveKeys(cmd: Pick<Command, 'id' | 'keys'>, overrides: Record<string, string[]> = activeOverrides()): string[] {
  const o = overrides[cmd.id];
  // A bare Space is the canvas's pan key and is never a shortcut.
  return (o ?? cmd.keys ?? []).map(normaliseCombo).filter((k) => k && k !== 'Space');
}

/** Shortcut -> commands that use it. More than one command under a shortcut is a conflict. */
export function buildKeymap(commands: Command[], overrides: Record<string, string[]> = activeOverrides()): Map<string, Command[]> {
  const map = new Map<string, Command[]>();
  for (const c of commands) {
    for (const k of effectiveKeys(c, overrides)) {
      const list = map.get(k);
      if (list) {
        if (!list.includes(c)) list.push(c);
      } else map.set(k, [c]);
    }
  }
  return map;
}

/** True when two commands can both be live at once. Tools for different layer kinds (Brush and Tile brush) never are. */
export function sameContext(a: Pick<Command, 'layers'>, b: Pick<Command, 'layers'>): boolean {
  if (!a.layers || !b.layers) return true;
  return a.layers.some((k) => b.layers!.includes(k));
}

/** Other commands already using this shortcut where this one works too. */
export function conflictsFor(shortcut: string, exceptId: string, commands: Command[], overrides: Record<string, string[]> = activeOverrides()): Command[] {
  const want = normaliseCombo(shortcut);
  if (!want) return [];
  const self = commands.find((c) => c.id === exceptId) ?? {};
  return commands.filter((c) => c.id !== exceptId && effectiveKeys(c, overrides).includes(want) && sameContext(self, c));
}

/** Every shortcut that two or more commands share in the same place, with who shares it. */
export function allConflicts(commands: Command[], overrides: Record<string, string[]> = activeOverrides()): Map<string, Command[]> {
  const out = new Map<string, Command[]>();
  for (const [k, list] of buildKeymap(commands, overrides)) {
    const clash = list.filter((c) => list.some((o) => o !== c && sameContext(c, o)));
    if (clash.length > 1) out.set(k, clash);
  }
  return out;
}

/** The first shortcut a command has now, as a label. Empty when it has none. */
export function shortcutLabel(cmd: Pick<Command, 'id' | 'keys'>, mac = isMacPlatform()): string {
  const k = effectiveKeys(cmd)[0];
  return k ? comboLabel(k, mac) : '';
}

// ---------------------------------------------------------------- changing the keymap

/** Gives a command exactly these shortcuts. If that's the same as its defaults, the override is dropped. */
export function setBindings(cmd: Pick<Command, 'id' | 'keys'>, keys: string[]): void {
  const next = [...new Set(keys.map(normaliseCombo).filter(Boolean))];
  const defaults = baseKeys(cmd);
  const same = next.length === defaults.length && next.every((k, i) => k === defaults[i]);
  const keymap = { ...getPrefs().keymap };
  if (same) delete keymap[cmd.id];
  else keymap[cmd.id] = next;
  setPrefs({ keymap });
}

/** Adds a shortcut to a command. With `take`, other commands using it lose it. */
export function addBinding(cmd: Pick<Command, 'id' | 'keys'>, shortcut: string, commands: Command[], take = false): void {
  const combo = normaliseCombo(shortcut);
  if (!combo || combo === 'Space') return;
  if (take) for (const other of conflictsFor(combo, cmd.id, commands)) setBindings(other, effectiveKeys(other).filter((k) => k !== combo));
  setBindings(cmd, [...effectiveKeys(cmd), combo]);
}

export function removeBinding(cmd: Pick<Command, 'id' | 'keys'>, shortcut: string): void {
  const combo = normaliseCombo(shortcut);
  setBindings(cmd, effectiveKeys(cmd).filter((k) => k !== combo));
}

/** Back to the set's shortcuts (Frameling's own by default), for one command or for all. */
export function resetBindings(id?: string): void {
  if (!id) return setPrefs({ keymap: {} });
  const keymap = { ...getPrefs().keymap };
  delete keymap[id];
  setPrefs({ keymap });
}

// ---------------------------------------------------------------- shortcuts written in text

const MOD_WORD: Record<string, string> = { Ctrl: 'Cmd', Alt: 'Option', Shift: 'Shift' };

/**
 * Help and tips are written with PC keys ("Press **Ctrl+S**", "Alt+drag", "hold Ctrl"). On a Mac this rewrites them
 * the way a Mac shows them: key shortcuts as ⌘⇧S like the key chips, mouse ones as "Cmd+click" and "Option+drag", and
 * drops the "(**Cmd+S** on a Mac)" asides, which would only repeat it. Anywhere else the text is left alone.
 */
export function platformKeysText(text: string, mac = isMacPlatform()): string {
  if (!mac || !/Ctrl|Alt|Cmd/.test(text)) return text;
  return (
    text
      // "(**Cmd+S** on a Mac)" and "(**Cmd+O**)" asides.
      .replace(/\s*\((\*\*)?Cmd\+[^)*]*(\*\*)?( on a Mac)?\)/g, '')
      // Modifier+mouse: Ctrl+click, Alt+drag, Shift+wheel.
      .replace(/\b((?:(?:Ctrl|Alt|Shift)\+)+)(click(?:s|ing)?|drag(?:s|ging)?|scroll(?:s|ing)?|wheel)\b/g, (_m, mods: string, word: string) =>
        mods.split('+').filter(Boolean).map((m) => MOD_WORD[m] ?? m).join('+') + '+' + word,
      )
      // Key shortcuts with Ctrl or Alt in them: Ctrl+Shift+T -> ⌘⇧T. A trailing + is the plus key.
      .replace(/\b((?:(?:Ctrl|Alt|Shift)\+)*(?:Ctrl|Alt)(?:\+(?:Ctrl|Alt|Shift))*)\+([A-Za-z0-9]\b|F\d{1,2}\b|Enter\b|Esc\b|Escape\b|Space\b|Tab\b|Delete\b|Backspace\b|Home\b|End\b|[,.=\-+[\]/;'`<>])/g, (_m, mods: string, key: string) => {
        const parts = mods.split('+');
        const combo = [parts.includes('Ctrl') ? 'Mod' : '', parts.includes('Alt') ? 'Alt' : '', parts.includes('Shift') ? 'Shift' : '', key === 'Esc' ? 'Escape' : key].filter(Boolean).join('+');
        return comboLabel(combo, true);
      })
      // "hold Ctrl", "press **Alt**": the key on its own.
      .replace(/\b(hold|Hold|holding|Holding|press|Press|pressing)(\s+\**)(Ctrl|Alt)\b/g, (_m, verb: string, gap: string, k: string) => verb + gap + MOD_WORD[k])
  );
}
