// How the tool rail's tools are grouped and ordered. Pure: no registry, no storage, so it can be tested alone.
// The arrangement is a list of groups, each a list of tool ids. Every workspace has its own: it starts from the
// workspace's default (BUILTIN_RAILS for the ones that come with the app, the saved one for your own) and what you
// change is kept for that workspace alone (`rails` in the dock state). Tools nobody has placed yet (new ones, plugin
// ones) are put away for you.
//
// The rail keeps its shape from layer to layer: every tool that works on a vector or a pixel layer has a place all the
// time. A tool that doesn't work on the layer you're on is left out of the rail, or stays where it is greyed out, as the person chooses (railFor). The Lasso and the
// Pixel lasso (and the other ways of picking) share one place, and the one for your layer shows (a slot, see slotMates).

import type { LayerKind } from '../core/format';

export interface ToolGroup {
  id: string;
  /** A name for the move menu (missing = "Group N"). */
  name?: string;
  tools: string[];
  /** Tools of this group put away (hidden from the rail, still here: they come back to the same place). Always a part of `tools`. */
  hidden?: string[];
  /** Folded into one button, with the rest of the group behind it. */
  fold?: boolean;
}

/** The groups the rail starts with. A tool says which one it starts in (`group`) and where (`groupAt`) when it is registered. */
export const DEFAULT_GROUPS: { id: string; name: string }[] = [
  { id: 'draw', name: 'Draw' },
  { id: 'extras', name: 'Colour and pixel extras' },
  { id: 'shapes', name: 'Shapes' },
  { id: 'select', name: 'Select and pen' },
  { id: 'rig', name: 'Rig and motion' },
  { id: 'view', name: 'View' },
];
export const OTHER_GROUP = { id: 'other', name: 'Other' };

/** What the rail needs to know of a tool to place it: its id and where it asked to start (a registered `Tool` fits). */
export interface ToolRef {
  id: string;
  group?: string;
  groupAt?: number;
  /** Tools with the same slot share one place on the rail (the Lasso and the Pixel lasso). */
  slot?: string;
}

/**
 * The arrangement each built-in workspace starts with. A group with no tools only fixes where its group sits; the tools
 * that start there (their `group` and `groupAt`) fill it. Draw is the standard order.
 */
export const BUILTIN_RAILS: Record<string, ToolGroup[]> = {
  // Drawing first, then colour extras, shapes, select and pen, rig, view.
  draw: DEFAULT_GROUPS.map((g) => ({ id: g.id, tools: [] })),
  // Drawing, then rig and motion straight after, then select and pen, shapes, extras and view.
  animate: ['draw', 'rig', 'select', 'shapes', 'extras', 'view'].map((id) => ({ id, tools: [] })),
  // Pixel tools first: draw with the eyedropper in reach, shade, dither and pixel select, then shapes; the vector-only
  // tools (select and pen, rig) come after.
  pixel: [
    { id: 'draw', tools: ['pencil', 'eraser', 'fill', 'eyedropper'] },
    { id: 'pixel', name: 'Pixel tools', tools: ['shade', 'dither', 'spray'] },
    { id: 'select', name: 'Select', tools: ['pixel-select', 'pixel-select-lasso', 'pixel-select-polygon', 'pixel-select-magnetic', 'pixel-select-wand'] },
    { id: 'shapes', tools: ['line', 'rect', 'ellipse', 'polygon', 'star'] },
    { id: 'view', tools: ['hand', 'zoom'] },
    { id: 'extras', tools: [] },
    { id: 'rig', tools: [] },
  ],
};

const MAX_GROUPS = 24;
const MAX_TOOLS = 120;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const ID = /^[\w.:/-]{1,80}$/;
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && !RESERVED.has(v) && !v.includes('..');

const rankOfGroup = (id: string): number => {
  const i = DEFAULT_GROUPS.findIndex((g) => g.id === id);
  return id === OTHER_GROUP.id ? DEFAULT_GROUPS.length : i < 0 ? DEFAULT_GROUPS.length + 1 : i;
};

/** Which default group a tool starts in (Other when it names none, or one that is not a default group). */
export function defaultGroupOf(tool: ToolRef): string {
  return tool.group && DEFAULT_GROUPS.some((g) => g.id === tool.group) ? tool.group : OTHER_GROUP.id;
}

/**
 * A saved arrangement made safe: bad ids and repeats dropped, sizes capped. Undefined when there is nothing to keep.
 * With `anchors` a group with no tools is kept: it only says where that group sits among the others (a default order).
 */
export function sanitizeGroups(raw: unknown, anchors = false): ToolGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ToolGroup[] = [];
  const seenGroups = new Set<string>();
  const seenTools = new Set<string>();
  for (const g of raw.slice(0, MAX_GROUPS)) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    const r = g as Record<string, unknown>;
    if (!isId(r.id) || seenGroups.has(r.id) || !Array.isArray(r.tools)) continue;
    const tools: string[] = [];
    for (const t of r.tools.slice(0, MAX_TOOLS)) {
      if (!isId(t) || seenTools.has(t)) continue;
      seenTools.add(t);
      tools.push(t);
    }
    if (!tools.length && !anchors) continue;
    seenGroups.add(r.id);
    const name = cleanGroupName(r.name);
    const hidden = cleanHidden(r.hidden, tools);
    out.push({ id: r.id, ...(name ? { name } : {}), tools, ...(hidden.length ? { hidden } : {}), ...(r.fold === true ? { fold: true } : {}) });
  }
  return out.length ? out : undefined;
}

/** The hidden list of a group made safe: only tools that are in the group, each once, in the group's order. */
function cleanHidden(raw: unknown, tools: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const want = new Set(raw.filter(isId));
  return tools.filter((t) => want.has(t));
}

export const MAX_GROUP_NAME = 40;

/** A group name from outside made safe: no control characters, spaces tidied, trimmed, not too long ('' when there is none). */
export function cleanGroupName(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME) : '';
}

/** The name to show for a group. */
export function groupName(g: ToolGroup, groups: ToolGroup[]): string {
  return g.name || usualName(g, groups);
}

/** The name a group has without one of its own. */
function usualName(g: ToolGroup, groups: ToolGroup[]): string {
  const d = DEFAULT_GROUPS.find((x) => x.id === g.id);
  if (d) return d.name;
  if (g.id === OTHER_GROUP.id) return OTHER_GROUP.name;
  return `Group ${groups.findIndex((x) => x.id === g.id) + 1}`;
}

/**
 * The arrangement to use for the tools that exist: the saved one with tools that are gone dropped, and tools it doesn't
 * place yet put in their default group (which comes back if it was emptied away), unknown ones in Other.
 * With nothing saved this is the default arrangement. Empty groups are dropped (once filled, so an anchor group with no tools to hold goes too).
 */
export function resolveGroups(saved: ToolGroup[] | undefined, tools: ToolRef[]): ToolGroup[] {
  const ids = tools.map((t) => t.id);
  const ref = new Map(tools.map((t) => [t.id, t]));
  const have = new Set(ids);
  const groups: ToolGroup[] = [];
  const placed = new Set<string>();
  for (const g of saved ?? []) {
    const tools = g.tools.filter((t) => have.has(t) && !placed.has(t));
    tools.forEach((t) => placed.add(t));
    // A group saved with no tools is an anchor (a default order): it stays where it is and the tools that start there fill it.
    if (tools.length || !g.tools.length) groups.push(withHidden(g, tools, g.hidden));
  }
  // The unplaced, in the order a default rail would show them.
  const order = (t: string) => {
    const r = ref.get(t)!;
    return defaultGroupOf(r) !== OTHER_GROUP.id && r.groupAt !== undefined ? r.groupAt : 1000 + ids.indexOf(t);
  };
  const loose = ids.filter((t) => !placed.has(t)).sort((a, b) => order(a) - order(b));
  for (const t of loose) {
    const gid = defaultGroupOf(ref.get(t)!);
    let g = groups.find((x) => x.id === gid);
    if (!g) {
      const meta = gid === OTHER_GROUP.id ? OTHER_GROUP : DEFAULT_GROUPS.find((x) => x.id === gid)!;
      g = { id: gid, name: meta.name, tools: [] };
      // Where it goes among the groups already there: before the first one that ranks after it.
      const at = groups.findIndex((x) => rankOfGroup(x.id) > rankOfGroup(gid));
      if (at >= 0) groups.splice(at, 0, g);
      else groups.push(g);
    }
    g.tools.push(t);
  }
  const mates = slotMates(tools);
  // The tools of a slot go away and come back as one.
  return bindSlots(groups, mates)
    .map((g) => withHidden(g, g.tools, g.hidden?.flatMap((t) => mates(t))))
    .filter((g) => g.tools.length);
}

/** The group with its `hidden` list cut to the tools it holds (and dropped when none is left). */
function withHidden(g: ToolGroup, tools: string[], hidden: string[] | undefined): ToolGroup {
  const { hidden: _old, ...rest } = g;
  const keep = tools.filter((t) => hidden?.includes(t));
  return { ...rest, tools, ...(keep.length ? { hidden: keep } : {}) };
}

/**
 * For each tool that shares a place with others (a slot), every tool in it: itself too, in registration order. Tools
 * with no slot, or alone in theirs, give back just themselves.
 */
export function slotMates(tools: ToolRef[]): (id: string) => string[] {
  const bySlot = new Map<string, string[]>();
  for (const t of tools) if (t.slot) bySlot.set(t.slot, [...(bySlot.get(t.slot) ?? []), t.id]);
  const slotOf = new Map(tools.map((t) => [t.id, t.slot]));
  return (id) => {
    const slot = slotOf.get(id);
    return (slot && bySlot.get(slot)) || [id];
  };
}

/** The arrangement with the tools of each slot side by side, in the group of whichever the arrangement places first. */
function bindSlots(groups: ToolGroup[], mates: (id: string) => string[]): ToolGroup[] {
  const placed = new Set<string>();
  const have = new Set(groups.flatMap((g) => g.tools));
  return groups.map((g) => {
    const tools: string[] = [];
    for (const t of g.tools) {
      if (placed.has(t)) continue;
      placed.add(t);
      tools.push(t);
      for (const m of mates(t)) {
        if (m === t || placed.has(m) || !have.has(m)) continue;
        placed.add(m);
        tools.push(m);
      }
    }
    return { ...g, tools };
  });
}

/** A tool as the rail sees it for the layer you're on: what it works on, as well as where it sits. */
export interface RailTool extends ToolRef {
  layers: LayerKind[];
  label?: string;
}

const everyday = (k: LayerKind | null): boolean => k === 'vector' || k === 'pixel';

/**
 * Which tools the rail shows for a kind of layer, and which of those are greyed out because they don't work there.
 * Vector and pixel layers get the same rail: every tool that works on either, one button per slot, with the ones that
 * don't work on this layer off. Other kinds of layer (tiles, camera) and no layer at all show only what works.
 * With `greyOut` false the ones that don't work are left out instead of greyed. `only` is a workspace narrowing the strip for this kind (the Pixel workspace on a pixel layer): just those tools.
 */
export function railFor(tools: RailTool[], kind: LayerKind | null, only?: string[], greyOut = true): { shown: string[]; off: string[] } {
  const works = (t: RailTool) => !kind || t.layers.includes(kind);
  let pool = tools;
  if (only) {
    const keep = new Set(only);
    pool = pool.filter((t) => keep.has(t.id) && works(t));
  } else if (everyday(kind)) pool = pool.filter((t) => t.layers.some(everyday));
  else pool = pool.filter(works);
  // One button per slot: the tool that works here, or the first when none does.
  const pick = new Map<string, RailTool>();
  for (const t of pool) {
    if (!t.slot) continue;
    const had = pick.get(t.slot);
    if (!had || (!works(had) && works(t))) pick.set(t.slot, t);
  }
  const shown = pool.filter((t) => !t.slot || pick.get(t.slot) === t);
  // With greyOut off, what does not work here is left out: the places that remain keep their order, the rail is just shorter.
  if (!greyOut) return { shown: shown.filter(works).map((t) => t.id), off: [] };
  return { shown: shown.map((t) => t.id), off: shown.filter((t) => !works(t)).map((t) => t.id) };
}

/** A tool the rail leaves out on this layer, and the kind of layer it needs. */
export interface WaitingTool {
  id: string;
  label: string;
  needs: 'vector' | 'pixel';
}

/**
 * The tools that are missing from the rail only because of the layer you are on (Text and Gradient on a pixel layer, Shade
 * and Dither on a vector one), so the rail can say so instead of just being shorter. A tool whose twin is on the rail
 * (the Lasso and the Pixel lasso) isn't missing, and ones put away on purpose (`away`) aren't waiting for anything.
 */
export function waitingFor(tools: RailTool[], kind: LayerKind | null, away: ReadonlySet<string> = new Set()): WaitingTool[] {
  if (!everyday(kind)) return [];
  const works = (t: RailTool) => t.layers.includes(kind!);
  const out: WaitingTool[] = [];
  for (const t of tools) {
    if (works(t) || away.has(t.id) || !t.layers.some(everyday)) continue;
    if (t.slot && tools.some((o) => o.slot === t.slot && o.id !== t.id && works(o))) continue;
    out.push({ id: t.id, label: t.label ?? t.id, needs: t.layers.includes('pixel') && !t.layers.includes('vector') ? 'pixel' : 'vector' });
  }
  return out;
}

/** "Text and Gradient work on vector layers." for the tools waiting for one kind of layer. */
export function waitingWords(list: WaitingTool[]): string {
  if (!list.length) return '';
  const names = list.map((t) => t.label);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${joined} ${names.length > 1 ? 'work' : 'works'} on ${list[0].needs} layers.`;
}

/** The tool of the same slot that works on this kind of layer, or null when it has no slot or none works. */
export function twinFor(tools: RailTool[], id: string, kind: LayerKind | null): string | null {
  const me = tools.find((t) => t.id === id);
  if (!me?.slot) return null;
  return tools.find((t) => t.slot === me.slot && t.id !== id && (!kind || t.layers.includes(kind)))?.id ?? null;
}

const KIND_WORDS: Record<LayerKind, string> = { vector: 'vector', pixel: 'pixel', tilemap: 'tile', camera: 'camera' };

/** Why a greyed-out tool is greyed out, in plain words, and what to do about it. */
export function whyOff(tool: { label?: string; layers: LayerKind[] }, kind: LayerKind | null): string {
  const name = tool.label ?? 'This tool';
  const needs = tool.layers.includes('pixel') && !tool.layers.includes('vector') ? 'pixel' : 'vector';
  const on = KIND_WORDS[kind ?? 'vector'];
  return `${name} works on ${needs} layers, and you're on a ${on} layer. Click a ${needs} layer, or add one with ${needs === 'pixel' ? 'Pixel' : 'Vector'} in the Layers header.`;
}

/** True when a group carries a name that is not the one it would have anyway (its usual name, or "Group N"). */
export function hasOwnName(g: ToolGroup, groups: ToolGroup[]): boolean {
  return !!g.name && g.name !== usualName(g, groups);
}

/**
 * The arrangement with one group named. An empty name takes the name away (back to "Group N", or the usual name for the
 * usual groups). The same arrangement comes back when nothing changes or the group is not there.
 */
export function renameGroup(groups: ToolGroup[], id: string, name: string): ToolGroup[] {
  const i = groups.findIndex((g) => g.id === id);
  if (i < 0) return groups;
  const clean = cleanGroupName(name);
  const g = groups[i];
  if ((g.name ?? '') === clean) return groups;
  const { name: _old, ...rest } = g;
  // Back to the usual name for a usual group: the arrangement says nothing, so the usual name shows.
  return groups.map((x, j) => (j === i ? { ...rest, tools: [...g.tools], ...(clean ? { name: clean } : {}) } : x));
}

/** The arrangement with only the tools that show now; groups left empty are dropped. */
export function visibleGroups(groups: ToolGroup[], visible: (id: string) => boolean): ToolGroup[] {
  return groups.map((g) => ({ ...g, tools: g.tools.filter(visible) })).filter((g) => g.tools.length);
}

/** Where a tool can be put: into a group (before a tool, or at the end), or into a group of its own. */
export type ToolPlace = { group: string; before?: string | null } | { newGroupAt: number };
/** What a drag can end on: a place, or the Put away shelf (the tool is hidden, in the group it is in). */
export type ToolDrop = ToolPlace | { away: true };

const copy = (groups: ToolGroup[]): ToolGroup[] => groups.map((g) => ({ ...g, tools: [...g.tools], ...(g.hidden ? { hidden: [...g.hidden] } : {}) }));

/** A group with these tools taken out of its hidden list (the list goes when it is empty). */
function unhidden(g: ToolGroup, gone: string[]): ToolGroup {
  if (!g.hidden?.some((t) => gone.includes(t))) return g;
  return withHidden(g, g.tools, g.hidden.filter((t) => !gone.includes(t)));
}

/** A fresh id for a group the person makes. */
export function newGroupId(groups: ToolGroup[]): string {
  let n = groups.length + 1;
  while (groups.some((g) => g.id === `g${n}`)) n++;
  return `g${n}`;
}

/**
 * The arrangement with one tool moved. `before` names the tool it goes in front of (missing or null: the end of the
 * group). `newGroupAt` is a place among the groups (0 = first). Groups left empty are dropped. A tool it doesn't know
 * is left alone.
 */
export function moveTool(groups: ToolGroup[], tool: string, to: ToolPlace, mates?: (id: string) => string[]): ToolGroup[] {
  const slot = mates?.(tool).filter((t) => groups.some((g) => g.tools.includes(t))) ?? [];
  if (slot.length > 1) return moveSlot(groups, slot, to, mates!);
  // A drop before one of a pair lands before the pair, never between the two.
  if (mates && 'group' in to && to.before) {
    const flat = groups.flatMap((g) => g.tools);
    const ahead = mates(to.before).filter((t) => flat.includes(t)).sort((x, y) => flat.indexOf(x) - flat.indexOf(y))[0];
    if (ahead && ahead !== tool) return moveOne(groups, tool, { group: to.group, before: ahead });
  }
  return moveOne(groups, tool, to);
}

/** A slot moves as one: its tools go together, in the order they are in now, and a drop before one of a slot goes before the slot. */
function moveSlot(groups: ToolGroup[], slot: string[], to: ToolPlace, mates: (id: string) => string[]): ToolGroup[] {
  const flat = groups.flatMap((g) => g.tools);
  const first = (ids: string[]) => ids.filter((t) => flat.includes(t)).sort((a, b) => flat.indexOf(a) - flat.indexOf(b));
  const mine = first(slot);
  let dest = to;
  if ('group' in to && to.before) {
    if (mine.includes(to.before)) return groups;
    dest = { group: to.group, before: first(mates(to.before))[0] ?? to.before };
  }
  let out = moveOne(groups, mine[0], dest);
  for (const t of mine.slice(1)) {
    const prev = out.find((g) => g.tools.includes(mine[mine.indexOf(t) - 1]));
    if (!prev) continue;
    out = moveOne(out, t, { group: prev.id, before: prev.tools[prev.tools.indexOf(mine[mine.indexOf(t) - 1]) + 1] ?? null });
  }
  return JSON.stringify(out) === JSON.stringify(groups) ? groups : out;
}

function moveOne(groups: ToolGroup[], tool: string, to: ToolPlace): ToolGroup[] {
  if (!groups.some((g) => g.tools.includes(tool))) return groups;
  const out = copy(groups);
  const from = out.find((g) => g.tools.includes(tool))!;
  // A tool that is moved is wanted: it shows again wherever it lands.
  if (from.hidden?.includes(tool)) {
    const rest = from.hidden.filter((t) => t !== tool);
    if (rest.length) from.hidden = rest;
    else delete from.hidden;
  }
  if ('newGroupAt' in to) {
    // The place counts the groups as they were, so moving a lone tool next to itself changes nothing.
    const at = Math.max(0, Math.min(out.length, to.newGroupAt));
    const alone = from.tools.length === 1;
    const fromAt = out.indexOf(from);
    if (alone && (at === fromAt || at === fromAt + 1)) return JSON.stringify(out) === JSON.stringify(groups) ? groups : out;
    from.tools = from.tools.filter((t) => t !== tool);
    const made: ToolGroup = { id: newGroupId(out), tools: [tool] };
    out.splice(at, 0, made);
    return out.filter((g) => g.tools.length);
  }
  const into = out.find((g) => g.id === to.group);
  if (!into) return groups;
  if (to.before === tool) return groups;
  from.tools = from.tools.filter((t) => t !== tool);
  const i = to.before ? into.tools.indexOf(to.before) : -1;
  if (i >= 0) into.tools.splice(i, 0, tool);
  else into.tools.push(tool);
  const same = JSON.stringify(out) === JSON.stringify(groups);
  return same ? groups : out.filter((g) => g.tools.length);
}

/**
 * One step along the rail for the keyboard: `by` places later (negative: earlier) among the tools that show. Past the
 * end of its group a tool crosses into the next group. At the very start or end nothing happens.
 */
export function shiftTool(groups: ToolGroup[], tool: string, by: number, visible: (id: string) => boolean = () => true, mates?: (id: string) => string[]): ToolGroup[] {
  const gi = groups.findIndex((g) => g.tools.includes(tool));
  if (gi < 0 || !by) return groups;
  const shown = groups[gi].tools.filter(visible);
  const j = shown.indexOf(tool) + by;
  if (j >= 0 && j < shown.length) {
    const rest = shown.filter((t) => t !== tool);
    return moveTool(groups, tool, { group: groups[gi].id, before: rest[j] ?? null }, mates);
  }
  const step = j < 0 ? -1 : 1;
  for (let k = gi + step; k >= 0 && k < groups.length; k += step) {
    const there = groups[k].tools.filter(visible);
    if (!there.length) continue;
    return moveTool(groups, tool, { group: groups[k].id, before: step < 0 ? null : there[0] }, mates);
  }
  return groups;
}

/** The place a tool is in, as words for a screen reader: "Draw, place 2 of 4". */
export function placeWords(groups: ToolGroup[], tool: string, visible: (id: string) => boolean = () => true): string {
  const g = groups.find((x) => x.tools.includes(tool));
  if (!g) return '';
  const shown = g.tools.filter(visible);
  return `${groupName(g, groups)}, place ${shown.indexOf(tool) + 1} of ${shown.length}`;
}

// ---------------------------------------------------------------- the builder: hide, fold, divide, join

/** Every tool that is put away now, in the order of the rail. */
export function hiddenTools(groups: ToolGroup[]): string[] {
  return groups.flatMap((g) => g.hidden ?? []);
}

/** True when anything is put away or folded: something the rail does not show as it comes. */
export function hasBuilderChanges(groups: ToolGroup[]): boolean {
  return groups.some((g) => g.hidden?.length || g.fold);
}

/** The arrangement with a tool put away (and the tools that share its place, as one). It stays in its group, to come back to. */
export function hideTool(groups: ToolGroup[], tool: string, mates: (id: string) => string[] = (id) => [id]): ToolGroup[] {
  const gi = groups.findIndex((g) => g.tools.includes(tool));
  if (gi < 0) return groups;
  const g = groups[gi];
  const all = mates(tool).filter((t) => g.tools.includes(t));
  if (all.every((t) => g.hidden?.includes(t))) return groups;
  const hidden = g.tools.filter((t) => all.includes(t) || g.hidden?.includes(t));
  return groups.map((x, i) => (i === gi ? { ...x, hidden } : x));
}

/** The arrangement with a put-away tool (and its mates) back on the rail, where it was. */
export function showTool(groups: ToolGroup[], tool: string, mates: (id: string) => string[] = (id) => [id]): ToolGroup[] {
  const all = mates(tool);
  if (!groups.some((g) => g.hidden?.some((t) => all.includes(t)))) return groups;
  return groups.map((g) => unhidden(g, all));
}

/** The arrangement with every tool back on the rail. */
export function showAllTools(groups: ToolGroup[]): ToolGroup[] {
  if (!hiddenTools(groups).length) return groups;
  return groups.map((g) => unhidden(g, g.hidden ?? []));
}

/** The arrangement with one group folded into one button (or not). The same one comes back when it already is so. */
export function foldGroup(groups: ToolGroup[], id: string, fold: boolean): ToolGroup[] {
  const i = groups.findIndex((g) => g.id === id);
  if (i < 0 || !!groups[i].fold === fold) return groups;
  const { fold: _old, ...rest } = groups[i];
  return groups.map((g, j) => (j === i ? { ...rest, ...(fold ? { fold: true } : {}) } : g));
}

/**
 * The arrangement with a divider put in before a tool: the tool and the ones after it in its group start a group of
 * their own, right after. That is all a divider is. Nothing changes when the tool already starts its group (or is in
 * the middle of a pair that share a place: the pair is never split).
 */
export function startGroupAt(groups: ToolGroup[], tool: string, mates: (id: string) => string[] = (id) => [id]): ToolGroup[] {
  const gi = groups.findIndex((g) => g.tools.includes(tool));
  if (gi < 0) return groups;
  const g = groups[gi];
  // Before the first of the tool's place, so a pair stays together.
  const at = Math.min(...mates(tool).map((t) => g.tools.indexOf(t)).filter((i) => i >= 0));
  if (at <= 0) return groups;
  const head = g.tools.slice(0, at);
  const tail = g.tools.slice(at);
  const keepHidden = (list: string[]) => g.hidden?.filter((t) => list.includes(t));
  const first = withHidden(g, head, keepHidden(head));
  const second = withHidden({ id: newGroupId(groups), tools: tail }, tail, keepHidden(tail));
  return [...groups.slice(0, gi), first, second, ...groups.slice(gi + 1)];
}

/** The arrangement with a group joined to the one above it (or to `into`, a group further up): its tools go on the end of that one, and the divider is gone. */
export function joinGroupAbove(groups: ToolGroup[], id: string, into?: string): ToolGroup[] {
  const i = groups.findIndex((g) => g.id === id);
  const u = into ? groups.findIndex((g) => g.id === into) : i - 1;
  if (i < 0 || u < 0 || u >= i) return groups;
  const up = groups[u];
  const g = groups[i];
  const tools = [...up.tools, ...g.tools];
  const hidden = [...(up.hidden ?? []), ...(g.hidden ?? [])];
  const joined = withHidden(up, tools, hidden);
  return groups.flatMap((x, j) => (j === u ? [joined] : j === i ? [] : [x]));
}

/**
 * The words above a group on the rail: the name it was given, or its usual one. A group you made and never named has
 * none: it is just a divider.
 */
export function headingOf(g: ToolGroup, groups: ToolGroup[]): string | undefined {
  if (g.name) return g.name;
  const usual = usualName(g, groups);
  return DEFAULT_GROUPS.some((d) => d.id === g.id) || g.id === OTHER_GROUP.id ? usual : undefined;
}

/** True when the group above this one is where "Join the group above" would join it to. */
export const canJoinAbove = (groups: ToolGroup[], id: string): boolean => groups.findIndex((g) => g.id === id) > 0;

/** The put-away tools as the shelf shows them: one for each place (the Lasso and the Pixel lasso are one), in rail order. */
export function awayPlaces(groups: ToolGroup[], mates: (id: string) => string[] = (id) => [id]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of hiddenTools(groups)) {
    if (seen.has(t)) continue;
    mates(t).forEach((m) => seen.add(m));
    out.push(t);
  }
  return out;
}
