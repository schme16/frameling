// Changing the menus: what a person's changes look like when saved, how they are laid over the menus Frameling comes
// with, and the small list operations the editor uses. All pure, so the shapes can be tested without a window.
//
// The idea is the same for the menu bar and for every menu and submenu: a *list of entries*. An entry is a command id,
// `-` (a divider), `heading:words`, `sub:<key>` (a submenu) or `group:tools`, `group:panels`, `group:workspaces`.
// A changed list is saved whole, beside `seen`: every entry the built-in list had at that moment. That is what lets a
// later Frameling tell "you took this out" (in `seen`, not in your list) from "this is new" (not in `seen`).
import type { MenuDef, SubmenuDef } from './menus';

/** A list the person changed: their entries in their order, and what the built-in list held when they changed it. */
export interface ListEdit {
  items: string[];
  seen: string[];
}

/** A menu (on the bar) or a submenu the person made. */
export interface CustomMenu {
  title: string;
  kind: 'menu' | 'sub';
}

/**
 * Everything saved about the menus. Keys: a menu's id (`Draw`, `my-1`), or `sub:<key>` for a submenu (`sub:tools`,
 * `sub:my-2`). Every field is optional, and nothing saved means the menus as they came.
 */
export interface MenuEdits {
  v: 1;
  /** The menu bar: menu ids in order. A built-in menu left out of it is hidden, never lost. */
  bar?: ListEdit;
  lists?: Record<string, ListEdit>;
  /** New words on screen for a menu or submenu. */
  titles?: Record<string, string>;
  custom?: Record<string, CustomMenu>;
}

export const NO_EDITS: MenuEdits = { v: 1 };

/** When a new Frameling adds something to a menu you changed: put it in at the end of its group, or leave it out. */
export type NewEntries = 'add' | 'leave';

const LIMITS = {
  entries: 400,
  entryLength: 120,
  title: 60,
  custom: 40,
  keys: 200,
};
const CUSTOM_ID = /^my-[a-z0-9]{1,12}$/;

export const isCustomId = (id: string): boolean => CUSTOM_ID.test(id);
export const isSubKey = (key: string): boolean => key.startsWith('sub:');
/** The key a list is saved under, for a menu id or a submenu key. */
export const subKey = (key: string): string => `sub:${key}`;

const isKeyed = (e: string): boolean => e !== '-';

// ---------------------------------------------------------------- reading what was saved

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clean = (v: unknown, max = LIMITS.entryLength): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v) ? v : null);

function sanitizeList(raw: unknown): ListEdit | undefined {
  if (!isObj(raw) || !Array.isArray(raw.items)) return undefined;
  const items = raw.items
    .map((e) => clean(e))
    .filter((e): e is string => e !== null)
    .slice(0, LIMITS.entries);
  const seen = Array.isArray(raw.seen)
    ? raw.seen
        .map((e) => clean(e))
        .filter((e): e is string => e !== null)
        .slice(0, LIMITS.entries * 2)
    : [];
  return { items, seen };
}

/** Turns whatever was saved (an older version, hand-edited, damaged) into good edits. Anything it can't make sense of is left out. */
export function sanitizeMenuEdits(raw: unknown): MenuEdits {
  if (!isObj(raw)) return NO_EDITS;
  const out: MenuEdits = { v: 1 };
  const custom: Record<string, CustomMenu> = {};
  if (isObj(raw.custom)) {
    for (const [id, c] of Object.entries(raw.custom).slice(0, LIMITS.custom)) {
      if (!isCustomId(id) || !isObj(c)) continue;
      const title = clean(c.title, LIMITS.title);
      if (title && (c.kind === 'menu' || c.kind === 'sub')) custom[id] = { title: title.trim() || 'My menu', kind: c.kind };
    }
  }
  // An entry naming a submenu or menu of your own that is gone would be a dead end.
  const ok = (e: string): boolean => !(e.startsWith('sub:my-') && !custom[e.slice(4)]);
  if (Object.keys(custom).length) out.custom = custom;
  const bar = sanitizeList(raw.bar);
  if (bar)
    out.bar = {
      items: bar.items.filter((e) => !isCustomId(e) || custom[e]?.kind === 'menu'),
      seen: bar.seen,
    };
  if (isObj(raw.lists)) {
    const lists: Record<string, ListEdit> = {};
    for (const [key, v] of Object.entries(raw.lists).slice(0, LIMITS.keys)) {
      const base = isSubKey(key) ? key.slice(4) : key;
      if (clean(key) === null || (isCustomId(base) && !custom[base])) continue;
      const l = sanitizeList(v);
      if (l) lists[key] = { items: l.items.filter(ok), seen: l.seen };
    }
    if (Object.keys(lists).length) out.lists = lists;
  }
  if (isObj(raw.titles)) {
    const titles: Record<string, string> = {};
    for (const [key, v] of Object.entries(raw.titles).slice(0, LIMITS.keys)) {
      const t = clean(v, LIMITS.title)?.trim();
      if (t && clean(key) !== null) titles[key] = t;
    }
    if (Object.keys(titles).length) out.titles = titles;
  }
  return out;
}

export const isUnchanged = (e: MenuEdits): boolean => !e.bar && !Object.keys(e.lists ?? {}).length && !Object.keys(e.titles ?? {}).length && !Object.keys(e.custom ?? {}).length;

// ---------------------------------------------------------------- laying the changes over the built-in menus

/**
 * Your list, with what is new in the built-in list put in: an entry the built-in list has that you have not seen goes
 * in after the entry it follows there (or at the end), unless `newEntries` is `leave`. Entries you took out stay out,
 * and entries that name something that is not there any more are kept (a plugin you switched off may come back).
 * `leftOut` is the built-in entries that ended up not in the list, so they don't turn up again at the bottom.
 */
export function mergeList(defaults: string[], edit: ListEdit, newEntries: NewEntries = 'add'): { items: string[]; leftOut: string[] } {
  const items = [...edit.items];
  if (newEntries === 'add') {
    const seen = new Set(edit.seen);
    const have = new Set(items);
    for (const entry of defaults.filter(isKeyed)) {
      if (seen.has(entry) || have.has(entry)) continue;
      items.splice(placeAt(items, defaults, entry), 0, entry);
      have.add(entry);
    }
  }
  const now = new Set(items);
  return { items, leftOut: defaults.filter((e) => isKeyed(e) && !now.has(e)) };
}

/** Where an entry goes in `items` to sit where the built-in list has it: after the nearest entry before it there that `items` still has, else at the end. */
function placeAt(items: string[], defaults: string[], entry: string): number {
  const keyed = defaults.filter(isKeyed);
  for (let j = keyed.indexOf(entry) - 1; j >= 0; j--) {
    const at = items.lastIndexOf(keyed[j]);
    if (at >= 0) return at + 1;
  }
  return keyed.indexOf(entry) > 0 || keyed.indexOf(entry) < 0 ? items.length : 0;
}

/** Puts an entry you took out back where the built-in list has it. */
export function putEntryBack(items: string[], defaults: string[], entry: string): string[] {
  if (items.includes(entry)) return items;
  return insertEntry(items, placeAt(items, defaults, entry), entry);
}

/** Built-in entries that are not in your list: what you took out, which can each be put back. */
export const takenOut = (items: string[], defaults: string[]): string[] => defaults.filter((e) => isKeyed(e) && !items.includes(e));

export interface Shape {
  menus: MenuDef[];
  subs: Record<string, SubmenuDef>;
  /** Entries taken out of every place, so their commands do not come back at the bottom of a menu. */
  hidden: string[];
  /** What each list was before any change, by key (the bar is `bar`), with what features added. */
  defaults: Record<string, string[]>;
  /** What each list is now, by key, as the editor shows it (features' additions included, hidden menus not in `bar`). */
  lists: Record<string, string[]>;
}

export interface ShapeOptions {
  newEntries?: NewEntries;
  /** What features have added to a menu id or `sub:<key>`. */
  contributed?: (key: string) => string[];
}

/** The menus as they are now: the ones Frameling comes with, with the person's changes laid over them. */
export function shapeMenus(builtMenus: MenuDef[], builtSubs: Record<string, SubmenuDef>, edits: MenuEdits, opts: ShapeOptions = {}): Shape {
  const mode = opts.newEntries ?? 'add';
  const added = opts.contributed ?? (() => []);
  const defaults: Record<string, string[]> = {};
  const hidden: string[] = [];
  const lists: Record<string, string[]> = {};
  const subs: Record<string, SubmenuDef> = {};
  const titleOf = (key: string, fallback: string): string => edits.titles?.[key] ?? fallback;

  for (const [k, def] of Object.entries(builtSubs)) {
    const key = subKey(k);
    defaults[key] = [...def.items, ...added(key)];
    const edit = edits.lists?.[key];
    if (!edit) {
      lists[key] = defaults[key];
      subs[k] = { ...def, label: titleOf(key, def.label) };
      continue;
    }
    const m = mergeList(defaults[key], edit, mode);
    lists[key] = m.items;
    hidden.push(...m.leftOut);
    subs[k] = {
      ...def,
      label: titleOf(key, def.label),
      items: m.items,
      fixed: true,
    };
  }
  for (const [id, c] of Object.entries(edits.custom ?? {})) {
    if (c.kind !== 'sub') continue;
    const key = subKey(id);
    defaults[key] = [];
    lists[key] = edits.lists?.[key]?.items ?? [];
    subs[id] = {
      label: titleOf(key, c.title),
      items: edits.lists?.[key]?.items ?? [],
      fixed: true,
    };
  }

  const built: Record<string, MenuDef> = {};
  for (const m of builtMenus) {
    defaults[m.label] = [...m.items, ...added(m.label)];
    const edit = edits.lists?.[m.label];
    const label = titleOf(m.label, m.title ?? m.label);
    const title = label === m.label ? undefined : label;
    if (!edit) {
      lists[m.label] = defaults[m.label];
      built[m.label] = { ...m, ...(title ? { title } : {}) };
      continue;
    }
    const r = mergeList(defaults[m.label], edit, mode);
    lists[m.label] = r.items;
    hidden.push(...r.leftOut);
    built[m.label] = {
      ...m,
      ...(title ? { title } : {}),
      items: r.items,
      fixed: true,
    };
  }
  const customMenus: Record<string, MenuDef> = {};
  for (const [id, c] of Object.entries(edits.custom ?? {})) {
    if (c.kind !== 'menu') continue;
    defaults[id] = [];
    lists[id] = edits.lists?.[id]?.items ?? [];
    customMenus[id] = {
      label: id,
      title: titleOf(id, c.title),
      categories: [],
      items: edits.lists?.[id]?.items ?? [],
      fixed: true,
    };
  }

  const barDefaults = builtMenus.map((m) => m.label);
  defaults.bar = barDefaults;
  let order = barDefaults;
  lists.bar = barDefaults;
  if (edits.bar) {
    const m = mergeList(barDefaults, edits.bar, mode);
    order = m.items.filter((id) => built[id] || customMenus[id]);
    // A built-in menu taken off the bar takes its commands with it: they are not scattered into other menus.
    for (const id of m.leftOut) hidden.push(...built[id].items);
  }
  for (const id of Object.keys(customMenus)) if (!order.includes(id)) order = [...order, id];
  const menus = order.map((id) => built[id] ?? customMenus[id]);
  lists.bar = menus.map((m) => m.label);
  return { menus, subs, hidden: [...new Set(hidden)], defaults, lists };
}

// ---------------------------------------------------------------- the editor's changes

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** The edits with this list set: dropped when it is the built-in list again, so putting everything back leaves nothing saved. */
export function setList(edits: MenuEdits, key: string, items: string[], builtIn: string[]): MenuEdits {
  const lists = { ...edits.lists };
  const isCustom = isCustomId(isSubKey(key) ? key.slice(4) : key);
  if (!isCustom && key !== 'bar' && same(items, builtIn)) delete lists[key];
  else if (key !== 'bar')
    lists[key] = {
      items: items.slice(0, LIMITS.entries),
      seen: builtIn.filter(isKeyed),
    };
  const next: MenuEdits = { ...edits, lists };
  if (key === 'bar') {
    if (same(items, builtIn)) delete next.bar;
    else
      next.bar = {
        items: items.slice(0, LIMITS.entries),
        seen: builtIn.filter(isKeyed),
      };
  }
  return tidyEdits(next);
}

function tidyEdits(e: MenuEdits): MenuEdits {
  const out: MenuEdits = { v: 1 };
  if (e.bar) out.bar = e.bar;
  if (e.lists && Object.keys(e.lists).length) out.lists = e.lists;
  if (e.titles && Object.keys(e.titles).length) out.titles = e.titles;
  if (e.custom && Object.keys(e.custom).length) out.custom = e.custom;
  return out;
}

/** New words for a menu or submenu. Empty words, or the built-in ones, put the built-in name back. */
export function renameKey(edits: MenuEdits, key: string, title: string, builtIn: string): MenuEdits {
  const t = title.trim().slice(0, LIMITS.title);
  const base = isSubKey(key) ? key.slice(4) : key;
  if (edits.custom?.[base]) {
    if (!t) return edits;
    return tidyEdits({
      ...edits,
      custom: { ...edits.custom, [base]: { ...edits.custom[base], title: t } },
    });
  }
  const titles = { ...edits.titles };
  if (!t || t === builtIn) delete titles[key];
  else titles[key] = t;
  return tidyEdits({ ...edits, titles });
}

/** The next unused id for something of your own. */
export function newCustomId(edits: MenuEdits): string {
  const used = new Set(Object.keys(edits.custom ?? {}));
  for (let n = 1; ; n++) if (!used.has(`my-${n}`)) return `my-${n}`;
}

/** A menu of your own, at the end of the bar. `bar` is the bar as it is now. */
export function addCustomMenu(edits: MenuEdits, title: string, bar: string[], builtInBar: string[]): { edits: MenuEdits; id: string } {
  const id = newCustomId(edits);
  const withIt = tidyEdits({
    ...edits,
    custom: {
      ...edits.custom,
      [id]: {
        title: title.trim().slice(0, LIMITS.title) || 'My menu',
        kind: 'menu',
      },
    },
  });
  return { edits: setList(withIt, 'bar', [...bar, id], builtInBar), id };
}

/** A submenu of your own, at the end of the list `key` (a menu or a submenu's key as the editor has it open). `items` is that list now. */
export function addCustomSub(edits: MenuEdits, title: string, key: string, items: string[], builtIn: string[]): { edits: MenuEdits; id: string } {
  const id = newCustomId(edits);
  const withIt = tidyEdits({
    ...edits,
    custom: {
      ...edits.custom,
      [id]: {
        title: title.trim().slice(0, LIMITS.title) || 'My submenu',
        kind: 'sub',
      },
    },
  });
  return { edits: setList(withIt, key, [...items, `sub:${id}`], builtIn), id };
}

/** Takes a menu or submenu of your own away, and every place that listed it. */
export function removeCustom(edits: MenuEdits, id: string): MenuEdits {
  if (!edits.custom?.[id]) return edits;
  const entry = edits.custom[id].kind === 'sub' ? `sub:${id}` : id;
  const custom = { ...edits.custom };
  delete custom[id];
  const lists: Record<string, ListEdit> = {};
  for (const [k, l] of Object.entries(edits.lists ?? {})) {
    if (k === id || k === `sub:${id}`) continue;
    lists[k] = { items: l.items.filter((e) => e !== entry), seen: l.seen };
  }
  const titles = { ...edits.titles };
  delete titles[id];
  delete titles[`sub:${id}`];
  const out: MenuEdits = { ...edits, custom, lists, titles };
  if (edits.bar)
    out.bar = {
      items: edits.bar.items.filter((e) => e !== entry),
      seen: edits.bar.seen,
    };
  return tidyEdits(out);
}

/** One menu or submenu back to how it came: its list and its name. (The bar is `bar`.) */
export function putBack(edits: MenuEdits, key: string): MenuEdits {
  const lists = { ...edits.lists };
  delete lists[key];
  const titles = { ...edits.titles };
  delete titles[key];
  const out: MenuEdits = { ...edits, lists, titles };
  if (key === 'bar') delete out.bar;
  return tidyEdits(out);
}

/** Which keys have been changed, for marking them in the editor. */
export function changedKeys(e: MenuEdits): Set<string> {
  const s = new Set<string>([...Object.keys(e.lists ?? {}), ...Object.keys(e.titles ?? {})]);
  if (e.bar) s.add('bar');
  return s;
}

// List operations. `to` is the position the entry ends up at.

export function moveEntry(items: string[], from: number, to: number): string[] {
  if (from < 0 || from >= items.length) return items;
  const at = Math.max(0, Math.min(items.length - 1, to));
  if (at === from) return items;
  const out = [...items];
  const [e] = out.splice(from, 1);
  out.splice(at, 0, e);
  return out;
}

export function removeEntry(items: string[], at: number): string[] {
  return at < 0 || at >= items.length ? items : items.filter((_, i) => i !== at);
}

export function insertEntry(items: string[], at: number, entry: string): string[] {
  const out = [...items];
  out.splice(Math.max(0, Math.min(items.length, at)), 0, entry);
  return out;
}

/**
 * Where a drop goes when an entry is dragged: `rects` are the rows' vertical middles, `y` the pointer. Gives the gap
 * (0 to rows.length) the pointer is in, and the index the entry lands on once taken out of its old place.
 */
export function dropGap(middles: number[], y: number): number {
  let gap = 0;
  while (gap < middles.length && y > middles[gap]) gap++;
  return gap;
}

/** The index a dragged entry ends up at when it is dropped in `gap` (gaps count the dragged row itself). */
export const landsAt = (from: number, gap: number): number => (gap > from ? gap - 1 : gap);

// What an entry is called in the editor.

export type EntryKind = 'command' | 'divider' | 'heading' | 'submenu' | 'group';

export function entryKind(entry: string): EntryKind {
  if (entry === '-') return 'divider';
  if (entry.startsWith('heading:')) return 'heading';
  if (entry.startsWith('sub:')) return 'submenu';
  if (entry.startsWith('group:')) return 'group';
  return 'command';
}

const GROUP_WORDS: Record<string, string> = {
  'group:tools': 'Every tool',
  'group:panels': 'Every panel',
  'group:workspaces': 'Every workspace',
};
export const groupWords = (entry: string): string => GROUP_WORDS[entry] ?? entry.slice(6);

/** Commands a list names that are not there right now (a feature that is off, a plugin that is gone, a command from an older version). */
export function missingCommands(items: string[], has: (id: string) => boolean): string[] {
  return items.filter((e) => entryKind(e) === 'command' && !has(e));
}
