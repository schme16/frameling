// Installed plugins: which are on, what each was allowed, starting and stopping them, and wiring what they add
// (commands, exports, panels) into the app's registries. The plugin code itself only ever runs in its sandbox.
import type { ComponentType } from 'react';
import { registerCommand, registerPanel, unregisterCommand, unregisterPanel } from '../core/registry';
import { drawingAt, findLayer } from '../core/doc';
import { store } from '../core/store';
import { rootDoc } from '../core/symbols';
import { notify } from '../io/notify';
import { ask } from '../platform/ask';
import { library } from '../platform/library';
import { syncPanels } from '../ui/dock';
import { syncDynamicCommands } from '../ui/dynamic';
import { createStore } from '../ui/mini';
import { PERMISSIONS, packPlugin, PluginProblem, readPluginFiles, readPluginZip, samePermissions, type Permission, type PluginManifest, type PluginPackage } from './manifest';
import { applyOps } from './ops';
import { PluginRuntime, type HostHooks, type PluginExporterDef, type Transport } from './runtime';
import { startSandbox } from './sandbox';
import type { UiNode } from './ui-schema';

export type PluginStatus = 'off' | 'starting' | 'on' | 'problem';

export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  /** What the person allowed when installing (may be less than asked: network can be declined). */
  granted: Permission[];
  network: string[];
  status: PluginStatus;
  problem?: string;
}

interface Saved {
  enabled: boolean;
  permissions: Permission[];
  network: string[];
}

const KEY = 'frameling.plugins.v1';

function loadSaved(): Record<string, Saved> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeSaved(next: Record<string, Saved>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Then it lasts this visit.
  }
}

export const plugins = createStore<InstalledPlugin[]>([]);
/** Each plugin panel's latest tree, by full panel id. */
export const panelTrees = createStore<Record<string, UiNode>>({});

const packages = new Map<string, PluginPackage>();
const runtimes = new Map<string, PluginRuntime>();
/** What each running plugin added, so turning it off takes it all away again. */
const added = new Map<string, { commands: string[]; panels: string[] }>();

/** Swapped in tests, where there's no sandbox to start. */
let starter: (pkg: PluginPackage, network: string[]) => Promise<Transport> = (pkg, network) =>
  startSandbox({ code: pkg.code, plugin: { id: pkg.manifest.id, name: pkg.manifest.name, version: pkg.manifest.version }, network });

export function setSandboxStarterForTests(fn: typeof starter): void {
  starter = fn;
}

const commandId = (pid: string, cid: string) => `plugin.${pid}.${cid}`;
export const exportCommandId = (pid: string, eid: string) => `plugin.${pid}.export.${eid}`;
export const panelId = (pid: string, id: string) => `plugin.${pid}.${id}`;

function patch(id: string, p: Partial<InstalledPlugin>): void {
  plugins.set((list) => list.map((x) => (x.manifest.id === id ? { ...x, ...p } : x)));
}

export function runtimeOf(id: string): PluginRuntime | undefined {
  return runtimes.get(id);
}

/** Hooks that tie one plugin to the app. */
function hooksFor(m: PluginManifest, onExporter: (def: PluginExporterDef) => void): HostHooks {
  const pid = m.id;
  const mine = () => added.get(pid) ?? (added.set(pid, { commands: [], panels: [] }), added.get(pid)!);
  return {
    getDoc: () => rootDoc(store().rootDoc()),
    getState: () => {
      const { doc, ui } = store().get();
      const layer = findLayer(doc, ui.activeLayerId);
      return { frame: ui.frame, activeLayerId: ui.activeLayerId, selection: [...ui.selection], drawingId: layer ? (drawingAt(doc, layer, ui.frame)?.id ?? null) : null };
    },
    edit: (label, ops) => {
      const s = store().get();
      if (store().nestedTag() || s.doc.editing?.length) throw new Error('Close the symbol or tile being edited first, then try again.');
      store().update(`${m.name}${label ? `: ${label}` : ''}`, (d) => applyOps(d, ops));
    },
    notify: (message, kind) => notify(`${m.name}: ${message}`, kind),
    addCommand: (def) => {
      const id = commandId(pid, def.id);
      registerCommand({
        id,
        label: def.label,
        category: 'Plugins',
        description: def.description ?? `From the ${m.name} plugin.`,
        keys: def.keys,
        help: 'plugins',
        keywords: ['plugin', m.name],
        run: () => runtimes.get(pid)?.runCommand(def.id),
      });
      if (!mine().commands.includes(id)) mine().commands.push(id);
    },
    addExporter: (def) => {
      const id = exportCommandId(pid, def.id);
      registerCommand({
        id,
        label: `Export ${def.label}...`,
        category: 'Export',
        description: def.description ?? `Export with the ${m.name} plugin.`,
        help: 'plugin-exports',
        keywords: ['plugin', 'export', m.name],
        enabled: () => runtimes.has(pid),
        run: () => onExporter(def),
      });
      if (!mine().commands.includes(id)) mine().commands.push(id);
    },
    addPanel: (def, ui) => {
      const id = panelId(pid, def.id);
      panelTrees.set((t) => ({ ...t, [id]: ui }));
      registerPanel({ id, title: def.title, icon: 'plugin', component: panelComponent(id, pid, def.id), zone: 'right', order: 95, help: 'plugin-panels' });
      if (!mine().panels.includes(id)) mine().panels.push(id);
      syncPanels();
      syncDynamicCommands();
    },
    updatePanel: (id, ui) => panelTrees.set((t) => ({ ...t, [panelId(pid, id)]: ui })),
    problem: (message, loading) => {
      if (loading) patch(pid, { status: 'problem', problem: message });
      notify(`The "${m.name}" plugin hit a problem: ${message}`, 'error', { label: 'Turn it off', run: () => void setEnabled(pid, false) }, 9000);
    },
    loaded: () => patch(pid, { status: 'on', problem: undefined }),
  };
}

// The panel component is made in PluginPanel.tsx and handed over here, so this file doesn't need React.
let makePanel: ((fullId: string, pid: string, localId: string) => ComponentType) | null = null;
export function setPanelFactory(fn: typeof makePanel): void {
  makePanel = fn;
}
function panelComponent(fullId: string, pid: string, localId: string): ComponentType {
  return makePanel ? makePanel(fullId, pid, localId) : () => null;
}

let exporterOpener: (pid: string, def: PluginExporterDef) => void = () => undefined;
export function setExporterOpener(fn: typeof exporterOpener): void {
  exporterOpener = fn;
}

async function start(p: InstalledPlugin): Promise<void> {
  const id = p.manifest.id;
  const pkg = packages.get(id);
  if (!pkg || runtimes.has(id)) return;
  patch(id, { status: 'starting', problem: undefined });
  const network = p.granted.includes('network') ? p.network : [];
  try {
    const transport = await starter(pkg, network);
    // Turned off while it was starting.
    if (!plugins.get().find((x) => x.manifest.id === id)?.enabled) return transport.close();
    const rt = new PluginRuntime(pkg.manifest, p.granted, transport, hooksFor(pkg.manifest, (def) => exporterOpener(id, def)));
    runtimes.set(id, rt);
  } catch (e) {
    patch(id, { status: 'problem', problem: e instanceof Error ? e.message : 'It could not start.' });
  }
}

function stop(id: string): void {
  runtimes.get(id)?.stop();
  runtimes.delete(id);
  const a = added.get(id);
  if (a) {
    for (const c of a.commands) unregisterCommand(c);
    for (const p of a.panels) {
      unregisterPanel(p);
      unregisterCommand(`view.panel.${p}`);
    }
    panelTrees.set((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !a.panels.includes(k))));
    added.delete(id);
    if (a.panels.length) syncPanels();
  }
  patch(id, { status: 'off' });
}

/** Reads every installed plugin and starts the ones that are on. */
export async function loadPlugins(): Promise<void> {
  const saved = loadSaved();
  const list: InstalledPlugin[] = [];
  for (const e of await library.list('plugins')) {
    const bytes = await library.read('plugins', e.id);
    if (!bytes) continue;
    try {
      const pkg = readPluginZip(bytes);
      packages.set(pkg.manifest.id, pkg);
      const s = saved[pkg.manifest.id];
      // Permissions it now asks for that nobody allowed: it stays off until someone does.
      const ok = !!s && samePermissions(pkg.manifest, { permissions: s.permissions, network: s.network });
      list.push({ manifest: pkg.manifest, enabled: !!s?.enabled && ok, granted: s?.permissions ?? [], network: s?.network ?? [], status: 'off', ...(s && !ok ? { problem: 'It asks for more than before. Turn it on to look and allow it.' } : {}) });
    } catch (err) {
      // A broken file in the folder: leave it, say nothing at start-up.
      void err;
    }
  }
  list.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  plugins.set(list);
  for (const p of list) if (p.enabled) await start(p);
}

type Approver = (m: PluginManifest, verb: 'Install' | 'Turn on' | 'Update') => Promise<{ permissions: Permission[]; network: string[] } | null>;
let approver: Approver | null = null;

/** The app's own "Install this plugin?" dialog (ApproveDialog.tsx). Without one, a plain question stands in. */
export function setApprover(fn: Approver | null): void {
  approver = fn;
}

function approve(m: PluginManifest, verb: 'Install' | 'Turn on' | 'Update') {
  return approver ? approver(m, verb) : plainApprove(m, verb);
}

/** The "Install this plugin?" question, with what it asks for. Resolves what they allowed, or null. */
async function plainApprove(m: PluginManifest, verb: 'Install' | 'Turn on' | 'Update'): Promise<{ permissions: Permission[]; network: string[] } | null> {
  const lines = m.permissions.map((p) => `- ${PERMISSIONS[p].label}${p === 'network' ? ` (${m.network.join(', ')})` : ''}`);
  const detail = [m.description, m.author ? `By ${m.author}.` : '', lines.length ? `It asks to:\n${lines.join('\n')}` : 'It asks for nothing beyond adding commands.', 'Plugins run in a sandbox, away from your files.']
    .filter(Boolean)
    .join('\n\n');
  const net = m.permissions.includes('network');
  const answer = await ask({
    title: `${verb} plugin`,
    message: `${verb} "${m.name}" ${m.version}?`,
    detail,
    buttons: net
      ? [
          { value: 'all', label: `${verb}, with the internet`, primary: true },
          { value: 'offline', label: `${verb} without the internet` },
          { value: 'cancel', label: 'Cancel' },
        ]
      : [
          { value: 'all', label: verb, primary: true },
          { value: 'cancel', label: 'Cancel' },
        ],
    cancel: 'cancel',
  });
  if (answer === 'cancel') return null;
  const permissions = answer === 'offline' ? m.permissions.filter((p) => p !== 'network') : [...m.permissions];
  return { permissions, network: answer === 'offline' ? [] : [...m.network] };
}

/** Installs (or updates) a plugin from a package, after asking. Resolves true when it's installed. */
export async function installPackage(pkg: PluginPackage): Promise<boolean> {
  const m = pkg.manifest;
  const had = plugins.get().find((x) => x.manifest.id === m.id);
  const allowed = await approve(m, had ? 'Update' : 'Install');
  if (!allowed) return false;
  if (had) stop(m.id);
  await library.write('plugins', m.id, packPlugin(pkg));
  packages.set(m.id, pkg);
  const saved = loadSaved();
  saved[m.id] = { enabled: true, permissions: allowed.permissions, network: allowed.network };
  writeSaved(saved);
  const entry: InstalledPlugin = { manifest: m, enabled: true, granted: allowed.permissions, network: allowed.network, status: 'off' };
  plugins.set((list) => [...list.filter((x) => x.manifest.id !== m.id), entry].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)));
  await start(entry);
  notify(`"${m.name}" is installed. Find it in the Plugins menu.`, 'success', undefined, 5000, 'cheer');
  return true;
}

/** Installs from a zip's bytes, or a folder's files. Says what went wrong in plain words. */
export async function installFrom(input: Uint8Array | Record<string, Uint8Array>): Promise<boolean> {
  let pkg: PluginPackage;
  try {
    pkg = input instanceof Uint8Array ? readPluginZip(input) : readPluginFiles(input);
  } catch (e) {
    notify(e instanceof PluginProblem ? e.message : "That plugin couldn't be read.", 'error');
    return false;
  }
  return installPackage(pkg);
}

export async function setEnabled(id: string, on: boolean): Promise<void> {
  const p = plugins.get().find((x) => x.manifest.id === id);
  if (!p) return;
  const saved = loadSaved();
  if (on) {
    let granted = p.granted;
    let network = p.network;
    // Never allowed, or it asks for more now: ask first.
    if (!saved[id] || !samePermissions(p.manifest, { permissions: granted, network })) {
      const a = await approve(p.manifest, 'Turn on');
      if (!a) return;
      granted = a.permissions;
      network = a.network;
    }
    saved[id] = { enabled: true, permissions: granted, network };
    writeSaved(saved);
    patch(id, { enabled: true, granted, network, problem: undefined });
    await start({ ...p, enabled: true, granted, network });
  } else {
    if (saved[id]) saved[id] = { ...saved[id], enabled: false };
    writeSaved(saved);
    patch(id, { enabled: false });
    stop(id);
  }
}

export async function removePlugin(id: string): Promise<void> {
  const p = plugins.get().find((x) => x.manifest.id === id);
  if (!p) return;
  const answer = await ask({
    title: 'Remove plugin',
    message: `Remove "${p.manifest.name}"?`,
    detail: 'What it added goes away. Your drawings stay as they are.',
    buttons: [
      { value: 'remove', label: 'Remove', primary: true },
      { value: 'cancel', label: 'Cancel' },
    ],
    cancel: 'cancel',
  });
  if (answer !== 'remove') return;
  stop(id);
  await library.remove('plugins', id);
  packages.delete(id);
  const saved = loadSaved();
  delete saved[id];
  writeSaved(saved);
  plugins.set((list) => list.filter((x) => x.manifest.id !== id));
  notify(`"${p.manifest.name}" is removed.`, 'info', undefined, 3000);
}

/** Turns plugins off and forgets them (tests). */
export function resetPluginsForTests(): void {
  for (const id of [...runtimes.keys()]) stop(id);
  packages.clear();
  plugins.set([]);
  panelTrees.set({});
}
