// A script: a few lines of JavaScript with a name, kept so it can be run again, put on a key and found in the palette.
// Everything here is pure (no store, no DOM), so the rules can be tested on their own.
import { strToU8, zipSync } from 'fflate';
import type { PluginManifest } from '../plugins/manifest';
import { isRunnable } from '../plugins/appRules';

/** Where a script is kept: with the app (every drawing can use it) or inside the drawing (it travels with the file). */
export type ScriptHome = 'app' | 'doc';

export interface Script {
  id: string;
  name: string;
  code: string;
  home: ScriptHome;
  /**
   * False for a script that came from somewhere else (pasted in, dropped in, opened from a file or a drawing): the first
   * run stops and shows what it does. True for one you typed, or one you looked at and said you trust.
   */
  reviewed: boolean;
  /** When it was last changed (ms since 1970). */
  updated: number;
}

export const LIMITS = { scripts: 100, code: 100_000, name: 60 };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The id a script's command has: `script.<id>`. */
export const commandIdOf = (id: string): string => `script.${id}`;
/** The id of the plugin a script stands in for while it runs (and the sandbox it runs in). */
export const pluginIdOf = (id: string): string => `script-${id}`;
/** The script a command id belongs to, or null. */
export const scriptIdOf = (commandId: string): string | null => (/^script\.[a-z0-9]{3,20}$/.test(commandId) ? commandId.slice(7) : null);

export function newScriptId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const id = 's' + Math.random().toString(36).slice(2, 8).padEnd(5, '0');
    if (!used.has(id)) return id;
  }
}

/** A name that nobody else has: "Make red", then "Make red 2". */
export function uniqueName(want: string, taken: Iterable<string>): string {
  const base = want.trim().replace(/\s+/g, ' ').slice(0, LIMITS.name - 4) || 'My script';
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** Reads what was saved, forgiving: anything that isn't a script is left out. */
export function sanitizeScripts(raw: unknown, home: ScriptHome): Script[] {
  if (!Array.isArray(raw)) return [];
  const out: Script[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    if (!isObj(r) || typeof r.id !== 'string' || !/^[a-z0-9]{3,20}$/.test(r.id) || ids.has(r.id) || typeof r.code !== 'string') continue;
    if (out.length >= LIMITS.scripts) break;
    ids.add(r.id);
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, LIMITS.name) : '';
    out.push({
      id: r.id,
      name: name || 'My script',
      code: r.code.slice(0, LIMITS.code),
      home,
      // A script that came out of a drawing (somebody else's file) is never taken as reviewed, whatever the file says.
      reviewed: home === 'app' && r.reviewed !== false,
      updated: typeof r.updated === 'number' && Number.isFinite(r.updated) ? r.updated : 0,
    });
  }
  return out;
}

/** What is written into storage or the drawing for a script: no home (where it is kept says that), and no review mark in a drawing. */
export function packScripts(list: Script[], home: ScriptHome): unknown[] {
  return list.map((s) => ({ id: s.id, name: s.name, code: s.code, updated: s.updated, ...(home === 'app' ? { reviewed: s.reviewed } : {}) }));
}

/**
 * The code that actually runs: the script's body inside a command of its own. It sits on the same line as the opening
 * so the line numbers an error reports are the person's own. An async function, so `await` works at the top.
 */
export function wrapScript(name: string, code: string): string {
  return `frameling.commands.register({ id: 'run', label: ${JSON.stringify(name.slice(0, LIMITS.name))} }, async () => {${code}\n});\n`;
}

// ---------------------------------------------------------------- pasted code

/** Whether text that arrived in the editor from outside is more than a word or two (so the script now counts as someone else's). */
export function countsAsPasted(text: string): boolean {
  return text.length >= 24 || /\n/.test(text.trim());
}

// ---------------------------------------------------------------- a quick look at a script

export interface Look {
  lines: number;
  /** Command ids the script names in quotes, in the order they first appear. */
  commandIds: string[];
  /** Of those, the ones a script isn't allowed to press. */
  blocked: string[];
  changesDrawing: boolean;
  runsCommands: boolean;
  /** A loop that may never end (the script is stopped after a few seconds anyway). */
  endlessLoop: boolean;
  /** Mentions the internet (a script has none, so this does nothing). */
  mentionsInternet: boolean;
}

const ID_IN_QUOTES = /['"`]([a-z][A-Za-z0-9]*\.[A-Za-z0-9._-]{1,60})['"`]/g;

/** A fast, honest read of what a script says, for the stop-and-look sheet. It reads the words; it can't know what a clever script would really do. */
export function lookAt(code: string, known: (id: string) => boolean): Look {
  const ids: string[] = [];
  for (const m of code.matchAll(ID_IN_QUOTES)) if (known(m[1]) && !ids.includes(m[1])) ids.push(m[1]);
  // A command id the script names but that isn't a command (a mistake, or a made-up name) is not worth a line.
  const blocked = ids.filter((id) => !isRunnable(id));
  return {
    lines: code.split('\n').length,
    commandIds: ids,
    blocked,
    changesDrawing: /document\s*\.\s*edit\s*\(/.test(code) || ids.some(isRunnable) || /\.\s*app\s*\.\s*run\s*\(/.test(code),
    runsCommands: /\.\s*app\s*\.\s*(run|set)\s*\(/.test(code),
    endlessLoop: /while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;\s*;\s*\)/.test(code),
    mentionsInternet: /\b(fetch|XMLHttpRequest|WebSocket|importScripts|import\s*\()\b/.test(code) || /https?:\/\//.test(code),
  };
}

// ---------------------------------------------------------------- becoming a plugin

/** A plugin id from a name: lower case letters, numbers and dashes, 3 to 60 long. */
export function pluginSlug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return s.length >= 3 ? s : `script-${s || 'plugin'}`.replace(/-+$/, '');
}

/** The plugin that a script grows into: the same code in a command of its own, and the powers a script already has. Nothing is rewritten. */
export function scriptAsPlugin(s: Pick<Script, 'name' | 'code'>): { manifest: PluginManifest; main: string } {
  return {
    manifest: {
      id: pluginSlug(s.name),
      name: s.name.slice(0, 60),
      version: '1.0.0',
      description: `Made from the script "${s.name}".`,
      author: '',
      main: 'main.js',
      permissions: ['document.read', 'document.edit', 'app'],
      network: [],
      apiVersion: 2,
      events: [],
      exporterOptions: {},
    },
    main: wrapScript(s.name, s.code),
  };
}

/** The plugin as a .zip, ready for Plugins > Install a plugin. */
export function scriptAsPluginZip(s: Pick<Script, 'name' | 'code'>): Uint8Array {
  const { manifest, main } = scriptAsPlugin(s);
  const json = { id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author, main: manifest.main, permissions: manifest.permissions, apiVersion: manifest.apiVersion };
  return zipSync({ 'manifest.json': strToU8(JSON.stringify(json, null, 2)), 'main.js': strToU8(main) });
}

/** The first comment of a script, as its one line of description. */
export function describeScript(code: string): string {
  const line = /^\s*\/\/\s*(.+)$/m.exec(code.split('\n').slice(0, 3).join('\n'));
  if (line) return line[1].trim().slice(0, 120);
  const block = /^\s*\/\*+\s*([^*\n][^\n]*?)\s*(\*\/)?$/m.exec(code.split('\n').slice(0, 3).join('\n'));
  return block ? block[1].trim().slice(0, 120) : '';
}
