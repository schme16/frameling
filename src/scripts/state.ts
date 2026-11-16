// The scripts that exist: the ones kept with the app (on this computer) and the ones kept inside the open drawing
// (`doc.ext.scripts`, which travels with the file). Making them, changing them, and turning each into a command.
import { strToU8 } from 'fflate';
import { registerCommand, unregisterCommand, allCommands } from '../core/registry';
import { sha256Hex } from '../plugins/fingerprint';
import { store } from '../core/store';
import { createStore } from '../ui/mini';
import { commandIdOf, describeScript, LIMITS, newScriptId, packScripts, sanitizeScripts, uniqueName, type Script, type ScriptHome } from './model';

const KEY = 'frameling.scripts.v1';
const ALLOWED_KEY = 'frameling.scripts.drawings.v1';

export interface ScriptsState {
  app: Script[];
  /** The ones inside the open drawing. They are listed always, and they run only once the person has allowed them. */
  doc: Script[];
  /** Whether the open drawing's scripts are turned on. */
  docOn: boolean;
}

export const scripts = createStore<ScriptsState>({ app: [], doc: [], docOn: false });
/** Which script is running, if one is. Only one at a time: two scripts changing the same drawing would be a muddle. */
export const running = createStore<{ id: string; name: string } | null>(null);
/** The script open in the editor. */
export const openId = createStore<string | null>(null);

export const allScripts = (): Script[] => [...scripts.get().app, ...scripts.get().doc];
export const findScript = (id: string): Script | undefined => allScripts().find((s) => s.id === id);
/** Whether a script is allowed to run now: its own, or in a drawing whose scripts are on. */
export const canRun = (s: Script): boolean => s.home === 'app' || scripts.get().docOn;

// ---------------------------------------------------------------- the app's own

function readApp(): Script[] {
  try {
    return sanitizeScripts(JSON.parse(localStorage.getItem(KEY) ?? '[]'), 'app');
  } catch {
    return [];
  }
}

function writeApp(list: Script[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(packScripts(list, 'app')));
  } catch {
    // Then it lasts this visit.
  }
}

// ---------------------------------------------------------------- the drawing's

/** What `doc.ext.scripts` holds, as scripts. Nothing from a file is taken as reviewed. */
export function docScripts(): Script[] {
  const ext = store().rootDoc().ext?.scripts as { v?: number; items?: unknown } | undefined;
  return sanitizeScripts(ext?.items, 'doc');
}

function writeDoc(list: Script[]): boolean {
  const ok = store().updateQuiet((d) => {
    const ext = { ...(d.ext ?? {}) };
    if (list.length) ext.scripts = { v: 1, items: packScripts(list, 'doc') };
    else delete ext.scripts;
    if (Object.keys(ext).length) d.ext = ext;
    else delete d.ext;
  });
  return ok;
}

/** A fingerprint of what the drawing's scripts say, so "yes, turn them on" is for exactly these words and not whatever the file says tomorrow. */
export function fingerprintOf(list: Script[]): string {
  return sha256Hex(strToU8(JSON.stringify(list.map((s) => [s.id, s.name, s.code]))));
}

function readAllowed(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(ALLOWED_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Whether the person already said yes to exactly these scripts in this drawing. */
export function wasAllowed(docId: string, list: Script[]): boolean {
  return list.length > 0 && readAllowed()[docId] === fingerprintOf(list);
}

export function rememberAllowed(docId: string, list: Script[]): void {
  try {
    const all = readAllowed();
    all[docId] = fingerprintOf(list);
    // Only the latest few drawings are kept.
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete all[k];
    localStorage.setItem(ALLOWED_KEY, JSON.stringify(all));
  } catch {
    // Then it asks again next time.
  }
}

export function forgetAllowed(docId: string): void {
  try {
    const all = readAllowed();
    delete all[docId];
    localStorage.setItem(ALLOWED_KEY, JSON.stringify(all));
  } catch {
    // Nothing to forget.
  }
}

/** Reads the open drawing's scripts (after it opens), and says whether they start on. */
export function loadDocScripts(on: boolean): void {
  scripts.set((s) => ({ ...s, doc: docScripts(), docOn: on }));
  syncCommands();
}

export function setDocOn(on: boolean): void {
  scripts.set((s) => ({ ...s, docOn: on }));
  syncCommands();
}

// ---------------------------------------------------------------- changing them

export type SaveResult = { ok: true } | { ok: false; why: string };

function put(next: Script[], home: ScriptHome): SaveResult {
  if (home === 'app') {
    writeApp(next);
    scripts.set((s) => ({ ...s, app: next }));
  } else {
    if (!writeDoc(next)) return { ok: false, why: 'Close the symbol or tile you are editing first, then save this script into the drawing.' };
    scripts.set((s) => ({ ...s, doc: next }));
    // The person who turned these on (or wrote them here) is the one changing them: "yes" still holds for what they now say.
    if (scripts.get().docOn) rememberAllowed(store().rootDoc().id, next);
  }
  syncCommands();
  return { ok: true };
}

const listOf = (home: ScriptHome): Script[] => (home === 'app' ? scripts.get().app : scripts.get().doc);

/** Makes a new script (with the name made unique). Returns it, or why it could not be made. */
export function createScript(name: string, code: string, home: ScriptHome, reviewed = true): { script: Script } | { why: string } {
  if (allScripts().length >= LIMITS.scripts) return { why: `That's a lot of scripts (up to ${LIMITS.scripts}). Delete one you don't use first.` };
  const s: Script = { id: newScriptId(allScripts().map((x) => x.id)), name: uniqueName(name, allScripts().map((x) => x.name)), code: code.slice(0, LIMITS.code), home, reviewed, updated: Date.now() };
  const r = put([...listOf(home), s], home);
  return r.ok ? { script: s } : { why: r.why };
}

/** Changes a script's code, name or review mark. */
export function updateScript(id: string, patch: Partial<Pick<Script, 'name' | 'code' | 'reviewed'>>): SaveResult {
  const s = findScript(id);
  if (!s) return { ok: false, why: 'That script is gone.' };
  const others = allScripts().filter((x) => x.id !== id).map((x) => x.name);
  const next: Script = {
    ...s,
    ...(patch.code !== undefined ? { code: patch.code.slice(0, LIMITS.code) } : {}),
    ...(patch.name !== undefined ? { name: uniqueName(patch.name, others) } : {}),
    ...(patch.reviewed !== undefined ? { reviewed: patch.reviewed } : {}),
    updated: Date.now(),
  };
  return put(listOf(s.home).map((x) => (x.id === id ? next : x)), s.home);
}

export function deleteScript(id: string): void {
  const s = findScript(id);
  if (!s) return;
  put(listOf(s.home).filter((x) => x.id !== id), s.home);
  if (openId.get() === id) openId.set(null);
}

/** Moves a script between the app and the drawing. */
export function moveScript(id: string, home: ScriptHome): SaveResult {
  const s = findScript(id);
  if (!s || s.home === home) return { ok: true };
  // A script that goes into a drawing is read as someone else's by whoever opens it; here it keeps its own mark.
  const moved: Script = { ...s, home, updated: Date.now(), ...(s.home === 'doc' ? { reviewed: false } : {}) };
  const intoEmpty = home === 'doc' && !scripts.get().doc.length;
  const r = put([...listOf(home), moved], home);
  if (!r.ok) return r;
  // The first script a person puts into a drawing is theirs: it is on, and the drawing's scripts are what they now say.
  if (intoEmpty) {
    setDocOn(true);
    rememberAllowed(store().rootDoc().id, scripts.get().doc);
  }
  put(listOf(s.home).filter((x) => x.id !== id), s.home);
  return { ok: true };
}

// ---------------------------------------------------------------- one command each

let runHandler: (s: Script) => void = () => undefined;
/** The panel's way to run a script (it knows how to stop and look first), handed over so this file does not need the runner. */
export function setRunHandler(fn: (s: Script) => void): void {
  runHandler = fn;
}

const made = new Set<string>();

/** Keeps the commands in step with the scripts: one for each script that may run, none for the others. */
export function syncCommands(): void {
  const want = new Map(allScripts().filter(canRun).map((s) => [commandIdOf(s.id), s]));
  for (const id of [...made]) {
    if (!want.has(id)) {
      unregisterCommand(id);
      made.delete(id);
    }
  }
  for (const [id, s] of want) {
    registerCommand({
      id,
      label: s.name,
      category: 'Scripts',
      description: describeScript(s.code) || 'One of your scripts.',
      help: 'scripts',
      keywords: ['script', 'macro', 'javascript', 'automate'],
      // A script runs in the drawing as it is, and with a symbol or tile open its changes would land in the wrong place.
      run: () => runHandler(findScript(s.id) ?? s),
    });
    made.add(id);
  }
}

/** Starts up: reads what the app has kept, and makes the commands. */
export function loadAppScripts(): void {
  scripts.set((s) => ({ ...s, app: readApp() }));
  syncCommands();
}

/** Every script command now registered (for tests). */
export const scriptCommandIds = (): string[] => allCommands().filter((c) => c.id.startsWith('script.')).map((c) => c.id);
