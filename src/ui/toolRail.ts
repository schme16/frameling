// The tool rail's live side: the arrangement as it is now, moving tools (by pointer drag, keyboard, menu), and the
// stacked style's "front tool" of each group. The pure model is toolArrange.ts; ToolStrip.tsx draws it.
import { allTools, getTool } from '../core/registry';
import { dock, setToolGroups } from './dock';
import { run } from './dockDrag';
import type { DockMenuItem } from './dockMenus';
import { createStore } from './mini';
import { groupName, moveTool, placeWords, resolveGroups, shiftTool, type ToolDrop, type ToolGroup } from './toolArrange';

/** The whole arrangement for the tools that exist (the saved one, or the default), whatever shows right now. */
export function currentGroups(): ToolGroup[] {
  return resolveGroups(dock.get().layout.tools.groups, allTools().map((t) => t.id));
}

/** True when the person has changed the arrangement from the default. */
export const isCustomArrangement = (): boolean => !!dock.get().layout.tools.groups;

/** Saves what a pure move made of the arrangement. Nothing happens when it hands the same one back. */
export function arrange(fn: (g: ToolGroup[]) => ToolGroup[]): boolean {
  const now = currentGroups();
  const next = fn(now);
  if (next === now) return false;
  setToolGroups(next);
  return true;
}

/** The tool each group shows on its button in the stacked style: the last one used from it. */
export const frontTools = createStore<Record<string, string>>({});

/** A group (by id) to open the flyout of, asked for from outside the rail (a quest pointing at a tool inside it). The rail answers and clears it. */
export const flyRequest = createStore<string | null>(null);

export const resetToolArrangement = (): void => setToolGroups(undefined);

/** A line for a screen reader after a move ("Pencil moved. Draw, place 2 of 4."). */
export const railNote = createStore('');

const label = (id: string): string => getTool(id)?.label ?? id;

export function moveToolTo(id: string, to: ToolDrop, visible: (id: string) => boolean = () => true): void {
  if (arrange((g) => moveTool(g, id, to))) railNote.set(`${label(id)} moved. ${placeWords(currentGroups(), id, visible)}.`);
}

/** Alt+arrow: one step along the rail. Returns true when the tool moved. */
export function stepTool(id: string, by: number, visible: (id: string) => boolean): boolean {
  const moved = arrange((g) => shiftTool(g, id, by, visible));
  if (moved) railNote.set(`${label(id)} moved. ${placeWords(currentGroups(), id, visible)}.`);
  return moved;
}

/** The menu for one tool: where to move it, and putting the rail back. */
export function toolMenu(id: string, visible: (id: string) => boolean): DockMenuItem[] {
  const groups = currentGroups();
  const here = groups.find((g) => g.tools.includes(id));
  const items: DockMenuItem[] = [{ heading: label(id) }];
  for (const g of groups) items.push({ label: `Move to ${groupName(g, groups)}`, disabled: g === here, onClick: () => moveToolTo(id, { group: g.id }, visible) });
  items.push({ label: 'Move to a new group', disabled: here?.tools.length === 1, onClick: () => moveToolTo(id, { newGroupAt: groups.length }, visible) });
  items.push({ separator: true }, { label: 'Reset tools to default', disabled: !isCustomArrangement(), onClick: resetToolArrangement });
  return items;
}

// ---------------------------------------------------------------- dragging a tool

/** What the drop would be shown as: a bar before or after a tool, a group lit up, or a gap between groups opened. */
export type DropMark = { kind: 'before' | 'after'; tool: string } | { kind: 'group'; group: string } | { kind: 'gap'; at: number };

export interface ToolDragState {
  id: string;
  x: number;
  y: number;
  drop: ToolDrop | null;
  mark: DropMark | null;
}

export const toolDrag = createStore<ToolDragState | null>(null);

/**
 * What letting go at a point would do, from what is under it. The views mark their parts with data attributes:
 * data-tool-id (a tool, inside a data-tool-axis box that says which way tools run), data-tool-group (a whole group,
 * drop at its end) and data-tool-gap (the space between groups, drop to start a group of its own).
 * `groups` is what shows, so "after a tool" means before the next one showing.
 */
export function hitTool(x: number, y: number, groups: ToolGroup[], dragged: string): { drop: ToolDrop; mark: DropMark } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    const tool = el.closest<HTMLElement>('[data-tool-id]');
    if (tool && tool.dataset.toolId) {
      const id = tool.dataset.toolId;
      if (id === dragged) return null;
      const g = groups.find((gr) => gr.tools.includes(id));
      if (!g) return null;
      const r = tool.getBoundingClientRect();
      const axis = tool.closest<HTMLElement>('[data-tool-axis]')?.dataset.toolAxis === 'y';
      const after = axis ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
      if (!after) return { drop: { group: g.id, before: id }, mark: { kind: 'before', tool: id } };
      const next = g.tools.filter((t) => t !== dragged)[g.tools.filter((t) => t !== dragged).indexOf(id) + 1] ?? null;
      return { drop: { group: g.id, before: next }, mark: { kind: 'after', tool: id } };
    }
    const gap = el.closest<HTMLElement>('[data-tool-gap]');
    if (gap) {
      const at = Number(gap.dataset.toolGap);
      return { drop: { newGroupAt: at }, mark: { kind: 'gap', at } };
    }
    const group = el.closest<HTMLElement>('[data-tool-group]');
    if (group?.dataset.toolGroup) return { drop: { group: group.dataset.toolGroup, before: null }, mark: { kind: 'group', group: group.dataset.toolGroup } };
  }
  return null;
}

/** Pointer down on a tool: a click still picks it; carrying it past a few pixels lifts it to be put somewhere else. */
export function startToolDrag(e: React.PointerEvent, id: string, groups: () => ToolGroup[], visible: (id: string) => boolean, onLift?: () => void): void {
  run(
    e,
    (ev) => {
      const hit = hitTool(ev.clientX, ev.clientY, groups(), id);
      toolDrag.set({ id, x: ev.clientX, y: ev.clientY, drop: hit?.drop ?? null, mark: hit?.mark ?? null });
    },
    (_ev, ok) => {
      const d = toolDrag.get();
      toolDrag.set(null);
      if (ok && d?.drop) moveToolTo(id, d.drop, visible);
    },
    onLift,
  );
}
