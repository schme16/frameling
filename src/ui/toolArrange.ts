// How the tool rail's tools are grouped and ordered. Pure: no registry, no storage, so it can be tested alone.
// The arrangement is a list of groups, each a list of tool ids. Every workspace has its own: it starts from the
// workspace's default (BUILTIN_RAILS for the ones that come with the app, the saved one for your own) and what you
// change is kept for that workspace alone (`rails` in the dock state). Tools nobody has placed yet (new ones, plugin
// ones) are put away for you.

export interface ToolGroup {
  id: string;
  /** A name for the move menu (missing = "Group N"). */
  name?: string;
  tools: string[];
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
    { id: 'pixel', name: 'Pixel tools', tools: ['shade', 'dither', 'spray', 'pixel-select'] },
    { id: 'shapes', tools: ['line', 'rect', 'ellipse', 'polygon', 'star'] },
    { id: 'view', tools: ['hand', 'zoom'] },
    { id: 'extras', tools: [] },
    { id: 'select', tools: [] },
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
    out.push({ id: r.id, ...(name ? { name } : {}), tools });
  }
  return out.length ? out : undefined;
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
    if (tools.length || !g.tools.length) groups.push({ ...g, tools });
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
  return groups.filter((g) => g.tools.length);
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
export type ToolDrop = { group: string; before?: string | null } | { newGroupAt: number };

const copy = (groups: ToolGroup[]): ToolGroup[] => groups.map((g) => ({ ...g, tools: [...g.tools] }));

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
export function moveTool(groups: ToolGroup[], tool: string, to: ToolDrop): ToolGroup[] {
  if (!groups.some((g) => g.tools.includes(tool))) return groups;
  const out = copy(groups);
  const from = out.find((g) => g.tools.includes(tool))!;
  if ('newGroupAt' in to) {
    // The place counts the groups as they were, so moving a lone tool next to itself changes nothing.
    const at = Math.max(0, Math.min(out.length, to.newGroupAt));
    const alone = from.tools.length === 1;
    const fromAt = out.indexOf(from);
    if (alone && (at === fromAt || at === fromAt + 1)) return groups;
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
export function shiftTool(groups: ToolGroup[], tool: string, by: number, visible: (id: string) => boolean = () => true): ToolGroup[] {
  const gi = groups.findIndex((g) => g.tools.includes(tool));
  if (gi < 0 || !by) return groups;
  const shown = groups[gi].tools.filter(visible);
  const j = shown.indexOf(tool) + by;
  if (j >= 0 && j < shown.length) {
    const rest = shown.filter((t) => t !== tool);
    return moveTool(groups, tool, { group: groups[gi].id, before: rest[j] ?? null });
  }
  const step = j < 0 ? -1 : 1;
  for (let k = gi + step; k >= 0 && k < groups.length; k += step) {
    const there = groups[k].tools.filter(visible);
    if (!there.length) continue;
    return moveTool(groups, tool, { group: groups[k].id, before: step < 0 ? null : there[0] });
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
