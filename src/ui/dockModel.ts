// The dock's pure model: the layout shape, tidying a saved layout (migrating old ones), and moving panels between the
// four zones and floating windows. No registry and no storage in here, so it can be tested alone. dock.ts keeps the
// live state and the workspaces; DockView.tsx and friends draw it.
import type { LayerKind } from '../core/format';
import type { DockZone } from '../core/registry';
import { cleanLocks, savedLocks, type Locks } from './dockLock';
import { sanitizeGroups, type ToolGroup } from './toolArrange';
import { cleanRailWidth } from './toolRailWidth';

export type { DockZone };

/** One group of tabs: a zone holds one, or several stacked. */
export interface DockGroup {
  tabs: string[];
  active: string | null;
}

export interface ZoneState {
  /** The first group's tabs (the top one on the left and right, the left one on the bottom and top). */
  tabs: string[];
  active: string | null;
  /** Width (left, right) or height (bottom, top) in px when open. */
  size: number;
  collapsed: boolean;
  /** More groups after the first, in order. Missing = the zone is one group (every layout from before stacks). */
  more?: DockGroup[];
  /** The share of the zone each group takes (first group, then `more`), adding up to 1. Missing = even. */
  shares?: number[];
}

/** A side, and optionally which group of it and where among its tabs, that a floated panel goes back to. */
export interface BackPlace {
  zone: DockZone;
  group?: number;
  index?: number;
}

/** A floating window: a group of tabs over the canvas. Later in `Layout.floats` means nearer the front. */
export interface FloatWin {
  id: string;
  /** A name the person gave the window (missing = it goes by its front panel). */
  name?: string;
  tabs: string[];
  active: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where each panel was docked before it floated, by panel id, so docking the window back puts it there (missing = where the panel was made to go). */
  back?: Record<string, BackPlace>;
}

/** Where the tool rail is: one of the zones' edges, or floating. */
export type ToolsPlace = DockZone | 'float';

export interface Layout {
  zones: Record<DockZone, ZoneState>;
  floats: FloatWin[];
  /**
   * The tool rail: where it is. `groups` is only read from older saves and files; the arrangement now belongs to the
   * workspace (`Workspace.rail`, and `rails` in the dock state for what the person changed). `home` is the side it was
   * last docked on, so a float dropped back goes there (missing = never docked since this was saved: the left).
   */
  tools: { place: ToolsPlace; x: number; y: number; groups?: ToolGroup[]; home?: DockZone };
  /** Panels the person closed. They stay out of the zones until they open them again. */
  hidden: string[];
  /** Every panel this layout has seen, so a panel added by a later version gets placed once. */
  known: string[];
  /** Names the person gave panels, by panel id (missing = the panel's own title). */
  names?: Record<string, string>;
}

export interface Workspace {
  id: string;
  name: string;
  builtin?: boolean;
  /** One line on what it is for (shown in the workspace list). */
  about?: string;
  layout: Layout;
  /** A pixel art workspace: the pixel bar over the canvas, export starting on a sprite sheet (missing = no). */
  pixel?: boolean;
  /** Tools the tool strip shows on each kind of layer, in this order (missing kind = every tool that works there). */
  tools?: Partial<Record<LayerKind, string[]>>;
  /** The tool rail's default arrangement for this workspace (missing = the standard one). Groups with no tools only set an order. */
  rail?: ToolGroup[];
  /** How wide the tool rail is for this workspace, in pixels (missing = its natural width). */
  railWidth?: number;
  /** What is locked in this workspace (missing = nothing): the tool rail and the panels stay where they are put. */
  locks?: { tools?: true; panels?: true };
}

export const ZONES: DockZone[] = ['left', 'right', 'bottom', 'top'];
export const TOOLS_PLACES: ToolsPlace[] = ['left', 'right', 'bottom', 'top', 'float'];
export const DEFAULT_SIZE: Record<DockZone, number> = { left: 260, right: 316, bottom: 230, top: 160 };
export const MIN_SIZE: Record<DockZone, number> = { left: 180, right: 200, bottom: 110, top: 80 };
export const MAX_SIZE: Record<DockZone, number> = { left: 560, right: 640, bottom: 640, top: 600 };
export const FLOAT_MIN = { w: 220, h: 140 };
export const FLOAT_DEFAULT = { w: 380, h: 320 };
export const MAX_SAVED = 12;
const MAX_TABS = 200;
const MAX_FLOATS = 12;
const MAX_NAME = 40;
/** The most tab groups one zone can hold. */
export const MAX_GROUPS = 4;
/** The smallest share of a zone a group can be squeezed to. */
export const MIN_SHARE = 0.12;

export const clampSize = (zone: DockZone, n: number): number => Math.max(MIN_SIZE[zone], Math.min(MAX_SIZE[zone], Math.round(n)));

export const emptyZone = (zone: DockZone): ZoneState => ({ tabs: [], active: null, size: DEFAULT_SIZE[zone], collapsed: false });

export function emptyLayout(): Layout {
  return { zones: { left: emptyZone('left'), right: emptyZone('right'), bottom: emptyZone('bottom'), top: emptyZone('top') }, floats: [], tools: { place: 'left', x: 90, y: 110 }, hidden: [], known: [] };
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---------------------------------------------------------------- tidying what was saved

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const ID = /^[\w.:/-]{1,80}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && !RESERVED.has(v) && !v.includes('..');

/** A name from outside made safe: no control characters, trimmed, not too long. */
export function cleanName(v: unknown, max = MAX_NAME): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Where a window's panels came from, from a saved layout: only for panels the window holds, each a zone and optionally a group and a place among its tabs. */
function cleanBack(v: unknown, tabs: string[]): { back?: Record<string, BackPlace> } {
  if (!isObj(v)) return {};
  const back: Record<string, BackPlace> = {};
  for (const id of tabs) {
    const b = Object.prototype.hasOwnProperty.call(v, id) ? v[id] : undefined;
    if (!isObj(b) || !(ZONES as unknown[]).includes(b.zone)) continue;
    const place: BackPlace = { zone: b.zone as DockZone };
    if (typeof b.group === 'number' && Number.isInteger(b.group) && b.group > 0 && b.group < MAX_GROUPS) place.group = b.group;
    if (typeof b.index === 'number' && Number.isInteger(b.index) && b.index >= 0 && b.index < MAX_TABS) place.index = b.index;
    back[id] = place;
  }
  return Object.keys(back).length ? { back } : {};
}

let floatSeq = 0;
const newFloatId = () => `fl${Date.now().toString(36)}${(floatSeq++).toString(36)}`;

/**
 * Anything that might be a layout (an old saved one, a hand-edited file, nothing at all) made into a good one: unknown
 * pieces dropped, each panel in one place only, every zone present (layouts from before the top zone and floating
 * windows read the same, with an empty top and no floats), numbers in range.
 */
export function normaliseLayout(raw: unknown): Layout {
  const r = isObj(raw) ? raw : {};
  const seen = new Set<string>();
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v : []).filter((x): x is string => isId(x) && !seen.has(x) && (seen.add(x), true)).slice(0, MAX_TABS);
  const zr = isObj(r.zones) ? r.zones : {};
  const l = emptyLayout();
  for (const z of ZONES) {
    const s = isObj(zr[z]) ? (zr[z] as Record<string, unknown>) : {};
    const tabs = ids(s.tabs);
    const zs: ZoneState = { tabs, active: typeof s.active === 'string' && tabs.includes(s.active) ? s.active : (tabs[0] ?? null), size: clampSize(z, num(s.size, DEFAULT_SIZE[z])), collapsed: s.collapsed === true };
    // Stacked groups (older saves have none): each tidied like the first, empty ones dropped, shares made to add up.
    const groups: DockGroup[] = [{ tabs: zs.tabs, active: zs.active }];
    for (const m of (Array.isArray(s.more) ? s.more : []).slice(0, MAX_GROUPS - 1)) {
      const g = isObj(m) ? m : {};
      const gt = ids(g.tabs);
      groups.push({ tabs: gt, active: typeof g.active === 'string' && gt.includes(g.active) ? g.active : (gt[0] ?? null) });
    }
    const raw = Array.isArray(s.shares) ? s.shares.slice(0, groups.length).map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)) : [];
    setGroups(zs, groups, raw.length === groups.length && raw.every((v) => v > 0) ? raw : evenShares(groups.length));
    l.zones[z] = zs;
  }
  const usedIds = new Set<string>();
  for (const f of (Array.isArray(r.floats) ? r.floats : []).slice(0, MAX_FLOATS * 4)) {
    if (!isObj(f)) continue;
    const tabs = ids(f.tabs);
    if (!tabs.length) continue;
    // Past the most windows, the panels join the last one rather than vanishing from every place.
    if (l.floats.length >= MAX_FLOATS) {
      l.floats[l.floats.length - 1].tabs.push(...tabs);
      continue;
    }
    let id = isId(f.id) && !usedIds.has(f.id) ? f.id : '';
    if (!id) do id = newFloatId(); while (usedIds.has(id));
    usedIds.add(id);
    const name = cleanName(f.name);
    l.floats.push({
      id,
      ...(name ? { name } : {}),
      tabs,
      active: typeof f.active === 'string' && tabs.includes(f.active) ? f.active : tabs[0],
      x: Math.round(num(f.x, 120)),
      y: Math.round(num(f.y, 120)),
      w: Math.max(FLOAT_MIN.w, Math.round(num(f.w, FLOAT_DEFAULT.w))),
      h: Math.max(FLOAT_MIN.h, Math.round(num(f.h, FLOAT_DEFAULT.h))),
      ...cleanBack(f.back, tabs),
    });
  }
  l.hidden = ids(r.hidden);
  l.known = [...new Set((Array.isArray(r.known) ? r.known : []).filter(isId))].slice(0, 500);
  const t = isObj(r.tools) ? r.tools : {};
  l.tools = { place: (TOOLS_PLACES as unknown[]).includes(t.place) ? (t.place as ToolsPlace) : 'left', x: Math.round(num(t.x, 90)), y: Math.round(num(t.y, 110)) };
  const groups = sanitizeGroups(t.groups);
  if (groups) l.tools.groups = groups;
  if ((ZONES as unknown[]).includes(t.home)) l.tools.home = t.home as DockZone;
  if (isObj(r.names)) {
    const names: Record<string, string> = {};
    for (const [id, n] of Object.entries(r.names).slice(0, 200)) {
      const c = cleanName(n);
      if (isId(id) && c) names[id] = c;
    }
    if (Object.keys(names).length) l.names = names;
  }
  return l;
}

/** A saved or shared workspace made safe, or null when it isn't one. `layout` is tidied but not checked against the panels. */
export function sanitizeWorkspace(raw: unknown): Workspace | null {
  if (!isObj(raw)) return null;
  const name = cleanName(raw.name);
  const id = typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : '';
  if (!name || !id) return null;
  const ws: Workspace = { id, name, layout: normaliseLayout(raw.layout) };
  // The arrangement used to live in the layout: an older save or file keeps it as this workspace's default.
  const rail = sanitizeGroups(raw.rail, true) ?? ws.layout.tools.groups;
  delete ws.layout.tools.groups;
  if (rail) ws.rail = rail;
  const railWidth = cleanRailWidth(raw.railWidth);
  if (railWidth) ws.railWidth = railWidth;
  const locks = savedLocks(cleanLocks(raw.locks, true));
  if (locks) ws.locks = locks;
  const about = cleanName(raw.about, 140);
  if (about) ws.about = about;
  if (raw.pixel === true) ws.pixel = true;
  if (isObj(raw.tools)) {
    const tools: Partial<Record<LayerKind, string[]>> = {};
    for (const k of ['vector', 'pixel', 'tilemap', 'camera'] as const) {
      const list = raw.tools[k];
      if (Array.isArray(list)) tools[k] = [...new Set(list.filter(isId))].slice(0, 80);
    }
    if (Object.keys(tools).length) ws.tools = tools;
  }
  return ws;
}

/** The saved workspaces out of storage: bad ones dropped, repeated ids dropped, at most MAX_SAVED. */
export function sanitizeWorkspaces(raw: unknown): Workspace[] {
  const out: Workspace[] = [];
  const seen = new Set<string>();
  for (const w of Array.isArray(raw) ? raw : []) {
    const s = sanitizeWorkspace(w);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out.slice(0, MAX_SAVED);
}

// ---------------------------------------------------------------- where things are

/** A panel's place: a zone (`group` is which of its stacked groups, missing for the first), or a floating window. */
export type Place = { zone: DockZone; group?: number } | { float: string };
/**
 * Where a dragged panel can land: a zone (in group `group`, the first when missing, at a tab position), or a floating
 * window, or a window of its own. `split` makes a new group before or after `group` for it instead of joining it.
 */
export type DropTarget = { zone: DockZone; index?: number; group?: number; split?: 'before' | 'after' } | { float: string; index?: number } | { newFloat: { x: number; y: number; w?: number; h?: number } };

// ---------------------------------------------------------------- stacked groups in a zone

export const evenShares = (n: number): number[] => Array.from({ length: n }, () => 1 / n);

/** Every group of a zone, first to last (the first group's arrays are the zone's own: copy before changing). */
export const groupsOf = (z: ZoneState): DockGroup[] => [{ tabs: z.tabs, active: z.active }, ...(z.more ?? [])];

/** How many groups a zone has (an empty zone counts as one). */
export const groupCount = (z: ZoneState): number => 1 + (z.more?.length ?? 0);

/** Every tab in a zone, group by group. */
export const zoneTabs = (z: ZoneState): string[] => groupsOf(z).flatMap((g) => g.tabs);

/** The share of the zone each group takes, adding up to 1. */
export function sharesOf(z: ZoneState): number[] {
  const n = groupCount(z);
  const s = z.shares;
  return s && s.length === n && s.every((v) => v > 0) ? s : evenShares(n);
}

/**
 * Writes groups back into a zone (in place). Empty groups go, so the zone never holds one; the rest take the room, in
 * the same proportions. `shares` runs along with `groups`. One group left means a plain zone again.
 */
export function setGroups(z: ZoneState, groups: DockGroup[], shares: number[]): void {
  const keep = groups.map((g, i) => ({ g, s: shares[i] ?? 1 / groups.length })).filter((x) => x.g.tabs.length);
  for (const x of keep) if (!x.g.active || !x.g.tabs.includes(x.g.active)) x.g.active = x.g.tabs[0];
  if (!keep.length) {
    z.tabs = [];
    z.active = null;
    delete z.more;
    delete z.shares;
    return;
  }
  z.tabs = keep[0].g.tabs;
  z.active = keep[0].g.active;
  if (keep.length === 1) {
    delete z.more;
    delete z.shares;
    return;
  }
  const total = keep.reduce((n, x) => n + x.s, 0);
  z.more = keep.slice(1).map((x) => ({ tabs: x.g.tabs, active: x.g.active }));
  z.shares = keep.map((x) => x.s / total);
}

/** The group index a place or target names, kept within the groups the zone has (missing = the first). */
const groupIndex = (z: ZoneState, group: number | undefined): number => Math.max(0, Math.min(group ?? 0, groupCount(z) - 1));

export function locate(l: Layout, id: string): Place | null {
  for (const z of ZONES) {
    const gs = groupsOf(l.zones[z]);
    const g = gs.findIndex((x) => x.tabs.includes(id));
    if (g >= 0) return g === 0 ? { zone: z } : { zone: z, group: g };
  }
  const f = l.floats.find((x) => x.tabs.includes(id));
  return f ? { float: f.id } : null;
}

/** The front tab of a group in a zone. */
export const activeOfGroup = (l: Layout, zone: DockZone, group = 0): string | null => groupsOf(l.zones[zone])[groupIndex(l.zones[zone], group)]?.active ?? null;

/** True when the panel is the front tab of its place and that place is open (a folded zone shows none). */
export function isFront(l: Layout, id: string): boolean {
  const at = locate(l, id);
  if (!at) return false;
  if ('zone' in at) return !l.zones[at.zone].collapsed && activeOfGroup(l, at.zone, at.group) === id;
  return l.floats.find((f) => f.id === at.float)?.active === id;
}

/**
 * What fronting a panel would cover: the panel now in front of its place when that is something other than a
 * Properties section (so Preview, Layers and the like). Null when nothing is lost: it is the front one already, a
 * section is in front, or it is not on screen (hidden, or its zone is folded, which fronting would undo).
 */
export function coveredBy(l: Layout, id: string, isSect: (id: string) => boolean): string | null {
  const at = locate(l, id);
  if (!at) return null;
  const front = 'zone' in at ? (l.zones[at.zone].collapsed ? null : activeOfGroup(l, at.zone, at.group)) : (l.floats.find((f) => f.id === at.float)?.active ?? null);
  return front && front !== id && !isSect(front) ? front : null;
}

/** Drops the tabs `keep` says no to from every group of a zone, fixing each group's front tab. Empty groups go. */
export function retainTabs(z: ZoneState, keep: (id: string) => boolean): void {
  const sh = sharesOf(z);
  const gs = groupsOf(z).map((g) => ({ tabs: g.tabs.filter(keep), active: g.active }));
  setGroups(z, gs, sh);
}

export const isPlaced = (l: Layout, id: string): boolean => locate(l, id) !== null;

/** Every panel that is on screen somewhere (in a zone or a window), hidden ones not counted. */
export function placedIds(l: Layout): string[] {
  return [...ZONES.flatMap((z) => zoneTabs(l.zones[z])), ...l.floats.flatMap((f) => f.tabs)];
}

/** The tabs of a zone or window. */
export function groupTabs(l: Layout, at: Place): string[] {
  return 'zone' in at ? (groupsOf(l.zones[at.zone])[groupIndex(l.zones[at.zone], at.group)]?.tabs ?? []) : (l.floats.find((f) => f.id === at.float)?.tabs ?? []);
}

/** What a panel is called: the name the person gave it, else its own title. */
export const nameOf = (l: Layout, id: string, title: string): string => l.names?.[id] ?? title;

/** What a window is called: its own name, else its front panel (and "and n more" when there are several). */
export function floatTitle(l: Layout, f: FloatWin, titleOf: (id: string) => string): string {
  if (f.name) return f.name;
  const front = nameOf(l, f.active ?? f.tabs[0], titleOf(f.active ?? f.tabs[0]));
  return f.tabs.length > 1 ? `${front} and ${f.tabs.length - 1} more` : front;
}

// ---------------------------------------------------------------- moving

/** Takes the panel out of wherever it is (empty windows close). Returns the same layout when it wasn't placed. */
function take(l: Layout, id: string): { next: Layout; from: Place | null; at: number } {
  const from = locate(l, id);
  // A copy even when the panel isn't placed (a hidden one being brought back): the callers change `next`, and the
  // layout in the store must stay untouched so the change is seen.
  if (!from) return { next: clone(l), from, at: -1 };
  const next = clone(l);
  let at = -1;
  const pull = (g: { tabs: string[]; active: string | null }) => {
    at = g.tabs.indexOf(id);
    g.tabs.splice(at, 1);
    // The tab beside it takes over when the front one leaves.
    if (g.active === id) g.active = g.tabs[Math.min(at, g.tabs.length - 1)] ?? null;
  };
  if ('zone' in from) {
    const z = next.zones[from.zone];
    const gs = groupsOf(z).map((g) => ({ tabs: [...g.tabs], active: g.active }));
    pull(gs[from.group ?? 0]);
    setGroups(z, gs, sharesOf(z));
  } else {
    const f = next.floats.find((x) => x.id === from.float)!;
    pull(f);
    if (f.back) {
      delete f.back[id];
      if (!Object.keys(f.back).length) delete f.back;
    }
    if (!f.tabs.length) next.floats = next.floats.filter((x) => x !== f);
  }
  return { next, from, at };
}

const insert = (g: { tabs: string[]; active: string | null }, id: string, index: number | undefined) => {
  g.tabs.splice(index === undefined ? g.tabs.length : Math.max(0, Math.min(index, g.tabs.length)), 0, id);
  g.active = id;
};

/** A box for a new window with its top-left at (x, y), kept on screen when the screen size is known. */
export function newBox(at: { x: number; y: number; w?: number; h?: number }, win?: { w: number; h: number }): Pick<FloatWin, 'x' | 'y' | 'w' | 'h'> {
  const w = Math.max(FLOAT_MIN.w, Math.round(at.w ?? FLOAT_DEFAULT.w));
  const h = Math.max(FLOAT_MIN.h, Math.round(at.h ?? FLOAT_DEFAULT.h));
  return win ? clampBox({ x: at.x, y: at.y, w, h }, win) : { x: Math.round(at.x), y: Math.round(at.y), w, h };
}

/**
 * A window box kept inside the screen: never wider or taller than it, and at least a strip of the title bar reachable.
 * Saved layouts hold pixel positions, so one from a bigger screen still opens on a smaller one.
 */
export function clampBox(b: { x: number; y: number; w: number; h: number }, win: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const w = Math.max(FLOAT_MIN.w, Math.min(Math.round(b.w), win.w));
  const h = Math.max(FLOAT_MIN.h, Math.min(Math.round(b.h), win.h));
  return { w, h, x: Math.max(0, Math.min(Math.round(b.x), win.w - Math.min(w, 120))), y: Math.max(0, Math.min(Math.round(b.y), win.h - 36)) };
}

/**
 * Puts panels into a zone's group (or a new group beside it), after they were taken out of wherever they were. `anchor` is
 * a tab that was in the target group before anything moved, so the group is still found when a group before it went away.
 */
function dropInZone(next: Layout, zone: DockZone, anchor: string | undefined, to: { index?: number; split?: 'before' | 'after' }, ids: string[], active: string): void {
  const z = next.zones[zone];
  const gs = groupsOf(z).map((g) => ({ tabs: [...g.tabs], active: g.active }));
  const sh = sharesOf(z);
  const found = anchor ? gs.findIndex((g) => g.tabs.includes(anchor)) : -1;
  const gi = found >= 0 ? found : 0;
  if (to.split && gs.length < MAX_GROUPS && gs[gi].tabs.length) {
    const at = to.split === 'before' ? gi : gi + 1;
    gs.splice(at, 0, { tabs: [...ids], active });
    // The new group takes half of the room the one beside it had.
    const half = sh[gi] / 2;
    sh[gi] = half;
    sh.splice(at, 0, half);
  } else {
    const g = gs[gi];
    g.tabs.splice(to.index === undefined ? g.tabs.length : Math.max(0, Math.min(to.index, g.tabs.length)), 0, ...ids);
    g.active = active;
  }
  setGroups(z, gs, sh);
  z.collapsed = false;
}

/** A tab of the group a drop names, other than the ones in `not`: what finds that group again after panels move. */
function anchorOf(l: Layout, zone: DockZone, group: number | undefined, not: string[]): string | undefined {
  const z = l.zones[zone];
  return groupsOf(z)[groupIndex(z, group)]?.tabs.find((t) => !not.includes(t));
}

/** Adds a window. Past the most windows there can be, the panel joins the front-most one instead (a saved layout holds no more). */
function withNewFloat(next: Layout, f: FloatWin): Layout {
  const last = next.floats[next.floats.length - 1];
  if (next.floats.length >= MAX_FLOATS && last) {
    insert(last, f.tabs[0], undefined);
    return next;
  }
  next.floats.push(f);
  return next;
}

/** The side, group and place a panel is leaving (or, from one window to another, the one it already remembered). */
function backOf(l: Layout, id: string, from: Place | null, at: number): BackPlace | undefined {
  if (from && 'zone' in from) return { zone: from.zone, ...(from.group ? { group: from.group } : {}), index: at };
  return from && 'float' in from ? l.floats.find((x) => x.id === from.float)?.back?.[id] : undefined;
}

/** Moves a panel to a target and makes it the front tab there. Windows left empty close; a closed panel opens. */
export function movePanelTo(l: Layout, id: string, to: DropTarget, win?: { w: number; h: number }): Layout {
  const from = locate(l, id);
  // A zone drop names a group by position: find it by a tab that stays, since taking the panel out can remove a group.
  const anchor = 'zone' in to ? anchorOf(l, to.zone, to.group, [id]) : undefined;
  if ('zone' in to && !anchor) {
    // The group holds nothing but this panel: dropping it on itself changes nothing (a folded zone opens).
    if (from && 'zone' in from && from.zone === to.zone && (from.group ?? 0) === groupIndex(l.zones[to.zone], to.group)) {
      if (!l.zones[to.zone].collapsed) return l;
      const open = clone(l);
      open.zones[to.zone].collapsed = false;
      return open;
    }
  }
  const { next, at } = take(l, id);
  let index = 'index' in to ? to.index : undefined;
  // Dropped in the group it came from: removing it shifted everything after it left by one.
  const same = from && (('zone' in to && 'zone' in from && to.zone === from.zone && groupIndex(l.zones[to.zone], to.group) === (from.group ?? 0)) || ('float' in to && 'float' in from && to.float === from.float));
  if (same && index !== undefined && index > at) index -= 1;
  next.hidden = next.hidden.filter((x) => x !== id);
  if (!next.known.includes(id)) next.known.push(id);
  if ('zone' in to) {
    dropInZone(next, to.zone, anchor, { index, split: to.split }, [id], id);
    return next;
  }
  if ('float' in to) {
    const f = next.floats.find((x) => x.id === to.float);
    if (f) {
      insert(f, id, index);
      const back = backOf(l, id, from, at);
      if (back) f.back = { ...f.back, [id]: back };
      next.floats = [...next.floats.filter((x) => x !== f), f];
      return next;
    }
    // The window is gone (it only had this panel in it): give the panel a window of its own where it was.
    const old = l.floats.find((x) => x.id === to.float);
    const back = backOf(l, id, from, at);
    return withNewFloat(next, { id: to.float, tabs: [id], active: id, ...newBox(old ?? { x: 120, y: 120 }, win), ...(back ? { back: { [id]: back } } : {}) });
  }
  const back = backOf(l, id, from, at);
  return withNewFloat(next, { id: newFloatId(), tabs: [id], active: id, ...newBox(to.newFloat, win), ...(back ? { back: { [id]: back } } : {}) });
}

/** Puts a whole window's panels into a zone or another window (the window closes). */
export function moveGroupTo(l: Layout, floatId: string, to: DropTarget): Layout {
  const f = l.floats.find((x) => x.id === floatId);
  if (!f || 'newFloat' in to || ('float' in to && to.float === floatId)) return l;
  const next = clone(l);
  next.floats = next.floats.filter((x) => x.id !== floatId);
  if ('zone' in to) {
    dropInZone(next, to.zone, anchorOf(l, to.zone, to.group, []), { index: to.index, split: to.split }, f.tabs, f.active ?? f.tabs[0]);
    return next;
  }
  const dest = next.floats.find((x) => x.id === to.float);
  if (!dest) return l;
  dest.tabs.splice(to.index === undefined ? dest.tabs.length : Math.max(0, Math.min(to.index, dest.tabs.length)), 0, ...f.tabs);
  if (f.back) dest.back = { ...dest.back, ...f.back };
  dest.active = f.active ?? f.tabs[0];
  next.floats = [...next.floats.filter((x) => x !== dest), dest];
  return next;
}

/** A window closed by docking: its panels go back to the zones they were made for. */
export function dockFloat(l: Layout, floatId: string, home: (id: string) => DockZone): Layout {
  const f = l.floats.find((x) => x.id === floatId);
  if (!f) return l;
  const next = clone(l);
  next.floats = next.floats.filter((x) => x.id !== floatId);
  for (const id of f.tabs) {
    const b = f.back?.[id];
    if (b) {
      // It remembers where this panel came from: back to that side, group and place.
      const z = next.zones[b.zone];
      const group = groupsOf(z)[groupIndex(z, b.group)];
      dropInZone(next, b.zone, anchorOf(next, b.zone, b.group, []), { index: b.index }, [id], id === f.active ? id : (group?.active ?? id));
      continue;
    }
    const z = next.zones[home(id)];
    z.tabs.push(id);
    if (id === f.active || !z.active) z.active = id;
    z.collapsed = false;
  }
  return next;
}

export const dockAllFloats = (l: Layout, home: (id: string) => DockZone): Layout => l.floats.reduce((acc, f) => dockFloat(acc, f.id, home), l);

/** A window closed with its panels: they go to the closed list and come back from the panel list. */
export function closeFloat(l: Layout, floatId: string): Layout {
  const f = l.floats.find((x) => x.id === floatId);
  if (!f) return l;
  const next = clone(l);
  next.floats = next.floats.filter((x) => x.id !== floatId);
  for (const id of f.tabs) if (!next.hidden.includes(id)) next.hidden.push(id);
  return next;
}

/** Closes a panel (it stays in `known`, so it doesn't come back by itself). */
export function closePanel(l: Layout, id: string): Layout {
  if (!locate(l, id) && l.hidden.includes(id)) return l;
  const { next } = take(l, id);
  if (!next.hidden.includes(id)) next.hidden.push(id);
  return next;
}

/** Makes a tab the front one of a group (in place). */
function setGroupActive(z: ZoneState, group: number, id: string): void {
  if (group === 0) z.active = id;
  else if (z.more?.[group - 1]) z.more[group - 1].active = id;
}

/** Makes a panel the front tab of its place, opens a folded zone, brings a window to the front. Not placed: nothing happens. */
export function frontPanel(l: Layout, id: string): Layout {
  const at = locate(l, id);
  if (!at) return l;
  const next = clone(l);
  if ('zone' in at) {
    setGroupActive(next.zones[at.zone], at.group ?? 0, id);
    next.zones[at.zone].collapsed = false;
  } else {
    const f = next.floats.find((x) => x.id === at.float)!;
    f.active = id;
    next.floats = [...next.floats.filter((x) => x !== f), f];
  }
  return next;
}

/** Brings a window to the front (cheap: only the order of the windows changes). */
export function raiseFloat(l: Layout, floatId: string): Layout {
  const i = l.floats.findIndex((f) => f.id === floatId);
  if (i < 0 || i === l.floats.length - 1) return l;
  return { ...l, floats: [...l.floats.filter((_, j) => j !== i), l.floats[i]] };
}

/** A window's box changed (moved or resized). Only that window is replaced. */
export function setFloatBox(l: Layout, floatId: string, box: Partial<Pick<FloatWin, 'x' | 'y' | 'w' | 'h'>>): Layout {
  return { ...l, floats: l.floats.map((f) => (f.id === floatId ? { ...f, ...box } : f)) };
}

/** Moves the line between group `boundary` and the next so the first takes `first` of the zone (kept so neither gets too small). */
export function splitGroupsAt(l: Layout, zone: DockZone, boundary: number, first: number): Layout {
  const z = l.zones[zone];
  const sh = sharesOf(z);
  if (boundary < 0 || boundary >= sh.length - 1) return l;
  const pair = sh[boundary] + sh[boundary + 1];
  // Two groups that already share less than twice the least get half each at worst (never a group with nothing).
  const least = Math.min(MIN_SHARE, pair / 2);
  const to = Math.max(least, Math.min(pair - least, first));
  if (Math.abs(to - sh[boundary]) < 1e-6 && z.shares) return l;
  const next = clone(l);
  const out = [...sh];
  out[boundary] = to;
  out[boundary + 1] = pair - to;
  next.zones[zone].shares = out;
  return next;
}

/** The first group's share of a zone once the line after it has been moved by `by` (a fraction of the zone). */
export function nudgeSplit(l: Layout, zone: DockZone, boundary: number, by: number): Layout {
  return splitGroupsAt(l, zone, boundary, (sharesOf(l.zones[zone])[boundary] ?? 0) + by);
}

/** The line between two groups goes back to even (the two share what they had between them). */
export function evenSplit(l: Layout, zone: DockZone, boundary: number): Layout {
  const sh = sharesOf(l.zones[zone]);
  return splitGroupsAt(l, zone, boundary, ((sh[boundary] ?? 0) + (sh[boundary + 1] ?? 0)) / 2);
}

/**
 * Two panels one over the other in a zone: `top` in a group of its own above the group `bottom` is the front tab of.
 * `topShare` is how much of the zone the top group takes. Works whatever places the panels were in (or none).
 */
export function stackPanels(l: Layout, top: string, bottom: string, zone: DockZone, topShare = 0.4): Layout {
  const was = locate(l, bottom);
  let next = was && 'zone' in was && was.zone === zone ? frontPanel(l, bottom) : movePanelTo(l, bottom, { zone });
  const at = locate(next, bottom);
  if (!at || !('zone' in at)) return next;
  next = movePanelTo(next, top, { zone, group: at.group ?? 0, split: 'before' });
  const z = next.zones[zone];
  const gi = groupsOf(z).findIndex((g) => g.tabs.includes(top));
  if (gi < 0 || groupsOf(z)[gi].tabs.length > 1 || gi + 1 >= groupCount(z)) return next;
  return splitGroupsAt(next, zone, gi, topShare);
}

/** A group joined into the one before it (its tabs go on the end). Nothing happens for the first group. */
export function joinGroupUp(l: Layout, zone: DockZone, group: number): Layout {
  const z = l.zones[zone];
  if (group < 1 || group >= groupCount(z)) return l;
  const next = clone(l);
  const nz = next.zones[zone];
  const gs = groupsOf(nz);
  const sh = sharesOf(nz);
  gs[group - 1].tabs.push(...gs[group].tabs);
  sh[group - 1] += sh[group];
  gs[group].tabs = [];
  setGroups(nz, gs, sh);
  return next;
}

/** Every group of a zone made one (tabs in order). */
export function joinAllGroups(l: Layout, zone: DockZone): Layout {
  const z = l.zones[zone];
  if (groupCount(z) < 2) return l;
  const next = clone(l);
  const nz = next.zones[zone];
  nz.tabs = zoneTabs(nz);
  delete nz.more;
  delete nz.shares;
  return next;
}

/** A window box changed by a step from the keyboard: bigger or smaller (top left stays put), never below the least or off the screen. */
export function resizeBox(b: { x: number; y: number; w: number; h: number }, dw: number, dh: number, win?: { w: number; h: number }): { w: number; h: number } {
  const maxW = win ? Math.max(FLOAT_MIN.w, win.w - Math.max(0, b.x)) : Infinity;
  const maxH = win ? Math.max(FLOAT_MIN.h, win.h - Math.max(0, b.y)) : Infinity;
  return { w: Math.round(Math.max(FLOAT_MIN.w, Math.min(maxW, b.w + dw))), h: Math.round(Math.max(FLOAT_MIN.h, Math.min(maxH, b.h + dh))) };
}

/** Names a panel (empty = back to its own title). */
export function renamePanelIn(l: Layout, id: string, name: string): Layout {
  const clean = cleanName(name);
  const names = { ...(l.names ?? {}) };
  if (clean) names[id] = clean;
  else delete names[id];
  const { names: _old, ...rest } = l;
  return Object.keys(names).length ? { ...rest, names } : rest;
}

/** Names a window (empty = it goes by its front panel). */
export function renameFloatIn(l: Layout, floatId: string, name: string): Layout {
  const clean = cleanName(name);
  return {
    ...l,
    floats: l.floats.map((f) => {
      if (f.id !== floatId) return f;
      const { name: _old, ...rest } = f;
      return clean ? { ...rest, name: clean } : rest;
    }),
  };
}

/** The tool rail moved to a zone's edge or floated (at a position, when given). */
export function placeToolsIn(l: Layout, place: ToolsPlace, at?: { x: number; y: number }): Layout {
  // A side it sits on is the side it comes home to; floating leaves that as it was.
  const home = place === 'float' ? l.tools.home ?? (l.tools.place === 'float' ? undefined : l.tools.place) : place;
  return { ...l, tools: { ...l.tools, place, x: at ? Math.round(at.x) : l.tools.x, y: at ? Math.round(at.y) : l.tools.y, ...(home ? { home } : {}) } };
}

/** The side the tool rail goes back to: where it was last docked (the left when it has never been). */
export const toolsHome = (l: Layout): DockZone => l.tools.home ?? (l.tools.place === 'float' ? 'left' : l.tools.place);

// ---------------------------------------------------------------- what a drop would do

/** Words for what letting go would do, for the chip that follows the pointer. */
export function dropWords(t: DropTarget | null, zoneName: (z: DockZone) => string, floatName: (id: string) => string): string {
  if (!t) return '';
  if ('newFloat' in t) return 'new window';
  if ('zone' in t) return zoneName(t.zone);
  return `into ${floatName(t.float)}`;
}
