// How the tool rail's tools are grouped and ordered. Pure: no registry, no storage, so it can be tested alone.
// The arrangement is a list of groups, each a list of tool ids. It is saved in the dock layout (`tools.groups`);
// a layout without one gets the default, and tools nobody has placed yet (new ones, plugin ones) are put away for you.

export interface ToolGroup {
  id: string;
  /** A name for the move menu (missing = "Group N"). */
  name?: string;
  tools: string[];
}

/** The groups the rail starts with, and the tools that belong in each (in this order). Tools not named go to Other. */
export const DEFAULT_GROUPS: { id: string; name: string; tools: string[] }[] = [
  { id: 'draw', name: 'Draw', tools: ['pencil', 'brush', 'eraser', 'fill', 'tile-brush', 'tile-eraser', 'tile-fill'] },
  { id: 'extras', name: 'Colour and pixel extras', tools: ['shade', 'dither', 'gradient', 'eyedropper', 'tile-picker'] },
  { id: 'shapes', name: 'Shapes', tools: ['line', 'rect', 'ellipse', 'polygon', 'star', 'tile-rect', 'text'] },
  { id: 'select', name: 'Select and pen', tools: ['select', 'pixel-select', 'points', 'pen'] },
  { id: 'rig', name: 'Rig and motion', tools: ['bone', 'pose', 'weights', 'motion-path', 'shape-hints'] },
  { id: 'view', name: 'View', tools: ['hand', 'zoom', 'camera', 'artboard'] },
];
export const OTHER_GROUP = { id: 'other', name: 'Other' };

const MAX_GROUPS = 24;
const MAX_TOOLS = 120;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const ID = /^[\w.:/-]{1,80}$/;
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && !RESERVED.has(v) && !v.includes('..');

const rankOfGroup = (id: string): number => {
  const i = DEFAULT_GROUPS.findIndex((g) => g.id === id);
  return id === OTHER_GROUP.id ? DEFAULT_GROUPS.length : i < 0 ? DEFAULT_GROUPS.length + 1 : i;
};

/** Which default group a tool belongs to (Other when none names it). */
export function defaultGroupOf(tool: string): string {
  return DEFAULT_GROUPS.find((g) => g.tools.includes(tool))?.id ?? OTHER_GROUP.id;
}

/** A saved arrangement made safe: bad ids and repeats dropped, sizes capped. Undefined when there is nothing to keep. */
export function sanitizeGroups(raw: unknown): ToolGroup[] | undefined {
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
    if (!tools.length) continue;
    seenGroups.add(r.id);
    // eslint-disable-next-line no-control-regex
    const name = typeof r.name === 'string' ? r.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : '';
    out.push({ id: r.id, ...(name ? { name } : {}), tools });
  }
  return out.length ? out : undefined;
}

/** The name to show for a group. */
export function groupName(g: ToolGroup, groups: ToolGroup[]): string {
  if (g.name) return g.name;
  const d = DEFAULT_GROUPS.find((x) => x.id === g.id);
  if (d) return d.name;
  if (g.id === OTHER_GROUP.id) return OTHER_GROUP.name;
  return `Group ${groups.indexOf(g) + 1}`;
}

/**
 * The arrangement to use for the tools that exist: the saved one with tools that are gone dropped, and tools it doesn't
 * place yet put in their default group (which comes back if it was emptied away), unknown ones in Other.
 * With nothing saved this is the default arrangement. Empty groups are dropped.
 */
export function resolveGroups(saved: ToolGroup[] | undefined, ids: string[]): ToolGroup[] {
  const have = new Set(ids);
  const groups: ToolGroup[] = [];
  const placed = new Set<string>();
  for (const g of saved ?? []) {
    const tools = g.tools.filter((t) => have.has(t) && !placed.has(t));
    tools.forEach((t) => placed.add(t));
    if (tools.length) groups.push({ ...g, tools });
  }
  // The unplaced, in the order a default rail would show them.
  const order = (t: string) => {
    const g = DEFAULT_GROUPS.find((x) => x.tools.includes(t));
    return g ? g.tools.indexOf(t) : 1000 + ids.indexOf(t);
  };
  const loose = ids.filter((t) => !placed.has(t)).sort((a, b) => order(a) - order(b));
  for (const t of loose) {
    const gid = defaultGroupOf(t);
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
