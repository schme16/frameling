// A plugin package: a folder or zip with manifest.json and one script. This reads and checks it. Pure, no DOM.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const PLUGIN_API_VERSION = 1;

/** What a plugin may ask for. Commands and short messages need nothing. */
export type Permission = 'document.read' | 'document.edit' | 'export' | 'panels' | 'network';

export const PERMISSIONS: Record<Permission, { label: string; detail: string }> = {
  'document.read': { label: 'See your drawing', detail: 'Read the open drawing: its layers, frames, shapes and pixels.' },
  'document.edit': { label: 'Change your drawing', detail: 'Change the open drawing. Every change is one step you can undo.' },
  export: { label: 'Add a way to export', detail: 'Turn your frames into files, when you choose to export with it.' },
  panels: { label: 'Show a panel', detail: 'Add a panel with buttons, sliders and text (no web pages).' },
  network: { label: 'Use the internet', detail: 'Send and receive data over the internet. Only allow this if you trust where it comes from.' },
};

export interface PluginManifest {
  /** Lower case letters, numbers and dashes. Stays the same across versions. */
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** The script, a path inside the package (default main.js). */
  main: string;
  permissions: Permission[];
  /** With the network permission: the https sites it talks to (origins, like https://api.example.com). */
  network: string[];
  apiVersion: number;
}

export interface PluginPackage {
  manifest: PluginManifest;
  code: string;
}

export class PluginProblem extends Error {}

const MAX_PACKAGE = 8 * 1024 * 1024;
const MAX_CODE = 2 * 1024 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** An https origin, cleaned (https://a.example.com:8443), or null. Plain http is never allowed. */
export function cleanOrigin(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname || u.hostname.includes('*')) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Checks a manifest and fills in what's missing. Throws a PluginProblem in plain words. */
export function parseManifest(raw: unknown): PluginManifest {
  if (!isObj(raw)) throw new PluginProblem("The plugin's manifest.json isn't readable.");
  const id = text(raw.id, 60).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(id)) throw new PluginProblem('The plugin needs an id made of lower case letters, numbers and dashes (3 to 60 long).');
  const name = text(raw.name, 60);
  if (!name) throw new PluginProblem('The plugin needs a name.');
  const version = text(raw.version, 20) || '0.0.0';
  const apiVersion = typeof raw.apiVersion === 'number' ? raw.apiVersion : PLUGIN_API_VERSION;
  if (apiVersion > PLUGIN_API_VERSION) throw new PluginProblem(`"${name}" needs a newer Frameling. Update Frameling and try again.`);
  const perms = Array.isArray(raw.permissions) ? raw.permissions : [];
  const permissions: Permission[] = [];
  for (const p of perms) {
    if (typeof p !== 'string' || !(p in PERMISSIONS)) throw new PluginProblem(`"${name}" asks for a permission Frameling doesn't know ("${String(p).slice(0, 40)}").`);
    if (!permissions.includes(p as Permission)) permissions.push(p as Permission);
  }
  const network: string[] = [];
  if (permissions.includes('network')) {
    for (const o of Array.isArray(raw.network) ? raw.network : []) {
      const c = cleanOrigin(o);
      if (!c) throw new PluginProblem(`"${name}" lists a site that isn't a plain https address ("${String(o).slice(0, 60)}").`);
      if (!network.includes(c)) network.push(c);
    }
    if (!network.length) throw new PluginProblem(`"${name}" asks for the internet but doesn't say which sites. List them under "network".`);
  }
  const main = text(raw.main, 120) || 'main.js';
  if (!/^[A-Za-z0-9_./-]+\.js$/.test(main) || main.includes('..')) throw new PluginProblem('The plugin\'s "main" must be a .js file inside the package.');
  return { id, name, version, description: text(raw.description, 300), author: text(raw.author, 80), main, permissions, network, apiVersion };
}

/** Drops one shared top folder (zips made by "compress folder" wrap everything in one). */
function stripTop(files: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const names = Object.keys(files).filter((n) => !n.endsWith('/'));
  if (names.includes('manifest.json')) return files;
  const tops = new Set(names.map((n) => n.split('/')[0]));
  if (tops.size !== 1) return files;
  const top = [...tops][0] + '/';
  if (!names.every((n) => n.startsWith(top))) return files;
  return Object.fromEntries(names.map((n) => [n.slice(top.length), files[n]]));
}

/** Reads a package from its files (a folder's, or a zip's). */
export function readPluginFiles(input: Record<string, Uint8Array>): PluginPackage {
  const files = stripTop(input);
  const m = files['manifest.json'];
  if (!m) throw new PluginProblem("That isn't a Frameling plugin: there's no manifest.json in it.");
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(m));
  } catch {
    throw new PluginProblem("The plugin's manifest.json isn't readable.");
  }
  const manifest = parseManifest(raw);
  const script = files[manifest.main];
  if (!script) throw new PluginProblem(`"${manifest.name}" is missing its script (${manifest.main}).`);
  if (script.length > MAX_CODE) throw new PluginProblem(`"${manifest.name}" is too big. A plugin script can be up to 2 MB.`);
  return { manifest, code: strFromU8(script) };
}

/** Reads a zipped package. */
export function readPluginZip(bytes: Uint8Array): PluginPackage {
  let entries: Record<string, Uint8Array>;
  let total = 0;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_PACKAGE) throw new PluginProblem('That plugin is too big to install.');
        return !f.name.endsWith('/') && (f.name.endsWith('.json') || f.name.endsWith('.js'));
      },
    });
  } catch (e) {
    if (e instanceof PluginProblem) throw e;
    throw new PluginProblem("That file isn't a Frameling plugin (it should be a .zip with manifest.json inside).");
  }
  return readPluginFiles(entries);
}

/** The package as Frameling keeps it: a small zip with the manifest and the script. */
export function packPlugin(pkg: PluginPackage): Uint8Array {
  return zipSync({ 'manifest.json': strToU8(JSON.stringify(pkg.manifest, null, 2)), [pkg.manifest.main]: strToU8(pkg.code) }, { level: 6 });
}

/** Two manifests ask for the same things (an update that needs no new approval). */
export function samePermissions(a: Pick<PluginManifest, 'permissions' | 'network'>, approved: { permissions: Permission[]; network: string[] }): boolean {
  return a.permissions.every((p) => approved.permissions.includes(p)) && a.network.every((o) => approved.network.includes(o));
}
