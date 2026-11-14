// Installed plugins: which are on, what each was allowed, starting and stopping them, and wiring what they add
// (commands, exports, panels) into the app's registries. The plugin code itself only ever runs in its sandbox.
import type { ComponentType } from 'react';
import { allCommands, registerCommand, registerPanel, registerTool, unregisterCommand, unregisterPanel, type ToolPointer } from '../core/registry';
import { setCursor } from '../canvas/controller';
import { clearSnap, snapPt } from '../canvas/guides';
import { removeOwned, withOwner } from '../core/owners';
import { drawingAt, findLayer } from '../core/doc';
import { store } from '../core/store';
import { rootDoc } from '../core/symbols';
import { withoutNotes } from '../notes/model';
import { announceUiChange } from '../features/host';
import { baseName, desktop } from '../io/desktop';
import { notify } from '../io/notify';
import { ask } from '../platform/ask';
import { library } from '../platform/library';
import { registerDecoration } from '../canvas/decorations';
import { registerSnapSource } from '../canvas/snapSources';
import { syncPanels } from '../ui/dock';
import { syncDynamicCommands } from '../ui/dynamic';
import { ICON_NAMES } from '../ui/icons';
import { effectiveKeys, normaliseCombo } from '../ui/keys';
import { createStore } from '../ui/mini';
import { setEventSink } from './bus';
import { plugins, type InstalledPlugin } from './state';
import { drawDrawList, guideSnapLines, handleAt, handleCursor, type DrawList } from './drawlist';
import { summarize, type PluginEventName } from './events';
import { PERMISSIONS, packPlugin, PluginProblem, readPluginFiles, readPluginZip, samePermissions, type Decision, type Permission, type PluginManifest, type PluginPackage } from './manifest';
import { applyOps } from './ops';
import { decide, elevatedIn, needsChoices, powerName, RISKS } from './powers';
import { codeFingerprint } from './fingerprint';
import { forgetValues } from './options';
import { EventPipe } from './pipe';
import { PluginRuntime, type HostHooks, type PluginExporterDef, type PluginToolDef, type Transport } from './runtime';
import { startSandbox } from './sandbox';
import { tripMessage, type Trip } from './watchdog';
import type { PluginDiag } from './diagnostics';
import { getPrefs } from '../ui/prefs';
import { addPluginShape, findInst, redrawPluginShape, ShapeProblem } from './shapes';
import type { UiNode } from './ui-schema';

export { plugins, type InstalledPlugin, type PluginStatus } from './state';

interface Saved {
  enabled: boolean;
  permissions: Permission[];
  network: string[];
  /** The version the person decided about. A newer version that asks for nothing new keeps the decision. */
  version?: string;
  /** Everything the manifest listed when they decided (so a power they refused is not asked again). */
  asked?: Permission[];
  askedNetwork?: string[];
  /** The fingerprint (SHA-256) of the plugin's code when the person decided. A different fingerprint from another place asks again. */
  fingerprint?: string;
  /** Where the plugin was picked from when they decided (a .zip's or folder's path). Updates from the same place are trusted to be the same author. */
  source?: string;
}

const KEY = 'frameling.plugins.v1';

/** What was saved, by plugin id. No prototype, so an id like "constructor" never finds something that was not saved. */
function loadSaved(): Record<string, Saved> {
  const out: Record<string, Saved> = Object.create(null);
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v)) if (v[k] && typeof v[k] === 'object') out[k] = v[k];
  } catch {
    // Nothing saved that can be read.
  }
  return out;
}

function writeSaved(next: Record<string, Saved>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Then it lasts this visit.
  }
}

/** Each plugin panel's latest tree, by full panel id. */
export const panelTrees = createStore<Record<string, UiNode>>({});

const packages = new Map<string, PluginPackage>();
const runtimes = new Map<string, PluginRuntime>();
/** What each running plugin added, so turning it off takes it all away again. */
const added = new Map<string, { commands: string[]; panels: string[] }>();
/** What each plugin shows on the canvas: `canvas` for its guide, `tool:<id>` for one of its tools. Replaced whole by each update. */
const overlays = new Map<string, Map<string, DrawList>>();
const ownerOf = (pid: string) => `plugin:${pid}`;

let overlayRequester: () => void = () => undefined;
/** The canvas hands over how to redraw its overlay (so this file does not need the canvas). */
export function setOverlayRequester(fn: () => void): void {
  overlayRequester = fn;
}

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
    getDoc: () => withoutNotes(rootDoc(store().rootDoc())),
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
      // A plugin may suggest keys, but never one that something else already uses: it must not take Frameling's own keys (or another plugin's).
      const taken = new Set(allCommands().filter((c) => c.id !== id).flatMap((c) => effectiveKeys(c)));
      const keys = def.keys?.map(normaliseCombo).filter((k) => k && !taken.has(k));
      registerCommand({
        id,
        label: def.label,
        category: 'Plugins',
        description: def.description ?? `From the ${m.name} plugin.`,
        keys: keys?.length ? keys : undefined,
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
    addTool: (def) => addPluginTool(m, def),
    addShapeKind: () => undefined,
    setOverlay: (target, list) => {
      const mineOverlays = overlays.get(pid) ?? (overlays.set(pid, new Map()), overlays.get(pid)!);
      if (list.length) mineOverlays.set(target, list);
      else mineOverlays.delete(target);
      ensureCanvasDecoration(pid);
      overlayRequester();
    },
    placeShape: (p) => {
      const s = store().get();
      if (store().nestedTag() || s.doc.editing?.length) throw new Error('Close the symbol or tile being edited first, then try again.');
      const drawingId = p.drawingId ?? (() => {
        const layer = findLayer(s.doc, s.ui.activeLayerId);
        return layer ? (drawingAt(s.doc, layer, s.ui.frame)?.id ?? null) : null;
      })();
      // The lock that counts is the one on the layer the shape goes into (or is already in), not on whatever layer is active.
      const target = p.inst ? (findInst(s.doc, p.pluginId, p.inst, drawingId)?.drawingId ?? drawingId) : drawingId;
      const layer = (target ? s.doc.layers.find((l) => l.cels.some((c) => c.drawingId === target)) : undefined) ?? findLayer(s.doc, s.ui.activeLayerId);
      if (layer?.locked) throw new Error('That layer is locked.');
      const label = `${m.name}: ${p.inst ? 'Redraw' : 'Add'} ${p.kind}`;
      let result: { inst: string; ids: string[]; replaced?: string[] } | undefined;
      try {
        store().update(label, (d) => {
          result = p.inst
            ? redrawPluginShape(d, { drawingId, pluginId: p.pluginId, kind: p.kind, props: p.props, list: p.drawn, inst: p.inst })
            : addPluginShape(d, { drawingId, pluginId: p.pluginId, kind: p.kind, props: p.props, list: p.drawn, at: { x: p.at.x ?? d.width / 2, y: p.at.y ?? d.height / 2 } });
        });
      } catch (e) {
        throw e instanceof ShapeProblem ? e : new Error('That shape could not be added.');
      }
      if (!result) throw new Error('Nothing was added.');
      // The new shape is picked, so it can be moved or changed straight away.
      const sel = store().get().ui.selection;
      if (!result.replaced || result.replaced.every((id) => sel.includes(id)) || !sel.length) store().setUi({ selection: result.ids });
      return result.inst;
    },
    pickFile: async ({ extensions, title }) => {
      const api = desktop();
      if (!api?.files.openOther) {
        notify('Picking a file needs the Frameling app.', 'info');
        return null;
      }
      const r = await api.files.openOther({ filters: [{ name: extensions.length ? extensions.join(', ') : 'All files', extensions: extensions.length ? extensions : ['*'] }], title });
      if (!r) return null;
      if ('error' in r) {
        notify(r.error, 'error');
        return null;
      }
      return { name: baseName(r.path), bytes: r.bytes };
    },
    subscriptionsChanged: () => syncEventPump(),
    problem: (message, loading) => {
      if (loading) patch(pid, { status: 'problem', problem: message });
      notify(`The "${m.name}" plugin hit a problem: ${message}`, 'error', { label: 'Turn it off', run: () => void setEnabled(pid, false) }, 9000);
    },
    loaded: () => patch(pid, { status: 'on', problem: undefined }),
    watchdog: (trip) => void turnOffForTrouble(m, trip),
    memory: () => memoryOf(pid),
    diagnostics: diagnosticsOn,
  };
}

/** "Measure plugins' memory and speed" (Preferences > Diagnostics). Off by default: nothing is counted and no memory is looked at. */
export const diagnosticsOn = (): boolean => getPrefs().pluginDiagnostics;

/** What the heartbeat and the process metrics say about each running plugin, by id (empty while measuring is off). */
export const pluginDiag = createStore<Record<string, PluginDiag>>({});

/** Looks at every running plugin once (the Plugins page does this every second or two while it is open). */
export async function refreshDiag(): Promise<void> {
  if (!diagnosticsOn()) {
    if (Object.keys(pluginDiag.get()).length) pluginDiag.set({});
    return;
  }
  const next: Record<string, PluginDiag> = Object.create(null);
  for (const [id, rt] of runtimes) next[id] = rt.diag(await memoryOf(id));
  pluginDiag.set(next);
}

/** Whether each plugin's sandbox has a process of its own in this run, which is what makes its memory measurable. */
export async function memoryMeasurable(): Promise<boolean> {
  return (await desktop()?.plugins?.isolated?.().catch(() => false)) ?? false;
}

/** The sentence under the switch: what is true right now, in plain words. */
export function diagnosticsAvailableNote(on: boolean, desktopApp: boolean, isolated: boolean): string {
  if (!desktopApp) return on ? 'Speed is measured here. Memory can only be measured in the desktop app.' : 'Off. Frameling still turns off a plugin that stops responding.';
  if (on && isolated) return 'On. Each plugin runs in its own process, so its memory is measured too. A plugin using more than 1 GB is turned off.';
  if (on) return 'On: speed is measured now. Restart Frameling to measure memory too (each plugin then runs in its own process, about 90 MB more each).';
  if (isolated) return 'Off. Restart Frameling to give back the memory the separate processes use.';
  return 'Off. Plugins share one process. Frameling still turns off a plugin that stops responding.';
}

/** Remembers the preference for the next start, when the desktop app decides how to run sandboxes (needs a restart). */
export function syncDiagnosticsFlag(on: boolean): void {
  void desktop()?.plugins?.setDiagnostics?.(on).catch(() => undefined);
}

let memorySeen: { at: number; sizes: Record<string, number> } | null = null;
/** The plugin's memory in bytes (desktop only). One look at the whole app serves every plugin asking within a second. */
async function memoryOf(pid: string): Promise<number | null> {
  const ask = desktop()?.plugins?.memory;
  if (!ask) return null;
  if (!memorySeen || Date.now() - memorySeen.at > 1000) {
    const sizes = await ask().catch(() => ({}) as Record<string, number>);
    memorySeen = { at: Date.now(), sizes };
  }
  return Object.hasOwn(memorySeen.sizes, pid) ? memorySeen.sizes[pid] : null;
}

/** A plugin got stuck or grew too big: turn it off, remember that, and say so plainly with a way back. */
async function turnOffForTrouble(m: PluginManifest, trip: Trip): Promise<void> {
  const message = tripMessage(m.name, trip);
  await setEnabled(m.id, false);
  patch(m.id, { problem: message });
  notify(message, 'warn', { label: 'Turn it on', run: () => void setEnabled(m.id, true) }, 12000);
}

/** The one decoration a plugin with the canvas power gets: it draws whatever the plugin last sent. Taken away with the plugin. */
function ensureCanvasDecoration(pid: string): void {
  const key = `deco:${pid}`;
  if (decorated.has(key)) return;
  decorated.add(key);
  withOwner(ownerOf(pid), () =>
    registerDecoration((g, ctx) => {
      const list = overlays.get(pid)?.get('canvas');
      if (list?.length && !store().get().ui.playing) drawDrawList(g, list, ctx.zoom);
    }),
  );
  // Its straight lines and boxes can be snapped to too, but only while the canvas power is still allowed.
  withOwner(ownerOf(pid), () =>
    registerSnapSource(() => {
      const list = overlays.get(pid)?.get('canvas');
      const allowed = plugins.get().find((x) => x.manifest.id === pid)?.granted.includes('canvas');
      return list?.length && allowed ? guideSnapLines(list) : { x: [], y: [] };
    }),
  );
}
const decorated = new Set<string>();

const toolId = (pid: string, id: string) => `plugin.${pid}.tool.${id}`;

/** Puts one of its tools in the toolbox. Pointer events go to the plugin; what comes back is drawn and applied by Frameling. */
function addPluginTool(m: PluginManifest, def: PluginToolDef): void {
  const pid = m.id;
  const id = toolId(pid, def.id);
  const rtOf = () => runtimes.get(pid);
  type Ev = { type: 'down' | 'move' | 'up' | 'hover' | 'cancel' | 'leave' | 'key' } & Record<string, unknown>;
  type Ctx = { hint(message: string): void } | undefined;
  const pipe = new EventPipe<Ev, Ctx>(async (ev, ctx) => {
    const hint = await rtOf()?.toolEvent(def.id, ev as never);
    if (hint) {
      ctx?.hint(`${m.name}: ${hint}`);
    }
  });
  const overlayOf = () => overlays.get(pid)?.get(`tool:${def.id}`);
  // Where the pointer last was (so a key press has a place), the handle being dragged and the one the pointer is over.
  let last = { x: 0, y: 0, rawX: 0, rawY: 0 };
  let lastCtx: { zoom: number; hint(message: string): void } | undefined;
  let dragging: string | null = null;
  let over: string | null = null;
  const setOver = (h: string | null) => {
    if (h === over) return;
    over = h;
    overlayRequester();
  };
  // An open hand over a handle, a closed one while it is being dragged.
  const showCursor = () => setCursor(handleCursor(over, dragging));
  const send = (type: 'down' | 'move' | 'up' | 'hover', e: ToolPointer, ctx: { zoom: number; hint(message: string): void }) => {
    const st = store().get();
    const layer = findLayer(st.doc, st.ui.activeLayerId);
    // A press on one of the tool's handles starts a drag that keeps that handle's id until the release.
    const list = overlayOf();
    const under = list ? handleAt(list, e.x, e.y, ctx.zoom) : null;
    if (type === 'down' && under) dragging = under;
    const handle = dragging ?? (type === 'hover' ? under : null);
    setOver(dragging ?? under);
    const p = def.snap ? snapPt(e, ctx.zoom, e.mod) : e;
    last = { x: p.x, y: p.y, rawX: e.x, rawY: e.y };
    lastCtx = ctx;
    pipe.push(
      { type, x: p.x, y: p.y, rawX: e.x, rawY: e.y, ...(handle ? { handle } : {}), pressure: e.pressure, shift: e.shift, alt: e.alt, mod: e.mod, button: e.button, frame: st.ui.frame, drawingId: layer ? (drawingAt(st.doc, layer, st.ui.frame)?.id ?? null) : null, zoom: ctx.zoom },
      ctx,
    );
    if (type === 'up') {
      dragging = null;
      setOver(under);
      if (def.snap) clearSnap();
    }
    showCursor();
  };
  const plain = (type: 'cancel' | 'leave', ctx: { zoom: number }) => {
    const st = store().get();
    dragging = null;
    setOver(null);
    showCursor();
    if (def.snap) clearSnap();
    pipe.push({ type, x: 0, y: 0, pressure: 0, shift: false, alt: false, mod: false, button: 0, frame: st.ui.frame, drawingId: null, zoom: ctx.zoom }, undefined);
  };
  withOwner(ownerOf(pid), () => {
    registerTool({
      id,
      label: def.label,
      icon: ICON_NAMES.includes(def.icon) ? def.icon : 'plugin',
      layers: def.layers,
      help: 'plugin-tools',
      cursor: 'crosshair',
      down: (e, ctx) => send('down', e, ctx),
      move: (e, ctx) => send('move', e, ctx),
      up: (e, ctx) => send('up', e, ctx),
      hover: (e, ctx) => send('hover', e, ctx),
      cancel: (ctx) => plain('cancel', ctx),
      leave: (ctx) => plain('leave', ctx),
      overlay: (g, ctx) => {
        const list = overlayOf();
        if (list?.length) drawDrawList(g, list, ctx.zoom, dragging ?? over);
      },
    });
    // Its named keys are commands with no key of their own: people give them keys in Preferences > Keyboard, and a key only does something while the tool is picked.
    for (const k of def.keys) {
      registerCommand({
        id: `${id}.key.${k.id}`,
        label: `${def.label}: ${k.label}`,
        category: 'Plugins',
        description: `A key for the ${def.label} tool of the ${m.name} plugin. It works while that tool is picked.`,
        help: 'plugin-tools',
        keywords: ['plugin', 'tool', 'key', m.name, def.label],
        enabled: (s) => s.ui.tool === id,
        run: () => {
          const st = store().get();
          pipe.push({ type: 'key', key: k.id, x: last.x, y: last.y, rawX: last.rawX, rawY: last.rawY, pressure: 0, shift: false, alt: false, mod: false, button: 0, frame: st.ui.frame, drawingId: null, zoom: lastCtx?.zoom ?? 1 }, lastCtx);
        },
      });
    }
  });
  syncDynamicCommands();
  announceUiChange();
}

// ---------------------------------------------------------------- events

let eventUnsub: (() => void) | null = null;
let seen: { doc: unknown; frame: number; selection: unknown } | null = null;

/** Listens to the app only while some plugin wants to hear about it. */
function syncEventPump(): void {
  const wanted = [...runtimes.values()].some((rt) => rt.subscribed.size > 0);
  if (wanted && !eventUnsub) {
    const s = store();
    const st = s.get();
    seen = { doc: st.doc, frame: st.ui.frame, selection: st.ui.selection };
    eventUnsub = s.subscribe(() => {
      const now = store().get();
      const before = seen!;
      if (now.doc !== before.doc) emitToPlugins('document.changed', () => summarize(store().rootDoc(), store().get().ui.frame, store().undoLabel()) as unknown as Record<string, unknown>);
      if (now.ui.frame !== before.frame) emitToPlugins('frame.changed', { frame: now.ui.frame });
      if (now.ui.selection !== before.selection) {
        const ids = now.ui.selection;
        emitToPlugins('selection.changed', { count: ids.length, ids: ids.slice(0, 200) });
      }
      seen = { doc: now.doc, frame: now.ui.frame, selection: now.ui.selection };
    });
  } else if (!wanted && eventUnsub) {
    eventUnsub();
    eventUnsub = null;
  }
}

/** Tells every running plugin that listens for it. */
export function emitToPlugins(name: PluginEventName, payload: Record<string, unknown> | (() => Record<string, unknown>)): void {
  for (const rt of runtimes.values()) rt.emit(name, payload);
}
setEventSink(emitToPlugins);

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

/** Bumped by every stop, so a start that was still waiting for its sandbox can tell it was overtaken (turned off, or restarted with other powers). */
const epochs = new Map<string, number>();
const starting = new Set<string>();

async function start(p: InstalledPlugin): Promise<void> {
  const id = p.manifest.id;
  const pkg = packages.get(id);
  if (!pkg || runtimes.has(id) || starting.has(id)) return;
  const epoch = epochs.get(id) ?? 0;
  const current = () => (epochs.get(id) ?? 0) === epoch;
  starting.add(id);
  patch(id, { status: 'starting', problem: undefined });
  const network = p.granted.includes('network') ? p.network : [];
  try {
    const transport = await starter(pkg, network);
    // Turned off, or restarted with other powers, while it was starting: this one must not run (with the old powers).
    if (!current() || !plugins.get().find((x) => x.manifest.id === id)?.enabled) return transport.close();
    const rt = new PluginRuntime(pkg.manifest, p.granted, transport, hooksFor(pkg.manifest, (def) => exporterOpener(id, def)));
    runtimes.set(id, rt);
  } catch (e) {
    if (current()) patch(id, { status: 'problem', problem: e instanceof Error ? e.message : 'It could not start.' });
  } finally {
    if (current()) starting.delete(id);
  }
}

function stop(id: string): void {
  epochs.set(id, (epochs.get(id) ?? 0) + 1);
  starting.delete(id);
  runtimes.get(id)?.stop();
  runtimes.delete(id);
  // Its tools and canvas guide go with it, and the person is taken off a tool that is gone.
  overlays.delete(id);
  decorated.delete(`deco:${id}`);
  if (removeOwned(ownerOf(id))) {
    if (store().get().ui.tool.startsWith(`plugin.${id}.tool.`)) store().setUi({ tool: 'select' });
    syncDynamicCommands();
    announceUiChange();
    overlayRequester();
  }
  syncEventPump();
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

let markLoaded: () => void = () => undefined;
const loadedOnce = new Promise<void>((r) => (markLoaded = r));
/** Resolves once the installed plugins have been read at start-up. */
export const whenPluginsLoaded = (): Promise<void> => loadedOnce;

/** Reads every installed plugin and starts the ones that are on. */
export async function loadPlugins(): Promise<void> {
  // Keeps the next start's choice (a file the desktop app reads before it begins) in step with the preference.
  syncDiagnosticsFlag(diagnosticsOn());
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
      const ok = !!s && samePermissions(pkg.manifest, s);
      list.push({ manifest: pkg.manifest, enabled: !!s?.enabled && ok, granted: s?.permissions ?? [], network: s?.network ?? [], grantedFor: s?.version, status: 'off', ...(s && !ok ? { problem: 'It asks for more than before. Turn it on to look and allow it.' } : {}) });
    } catch (err) {
      // A broken file in the folder: leave it, say nothing at start-up.
      void err;
    }
  }
  list.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  plugins.set(list);
  markLoaded();
  for (const p of list) if (p.enabled) await start(p);
}

/** Frameling asks; what comes back is what the person allowed, or null for "no, leave it". */
type Approver = (m: PluginManifest, verb: 'Install' | 'Turn on' | 'Update') => Promise<{ permissions: Permission[]; network: string[] } | null>;
let approver: Approver | null = null;

/** The app's own "Install this plugin?" dialog (ApproveDialog.tsx). Without one, a plain question stands in. */
export function setApprover(fn: Approver | null): void {
  approver = fn;
}

/** Asks, and resolves the decision to remember (what was allowed and everything that was asked), or null. */
async function approve(m: PluginManifest, verb: 'Install' | 'Turn on' | 'Update'): Promise<Decision | null> {
  const a = await (approver ? approver(m, verb) : plainApprove(m, verb));
  return a ? { permissions: a.permissions, network: a.network, asked: [...m.permissions], askedNetwork: [...m.network] } : null;
}

/** The "Install this plugin?" question, with what it asks for, in plain words. Resolves what they allowed, or null. */
async function plainApprove(m: PluginManifest, verb: 'Install' | 'Turn on' | 'Update'): Promise<{ permissions: Permission[]; network: string[] } | null> {
  const elevated = elevatedIn(m);
  const net = m.permissions.includes('network');
  const lines = m.permissions.map((p) => `- ${PERMISSIONS[p].label}${p === 'network' ? ` (${m.network.join(', ')})` : ''}${RISKS[p] && (elevated.includes(p) || p === 'network') ? `. Careful: ${RISKS[p]}` : ''}`);
  const detail = [m.description, m.author ? `By ${m.author}.` : '', lines.length ? `It asks to:\n${lines.join('\n')}` : 'It asks for nothing beyond adding commands.', 'Plugins run in a sandbox, away from your files.']
    .filter(Boolean)
    .join('\n\n');
  const answer = await ask({
    title: `${verb} plugin`,
    message: `${verb} "${m.name}" ${m.version}?`,
    detail,
    buttons:
      net || elevated.length
        ? [
            { value: 'all', label: `${verb}, allow everything it asks`, primary: true },
            { value: 'safe', label: `${verb} without ${elevated.length && net ? 'those powers or the internet' : net ? 'the internet' : 'those powers'}` },
            { value: 'cancel', label: 'Cancel' },
          ]
        : [
            { value: 'all', label: verb, primary: true },
            { value: 'cancel', label: 'Cancel' },
          ],
    cancel: 'cancel',
  });
  if (answer === 'cancel') return null;
  const d = decide(m, answer === 'safe' ? [] : elevated, answer !== 'safe');
  return { permissions: d.permissions, network: d.network };
}

/**
 * Whether an update's code may keep what was allowed to the plugin before. The same code always does. Different code does
 * only when it comes from the very place the earlier one came from (the same .zip or folder, being worked on); the same id
 * from anywhere else is not known to be the same author, so it is asked about again.
 */
function sameCode(prior: Saved, stored: PluginPackage | undefined, fingerprint: string, source: string | undefined): boolean {
  // A decision saved before fingerprints: what was stored then is what was decided about.
  const before = prior.fingerprint ?? (stored ? codeFingerprint(stored.code) : undefined);
  if (before === fingerprint) return true;
  return !!source && !!prior.source && source === prior.source;
}

/** Installs (or updates) a plugin from a package, after asking. Resolves true when it's installed. */
export async function installPackage(pkg: PluginPackage): Promise<boolean> {
  const m = pkg.manifest;
  const had = plugins.get().find((x) => x.manifest.id === m.id);
  // A new version that asks for nothing it was not already asked about keeps what the person decided before.
  const prior = had ? loadSaved()[m.id] : undefined;
  const fingerprint = codeFingerprint(pkg.code);
  const kept: Decision | null = prior && samePermissions(m, prior) && sameCode(prior, packages.get(m.id), fingerprint, pkg.source) ? { permissions: prior.permissions, network: prior.network, asked: [...new Set([...(prior.asked ?? prior.permissions), ...m.permissions])], askedNetwork: [...new Set([...(prior.askedNetwork ?? prior.network), ...m.network])] } : null;
  const allowed = kept ?? (await approve(m, had ? 'Update' : 'Install'));
  if (!allowed) return false;
  if (had) stop(m.id);
  await library.write('plugins', m.id, packPlugin(pkg));
  packages.set(m.id, pkg);
  const saved = loadSaved();
  saved[m.id] = { enabled: true, permissions: allowed.permissions, network: allowed.network, version: m.version, asked: allowed.asked, askedNetwork: allowed.askedNetwork, fingerprint, ...(pkg.source ? { source: pkg.source } : {}) };
  writeSaved(saved);
  const entry: InstalledPlugin = { manifest: m, enabled: true, granted: allowed.permissions, network: allowed.network, grantedFor: m.version, status: 'off' };
  plugins.set((list) => [...list.filter((x) => x.manifest.id !== m.id), entry].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)));
  await start(entry);
  notify(`"${m.name}" is installed. Find it in Edit > Plugins.`, 'success', undefined, 5000, 'cheer');
  return true;
}

/** Installs from a zip's bytes, or a folder's files. Says what went wrong in plain words. */
export async function installFrom(input: Uint8Array | Record<string, Uint8Array>, source?: string): Promise<boolean> {
  let pkg: PluginPackage;
  try {
    pkg = input instanceof Uint8Array ? readPluginZip(input) : readPluginFiles(input);
    if (source) pkg = { ...pkg, source };
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
    let entry: Saved = saved[id] ?? { enabled: true, permissions: granted, network };
    // Never decided about, or it asks for more now: ask first.
    if (!saved[id] || !samePermissions(p.manifest, saved[id])) {
      const a = await approve(p.manifest, 'Turn on');
      if (!a) return;
      granted = a.permissions;
      network = a.network;
      entry = { ...entry, version: p.manifest.version, asked: a.asked, askedNetwork: a.askedNetwork };
    }
    saved[id] = { ...entry, enabled: true, permissions: granted, network };
    writeSaved(saved);
    patch(id, { enabled: true, granted, network, grantedFor: saved[id].version, problem: undefined });
    await start({ ...p, enabled: true, granted, network });
  } else {
    if (saved[id]) saved[id] = { ...saved[id], enabled: false };
    writeSaved(saved);
    patch(id, { enabled: false });
    stop(id);
  }
}

/**
 * Turns one power of a plugin on or off from Preferences. Turning one off needs no question; turning one on shows what it
 * could do and asks. The plugin restarts with the new set, so what that power added goes away or comes back.
 */
export async function setPower(id: string, power: Permission, on: boolean): Promise<void> {
  const p = plugins.get().find((x) => x.manifest.id === id);
  if (!p || !p.manifest.permissions.includes(power) || on === p.granted.includes(power)) return;
  if (on) {
    const risk = RISKS[power];
    if (risk) {
      const answer = await ask({
        title: 'Allow this?',
        message: `Let "${p.manifest.name}" ${powerName(power).toLowerCase()}?`,
        detail: `${risk}\n\nYou can turn this off again any time in Preferences, Plugins.`,
        buttons: [
          { value: 'allow', label: 'Allow', primary: true },
          { value: 'cancel', label: 'Cancel' },
        ],
        cancel: 'cancel',
      });
      if (answer !== 'allow') return;
    }
  }
  const granted = on ? [...p.granted, power] : p.granted.filter((x) => x !== power);
  const network = power === 'network' ? (on ? [...p.manifest.network] : []) : p.network;
  const saved = loadSaved();
  saved[id] = { ...(saved[id] ?? { enabled: p.enabled, permissions: [], network: [] }), permissions: granted, network, version: p.manifest.version, asked: saved[id]?.asked ?? [...p.manifest.permissions], askedNetwork: saved[id]?.askedNetwork ?? [...p.manifest.network] };
  writeSaved(saved);
  patch(id, { granted, network, grantedFor: p.manifest.version });
  if (p.enabled) {
    stop(id);
    await start({ ...p, granted, network });
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
  forgetValues(id);
  plugins.set((list) => list.filter((x) => x.manifest.id !== id));
  notify(`"${p.manifest.name}" is removed.`, 'info', undefined, 3000);
}

/** Turns plugins off and forgets them (tests). */
export function resetPluginsForTests(): void {
  for (const id of new Set([...runtimes.keys(), ...starting])) stop(id);
  packages.clear();
  plugins.set([]);
  panelTrees.set({});
  pluginDiag.set({});
  memorySeen = null;
}
