// The dock's pure model: the layout shape, tidying a saved layout (migrating old ones), and moving panels between the
// four zones and floating windows. No registry and no storage in here, so it can be tested alone. dock.ts keeps the
// live state and the workspaces; DockView.tsx and friends draw it.
import type { LayerKind } from '../core/format';
import type { DockZone } from '../core/registry';
import { sanitizeGroups, type ToolGroup } from './toolArrange';

export type { DockZone };

export interface ZoneState {
  tabs: string[];
  active: string | null;
  /** Width (left, right) or height (bottom, top) in px when open. */
  size: number;
  collapsed: boolean;
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
}

/** Where the tool rail is: one of the zones' edges, or floating. */
export type ToolsPlace = DockZone | 'float';

export interface Layout {
  zones: Record<DockZone, ZoneState>;
  floats: FloatWin[];
  /** The tool rail: where it is, and how its tools are grouped and ordered (missing = the default arrangement). */
  tools: { place: ToolsPlace; x: number; y: number; groups?: ToolGroup[] };
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
    l.zones[z] = { tabs, active: typeof s.active === 'string' && tabs.includes(s.active) ? s.active : (tabs[0] ?? null), size: clampSize(z, num(s.size, DEFAULT_SIZE[z])), collapsed: s.collapsed === true };
  }
  const usedIds = new Set<string>();
  for (const f of (Array.isArray(r.floats) ? r.floats : []).slice(0, MAX_FLOATS * 4)) {
    if (!isObj(f) || l.floats.length >= MAX_FLOATS) continue;
    const tabs = ids(f.tabs);
    if (!tabs.length) continue;
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
    });
  }
  l.hidden = ids(r.hidden);
  l.known = [...new Set((Array.isArray(r.known) ? r.known : []).filter(isId))].slice(0, 500);
  const t = isObj(r.tools) ? r.tools : {};
  l.tools = { place: (TOOLS_PLACES as unknown[]).includes(t.place) ? (t.place as ToolsPlace) : 'left', x: Math.round(num(t.x, 90)), y: Math.round(num(t.y, 110)) };
  const groups = sanitizeGroups(t.groups);
  if (groups) l.tools.groups = groups;
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

export type Place = { zone: DockZone } | { float: string };
/** Where a dragged panel can land: a zone or a floating window (at a tab position), or a window of its own. */
export type DropTarget = { zone: DockZone; index?: number } | { float: string; index?: number } | { newFloat: { x: number; y: number; w?: number; h?: number } };

export function locate(l: Layout, id: string): Place | null {
  for (const z of ZONES) if (l.zones[z].tabs.includes(id)) return { zone: z };
  const f = l.floats.find((x) => x.tabs.includes(id));
  return f ? { float: f.id } : null;
}

export const isPlaced = (l: Layout, id: string): boolean => locate(l, id) !== null;

/** Every panel that is on screen somewhere (in a zone or a window), hidden ones not counted. */
export function placedIds(l: Layout): string[] {
  return [...ZONES.flatMap((z) => l.zones[z].tabs), ...l.floats.flatMap((f) => f.tabs)];
}

/** The tabs of a zone or window. */
export function groupTabs(l: Layout, at: Place): string[] {
  return 'zone' in at ? l.zones[at.zone].tabs : (l.floats.find((f) => f.id === at.float)?.tabs ?? []);
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
  if (!from) return { next: l, from, at: -1 };
  const next = clone(l);
  let at = -1;
  const pull = (g: { tabs: string[]; active: string | null }) => {
    at = g.tabs.indexOf(id);
    g.tabs.splice(at, 1);
    // The tab beside it takes over when the front one leaves.
    if (g.active === id) g.active = g.tabs[Math.min(at, g.tabs.length - 1)] ?? null;
  };
  if ('zone' in from) pull(next.zones[from.zone]);
  else {
    const f = next.floats.find((x) => x.id === from.float)!;
    pull(f);
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

/** Moves a panel to a target and makes it the front tab there. Windows left empty close; a closed panel opens. */
export function movePanelTo(l: Layout, id: string, to: DropTarget, win?: { w: number; h: number }): Layout {
  const { next, from, at } = take(l, id);
  let index = 'index' in to ? to.index : undefined;
  // Dropped in the group it came from: removing it shifted everything after it left by one.
  const same = from && (('zone' in to && 'zone' in from && to.zone === from.zone) || ('float' in to && 'float' in from && to.float === from.float));
  if (same && index !== undefined && index > at) index -= 1;
  next.hidden = next.hidden.filter((x) => x !== id);
  if (!next.known.includes(id)) next.known.push(id);
  if ('zone' in to) {
    insert(next.zones[to.zone], id, index);
    next.zones[to.zone].collapsed = false;
    return next;
  }
  if ('float' in to) {
    const f = next.floats.find((x) => x.id === to.float);
    if (f) {
      insert(f, id, index);
      next.floats = [...next.floats.filter((x) => x !== f), f];
      return next;
    }
    // The window is gone (it only had this panel in it): give the panel a window of its own where it was.
    const old = l.floats.find((x) => x.id === to.float);
    next.floats.push({ id: to.float, tabs: [id], active: id, ...newBox(old ?? { x: 120, y: 120 }, win) });
    return next;
  }
  next.floats.push({ id: newFloatId(), tabs: [id], active: id, ...newBox(to.newFloat, win) });
  return next;
}

/** Puts a whole window's panels into a zone or another window (the window closes). */
export function moveGroupTo(l: Layout, floatId: string, to: DropTarget): Layout {
  const f = l.floats.find((x) => x.id === floatId);
  if (!f || 'newFloat' in to || ('float' in to && to.float === floatId)) return l;
  const next = clone(l);
  next.floats = next.floats.filter((x) => x.id !== floatId);
  if ('zone' in to) {
    const z = next.zones[to.zone];
    const at = to.index === undefined ? z.tabs.length : Math.max(0, Math.min(to.index, z.tabs.length));
    z.tabs.splice(at, 0, ...f.tabs);
    z.active = f.active ?? f.tabs[0];
    z.collapsed = false;
    return next;
  }
  const dest = next.floats.find((x) => x.id === to.float);
  if (!dest) return l;
  dest.tabs.splice(to.index === undefined ? dest.tabs.length : Math.max(0, Math.min(to.index, dest.tabs.length)), 0, ...f.tabs);
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
  const { next } = take(l, id);
  if (!next.hidden.includes(id)) next.hidden.push(id);
  return next;
}

/** Makes a panel the front tab of its place, opens a folded zone, brings a window to the front. Not placed: nothing happens. */
export function frontPanel(l: Layout, id: string): Layout {
  const at = locate(l, id);
  if (!at) return l;
  const next = clone(l);
  if ('zone' in at) {
    next.zones[at.zone].active = id;
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
  return { ...l, tools: { ...l.tools, place, x: at ? Math.round(at.x) : l.tools.x, y: at ? Math.round(at.y) : l.tools.y } };
}

// ---------------------------------------------------------------- what a drop would do

/** Words for what letting go would do, for the chip that follows the pointer. */
export function dropWords(t: DropTarget | null, zoneName: (z: DockZone) => string, floatName: (id: string) => string): string {
  if (!t) return '';
  if ('newFloat' in t) return 'new window';
  if ('zone' in t) return zoneName(t.zone);
  return `into ${floatName(t.float)}`;
}
