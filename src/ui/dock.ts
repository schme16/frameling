// The dock's live state: where every panel is (the left, right, bottom and top zones, or a floating window), how big
// each zone is, and the workspaces (saved layouts). The pure model is in dockModel.ts; the views are DockView.tsx,
// DockFloats.tsx and RightDock.tsx. This file is plain state so it can be tested.
import { allPanels, allTools, getPanel, type DockZone, type PanelDef } from '../core/registry';
import type { LayerKind } from '../core/format';
import { activeOfGroup, cleanName, clone, closeFloat, closePanel, clampSize, coveredBy, dockAllFloats, dockFloat, emptyLayout, evenSplit, frontPanel, groupTabs, isFront, joinAllGroups, joinGroupUp, locate, FLOAT_DEFAULT, MAX_SAVED, moveGroupTo, movePanelTo, nameOf, normaliseLayout, nudgeSplit, placeToolsIn, placedIds, raiseFloat, renameFloatIn, renamePanelIn, resizeBox, retainTabs, sanitizeWorkspace, sanitizeWorkspaces, setFloatBox, splitGroupsAt, stackPanels, ZONES, type DropTarget, type Layout, type Place, type ToolsPlace, type Workspace } from './dockModel';
import { createStore, readRaw, writeJson } from './mini';
import { BUILTIN_RAILS, resolveGroups, sanitizeGroups, type ToolGroup } from './toolArrange';
import { parseWorkspaceText, uniqueWorkspaceName, workspaceToText } from './workspaceFile';

export * from './dockModel';

export interface DockState {
  layout: Layout;
  /** True until the first sync after a fresh start, so the first layout is built from every panel, in order. */
  fresh?: boolean;
  workspaceId: string;
  user: Workspace[];
  /** What the person changed in each workspace's tool rail, by workspace id. A workspace missing here uses its own default. */
  rails?: Record<string, ToolGroup[]>;
}

export const DOCK_KEY = 'frameling.dock.v1';
/** Set once the person has been told their old tool arrangement moved to the workspace they were on. */
export const RAIL_NOTE_KEY = 'frameling.dock.railNote.v1';
/** The workspace a customised single arrangement moved to at start-up, until the person is told (see takeRailMigrationNote). */
let railMoved: string | null = null;
/** Saved state is version 2 from the top zone, floating windows, the movable tool rail and panel names. Version 1 loads as it was. */
const DOCK_VERSION = 2;

/** The saved per-workspace arrangements made safe. */
function sanitizeRails(raw: unknown): Record<string, ToolGroup[]> {
  const out: Record<string, ToolGroup[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw).slice(0, 64)) {
    const g = /^[\w-]{1,40}$/.test(id) && id !== '__proto__' ? sanitizeGroups(v) : undefined;
    if (g) out[id] = g;
  }
  return out;
}

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
  // Slices sit right after Preview and Tool options, not at the back of a long row of tabs.
  const right = pixel.zones.right.tabs;
  if (right.includes('slices')) {
    right.splice(right.indexOf('slices'), 1);
    right.splice(Math.min(right.length, (right.includes('tool-options') ? right.indexOf('tool-options') : 0) + 1), 0, 'slices');
  }
  pixel.zones.right.size = 264;
  pixel.zones.bottom.size = 260;

  return [
    { id: 'draw', name: 'Draw', builtin: true, about: 'Tools and colours close at hand, with a small timeline underneath.', layout: draw, rail: BUILTIN_RAILS.draw },
    { id: 'animate', name: 'Animate', builtin: true, about: 'A tall timeline across the bottom, with Layers leading the right side.', layout: animate, rail: BUILTIN_RAILS.animate },
    { id: 'pixel', name: 'Pixel', builtin: true, about: 'For pixel art: only the pixel tools, a big palette on the left and a real-size Preview.', layout: pixel, pixel: true, tools: { pixel: [...PIXEL_TOOLS] }, rail: BUILTIN_RAILS.pixel },
  ];
}

/** The tools the Pixel workspace shows on a pixel layer, drawing tools first. Rig and vector-only tools are left out. */
export const PIXEL_TOOLS = [
  'pencil', 'eraser', 'fill', 'shade', 'dither', 'spray', 'line', 'rect', 'ellipse', 'polygon', 'star',
  // Each way of picking is its own tool (src/select/ways.ts).
  'pixel-select', 'pixel-select-lasso', 'pixel-select-polygon', 'pixel-select-magnetic', 'pixel-select-wand',
  'eyedropper', 'hand', 'zoom',
] as const;
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
  for (const z of ZONES) retainTabs(l.zones[z], (id) => ids.has(id));
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
  const layout = normaliseLayout(saved.layout);
  const workspaceId = typeof saved.workspaceId === 'string' ? saved.workspaceId : 'draw';
  const rails = sanitizeRails(saved.rails);
  // Before each workspace had its own rail there was one arrangement, in the layout: it is now the person's own
  // arrangement for the workspace they are on.
  if (layout.tools.groups) {
    if (!rails[workspaceId]) {
      rails[workspaceId] = layout.tools.groups;
      railMoved = workspaceId;
    }
    delete layout.tools.groups;
  }
  return { layout, workspaceId, user, ...(Object.keys(rails).length ? { rails } : {}) };
}

export const dock = createStore<DockState>(initial());

/**
 * The name of the workspace that took over a tool arrangement the person had changed before each workspace had its own,
 * once, the first time it is asked after that update. Null when there is nothing to say, or it has been said.
 */
export function takeRailMigrationNote(): string | null {
  const id = railMoved;
  railMoved = null;
  if (!id) return null;
  if (readRaw<unknown>(RAIL_NOTE_KEY, null)) return null;
  writeJson(RAIL_NOTE_KEY, 'told');
  return listWorkspaces().find((w) => w.id === id)?.name ?? null;
}

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
// (and across restarts), because the layout forgets a panel that is not registered. Each workspace has its own places,
// so a panel never comes back into a layout it was not in.
const PARKED_KEY = 'frameling.dock.parked.v2';
const PARKED_OLD_KEY = 'frameling.dock.parked.v1';
interface Parked {
  /** The zone it was in, or the window (with its box) when it floated. */
  zone?: DockZone;
  /** Which stacked group of the zone (missing = the first). */
  group?: number;
  float?: { id: string; x: number; y: number; w: number; h: number };
  index?: number;
  /** It was the front tab there. */
  front?: boolean;
  /** The person had closed it. */
  hidden?: boolean;
}
type ParkedByWorkspace = Record<string, Record<string, Parked>>;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const readAllParked = (): ParkedByWorkspace => {
  const v = readRaw<unknown>(PARKED_KEY, null);
  if (isRecord(v)) return v as ParkedByWorkspace;
  // The first version kept one list for whichever workspace was open: it now belongs to the one that is open.
  const old = readRaw<unknown>(PARKED_OLD_KEY, null);
  if (!isRecord(old)) return {};
  try {
    localStorage.removeItem(PARKED_OLD_KEY);
  } catch {
    // Nothing to do.
  }
  return { [dock.get().workspaceId]: old as Record<string, Parked> };
};
const writeAllParked = (all: ParkedByWorkspace): void => {
  const kept = Object.fromEntries(Object.entries(all).filter(([, v]) => Object.keys(v).length));
  writeJson(PARKED_KEY, kept);
};

/** Where a panel is in a layout, as something that can be put back. Null when the layout does not hold it. */
function placeInLayout(l: Layout, id: string): Parked | null {
  const at = locate(l, id);
  if (at && 'zone' in at) return { zone: at.zone, ...(at.group ? { group: at.group } : {}), index: groupTabs(l, at).indexOf(id), front: activeOfGroup(l, at.zone, at.group) === id };
  if (at) {
    const f = l.floats.find((x) => x.id === at.float)!;
    return { float: { id: f.id, x: f.x, y: f.y, w: f.w, h: f.h }, index: f.tabs.indexOf(id), front: f.active === id };
  }
  return l.hidden.includes(id) ? { hidden: true } : null;
}

/** Remembers where these panels are, just before their feature is turned off and they leave the layout (this workspace's). */
export function parkPanels(ids: string[]): void {
  const s = dock.get();
  const all = readAllParked();
  const mine = { ...all[s.workspaceId] };
  for (const id of ids) {
    const at = placeInLayout(s.layout, id);
    if (at) mine[id] = at;
    else delete mine[id];
  }
  writeAllParked({ ...all, [s.workspaceId]: mine });
}

/** Panels a workspace's saved layout holds that nothing registers right now (their feature is off): their places are kept for it. */
function parkMissing(w: Workspace): void {
  const have = new Set(allPanels().map((p) => p.id));
  const gone = [...placedIds(w.layout), ...w.layout.hidden].filter((id) => !have.has(id));
  if (!gone.length) return;
  const all = readAllParked();
  const mine = { ...all[w.id] };
  for (const id of gone) if (!mine[id]) mine[id] = placeInLayout(w.layout, id) ?? { hidden: true };
  writeAllParked({ ...all, [w.id]: mine });
}

/**
 * Panels that came back (their feature was turned on) go where they were when it was turned off, in the workspace that
 * is open: the same zone or window and place among its tabs, or closed if they were closed. Panels with no memory of a
 * place are placed in their home zone if this layout has never seen them, and otherwise stay closed.
 */
export function replacePanels(ids: string[]): void {
  const s = dock.get();
  const all = readAllParked();
  const parked = all[s.workspaceId] ?? {};
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
        const before = p.zone ? activeOfGroup(next, p.zone, p.group) : null;
        if (p.zone) next = movePanelTo(next, id, { zone: p.zone, index: p.index, ...(p.group ? { group: p.group } : {}) }, screen());
        else if (p.float) {
          const have = made.get(p.float.id) ?? (next.floats.some((f) => f.id === p.float!.id) ? p.float.id : undefined);
          next = movePanelTo(next, id, have ? { float: have, index: p.index } : { newFloat: p.float }, screen());
          if (!have) made.set(p.float.id, next.floats[next.floats.length - 1].id);
        } else continue;
        // Joining a group does not take the front from the tab that was there.
        if (!p.front && p.zone && before && locate(next, before)) {
          const keep = next.zones[p.zone].collapsed;
          next = frontPanel(next, before);
          next.zones[p.zone].collapsed = keep;
        }
      }
      Object.assign(l, next);
    });
  }
  // Other workspaces are rebuilt from their own layouts when they are opened, so what they kept for these panels goes too.
  let changed = false;
  for (const list of Object.values(all)) {
    for (const id of ids) if (id in list) (delete list[id], (changed = true));
  }
  if (changed) writeAllParked(all);
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
  apply((l) => {
    const at = locate(l, id);
    return at && 'zone' in at && at.zone === zone ? frontPanel(l, id) : l;
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

/** Makes a window bigger or smaller by a step (negative = smaller) from the keyboard, kept on screen. */
export function resizeFloatBy(floatId: string, dw: number, dh: number): { w: number; h: number } | null {
  const f = dock.get().layout.floats.find((x) => x.id === floatId);
  if (!f) return null;
  const box = resizeBox(f, dw, dh, screen());
  apply((l) => setFloatBox(l, floatId, box));
  return box;
}

/** Puts a window back to the size new windows start with. */
export function resetFloatSize(floatId: string): { w: number; h: number } | null {
  const f = dock.get().layout.floats.find((x) => x.id === floatId);
  return f ? resizeFloatBy(floatId, FLOAT_DEFAULT.w - f.w, FLOAT_DEFAULT.h - f.h) : null;
}

/** The line between stacked groups moved (`first` is the first group's share of the zone). `persist` false while dragging; call flushDock() after. */
export function setGroupSplit(zone: DockZone, boundary: number, first: number, persist = true): void {
  apply((l) => splitGroupsAt(l, zone, boundary, first), persist);
}

export function nudgeGroupSplit(zone: DockZone, boundary: number, by: number): void {
  apply((l) => nudgeSplit(l, zone, boundary, by));
}

export function evenGroupSplit(zone: DockZone, boundary: number): void {
  apply((l) => evenSplit(l, zone, boundary));
}

/** A group joined into the one before it. */
export function joinGroup(zone: DockZone, group: number): void {
  apply((l) => joinGroupUp(l, zone, group));
}

/** Every group of a zone made one. */
export function joinGroups(zone: DockZone): void {
  apply((l) => joinAllGroups(l, zone));
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

/** The default tool rail arrangement of a workspace: what it brings, before the person changes anything (undefined = the standard one). */
export function defaultRailOf(s: Pick<DockState, 'user'>, workspaceId: string): ToolGroup[] | undefined {
  return BUILTIN_RAILS[workspaceId] ?? s.user.find((w) => w.id === workspaceId)?.rail;
}

/** The arrangement to use in the current workspace: the person's own for it, or what it brings. */
export function railOf(s: DockState): ToolGroup[] | undefined {
  return s.rails?.[s.workspaceId] ?? defaultRailOf(s, s.workspaceId);
}

/** Saves how the current workspace's tool rail is grouped (undefined, or what the workspace brings, goes back to its default). */
export function setToolGroups(groups: ToolGroup[] | undefined): void {
  const s = dock.get();
  const id = s.workspaceId;
  const rails = { ...s.rails };
  const tools = allTools();
  const same = groups && JSON.stringify(resolveGroups(groups, tools)) === JSON.stringify(resolveGroups(defaultRailOf(s, id), tools));
  if (groups && !same) rails[id] = groups;
  else delete rails[id];
  if (JSON.stringify(rails) === JSON.stringify(s.rails ?? {})) return;
  commit({ ...s, ...(Object.keys(rails).length ? { rails } : { rails: undefined }) });
}

/** Drops what the person changed in a workspace's tool rail, so it uses its own default again. */
export function resetToolGroups(): void {
  setToolGroups(undefined);
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

/**
 * Brings a panel forward only when that hides nothing the person chose to look at: a Properties section in front (or
 * the panel itself) is fine, Preview or Layers in front stays. A hidden panel or a folded zone stays as it is too.
 * Says what it left in front, or null when there is nothing to say.
 */
export function showPanelGently(id: string, isSect: (id: string) => boolean): string | null {
  const l = dock.get().layout;
  const at = locate(l, id);
  if (!at || ('zone' in at && l.zones[at.zone].collapsed)) return null;
  const front = coveredBy(l, id, isSect);
  if (front) return front;
  apply((x) => frontPanel(x, id));
  return null;
}

/** Puts one panel over another in a zone (each front of its own group), opening whichever was hidden. A missing panel: the other just comes to the front. */
export function stackPanelsIn(top: string, bottom: string, zone: DockZone = 'right', topShare = 0.4): void {
  if (!getPanel(top) || !getPanel(bottom)) return showPanel(getPanel(top) ? top : bottom);
  apply((l) => stackPanels(l, top, bottom, zone, topShare));
}

/** Opens a hidden panel, or closes a panel that's showing at the front. A panel hiding behind another tab comes forward. */
export function togglePanel(id: string): void {
  const l = dock.get().layout;
  const at = locate(l, id);
  if (!at) return showPanel(id);
  if (!isFront(l, id)) return showPanel(id);
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
  // Panels of a feature that is off are not in the reconciled layout: keep their places for when it comes back.
  parkMissing(w);
  const layout = reconcile(w.layout);
  // The ones that come with the app only say where panels go: the person's own panel names and where the tool rail sits
  // stay. Each workspace has its own tool arrangement (see railOf), so none is carried in the layout.
  if (w.builtin) {
    layout.tools = { ...s.layout.tools };
    if (s.layout.names) layout.names = s.layout.names;
  }
  delete layout.tools.groups;
  commit({ ...s, workspaceId: w.id, layout });
  return true;
}

/** Back to the current workspace as it was saved (or as it came with the app). */
export function resetLayout(): void {
  const id = dock.get().workspaceId;
  if (!applyWorkspace(id)) return void applyWorkspace('draw');
  // One of your own goes back to the arrangement it was saved with; the ones that come with the app keep yours, like the rail place.
  const s = dock.get();
  if (s.rails?.[id] && s.user.some((w) => w.id === id)) {
    const { [id]: _gone, ...rest } = s.rails;
    commit({ ...s, rails: Object.keys(rest).length ? rest : undefined });
  }
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
  // The tool arrangement as it is now (yours, or the one the workspace brings) becomes this workspace's default.
  const rail = railOf(s);
  const ws: Workspace = { id: existing?.id ?? newWorkspaceId(), name: clean, ...(existing?.about ? { about: existing.about } : {}), layout: clone(s.layout), ...(from?.pixel ? { pixel: true } : {}), ...(from?.tools ? { tools: clone(from.tools) } : {}), ...(rail ? { rail: clone(rail) } : {}) };
  const user = existing ? s.user.map((w) => (w.id === ws.id ? ws : w)) : [...s.user, ws];
  // A workspace saved again starts from what was just saved, so its own changes to the arrangement are folded in.
  const { [ws.id]: _folded, ...rails } = s.rails ?? {};
  commit({ ...s, user, workspaceId: ws.id, rails: Object.keys(rails).length ? rails : undefined });
  return ws;
}

export function deleteWorkspace(id: string): void {
  const s = dock.get();
  if (!s.user.some((w) => w.id === id)) return;
  const { [id]: _gone, ...rails } = s.rails ?? {};
  const parked = readAllParked();
  if (parked[id]) {
    delete parked[id];
    writeAllParked(parked);
  }
  commit({ ...s, user: s.user.filter((w) => w.id !== id), workspaceId: s.workspaceId === id ? 'draw' : s.workspaceId, rails: Object.keys(rails).length ? rails : undefined });
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
  // The tool arrangement goes along: yours for that workspace, or the one it brings.
  const s = dock.get();
  const rail = s.rails?.[id ?? s.workspaceId] ?? (w ?? from)?.rail;
  const { rail: _own, ...rest } = ws;
  return workspaceToText({ ...rest, ...(rail ? { rail } : {}), layout: reconcile(ws.layout) });
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
