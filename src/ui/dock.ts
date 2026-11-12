// The dock's live state: where every panel is (the left, right, bottom and top zones, or a floating window), how big
// each zone is, and the workspaces (saved layouts). The pure model is in dockModel.ts; the views are DockView.tsx,
// DockFloats.tsx and RightDock.tsx. This file is plain state so it can be tested.
import { allPanels, getPanel, type DockZone, type PanelDef } from '../core/registry';
import type { LayerKind } from '../core/format';
import { cleanName, clone, closeFloat, closePanel, clampSize, dockAllFloats, dockFloat, emptyLayout, frontPanel, locate, MAX_SAVED, moveGroupTo, movePanelTo, nameOf, normaliseLayout, placeToolsIn, placedIds, raiseFloat, renameFloatIn, renamePanelIn, sanitizeWorkspace, sanitizeWorkspaces, setFloatBox, ZONES, type DropTarget, type Layout, type Place, type ToolsPlace, type Workspace } from './dockModel';
import { createStore, readRaw, writeJson } from './mini';
import type { ToolGroup } from './toolArrange';
import { parseWorkspaceText, uniqueWorkspaceName, workspaceToText } from './workspaceFile';

export * from './dockModel';

export interface DockState {
  layout: Layout;
  /** True until the first sync after a fresh start, so the first layout is built from every panel, in order. */
  fresh?: boolean;
  workspaceId: string;
  user: Workspace[];
}

export const DOCK_KEY = 'frameling.dock.v1';
/** Saved state is version 2 from the top zone, floating windows, the movable tool rail and panel names. Version 1 loads as it was. */
const DOCK_VERSION = 2;

const isHelp = (p: PanelDef) => /help/.test(p.id);
const isColour = (p: PanelDef) => /colou?r|palette|swatch/.test(p.id);
const isLayers = (p: PanelDef) => /layer/.test(p.id);

/** Panels in their registered zones, in order, the first one (that isn't help) showing. */
function layoutFrom(panels: PanelDef[], place: (p: PanelDef) => DockZone, order: (a: PanelDef, b: PanelDef) => number = () => 0): Layout {
  const l = emptyLayout();
  const sorted = [...panels].sort((a, b) => (isHelp(a) ? 1 : 0) - (isHelp(b) ? 1 : 0) || order(a, b));
  for (const p of sorted) l.zones[place(p)].tabs.push(p.id);
  for (const z of ZONES) l.zones[z].active = l.zones[z].tabs[0] ?? null;
  l.known = panels.map((p) => p.id);
  return l;
}

/** The three layouts that come with the app. They're built from whatever panels are registered. */
export function builtinWorkspaces(panels: PanelDef[] = allPanels()): Workspace[] {
  const draw = layoutFrom(panels, (p) => p.zone);
  // Wide enough for Tool options, a named Colours tab and the +N button.
  draw.zones.right.size = 316;
  // Tall enough for the timeline buttons and two layer rows at the default window size.
  draw.zones.bottom.size = 260;

  // Animate: the timeline gets room, layers lead the right side.
  const animate = layoutFrom(panels, (p) => p.zone, (a, b) => (isLayers(b) ? 1 : 0) - (isLayers(a) ? 1 : 0));
  animate.zones.bottom.size = 330;
  animate.zones.right.size = 280;

  // Pixel: a big palette on the left where it's always in reach, the real-size Preview leading the right, and the
  // panels pixel art never needs tucked away (View > Panels still has them).
  const pixel = layoutFrom(panels, (p) => (isColour(p) ? 'left' : p.zone), (a, b) => (b.id === 'preview' ? 1 : 0) - (a.id === 'preview' ? 1 : 0));
  pixel.zones.left.size = 280;
  // The pixel palette leads the left side when there is one.
  if (pixel.zones.left.tabs.includes('palette')) {
    pixel.zones.left.tabs = ['palette', ...pixel.zones.left.tabs.filter((t) => t !== 'palette')];
    pixel.zones.left.active = 'palette';
  }
  for (const id of PIXEL_HIDDEN) {
    for (const z of ZONES) pixel.zones[z].tabs = pixel.zones[z].tabs.filter((t) => t !== id);
    if (panels.some((p) => p.id === id)) pixel.hidden.push(id);
  }
  for (const z of ZONES) if (!pixel.zones[z].tabs.includes(pixel.zones[z].active ?? '')) pixel.zones[z].active = pixel.zones[z].tabs[0] ?? null;
  pixel.zones.right.size = 264;
  pixel.zones.bottom.size = 260;

  return [
    { id: 'draw', name: 'Draw', builtin: true, about: 'Tools and colours close at hand, with a small timeline underneath.', layout: draw },
    { id: 'animate', name: 'Animate', builtin: true, about: 'A tall timeline across the bottom, with Layers leading the right side.', layout: animate },
    { id: 'pixel', name: 'Pixel', builtin: true, about: 'For pixel art: only the pixel tools, a big palette on the left and a real-size Preview.', layout: pixel, pixel: true, tools: { pixel: [...PIXEL_TOOLS] } },
  ];
}

/** The tools the Pixel workspace shows on a pixel layer, drawing tools first. Rig and vector-only tools are left out. */
export const PIXEL_TOOLS = ['pencil', 'brush', 'eraser', 'fill', 'shade', 'dither', 'line', 'rect', 'ellipse', 'polygon', 'star', 'pixel-select', 'eyedropper', 'hand', 'zoom'] as const;
/** Panels the Pixel workspace starts with closed. */
export const PIXEL_HIDDEN = ['rig', 'lipsync', 'text', 'particles', 'camera', 'symbol-props'] as const;

/**
 * The tools to show in the strip: the ones that work on this layer kind, narrowed and ordered by the workspace's own
 * list for that kind when it has one. Tools the list names that aren't registered are skipped.
 */
export function stripTools<T extends { id: string }>(usable: T[], kind: LayerKind | null, ws: Pick<Workspace, 'tools'> | undefined): T[] {
  const only = kind ? ws?.tools?.[kind] : undefined;
  if (!only) return usable;
  const byId = new Map(usable.map((t) => [t.id, t]));
  return only.map((id) => byId.get(id)).filter((t): t is T => !!t);
}

/** True when the current workspace is a pixel art one (the built-in Pixel, or one saved from it). */
export function inPixelWorkspace(): boolean {
  return !!currentWorkspace()?.pixel;
}

/**
 * Fixes a layout against the registered panels: drops ones that no longer exist, places new ones, and brings an older
 * saved layout (no top zone, no windows, no tool rail place) up to date.
 */
export function reconcile(layout: Layout, panels: PanelDef[] = allPanels()): Layout {
  const l = normaliseLayout(layout);
  const ids = new Set(panels.map((p) => p.id));
  for (const z of ZONES) {
    const zs = l.zones[z];
    zs.tabs = zs.tabs.filter((id) => ids.has(id));
    if (!zs.active || !zs.tabs.includes(zs.active)) zs.active = zs.tabs[0] ?? null;
  }
  for (const f of l.floats) {
    f.tabs = f.tabs.filter((id) => ids.has(id));
    if (!f.active || !f.tabs.includes(f.active)) f.active = f.tabs[0] ?? null;
  }
  l.floats = l.floats.filter((f) => f.tabs.length);
  const placed = new Set(placedIds(l));
  l.hidden = l.hidden.filter((id) => ids.has(id) && !placed.has(id));
  if (l.names) {
    for (const id of Object.keys(l.names)) if (!ids.has(id)) delete l.names[id];
    if (!Object.keys(l.names).length) delete l.names;
  }
  const known = new Set(l.known);
  for (const p of panels) {
    if (known.has(p.id) || placed.has(p.id) || l.hidden.includes(p.id)) continue;
    l.zones[p.zone].tabs.push(p.id);
    if (!l.zones[p.zone].active) l.zones[p.zone].active = p.id;
    known.add(p.id);
  }
  l.known = [...new Set([...known, ...panels.map((p) => p.id)])];
  return l;
}

function initial(): DockState {
  const saved = readRaw<Record<string, unknown> | null>(DOCK_KEY, null);
  const user = sanitizeWorkspaces(saved?.user);
  // Panels from other areas register after this file loads, so a first run waits for syncPanels() to build the layout.
  if (!saved?.layout || typeof saved.layout !== 'object') return { layout: emptyLayout(), workspaceId: 'draw', user, fresh: true };
  return { layout: normaliseLayout(saved.layout), workspaceId: typeof saved.workspaceId === 'string' ? saved.workspaceId : 'draw', user };
}

export const dock = createStore<DockState>(initial());

/** True while the panels are put away for room to draw (Hide all panels). Not kept: a new session starts with them back. */
export const panelsAway = createStore(false);
export const togglePanelsAway = (to?: boolean): void => panelsAway.set(to ?? !panelsAway.get());

function save(): void {
  writeJson(DOCK_KEY, { ...dock.get(), v: DOCK_VERSION });
}

function commit(next: DockState): void {
  dock.set(next);
  save();
}

function change(fn: (l: Layout) => void): void {
  const s = dock.get();
  const layout = clone(s.layout);
  fn(layout);
  commit({ ...s, layout });
}

/** Replaces the layout with what a pure function made of it. Nothing changes when it hands the same layout back. */
function apply(fn: (l: Layout) => Layout, persist = true): void {
  const s = dock.get();
  const layout = fn(s.layout);
  if (layout === s.layout) return;
  if (persist) commit({ ...s, layout });
  else dock.set({ ...s, layout });
}

/** Writes the layout out (after changes that were made without saving, like a window being dragged). */
export function flushDock(): void {
  save();
}

/** Call once everything has registered (and again if a panel registers later). */
export function syncPanels(): void {
  const s = dock.get();
  if (s.fresh) {
    const w = builtinWorkspaces().find((x) => x.id === s.workspaceId) ?? builtinWorkspaces()[0];
    commit({ ...s, fresh: false, layout: w.layout });
    return;
  }
  const layout = reconcile(s.layout);
  if (JSON.stringify(layout) !== JSON.stringify(s.layout)) commit({ ...s, layout });
}

// Where panels were when their feature was turned off, so they come back to the same place. Kept apart from the layout
// (and across restarts), because the layout forgets a panel that is not registered.
const PARKED_KEY = 'frameling.dock.parked.v1';
interface Parked {
  /** The zone it was in, or the window (with its box) when it floated. */
  zone?: DockZone;
  float?: { id: string; x: number; y: number; w: number; h: number };
  index?: number;
  /** It was the front tab there. */
  front?: boolean;
  /** The person had closed it. */
  hidden?: boolean;
}
const readParked = (): Record<string, Parked> => {
  const v = readRaw<unknown>(PARKED_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Parked>) : {};
};

/** Remembers where these panels are, just before their feature is turned off and they leave the layout. */
export function parkPanels(ids: string[]): void {
  const l = dock.get().layout;
  const parked = readParked();
  for (const id of ids) {
    const at = locate(l, id);
    if (at && 'zone' in at) parked[id] = { zone: at.zone, index: l.zones[at.zone].tabs.indexOf(id), front: l.zones[at.zone].active === id };
    else if (at) {
      const f = l.floats.find((x) => x.id === at.float)!;
      parked[id] = { float: { id: f.id, x: f.x, y: f.y, w: f.w, h: f.h }, index: f.tabs.indexOf(id), front: f.active === id };
    } else if (l.hidden.includes(id)) parked[id] = { hidden: true };
    else delete parked[id];
  }
  writeJson(PARKED_KEY, parked);
}

/**
 * Panels that came back (their feature was turned on) go where they were when it was turned off: the same zone or
 * window and place among its tabs, or closed if they were closed. Panels with no memory of a place are placed in their
 * home zone if this layout has never seen them, and otherwise stay closed.
 */
export function replacePanels(ids: string[]): void {
  const s = dock.get();
  const parked = readParked();
  const mine = ids.filter((id) => parked[id] && getPanel(id));
  if (!s.fresh && mine.length) {
    const made = new Map<string, string>();
    change((l) => {
      let next = l;
      for (const id of mine) {
        const p = parked[id];
        if (locate(next, id)) continue;
        if (p.hidden) {
          if (!next.hidden.includes(id)) next = { ...next, hidden: [...next.hidden, id], known: next.known.includes(id) ? next.known : [...next.known, id] };
          continue;
        }
        const before = p.zone ? next.zones[p.zone].active : null;
        if (p.zone) next = movePanelTo(next, id, { zone: p.zone, index: p.index }, screen());
        else if (p.float) {
          const have = made.get(p.float.id) ?? (next.floats.some((f) => f.id === p.float!.id) ? p.float.id : undefined);
          next = movePanelTo(next, id, have ? { float: have, index: p.index } : { newFloat: p.float }, screen());
          if (!have) made.set(p.float.id, next.floats[next.floats.length - 1].id);
        } else continue;
        // Joining a group does not take the front from the tab that was there.
        if (!p.front && p.zone && before && next.zones[p.zone].tabs.includes(before)) {
          next = clone(next);
          next.zones[p.zone].active = before;
        }
      }
      Object.assign(l, next);
    });
  }
  if (mine.length) {
    const left = readParked();
    for (const id of mine) delete left[id];
    writeJson(PARKED_KEY, left);
  }
  syncPanels();
}

/** Where a panel was made to go: its own zone, or the right side when it isn't registered. */
export const homeOf = (id: string): DockZone => getPanel(id)?.zone ?? 'right';

export function isVisible(id: string, l: Layout = dock.get().layout): boolean {
  return locate(l, id) !== null;
}

/** The zone a panel is docked in. Null when it is closed or in a floating window (see `placeOf`). */
export function zoneOf(id: string, l: Layout = dock.get().layout): DockZone | null {
  const at = locate(l, id);
  return at && 'zone' in at ? at.zone : null;
}

/** Where a panel is: a zone, a floating window, or null when it is closed. */
export function placeOf(id: string, l: Layout = dock.get().layout): Place | null {
  return locate(l, id);
}

/** What a panel is called now: the name the person gave it, else its own title. */
export function panelTitle(id: string, l: Layout = dock.get().layout): string {
  return nameOf(l, id, getPanel(id)?.title ?? id);
}

export function setActive(zone: DockZone, id: string): void {
  change((l) => {
    if (!l.zones[zone].tabs.includes(id)) return;
    l.zones[zone].active = id;
    l.zones[zone].collapsed = false;
  });
}

/** Makes a panel the front tab of a floating window and brings the window to the front. */
export function setFloatActive(floatId: string, id: string): void {
  apply((l) => {
    const at = locate(l, id);
    return at && 'float' in at && at.float === floatId ? frontPanel(l, id) : l;
  });
}

export function resizeZone(zone: DockZone, size: number): void {
  change((l) => void (l.zones[zone].size = clampSize(zone, size)));
}

export function toggleCollapsed(zone: DockZone, to?: boolean): void {
  change((l) => void (l.zones[zone].collapsed = to ?? !l.zones[zone].collapsed));
}

/** The screen's size, for keeping new windows on it (not known while testing). */
const screen = (): { w: number; h: number } | undefined => (typeof window !== 'undefined' && window.innerWidth > 0 ? { w: window.innerWidth, h: window.innerHeight } : undefined);

/** Puts a panel somewhere: a zone or window at a position, or a new window. Works for panels anywhere and for closed ones. */
export function placePanel(id: string, to: DropTarget): void {
  if (!getPanel(id)) return;
  apply((l) => movePanelTo(l, id, to, screen()));
}

/** Puts a panel in a zone at a position (the end by default). Works for panels in another zone and for hidden ones. */
export function movePanel(id: string, zone: DockZone, index?: number): void {
  placePanel(id, { zone, index });
}

/** Gives a panel a window of its own, near the middle of the screen unless told where. */
export function floatPanel(id: string, at?: { x: number; y: number }): void {
  const s = screen();
  const w = s?.w ?? 1200;
  const n = dock.get().layout.floats.length;
  placePanel(id, { newFloat: at ?? { x: Math.round(w / 2 - 190) + n * 28, y: 120 + n * 28 } });
}

/** Puts a window's whole group into a zone or another window. */
export function moveFloatTo(floatId: string, to: DropTarget): void {
  apply((l) => moveGroupTo(l, floatId, to));
}

/** Docks a window back: its panels return to the zones they were made for. */
export function dockFloatBack(floatId: string): void {
  apply((l) => dockFloat(l, floatId, homeOf));
}

export function dockEverythingBack(): void {
  apply((l) => dockAllFloats(l, homeOf));
}

/** Closes a window and its panels (they're in the panel list to bring back). */
export function closeFloatWindow(floatId: string): void {
  apply((l) => closeFloat(l, floatId));
}

export function raiseFloatWindow(floatId: string): void {
  apply((l) => raiseFloat(l, floatId), false);
}

/** Moves or resizes a window. `persist` false while it is being dragged (call flushDock() when it lets go). */
export function setFloatWindowBox(floatId: string, box: Parameters<typeof setFloatBox>[2], persist = false): void {
  apply((l) => setFloatBox(l, floatId, box), persist);
}

export function renamePanel(id: string, name: string): void {
  apply((l) => renamePanelIn(l, id, name));
}

export function renameFloat(floatId: string, name: string): void {
  apply((l) => renameFloatIn(l, floatId, name));
}

export function placeTools(place: ToolsPlace, at?: { x: number; y: number }, persist = true): void {
  apply((l) => placeToolsIn(l, place, at), persist);
}

/** Saves how the tool rail's tools are grouped (undefined goes back to the default arrangement). */
export function setToolGroups(groups: ToolGroup[] | undefined): void {
  apply((l) => {
    const { groups: _old, ...rest } = l.tools;
    return { ...l, tools: groups ? { ...rest, groups } : rest };
  });
}

export function hidePanel(id: string): void {
  apply((l) => closePanel(l, id));
}

export function showPanel(id: string): void {
  const p = getPanel(id);
  if (!p) return;
  const l = dock.get().layout;
  if (locate(l, id)) apply((x) => frontPanel(x, id));
  else movePanel(id, p.zone);
}

/** Opens a hidden panel, or closes a panel that's showing at the front. A panel hiding behind another tab comes forward. */
export function togglePanel(id: string): void {
  const l = dock.get().layout;
  const at = locate(l, id);
  if (!at) return showPanel(id);
  const front = 'zone' in at ? !l.zones[at.zone].collapsed && l.zones[at.zone].active === id : l.floats.find((f) => f.id === at.float)!.active === id;
  if (!front) return showPanel(id);
  hidePanel(id);
}

// ---------------------------------------------------------------- workspaces

export function listWorkspaces(): Workspace[] {
  return [...builtinWorkspaces(), ...dock.get().user];
}

export function currentWorkspace(): Workspace | undefined {
  const id = dock.get().workspaceId;
  return listWorkspaces().find((w) => w.id === id);
}

export function applyWorkspace(id: string): boolean {
  const w = listWorkspaces().find((x) => x.id === id);
  if (!w) return false;
  const s = dock.get();
  const layout = reconcile(w.layout);
  // The ones that come with the app only say where panels go: the person's own panel names and tool rail stay.
  if (w.builtin) {
    layout.tools = s.layout.tools;
    if (s.layout.names) layout.names = s.layout.names;
  }
  commit({ ...s, workspaceId: w.id, layout });
  return true;
}

/** Back to the current workspace as it was saved (or as it came with the app). */
export function resetLayout(): void {
  if (!applyWorkspace(dock.get().workspaceId)) applyWorkspace('draw');
}

let idSeq = 0;
const newWorkspaceId = () => `u-${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/** True when there is no room to save another workspace of your own. */
export const workspacesFull = (): boolean => dock.get().user.length >= MAX_SAVED;

/** Saves the layout as it is now under a name. Same name again replaces it. Null when the name is empty or you have the most you can keep. */
export function saveWorkspace(name: string): Workspace | null {
  const clean = cleanName(name);
  if (!clean) return null;
  const s = dock.get();
  const existing = s.user.find((w) => w.name.toLowerCase() === clean.toLowerCase());
  if (!existing && s.user.length >= MAX_SAVED) return null;
  // A layout saved from the Pixel workspace stays a pixel one (its tool list and pixel bar come along).
  const from = currentWorkspace();
  const ws: Workspace = { id: existing?.id ?? newWorkspaceId(), name: clean, ...(existing?.about ? { about: existing.about } : {}), layout: clone(s.layout), ...(from?.pixel ? { pixel: true } : {}), ...(from?.tools ? { tools: clone(from.tools) } : {}) };
  const user = existing ? s.user.map((w) => (w.id === ws.id ? ws : w)) : [...s.user, ws];
  commit({ ...s, user, workspaceId: ws.id });
  return ws;
}

export function deleteWorkspace(id: string): void {
  const s = dock.get();
  if (!s.user.some((w) => w.id === id)) return;
  commit({ ...s, user: s.user.filter((w) => w.id !== id), workspaceId: s.workspaceId === id ? 'draw' : s.workspaceId });
  if (s.workspaceId === id) applyWorkspace('draw');
}

export function renameWorkspace(id: string, name: string): void {
  const clean = cleanName(name);
  const s = dock.get();
  if (!clean) return;
  commit({ ...s, user: s.user.map((w) => (w.id === id ? { ...w, name: clean } : w)) });
}

/** Moves one of your own workspaces to a place in the list (0 is first). The ones that come with the app stay put. */
export function moveWorkspace(id: string, to: number): void {
  const s = dock.get();
  const from = s.user.findIndex((w) => w.id === id);
  if (from < 0) return;
  const at = Math.max(0, Math.min(to, s.user.length - 1));
  if (at === from) return;
  const user = [...s.user];
  const [w] = user.splice(from, 1);
  user.splice(at, 0, w);
  commit({ ...s, user });
}

/** A workspace as text to save to a file or copy. Any workspace in the list, or the layout as it is now when no id is given. */
export function workspaceText(id?: string): string | null {
  const w = id ? listWorkspaces().find((x) => x.id === id) : undefined;
  if (id && !w) return null;
  const from = currentWorkspace();
  const ws: Workspace = w ?? { id: 'now', name: from?.name ?? 'My workspace', layout: dock.get().layout, ...(from?.pixel ? { pixel: true } : {}), ...(from?.tools ? { tools: from.tools } : {}) };
  return workspaceToText({ ...ws, layout: reconcile(ws.layout) });
}

export type AddResult = { ok: true; workspace: Workspace } | { ok: false; error: string };

/** Adds a workspace from a file's text or pasted text to your own. It keeps the current layout until you switch to it. */
export function importWorkspace(text: string): AddResult {
  const r = parseWorkspaceText(text);
  if (!r.ok) return r;
  const s = dock.get();
  if (s.user.length >= MAX_SAVED) return { ok: false, error: `You already have ${MAX_SAVED} workspaces of your own. Delete one to make room.` };
  const taken = listWorkspaces().map((w) => w.name);
  const ws = sanitizeWorkspace({ ...r.workspace, id: newWorkspaceId(), name: uniqueWorkspaceName(r.workspace.name, taken) });
  if (!ws) return { ok: false, error: 'That workspace could not be added.' };
  commit({ ...s, user: [...s.user, ws] });
  return { ok: true, workspace: ws };
}

/** For tests. */
export function resetDock(): void {
  const draw = builtinWorkspaces().find((w) => w.id === 'draw')!;
  commit({ layout: draw.layout, workspaceId: 'draw', user: [], fresh: false });
  panelsAway.set(false);
}
