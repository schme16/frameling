// Dock layout: which panels sit in the left, right and bottom zones, in what order, how big, and the workspaces
// (saved layouts). The view lives in Dock.tsx; this file is plain state so it can be tested.
import { allPanels, getPanel, type DockZone, type PanelDef } from '../core/registry';
import { createStore, readRaw, writeJson } from './mini';

export interface ZoneState {
  tabs: string[];
  active: string | null;
  /** Width (left, right) or height (bottom) in px when open. */
  size: number;
  collapsed: boolean;
}

export interface Layout {
  zones: Record<DockZone, ZoneState>;
  /** Panels the person closed. They stay out of the zones until they open them again. */
  hidden: string[];
  /** Every panel this layout has seen, so a panel added by a later version gets placed once. */
  known: string[];
}

export interface Workspace {
  id: string;
  name: string;
  builtin?: boolean;
  layout: Layout;
}

export interface DockState {
  layout: Layout;
  /** True until the first sync after a fresh start, so the first layout is built from every panel, in order. */
  fresh?: boolean;
  workspaceId: string;
  user: Workspace[];
}

export const ZONES: DockZone[] = ['left', 'right', 'bottom'];
export const DEFAULT_SIZE: Record<DockZone, number> = { left: 260, right: 316, bottom: 230 };
export const MIN_SIZE: Record<DockZone, number> = { left: 180, right: 200, bottom: 110 };
export const MAX_SIZE: Record<DockZone, number> = { left: 560, right: 640, bottom: 640 };
export const DOCK_KEY = 'frameling.dock.v1';

export const clampSize = (zone: DockZone, n: number): number => Math.max(MIN_SIZE[zone], Math.min(MAX_SIZE[zone], Math.round(n)));

const emptyZone = (zone: DockZone): ZoneState => ({ tabs: [], active: null, size: DEFAULT_SIZE[zone], collapsed: false });

function emptyLayout(): Layout {
  return { zones: { left: emptyZone('left'), right: emptyZone('right'), bottom: emptyZone('bottom') }, hidden: [], known: [] };
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

  // Pixel: colours sit on the left where the palette is always in reach.
  const pixel = layoutFrom(panels, (p) => (isColour(p) ? 'left' : p.zone));
  pixel.zones.left.size = 240;
  // The pixel palette leads the left side when there is one.
  if (pixel.zones.left.tabs.includes('palette')) {
    pixel.zones.left.tabs = ['palette', ...pixel.zones.left.tabs.filter((t) => t !== 'palette')];
    pixel.zones.left.active = 'palette';
  }
  pixel.zones.bottom.size = 260;

  return [
    { id: 'draw', name: 'Draw', builtin: true, layout: draw },
    { id: 'animate', name: 'Animate', builtin: true, layout: animate },
    { id: 'pixel', name: 'Pixel', builtin: true, layout: pixel },
  ];
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Fixes a layout against the registered panels: drops ones that no longer exist, places new ones. */
export function reconcile(layout: Layout, panels: PanelDef[] = allPanels()): Layout {
  const l = clone(layout);
  const ids = new Set(panels.map((p) => p.id));
  const placed = new Set<string>();
  for (const z of ZONES) {
    const zs = l.zones[z];
    zs.tabs = zs.tabs.filter((id) => ids.has(id) && !placed.has(id) && (placed.add(id), true));
    if (!zs.active || !zs.tabs.includes(zs.active)) zs.active = zs.tabs[0] ?? null;
  }
  l.hidden = l.hidden.filter((id) => ids.has(id) && !placed.has(id));
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
  const saved = readRaw<Partial<DockState> | null>(DOCK_KEY, null);
  const user = Array.isArray(saved?.user) ? saved!.user! : [];
  // Panels from other areas register after this file loads, so a first run waits for syncPanels() to build the layout.
  if (!saved?.layout) return { layout: emptyLayout(), workspaceId: 'draw', user, fresh: true };
  return { layout: saved.layout, workspaceId: saved.workspaceId ?? 'draw', user };
}

export const dock = createStore<DockState>(initial());

function commit(next: DockState): void {
  dock.set(next);
  writeJson(DOCK_KEY, next);
}

function change(fn: (l: Layout) => void): void {
  const s = dock.get();
  const layout = clone(s.layout);
  fn(layout);
  commit({ ...s, layout });
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

export function isVisible(id: string, l: Layout = dock.get().layout): boolean {
  return ZONES.some((z) => l.zones[z].tabs.includes(id));
}

export function zoneOf(id: string, l: Layout = dock.get().layout): DockZone | null {
  return ZONES.find((z) => l.zones[z].tabs.includes(id)) ?? null;
}

export function setActive(zone: DockZone, id: string): void {
  change((l) => {
    if (!l.zones[zone].tabs.includes(id)) return;
    l.zones[zone].active = id;
    l.zones[zone].collapsed = false;
  });
}

export function resizeZone(zone: DockZone, size: number): void {
  change((l) => void (l.zones[zone].size = clampSize(zone, size)));
}

export function toggleCollapsed(zone: DockZone, to?: boolean): void {
  change((l) => void (l.zones[zone].collapsed = to ?? !l.zones[zone].collapsed));
}

/** Puts a panel in a zone at a position (the end by default). Works for panels in another zone and for hidden ones. */
export function movePanel(id: string, zone: DockZone, index?: number): void {
  if (!getPanel(id)) return;
  change((l) => {
    for (const z of ZONES) {
      const zs = l.zones[z];
      const at = zs.tabs.indexOf(id);
      if (at >= 0) {
        zs.tabs.splice(at, 1);
        if (zs.active === id) zs.active = zs.tabs[Math.min(at, zs.tabs.length - 1)] ?? null;
        // Dropping onto a later slot in the same zone: removing it shifted everything left.
        if (z === zone && index !== undefined && index > at) index -= 1;
      }
    }
    l.hidden = l.hidden.filter((x) => x !== id);
    const dest = l.zones[zone];
    const i = index === undefined ? dest.tabs.length : Math.max(0, Math.min(index, dest.tabs.length));
    dest.tabs.splice(i, 0, id);
    dest.active = id;
    dest.collapsed = false;
    if (!l.known.includes(id)) l.known.push(id);
  });
}

export function hidePanel(id: string): void {
  change((l) => {
    for (const z of ZONES) {
      const zs = l.zones[z];
      const at = zs.tabs.indexOf(id);
      if (at < 0) continue;
      zs.tabs.splice(at, 1);
      if (zs.active === id) zs.active = zs.tabs[Math.min(at, zs.tabs.length - 1)] ?? null;
    }
    if (!l.hidden.includes(id)) l.hidden.push(id);
  });
}

export function showPanel(id: string): void {
  const p = getPanel(id);
  if (!p) return;
  const zone = zoneOf(id);
  if (zone) setActive(zone, id);
  else movePanel(id, p.zone);
}

/** Opens a hidden panel, or closes a panel that's showing at the front. A panel hiding behind another tab comes forward. */
export function togglePanel(id: string): void {
  const l = dock.get().layout;
  const z = zoneOf(id, l);
  if (!z) return showPanel(id);
  const zs = l.zones[z];
  if (zs.collapsed || zs.active !== id) return setActive(z, id);
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
  commit({ ...dock.get(), workspaceId: w.id, layout: reconcile(w.layout) });
  return true;
}

/** Back to the current workspace as it was saved (or as it came with the app). */
export function resetLayout(): void {
  if (!applyWorkspace(dock.get().workspaceId)) applyWorkspace('draw');
}

/** Saves the layout as it is now under a name. Same name again replaces it. */
export function saveWorkspace(name: string): Workspace | null {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const s = dock.get();
  const existing = s.user.find((w) => w.name.toLowerCase() === clean.toLowerCase());
  const ws: Workspace = { id: existing?.id ?? `u-${Date.now().toString(36)}`, name: clean, layout: clone(s.layout) };
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
  const clean = name.trim().slice(0, 40);
  const s = dock.get();
  if (!clean) return;
  commit({ ...s, user: s.user.map((w) => (w.id === id ? { ...w, name: clean } : w)) });
}

/** For tests. */
export function resetDock(): void {
  const draw = builtinWorkspaces().find((w) => w.id === 'draw')!;
  commit({ layout: draw.layout, workspaceId: 'draw', user: [], fresh: false });
}
