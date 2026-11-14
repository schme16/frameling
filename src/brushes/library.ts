// The brush library as the picker shows it: groups, favourites, recent, search and the keyboard order. Pure functions,
// no DOM, so the rules can be tested without drawing anything.
import type { BrushPreset } from './model';

export const MY_GROUP = 'My brushes';
export const STARTERS_GROUP = 'Starters';
/** Names a group of your own can't have: they are the picker's own sections. */
const RESERVED = ['favourites', 'recent', 'all brushes'];
export const MAX_GROUP = 40;
/** With this many brushes or fewer the picker is a plain list: no search, no groups. */
export const SMALL_LIBRARY = 8;
/** Brushes remembered as recent, and how many of them the Recent section shows. */
export const RECENT_KEPT = 8;
export const RECENT_SHOWN = 5;
const MAX_IDS = 2000;

/** A group name as it is kept: spaces tidied, cut to length. Empty (undefined) when it is nothing, or is "My brushes" or a section name. */
export function cleanGroup(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const g = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP).trim();
  if (!g) return undefined;
  const low = g.toLowerCase();
  if (low === MY_GROUP.toLowerCase() || low === STARTERS_GROUP.toLowerCase() || RESERVED.includes(low)) return undefined;
  return g;
}

/** The group a brush sits in: the starters have theirs, brushes saved before groups existed land in "My brushes". */
export const groupOf = (p: BrushPreset): string => (p.builtin ? STARTERS_GROUP : p.group || MY_GROUP);

/** The names of the groups of your own in use, for suggesting one when you save. */
export function groupNames(all: readonly BrushPreset[]): string[] {
  const seen = new Map<string, string>();
  for (const p of all) if (!p.builtin && p.group && !seen.has(p.group.toLowerCase())) seen.set(p.group.toLowerCase(), p.group);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Search as people expect: every word, anywhere in the name or the group, capitals ignored. Name matches come first. */
export function searchBrushes(all: readonly BrushPreset[], query: string): BrushPreset[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...all];
  const hits: { p: BrushPreset; inName: boolean }[] = [];
  for (const p of all) {
    const name = p.name.toLowerCase();
    const text = `${name} ${groupOf(p).toLowerCase()}`;
    if (words.every((w) => text.includes(w))) hits.push({ p, inName: words.every((w) => name.includes(w)) });
  }
  return [...hits.filter((h) => h.inName), ...hits.filter((h) => !h.inName)].map((h) => h.p);
}

// ---------------------------------------------------------------- favourites and recent

/** Adds the id, or takes it out when it is there. */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** The id at the front, once, and no more than `max` of them. */
export function pushRecent(list: readonly string[], id: string, max = RECENT_KEPT): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/** Reads a saved list of ids. Anything that isn't a short string is dropped, repeats are dropped. */
export function sanitizeIds(raw: unknown, max = MAX_IDS): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) if (typeof x === 'string' && x && x.length < 80 && !out.includes(x) && out.length < max) out.push(x);
  return out;
}

export type RowStyle = 'tip' | 'two';
export const ROW_SCALE = { min: 0.6, max: 1.5 };
export const BOX = { minW: 300, maxW: 640, minH: 260 };

export interface PickerMemory {
  favourites: string[];
  recent: string[];
  rowScale: number;
  /** The size the panel was dragged to, if it was. */
  box: { w: number; h: number } | null;
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

/** Reads what the picker remembered. Anything off falls back to the plain default. */
export function sanitizeMemory(raw: unknown): PickerMemory {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const b = r.box && typeof r.box === 'object' ? (r.box as Record<string, unknown>) : null;
  const w = b ? num(b.w, BOX.minW, BOX.maxW) : null;
  const h = b ? num(b.h, BOX.minH, 4000) : null;
  return {
    favourites: sanitizeIds(r.favourites),
    recent: sanitizeIds(r.recent, RECENT_KEPT),
    rowScale: num(r.rowScale, ROW_SCALE.min, ROW_SCALE.max) ?? 1,
    box: w !== null && h !== null ? { w, h } : null,
  };
}

// ---------------------------------------------------------------- what the list shows

export interface Section {
  /** 'favourites', 'recent', 'group:<name>' or 'found'. */
  key: string;
  kind: 'favourites' | 'recent' | 'group' | 'found';
  name: string;
  count: number;
  open: boolean;
  /** The rows. Empty while the section is folded, so a closed group costs nothing to show. */
  brushes: BrushPreset[];
  /** The brush in use is in here (groups only: Favourites and Recent are not places). */
  here: boolean;
}

export interface PickerFacts {
  all: readonly BrushPreset[];
  favourites: readonly string[];
  recent: readonly string[];
  activeId: string | null;
  /** The section keys open now. null: only the group the brush in use is in. */
  opened: readonly string[] | null;
  query: string;
}

/** My brushes first, then the starters, then groups of your own by name. */
function groupOrder(name: string): number {
  return name === MY_GROUP ? 0 : name === STARTERS_GROUP ? 1 : 2;
}

/** A group's section key. Capitals don't make another group: "Inking" and "inking" are one. */
export const groupKey = (name: string): string => `group:${name.toLowerCase()}`;

/** The groups and how many brushes each holds, in the order the picker lists them. */
export function groupsOf(all: readonly BrushPreset[]): { name: string; brushes: BrushPreset[] }[] {
  const map = new Map<string, { name: string; brushes: BrushPreset[] }>();
  for (const p of all) {
    const g = groupOf(p);
    const have = map.get(g.toLowerCase());
    if (have) have.brushes.push(p);
    else map.set(g.toLowerCase(), { name: g, brushes: [p] });
  }
  return [...map.values()]
    .sort((a, b) => groupOrder(a.name) - groupOrder(b.name) || a.name.localeCompare(b.name));
}

/** Every section key that can be folded or opened (for "fold all" and "open all"). */
export function foldableKeys(f: Pick<PickerFacts, 'all'>): string[] {
  return ['favourites', 'recent', ...groupsOf(f.all).map((g) => groupKey(g.name))];
}

/** The sections to draw. Searching swaps everything for one flat list of what was found. */
export function buildSections(f: PickerFacts): Section[] {
  const active = f.activeId ? f.all.find((p) => p.id === f.activeId) : undefined;
  if (f.query.trim()) {
    const found = searchBrushes(f.all, f.query);
    return [{ key: 'found', kind: 'found', name: 'Found', count: found.length, open: true, brushes: found, here: !!active && found.includes(active) }];
  }
  const byId = new Map(f.all.map((p) => [p.id, p]));
  const open = f.opened ?? (active ? [groupKey(groupOf(active))] : []);
  const make = (key: string, kind: Section['kind'], name: string, list: BrushPreset[]): Section => {
    const isOpen = open.includes(key);
    return { key, kind, name, count: list.length, open: isOpen, brushes: isOpen ? list : [], here: kind === 'group' && !!active && list.includes(active) };
  };
  const favs = f.favourites.map((id) => byId.get(id)).filter((p): p is BrushPreset => !!p);
  const recent = f.recent.map((id) => byId.get(id)).filter((p): p is BrushPreset => !!p).slice(0, RECENT_SHOWN);
  return [
    make('favourites', 'favourites', 'Favourites', favs),
    make('recent', 'recent', 'Recent', recent),
    ...groupsOf(f.all).map((g) => make(groupKey(g.name), 'group', g.name, g.brushes)),
  ];
}

// ---------------------------------------------------------------- the keyboard order

export interface Item {
  /** Unique in the list: a brush that is a favourite and in its group is two rows. */
  key: string;
  kind: 'head' | 'row';
  section: string;
  brush?: BrushPreset;
}

export const rowKey = (section: string, id: string): string => `${section}|${id}`;

/** Every line you can land on, top to bottom: group headings (when not searching) and the rows of open groups. */
export function flatten(sections: readonly Section[]): Item[] {
  const out: Item[] = [];
  for (const s of sections) {
    if (s.kind !== 'found') out.push({ key: `head|${s.key}`, kind: 'head', section: s.key });
    for (const b of s.brushes) out.push({ key: rowKey(s.key, b.id), kind: 'row', section: s.key, brush: b });
  }
  return out;
}

/** Where the highlight starts: the brush in use if it shows, else the first row, else the first line. */
export function startKey(items: readonly Item[], activeId: string | null): string | null {
  const mine = activeId ? items.find((i) => i.kind === 'row' && i.brush?.id === activeId) : undefined;
  return (mine ?? items.find((i) => i.kind === 'row') ?? items[0])?.key ?? null;
}

/** The highlight after an arrow, Page or Home or End key, wrapping at the ends for single steps. Unchanged for other keys. */
export function moveHot(items: readonly Item[], hot: string | null, key: string): string | null {
  if (!items.length) return null;
  const at = items.findIndex((i) => i.key === hot);
  const last = items.length - 1;
  let to = at;
  if (key === 'ArrowDown') to = at < 0 || at === last ? 0 : at + 1;
  else if (key === 'ArrowUp') to = at <= 0 ? last : at - 1;
  else if (key === 'PageDown') to = Math.min(last, Math.max(at, 0) + 8);
  else if (key === 'PageUp') to = Math.max(0, Math.max(at, 0) - 8);
  else if (key === 'Home') to = 0;
  else if (key === 'End') to = last;
  return items[to].key;
}
