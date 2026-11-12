// A plugin package: a folder or zip with manifest.json and one script. This reads and checks it. Pure, no DOM.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { EVENT_NAMES, type PluginEventName } from './events';
import { sanitizeOptions, type ExportOption } from './options';

/** The newest plugin API this Frameling knows. Version 1 plugins keep working unchanged. */
export const PLUGIN_API_VERSION = 2;

/** What a plugin may ask for. Commands and short messages need nothing. The last four are version 2 only. */
export type Permission = 'document.read' | 'document.edit' | 'export' | 'panels' | 'network' | 'tools' | 'canvas' | 'shapes' | 'files.read';

/** Version 2 spells "change the drawing" as `document.write`. It is the same power as `document.edit`. */
const PERMISSION_ALIASES: Record<string, Permission> = { 'document.write': 'document.edit' };
/** Only a version 2 manifest may ask for these. */
export const V2_PERMISSIONS: Permission[] = ['tools', 'canvas', 'shapes', 'files.read'];

export const PERMISSIONS: Record<Permission, { label: string; detail: string }> = {
  'document.read': { label: 'See your drawing', detail: 'Read the open drawing: its layers, frames, shapes and pixels.' },
  'document.edit': { label: 'Change your drawing', detail: 'Change the open drawing. Every change is one step you can undo.' },
  export: { label: 'Add a way to export', detail: 'Turn your frames into files, when you choose to export with it.' },
  panels: { label: 'Show a panel', detail: 'Add a panel with buttons, sliders and text (no web pages).' },
  network: { label: 'Use the internet', detail: 'Send and receive data over the internet. Only allow this if you trust where it comes from.' },
  tools: { label: 'Add its own tools', detail: 'Put new tools in your toolbox. A tool sees where you click and drag on the canvas while it is chosen.' },
  canvas: { label: 'Draw on the canvas', detail: 'Show lines, shapes and text on top of your canvas. They are only a guide on screen and never end up in your files.' },
  shapes: { label: 'Add its own kinds of shape', detail: 'Add new kinds of shape to your drawing. They are saved as ordinary shapes, so the file still opens without the plugin.' },
  'files.read': { label: 'Read a file you pick', detail: 'Ask you to pick a file, then read just that file. It can never look at your other files.' },
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
  /** Version 2: the events it wants to hear about (it hears nothing it did not list). */
  events: PluginEventName[];
  /** Version 2: the options each of its exporters shows in the Export dialog, by exporter id. */
  exporterOptions: Record<string, ExportOption[]>;
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
  // A manifest that does not say is version 1: it was written before version 2 existed.
  const apiVersion = typeof raw.apiVersion === 'number' && Number.isInteger(raw.apiVersion) && raw.apiVersion >= 1 ? raw.apiVersion : 1;
  if (apiVersion > PLUGIN_API_VERSION) throw new PluginProblem(`"${name}" needs a newer Frameling. Update Frameling and try again.`);
  const perms = Array.isArray(raw.permissions) ? raw.permissions : [];
  const permissions: Permission[] = [];
  for (const raw of perms) {
    const p = typeof raw === 'string' ? (apiVersion >= 2 ? (PERMISSION_ALIASES[raw] ?? raw) : raw) : raw;
    if (typeof p !== 'string' || !(p in PERMISSIONS)) throw new PluginProblem(`"${name}" asks for a permission Frameling doesn't know ("${String(raw).slice(0, 40)}").`);
    if (apiVersion < 2 && V2_PERMISSIONS.includes(p as Permission)) throw new PluginProblem(`"${name}" asks to ${PERMISSIONS[p as Permission].label.toLowerCase()}, which needs "apiVersion": 2 in its manifest.`);
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
  const events: PluginEventName[] = [];
  if (raw.events !== undefined && !(Array.isArray(raw.events) && !raw.events.length)) {
    if (apiVersion < 2) throw new PluginProblem(`"${name}" lists events, which needs "apiVersion": 2 in its manifest.`);
    for (const e of Array.isArray(raw.events) ? raw.events : []) {
      if (typeof e !== 'string' || !(EVENT_NAMES as readonly string[]).includes(e)) throw new PluginProblem(`"${name}" asks to hear about an event Frameling doesn't have ("${String(e).slice(0, 40)}").`);
      if (!events.includes(e as PluginEventName)) events.push(e as PluginEventName);
    }
  }
  const exporterOptions: Record<string, ExportOption[]> = {};
  if (raw.exporters !== undefined && !(isObj(raw.exporters) && !Object.keys(raw.exporters).length)) {
    if (apiVersion < 2) throw new PluginProblem(`"${name}" describes export options, which needs "apiVersion": 2 in its manifest.`);
    if (!isObj(raw.exporters)) throw new PluginProblem(`"${name}" has "exporters" that isn't readable.`);
    for (const [eid, def] of Object.entries(raw.exporters).slice(0, 10)) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(eid) || !isObj(def)) continue;
      const opts = sanitizeOptions(def.options);
      if (opts.length) exporterOptions[eid] = opts;
    }
  }
  return { id, name, version, description: text(raw.description, 300), author: text(raw.author, 80), main, permissions, network, apiVersion, events, exporterOptions };
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
  // What it never said stays out of the stored copy, so a version 1 manifest is stored as it was written.
  const { events, exporterOptions, ...rest } = pkg.manifest;
  const manifest = { ...rest, ...(events.length ? { events } : {}), ...(Object.keys(exporterOptions).length ? { exporters: Object.fromEntries(Object.entries(exporterOptions).map(([k, options]) => [k, { options }])) } : {}) };
  return zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)), [pkg.manifest.main]: strToU8(pkg.code) }, { level: 6 });
}

/** What was decided about a plugin: what it may do now, and everything it was asked about (so a denied power is not asked again). */
export interface Decision {
  permissions: Permission[];
  network: string[];
  /** Everything the manifest listed at the time (missing in what was saved before version 2: the allowed ones count). */
  asked?: Permission[];
  askedNetwork?: string[];
}

/** The manifest asks for nothing the person has not already been asked about (an update that needs no new approval). */
export function samePermissions(a: Pick<PluginManifest, 'permissions' | 'network'>, approved: Decision): boolean {
  const asked = approved.asked ?? approved.permissions;
  const askedNet = approved.askedNetwork ?? approved.network;
  return a.permissions.every((p) => asked.includes(p)) && a.network.every((o) => askedNet.includes(o));
}
